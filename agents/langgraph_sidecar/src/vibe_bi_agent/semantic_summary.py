from __future__ import annotations

import json
import re
from typing import Any

from .models import AgentExecutionContext


TEMPORAL_FIELD_RE = re.compile(r'(date|time|month|year|week|quarter|period|年月|月份|日期|时间|年度|年份|月|周|季度)', re.IGNORECASE)
TREND_NAME_RE = re.compile(r'(trend|timeline|history|time|monthly|按年月|年月|趋势|月度|时间)', re.IGNORECASE)
RANKING_NAME_RE = re.compile(r'(rank|top|排行|排名|按船舶|按.*排名|top\s*\d+)', re.IGNORECASE)
MATRIX_NAME_RE = re.compile(r'(matrix|明细|透视|pivot|交叉)', re.IGNORECASE)
TOTAL_MARKER_RE = re.compile(r'(grand.?total|合计|总计|subtotal)', re.IGNORECASE)


def build_semantic_report_summary(context: AgentExecutionContext) -> str:
    metrics: list[dict[str, Any]] = []
    trends: list[dict[str, Any]] = []
    categories: list[dict[str, Any]] = []
    rankings: list[dict[str, Any]] = []
    matrices: list[dict[str, Any]] = []
    tables: list[dict[str, Any]] = []

    for dataset in context.datasets:
        if not dataset.query:
            continue

        rows = [row for row in (dataset.previewResult.rows if dataset.previewResult else []) if isinstance(row, dict)]
        summary = _summarize_dataset(dataset.query.id, dataset.name, rows)
        if summary['kind'] == 'metric':
            metrics.append(summary)
        elif summary['kind'] == 'trend':
            trends.append(summary)
        elif summary['kind'] == 'category':
            categories.append(summary)
        elif summary['kind'] == 'ranking':
            rankings.append(summary)
        elif summary['kind'] == 'matrix':
            matrices.append(summary)
        else:
            tables.append(summary)

    payload = {
        'metrics': metrics[:12],
        'trends': trends[:8],
        'categories': categories[:8],
        'rankings': rankings[:8],
        'matrices': matrices[:4],
        'tables': tables[:6],
    }
    return json.dumps(payload, ensure_ascii=False, indent=2)


def _summarize_dataset(query_ref: str, query_name: str, rows: list[dict[str, Any]]) -> dict[str, Any]:
    columns = _collect_columns(rows)
    numeric_fields = [field for field in columns if _is_numeric_field(field, rows)]
    temporal_fields = [field for field in columns if _is_temporal_field(field, rows)]
    text_fields = [field for field in columns if field not in numeric_fields]
    non_index_numeric_fields = [field for field in numeric_fields if _normalize_token(field) != 'columnindex']

    base = {
        'queryRef': query_ref,
        'queryName': query_name,
        'rowCount': len(rows),
        'columns': columns[:10],
    }

    if not rows or not columns:
        return {
            **base,
            'kind': 'table',
            'sampleRows': [],
        }

    matrix_summary = _try_build_matrix_summary(query_name, rows, text_fields, non_index_numeric_fields)
    if matrix_summary:
        return {
            **base,
            'kind': 'matrix',
            **matrix_summary,
        }

    if len(rows) <= 2 and non_index_numeric_fields:
        metric_field = non_index_numeric_fields[0]
        secondary_field = next((field for field in non_index_numeric_fields if field != metric_field), None)
        row = rows[0]
        return {
            **base,
            'kind': 'metric',
            'label': _clean_label(metric_field, query_name),
            'valueField': metric_field,
            'value': _to_number(row.get(metric_field)),
            'secondaryField': secondary_field,
            'secondaryValue': _to_number(row.get(secondary_field)) if secondary_field else None,
        }

    category_field = temporal_fields[0] if temporal_fields else _pick_text_field(text_fields, rows)
    value_field = non_index_numeric_fields[0] if non_index_numeric_fields else None
    secondary_field = next((field for field in non_index_numeric_fields if field != value_field), None)
    if category_field and value_field:
        kind = _resolve_series_kind(query_name, category_field, temporal_fields, len(rows))
        points = [
            {
                'label': str(row.get(category_field, '-')),
                'value': _to_number(row.get(value_field)),
                'secondaryValue': _to_number(row.get(secondary_field)) if secondary_field else None,
            }
            for row in rows[:12]
            if not _is_total_row(row)
        ]
        return {
            **base,
            'kind': kind,
            'label': query_name,
            'categoryField': category_field,
            'valueField': value_field,
            'secondaryField': secondary_field,
            'samplePoints': points[:8],
        }

    return {
        **base,
        'kind': 'table',
        'sampleRows': [_compact_row(row) for row in rows[:3]],
    }


def _try_build_matrix_summary(
    query_name: str,
    rows: list[dict[str, Any]],
    text_fields: list[str],
    numeric_fields: list[str],
) -> dict[str, Any] | None:
    has_column_index = any('columnindex' == _normalize_token(key) for row in rows for key in row.keys())
    if not has_column_index and not MATRIX_NAME_RE.search(query_name):
        return None

    row_field = next((field for field in text_fields if not TEMPORAL_FIELD_RE.search(field) and _normalize_token(field) not in ('isgrandtotalrowtotal', 'isgrandtotalcolumntotal')), None)
    value_field = next((field for field in numeric_fields if _normalize_token(field) not in ('columnindex', 'sortbydm00')), None)
    column_field = next((field for field in text_fields if field != row_field and TEMPORAL_FIELD_RE.search(field)), None)
    if not row_field or not value_field:
        return None

    row_labels: list[str] = []
    column_labels: list[str] = []
    for row in rows:
        if _is_total_row(row):
            continue
        row_label = str(row.get(row_field) or '').strip()
        if row_label and row_label not in row_labels:
            row_labels.append(row_label)
        if column_field:
          column_label = str(row.get(column_field) or '').strip()
          if column_label and column_label not in column_labels:
              column_labels.append(column_label)

    return {
        'label': query_name,
        'rowField': row_field,
        'columnField': column_field,
        'valueField': value_field,
        'rowLabels': row_labels[:8],
        'columnLabels': column_labels[:12],
    }


def _resolve_series_kind(query_name: str, category_field: str, temporal_fields: list[str], point_count: int) -> str:
    if TREND_NAME_RE.search(query_name) or category_field in temporal_fields or TEMPORAL_FIELD_RE.search(category_field):
        return 'trend'
    if RANKING_NAME_RE.search(query_name) or point_count > 10:
        return 'ranking'
    return 'category'


def _pick_text_field(text_fields: list[str], rows: list[dict[str, Any]]) -> str | None:
    for field in text_fields:
        if _distinct_count(rows, field) > 1:
            return field
    return text_fields[0] if text_fields else None


def _distinct_count(rows: list[dict[str, Any]], field: str) -> int:
    return len({str(row.get(field) or '') for row in rows if row.get(field) not in (None, '')})


def _collect_columns(rows: list[dict[str, Any]]) -> list[str]:
    seen: list[str] = []
    for row in rows:
        for key in row.keys():
            if key == '__rowIndex' or key in seen:
                continue
            seen.append(key)
    return seen


def _is_temporal_field(field: str, rows: list[dict[str, Any]]) -> bool:
    if TEMPORAL_FIELD_RE.search(field):
        return True
    for value in [row.get(field) for row in rows[:10]]:
        if _looks_temporal_value(value):
            return True
    return False


def _looks_temporal_value(value: Any) -> bool:
    if isinstance(value, (int, float)):
        return 1900 <= value <= 2100
    if not isinstance(value, str):
        return False
    trimmed = value.strip()
    return bool(
        re.fullmatch(r'\d{4}[-/]\d{1,2}([-/]\d{1,2})?', trimmed)
        or re.fullmatch(r'\d{1,2}月', trimmed)
        or re.fullmatch(r'\d{4}年', trimmed)
        or re.fullmatch(r'\d{4}年\d{1,2}月', trimmed)
    )


def _is_numeric_field(field: str, rows: list[dict[str, Any]]) -> bool:
    values = [row.get(field) for row in rows[:12] if row.get(field) not in (None, '')]
    if not values:
        return False
    numeric_count = sum(1 for value in values if _to_number(value) is not None)
    return numeric_count / len(values) >= 0.75


def _is_total_row(row: dict[str, Any]) -> bool:
    return any(
        TOTAL_MARKER_RE.search(key.lower()) and (value is True or str(value).lower() == 'true')
        for key, value in row.items()
    )


def _to_number(value: Any) -> float | None:
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        cleaned = value.replace(',', '').strip()
        if not cleaned:
            return None
        try:
            return float(cleaned)
        except ValueError:
            return None
    return None


def _clean_label(field: str, fallback: str) -> str:
    normalized = re.sub(r'^[^[\]]+\[', '', field)
    normalized = re.sub(r'\]$', '', normalized)
    normalized = re.sub(r'^[_.-]+|[_.-]+$', '', normalized)
    normalized = re.sub(r'[._]+', ' ', normalized)
    normalized = re.sub(r'\s+', ' ', normalized).strip()
    return normalized or fallback


def _normalize_token(value: str) -> str:
    return re.sub(r'[_\-\s./\\:：|]+', '', re.sub(r"['\"`\[\]()（）{}]", '', value.strip().lower()))


def _compact_row(row: dict[str, Any], max_fields: int = 6) -> dict[str, Any]:
    compact: dict[str, Any] = {}
    for index, (key, value) in enumerate(row.items()):
        if index >= max_fields:
            compact['...'] = f'+{len(row) - max_fields} more fields'
            break
        compact[key] = value
    return compact
