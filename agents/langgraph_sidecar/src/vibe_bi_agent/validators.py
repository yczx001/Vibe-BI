from __future__ import annotations

from collections import OrderedDict
from dataclasses import dataclass
import json
import re
from typing import Any
from uuid import uuid4

import httpx
from pydantic import ValidationError

from .models import (
    AgentDatasetContext,
    AgentExecutionContext,
    BindingFieldSchema,
    DatasetField,
    DesignBrief,
    FreeformBindingDefinition,
    GeneratedArtifact,
    GeneratedCreativeSpec,
    PageDefinition,
    QueryDefinition,
    ReportDefinition,
    ThemeComponents,
    ThemeDefinition,
    ThemeTypography,
    utc_now_iso,
)


@dataclass(slots=True)
class DatasetIndexEntry:
    dataset: AgentDatasetContext
    query: QueryDefinition
    visible_fields: list[DatasetField]
    field_names: list[str]
    preview_rows: list[dict[str, Any]]
    alias_tokens: set[str]


@dataclass(slots=True)
class NormalizedSpecResult:
    spec: GeneratedCreativeSpec
    artifact: GeneratedArtifact
    issues: list[str]
    warnings: list[str]


REPORT_INTENT_HINTS = (
    '报表',
    '报告',
    'dashboard',
    'dashboard',
    '页面',
    '布局',
    '主题',
    '配色',
    '视觉',
    '图表',
    '筛选',
    '生成',
    '重做',
    '修改',
    '改成',
    '切换',
    'html',
    'style',
    'theme',
    'layout',
)


GENERIC_FONT_HINTS = (
    'inter',
    'arial',
    'roboto',
)

COMMON_API_BASE_URLS = (
    'http://127.0.0.1:5119',
    'http://localhost:5119',
    'http://127.0.0.1:5120',
    'http://localhost:5120',
)

EXPLICIT_PARITY_STYLE_FAMILIES = {
    'boardroom-editorial',
}

EXPLICIT_PARITY_LAYOUT_ARCHETYPES = {
    'parity-operational-single-page',
}


def determine_intent(message: str, context: AgentExecutionContext) -> str:
    lowered = message.lower()
    if any(hint in lowered for hint in REPORT_INTENT_HINTS):
        return 'report'
    if context.currentPages or context.currentReport:
        if any(token in lowered for token in ('改', '换', '调整', '优化', '修改', 'theme', 'layout', 'style', 'dark', 'light')):
            return 'report'
    return 'reply'


def summarize_context(context: AgentExecutionContext) -> str:
    if not context.datasets:
        return 'No datasets are currently available.'

    lines: list[str] = []
    for dataset in context.datasets:
        query_ref = dataset.query.id if dataset.query else '(no-query)'
        visible_fields = [field for field in dataset.fields if field.isVisible]
        field_descriptions = [
            _format_field_summary(field)
            for field in (visible_fields or dataset.fields)
        ]
        preview_rows = dataset.previewResult.rows[:1] if dataset.previewResult else []
        preview_summary = json.dumps(
            [_compact_preview_row(row) for row in preview_rows],
            ensure_ascii=False,
        ) if preview_rows else '[]'
        lines.extend([
            f'- Dataset: {dataset.name}',
            f'  queryRef: {query_ref}',
            f'  sourceLabel: {dataset.sourceLabel}',
            f'  queryMode: {dataset.queryMode}',
            f'  visibleFields: {", ".join(field_descriptions[:12])}',
            f'  previewRows: {preview_summary}',
        ])
    return '\n'.join(lines)


def _compact_preview_row(row: dict[str, Any], max_fields: int = 6) -> dict[str, Any]:
    compact: OrderedDict[str, Any] = OrderedDict()
    for index, (key, value) in enumerate(row.items()):
        if index >= max_fields:
            compact['...'] = f'+{len(row) - max_fields} more fields'
            break
        compact[key] = _truncate_preview_value(value)
    return compact


def _extract_section_hints(html: str) -> list[str]:
    hints: list[str] = []
    for pattern in (
        r'<section[^>]+id="([^"]+)"',
        r'<section[^>]+class="([^"]+)"',
        r'<div[^>]+id="([^"]*mount[^"]*)"',
    ):
        for match in re.finditer(pattern, html, flags=re.IGNORECASE):
            value = re.sub(r'\s+', ' ', (match.group(1) or '').strip())
            if not value or value in hints:
                continue
            hints.append(value)
            if len(hints) >= 12:
                return hints
    return hints


def _extract_slot_hints(html: str) -> list[str]:
    hints: list[str] = []
    for match in re.finditer(r'data-slot="([^"]+)"', html or '', flags=re.IGNORECASE):
        value = re.sub(r'\s+', ' ', (match.group(1) or '').strip())
        if not value or value in hints:
            continue
        hints.append(value)
        if len(hints) >= 16:
            return hints
    return hints


def _extract_interaction_hints(js: str) -> list[str]:
    checks = (
        ('addEventListener', r'addEventListener\s*\('),
        ('canonicalFilters', r'context\.filters|filters\.set\(|filters\.clear\(|filters\.clearAll\('),
        ('helpersDataSet', r'helpers\.dataSet\s*\('),
        ('semanticReportData', r'context\.reportData'),
        ('localState', r'getPersistentState|setPersistentState|updatePersistentState|localState|presentationState'),
        ('deriveView', r'deriveView|buildViewModel'),
        ('tooltip', r'tooltip|data-tip'),
        ('rankingInteraction', r'rank\w*.*addEventListener|data-ship'),
        ('filterPills', r'pill|filter-bar|filter-panel'),
    )
    hints: list[str] = []
    for label, pattern in checks:
        if re.search(pattern, js or '', flags=re.IGNORECASE):
            hints.append(label)
    return hints


def _truncate_preview_value(value: Any, max_length: int = 36) -> Any:
    if isinstance(value, str) and len(value) > max_length:
        return f'{value[:max_length]}...'
    return value


def summarize_current_report(context: AgentExecutionContext) -> str | None:
    report = context.currentReport or {}
    if not report and not context.currentPages:
        return None

    page = context.currentPages[0] if context.currentPages else {}
    summary = {
        'report': {
            'id': report.get('id'),
            'name': report.get('name'),
            'description': report.get('description'),
            'renderMode': report.get('renderMode'),
            'themeName': (report.get('theme') or {}).get('name') if isinstance(report, dict) else None,
            'runtimeHints': report.get('runtimeHints'),
        },
        'page': {
            'id': page.get('id'),
            'name': page.get('name'),
            'viewport': page.get('viewport'),
            'sectionHints': _extract_section_hints(page.get('html') or ''),
            'slotHints': _extract_slot_hints(page.get('html') or ''),
            'interactionHints': _extract_interaction_hints(page.get('js') or ''),
            'hasIntegratedFilters': _has_integrated_filter_zone(page.get('html') or '', page.get('js') or ''),
            'bindings': [
                {
                    'name': binding.get('name'),
                    'kind': binding.get('kind'),
                    'queryRef': binding.get('queryRef'),
                    'fields': binding.get('fields'),
                    'shapeHint': binding.get('shapeHint'),
                }
                for binding in (page.get('bindings') or [])[:24]
                if isinstance(binding, dict)
            ],
            'htmlLength': len(page.get('html') or ''),
            'cssLength': len(page.get('css') or ''),
            'jsLength': len(page.get('js') or ''),
        },
        'theme': {
            'name': ((report.get('theme') or {}) if isinstance(report, dict) else {}).get('name'),
            'fontFamily': (((report.get('theme') or {}) if isinstance(report, dict) else {}).get('typography') or {}).get('fontFamily'),
        },
    }
    return json.dumps(summary, ensure_ascii=False, indent=2)


def summarize_generated_spec(spec: GeneratedCreativeSpec) -> dict[str, Any]:
    return {
        'runtimeHints': spec.runtimeHints.model_dump(mode='json') if spec.runtimeHints else {},
        'sectionHints': _extract_section_hints(spec.html or ''),
        'slotHints': _extract_slot_hints(spec.html or ''),
        'interactionHints': _extract_interaction_hints(spec.js or ''),
        'hasIntegratedFilters': _has_integrated_filter_zone(spec.html or '', spec.js or ''),
        'bindingNames': [binding.name for binding in spec.bindings if binding.name],
        'bindingAliases': [binding.alias for binding in spec.bindings if binding.alias],
        'queryRefs': [binding.queryRef for binding in spec.bindings if binding.queryRef],
        'htmlLength': len(spec.html or ''),
        'cssLength': len(spec.css or ''),
        'jsLength': len(spec.js or ''),
    }


def parse_design_brief(raw_text: str) -> DesignBrief:
    payload = load_json_candidate(raw_text)
    return DesignBrief.model_validate(payload)


def normalize_creative_spec(
    raw_text: str,
    context: AgentExecutionContext,
    *,
    force_parity_lane: bool = False,
) -> NormalizedSpecResult:
    payload = load_json_candidate(raw_text)
    spec = GeneratedCreativeSpec.model_validate(payload)
    if force_parity_lane:
        spec.runtimeHints.styleFamily = 'boardroom-editorial'
        spec.runtimeHints.layoutArchetype = 'parity-operational-single-page'
    issues: list[str] = []
    warnings: list[str] = []
    dataset_index = build_dataset_index(context)
    query_ref_map = {entry.query.id: entry for entry in dataset_index.values()}

    for binding in spec.bindings:
        _normalize_binding(binding, dataset_index, issues)

    used_query_refs = [binding.queryRef for binding in spec.bindings if binding.queryRef]
    used_query_refs.extend(spec.usedQueryRefs)
    normalized_used_refs = _dedupe(_resolve_query_ref(value, dataset_index) or value for value in used_query_refs if value)
    spec.usedQueryRefs = [query_ref for query_ref in normalized_used_refs if query_ref in query_ref_map]

    if force_parity_lane and query_ref_map:
        spec.usedQueryRefs = _select_default_query_refs(dataset_index)
        warnings.append('显式 parity lane 已激活，系统自动附加完整查询集供 canonical renderer 使用。')
    elif not spec.usedQueryRefs and query_ref_map:
        spec.usedQueryRefs = _select_default_query_refs(dataset_index)
        warnings.append('AI 未显式声明可用查询，系统已自动补全真实数据查询以保证 creative-html 能渲染。')

    _ensure_binding_coverage(spec, dataset_index)

    if not spec.usedQueryRefs and query_ref_map:
        issues.append('AI 没有引用任何现有数据查询，无法渲染真实报表数据。')

    issues.extend(_detect_partial_parity_activation(spec))

    runtime_markup = f'{spec.html}\n{spec.js}'
    if spec.usedQueryRefs:
        if not spec.js.strip():
            issues.append('creative-html 页面缺少 page.js，无法把运行时数据挂载到页面。')
        elif not _has_runtime_data_consumption(runtime_markup):
            if _is_parity_profile_candidate(spec) and len(spec.usedQueryRefs) >= 4:
                issues.append('parity-class 页面没有显式消费 context.reportData/context.data，无法稳定驱动多模块报表。')
            else:
                warnings.append('creative-html 页面没有显式消费 context.reportData/context.data，建议在 page.js 中补充数据读取逻辑以增强稳定性。')

    issues.extend(_detect_synthetic_data_issues(spec))
    brittle_issues, brittle_warnings = _detect_brittle_runtime_usage(spec)
    if force_parity_lane:
        warnings.extend(brittle_issues)
    else:
        issues.extend(brittle_issues)
    warnings.extend(brittle_warnings)
    if not force_parity_lane:
        issues.extend(_detect_parity_profile_issues(spec))
    else:
        warnings.extend(_detect_parity_profile_issues(spec))
    warnings.extend(_detect_parity_profile_warnings(spec))

    if len(spec.css.strip()) < 1400:
        warnings.append('CSS 设计表达偏弱，未完全达到内置 front-end design 标准。')
    if len(spec.html.strip()) < 220:
        warnings.append('HTML 结构偏薄，页面叙事和版式层级仍可继续增强。')

    full_markup = f'{spec.html}\n{spec.css}'
    lowered_markup = full_markup.lower()
    if any(font in lowered_markup for font in GENERIC_FONT_HINTS) and 'source han' not in lowered_markup and 'noto sans sc' not in lowered_markup:
        warnings.append('页面仍在使用较普通的字体族，视觉方向还可以继续强化。')

    query_refs_in_bindings = {binding.queryRef for binding in spec.bindings if binding.queryRef}
    for query_ref in query_refs_in_bindings:
      if query_ref not in query_ref_map:
          issues.append(f'AI 返回了不存在的 queryRef: {query_ref}')

    all_required_refs = _dedupe([*spec.usedQueryRefs, *[ref for ref in query_refs_in_bindings if ref]])
    selected_queries = [query_ref_map[query_ref].query for query_ref in all_required_refs if query_ref in query_ref_map]
    artifact = build_artifact_from_spec(spec, context, selected_queries)
    return NormalizedSpecResult(spec=spec, artifact=artifact, issues=issues, warnings=warnings)


async def run_self_test(
    artifact: GeneratedArtifact,
    context: AgentExecutionContext,
) -> list[str]:
    issues: list[str] = []
    query_results: dict[str, dict[str, Any]] = {}
    baseline_query_map = _build_baseline_query_map(context)

    if context.apiBaseUrl and context.connectionString and artifact.queries:
        for query in artifact.queries:
            try:
                result = await _execute_query_with_baseline_restore(
                    api_base_url=context.apiBaseUrl,
                    connection_string=context.connectionString,
                    query=query,
                    baseline_query_map=baseline_query_map,
                )
                query_results[query.id] = result
            except Exception as exc:  # noqa: BLE001
                issues.append(f'查询 {query.id} 自检失败: {exc}')

    dataset_index = build_dataset_index(context)
    for page in artifact.pages:
        for binding in page.bindings:
            if not binding.queryRef:
                continue

            entry = dataset_index.get(binding.queryRef)
            runtime_result = query_results.get(binding.queryRef)
            available_fields = set(entry.field_names if entry else [])
            result_columns = set()
            if runtime_result:
                result_columns = {
                    column.get('name')
                    for column in runtime_result.get('columns', [])
                    if isinstance(column, dict) and isinstance(column.get('name'), str)
                }
            allowed = available_fields | result_columns

            for field_name in _collect_binding_fields(binding):
                if field_name and field_name not in allowed:
                    issues.append(
                        f'绑定 {binding.name} 引用了不存在的字段 {field_name}，queryRef={binding.queryRef}。'
                    )

            if runtime_result and not runtime_result.get('rows'):
                issues.append(f'绑定 {binding.name} 对应的查询 {binding.queryRef} 没有返回任何数据行。')

    return issues


def _build_baseline_query_map(context: AgentExecutionContext) -> dict[str, QueryDefinition]:
    baseline_queries = context.baselineQueries or context.currentQueries
    return {
        query.id: query.model_copy(deep=True)
        for query in baseline_queries
        if query.id and (query.dax or query.executionDax)
    }


async def _execute_query_with_baseline_restore(
    *,
    api_base_url: str,
    connection_string: str,
    query: QueryDefinition,
    baseline_query_map: dict[str, QueryDefinition],
) -> dict[str, Any]:
    try:
        return await _execute_query(api_base_url, connection_string, query)
    except Exception as primary_error:  # noqa: BLE001
        baseline_query = baseline_query_map.get(query.id)
        if not baseline_query:
            raise

        current_dax = (query.executionDax or query.dax or '').strip()
        baseline_dax = (baseline_query.executionDax or baseline_query.dax or '').strip()
        if not baseline_dax or baseline_dax == current_dax:
            raise primary_error

        try:
            result = await _execute_query(api_base_url, connection_string, baseline_query)
        except Exception:  # noqa: BLE001
            raise primary_error

        _restore_query_from_baseline(query, baseline_query)
        return result


def _restore_query_from_baseline(query: QueryDefinition, baseline_query: QueryDefinition) -> None:
    query.dax = baseline_query.dax
    query.executionDax = baseline_query.executionDax or baseline_query.dax
    query.evaluateQueries = list(baseline_query.evaluateQueries)
    query.selectedEvaluateIndex = baseline_query.selectedEvaluateIndex
    query.parameters = [parameter.model_copy(deep=True) for parameter in baseline_query.parameters]


def load_json_candidate(raw_text: str) -> Any:
    candidate = extract_json_candidate(raw_text)
    if candidate is None:
        raise ValueError('模型响应中没有找到 JSON。')

    try:
        return json.loads(candidate)
    except json.JSONDecodeError:
        repaired = _try_close_json(candidate)
        if repaired != candidate:
            try:
                return json.loads(repaired)
            except json.JSONDecodeError:
                pass
        structured = _repair_creative_spec_candidate(candidate)
        if structured is not None:
            return structured
        raise


def extract_json_candidate(raw_text: str) -> str | None:
    stripped = raw_text.strip()
    if stripped.startswith('```'):
        stripped = re.sub(r'^```(?:json)?\s*', '', stripped, flags=re.IGNORECASE)
        stripped = re.sub(r'\s*```$', '', stripped)
        stripped = stripped.strip()

    if stripped.startswith('{') or stripped.startswith('['):
        return stripped

    start_positions = [pos for pos in (stripped.find('{'), stripped.find('[')) if pos >= 0]
    if not start_positions:
        return None

    start = min(start_positions)
    opener = stripped[start]
    closer = '}' if opener == '{' else ']'
    depth = 0
    in_string = False
    escaped = False
    for index in range(start, len(stripped)):
        char = stripped[index]
        if in_string:
            if escaped:
                escaped = False
            elif char == '\\':
                escaped = True
            elif char == '"':
                in_string = False
            continue

        if char == '"':
            in_string = True
        elif char == opener:
            depth += 1
        elif char == closer:
            depth -= 1
            if depth == 0:
                return stripped[start:index + 1]

    return stripped[start:]


def build_dataset_index(context: AgentExecutionContext) -> dict[str, DatasetIndexEntry]:
    index: dict[str, DatasetIndexEntry] = {}

    for dataset in context.datasets:
        if not dataset.query:
            continue

        visible_fields = [field for field in dataset.fields if field.isVisible]
        if not visible_fields and dataset.previewResult:
            visible_fields = [
                DatasetField(
                    name=column.name,
                    label=column.name,
                    dataType=column.dataType or 'unknown',
                    isVisible=True,
                )
                for column in dataset.previewResult.columns
                if column.name != '__rowIndex'
            ]

        alias_tokens = {
            _normalize_token(dataset.query.id),
            _normalize_token(dataset.id),
            _normalize_token(dataset.name),
            _normalize_token(dataset.sourceLabel),
        }
        alias_tokens = {token for token in alias_tokens if token}

        index[dataset.query.id] = DatasetIndexEntry(
            dataset=dataset,
            query=dataset.query,
            visible_fields=visible_fields,
            field_names=[field.name for field in visible_fields],
            preview_rows=dataset.previewResult.rows if dataset.previewResult else [],
            alias_tokens=alias_tokens,
        )

    return index


def build_artifact_from_spec(
    spec: GeneratedCreativeSpec,
    context: AgentExecutionContext,
    selected_queries: list[QueryDefinition],
) -> GeneratedArtifact:
    now = utc_now_iso()
    report_id = _safe_existing_id(context.currentReport, 'id') or f'report-{uuid4().hex[:8]}'
    page_id = _safe_existing_page_id(context.currentPages) or f'page-{uuid4().hex[:8]}'
    existing_page = context.currentPages[0] if context.currentPages else {}
    theme = _complete_theme(spec.theme)

    report = ReportDefinition(
        id=report_id,
        name=spec.reportName.strip() or 'AI Report',
        description=(spec.reportDescription or '').strip() or None,
        createdAt=_safe_existing_id(context.currentReport, 'createdAt') or now,
        modifiedAt=now,
        generationMode='ai-generated',
        renderMode='creative-html',
        pages=[page_id],
        defaultPage=page_id,
        theme=theme,
        runtimeHints=spec.runtimeHints,
    )

    page = PageDefinition(
        id=page_id,
        name=_safe_page_name(existing_page) or 'Page 1',
        filters=existing_page.get('filters') if isinstance(existing_page, dict) and isinstance(existing_page.get('filters'), list) else [],
        components=[],
        html=spec.html,
        css=spec.css,
        js=spec.js,
        bindings=spec.bindings,
        viewport=spec.viewport,
    )

    return GeneratedArtifact(
        report=report,
        pages=[page],
        queries=selected_queries,
    )


def _normalize_binding(
    binding: FreeformBindingDefinition,
    dataset_index: dict[str, DatasetIndexEntry],
    issues: list[str],
) -> None:
    resolved_query_ref = _resolve_query_ref_for_binding(binding, dataset_index)
    if not resolved_query_ref and len(dataset_index) == 1:
        resolved_query_ref = next(iter(dataset_index))
    binding.queryRef = resolved_query_ref

    if not binding.queryRef:
        return

    entry = dataset_index.get(binding.queryRef)
    if not entry:
        issues.append(f'绑定 {binding.name} 引用了不存在的查询 {binding.queryRef}。')
        return

    binding.field = _resolve_field(binding.field, entry)
    binding.categoryField = _resolve_field(binding.categoryField, entry)
    binding.valueField = _resolve_field(binding.valueField, entry)
    binding.secondaryField = _resolve_field(binding.secondaryField, entry)
    binding.fields = _dedupe(_resolve_field(field_name, entry) for field_name in binding.fields)
    binding.recommendedFields = _dedupe(_resolve_field(field_name, entry) for field_name in binding.recommendedFields)
    binding.structuralFields = _dedupe(_resolve_field(field_name, entry) for field_name in binding.structuralFields)

    if binding.kind in ('value', 'metric'):
        if not binding.valueField:
            binding.valueField = _pick_numeric_field(entry) or _pick_first_field(entry)
        if not binding.field:
            binding.field = binding.valueField
        if binding.field and not binding.fields:
            binding.fields = [binding.field]

    elif binding.kind == 'chart':
        if not binding.categoryField:
            binding.categoryField = _pick_category_field(entry)
        if not binding.valueField:
            binding.valueField = _pick_numeric_field(entry)
        if not binding.fields:
            binding.fields = _dedupe([binding.categoryField, binding.valueField])
        if not binding.recommendedFields:
            binding.recommendedFields = binding.fields.copy()
        if not binding.structuralFields:
            binding.structuralFields = [field for field in [binding.categoryField] if field]

    elif binding.kind == 'table':
        if not binding.fields:
            binding.fields = entry.field_names[: min(6, len(entry.field_names))]
        if not binding.columns:
            binding.columns = binding.fields.copy()
        if not binding.recommendedFields:
            binding.recommendedFields = binding.fields.copy()

    elif binding.kind == 'list':
        if not binding.fields:
            binding.fields = entry.field_names[: min(4, len(entry.field_names))]
        if not binding.recommendedFields:
            binding.recommendedFields = binding.fields.copy()

    binding.schema = [
        BindingFieldSchema(
            name=field.name,
            label=field.label or field.name,
            dataType=field.dataType,
            semanticRole=field.semanticRole,
            isRecommended=field.name in (binding.recommendedFields or binding.fields),
            isStructural=field.name in binding.structuralFields,
            isVisible=field.isVisible,
        )
        for field in entry.visible_fields
    ]

    referenced_fields = _collect_binding_fields(binding)
    for field_name in referenced_fields:
        if field_name and field_name not in entry.field_names:
            issues.append(
                f'绑定 {binding.name} 使用了字段 {field_name}，但该字段不在 {binding.queryRef} 的可见字段集中。'
            )


def _resolve_query_ref_for_binding(
    binding: FreeformBindingDefinition,
    dataset_index: dict[str, DatasetIndexEntry],
) -> str | None:
    direct_candidates = [
        binding.queryRef,
        binding.name,
        binding.alias,
        binding.label,
        binding.description,
        binding.className,
    ]
    for candidate in direct_candidates:
        resolved = _resolve_query_ref(candidate, dataset_index)
        if resolved:
            return resolved

    best_query_ref: str | None = None
    best_score = 0
    for query_ref, entry in dataset_index.items():
        score = _score_dataset_for_binding(binding, entry)
        if score > best_score:
            best_score = score
            best_query_ref = query_ref

    return best_query_ref if best_score >= 3 else None


def _ensure_binding_coverage(
    spec: GeneratedCreativeSpec,
    dataset_index: dict[str, DatasetIndexEntry],
) -> None:
    covered_refs = {binding.queryRef for binding in spec.bindings if binding.queryRef}
    existing_names = {binding.name for binding in spec.bindings}
    existing_aliases = {binding.alias for binding in spec.bindings if binding.alias}

    for query_ref in spec.usedQueryRefs:
        if query_ref in covered_refs:
            continue

        entry = dataset_index.get(query_ref)
        if not entry:
            continue

        synthesized = _build_synthesized_binding(entry, existing_names, existing_aliases)
        spec.bindings.append(synthesized)
        covered_refs.add(query_ref)
        existing_names.add(synthesized.name)
        if synthesized.alias:
            existing_aliases.add(synthesized.alias)


def _select_default_query_refs(
    dataset_index: dict[str, DatasetIndexEntry],
) -> list[str]:
    prioritized = sorted(
        dataset_index.items(),
        key=lambda item: _default_query_priority(item[1]),
    )
    return [query_ref for query_ref, _ in prioritized]


def _default_query_priority(entry: DatasetIndexEntry) -> tuple[int, int, str]:
    kind, shape_hint = _infer_binding_shape(entry)
    query_name = (entry.query.name or entry.dataset.name or '').lower()
    row_count = len(entry.preview_rows)

    if kind == 'metric':
        base = 0
    elif kind == 'chart' and ('trend' in query_name or '年月' in query_name or '月度' in query_name or '时间' in query_name):
        base = 1
    elif kind == 'chart':
        base = 2
    elif shape_hint == 'matrix':
        base = 3
    elif kind == 'table':
        base = 4
    elif kind == 'list':
        base = 5
    else:
        base = 6

    return (base, -row_count, entry.query.id)


def _detect_synthetic_data_issues(spec: GeneratedCreativeSpec) -> list[str]:
    issues: list[str] = []
    js = spec.js or ''
    lowered = js.lower()

    if 'math.random' in lowered:
        issues.append('creative-html 页面使用了 Math.random 生成内容，必须改为基于真实数据的确定性渲染。')

    if re.search(r'array\.from\(\s*\{\s*length\s*:', lowered):
        issues.append('creative-html 页面构造了固定长度的样例序列，必须改为基于真实查询结果生成。')

    suspicious_tokens = (
        'fallback demo',
        'demo values',
        'mock data',
        'mock rows',
        'sample rows',
        'placeholder metrics',
        '示例数据',
        '模拟数据',
        '占位数据',
        '回退演示',
    )
    if any(token in lowered for token in suspicious_tokens):
        issues.append('creative-html 页面仍包含示例/模拟数据回退逻辑，必须移除并改用真实数据或空状态。')

    return issues


def _detect_brittle_runtime_usage(spec: GeneratedCreativeSpec) -> tuple[list[str], list[str]]:
    issues: list[str] = []
    warnings: list[str] = []
    js = spec.js or ''
    lowered = js.lower()
    is_parity = _is_parity_profile_candidate(spec)

    uses_report_data = _has_runtime_data_consumption(lowered)
    uses_helper_value = 'helpers.value(' in lowered or '.value(' in lowered
    uses_helper_field_name = 'helpers.fieldname(' in lowered or '.fieldname(' in lowered
    hardcoded_query_refs = len(re.findall(r'dataset-q-[a-z0-9-]+', lowered))
    hardcoded_field_access = len(re.findall(r"\[['\"][^'\"]+['\"]\]", js))

    if spec.usedQueryRefs and len(spec.usedQueryRefs) >= 3 and not uses_report_data:
        message = 'creative-html 页面没有使用 context.reportData 语义层，后续修改容易退化为硬编码页面。'
        (issues if is_parity else warnings).append(message)

    if hardcoded_query_refs >= 4 and not uses_report_data:
        message = 'creative-html 页面过度硬编码 queryRef，必须改为以 context.reportData 或 helpers.dataSet 为主的稳定数据访问。'
        (issues if is_parity else warnings).append(message)

    if hardcoded_field_access >= 10 and not (uses_helper_value and uses_helper_field_name):
        message = 'creative-html 页面大量直接写死字段键名，必须改为 helpers.value / helpers.fieldName 解析字段，避免展示名和真实字段名混淆。'
        (issues if is_parity else warnings).append(message)

    return issues, warnings


def _detect_partial_parity_activation(spec: GeneratedCreativeSpec) -> list[str]:
    runtime = spec.runtimeHints.model_dump(mode='json') if spec.runtimeHints else {}
    style_family = _normalize_token(str(runtime.get('styleFamily') or ''))
    layout_archetype = _normalize_token(str(runtime.get('layoutArchetype') or ''))
    style_match = style_family in {_normalize_token(value) for value in EXPLICIT_PARITY_STYLE_FAMILIES}
    layout_match = layout_archetype in {_normalize_token(value) for value in EXPLICIT_PARITY_LAYOUT_ARCHETYPES}

    if style_match == layout_match:
        return []

    return [
        'parity-class 激活必须同时声明 runtimeHints.styleFamily="boardroom-editorial" 和 '
        'runtimeHints.layoutArchetype="parity-operational-single-page"，不能只声明其中一个。'
    ]


def _detect_parity_profile_issues(spec: GeneratedCreativeSpec) -> list[str]:
    if not _is_parity_profile_candidate(spec):
        return []

    issues: list[str] = []
    html = spec.html or ''
    js = spec.js or ''
    section_hints = _extract_section_hints(html)
    slot_hints = _extract_slot_hints(html)
    interaction_hints = _extract_interaction_hints(js)
    full_markup = f'{html}\n{js}'.lower()

    zone_checks = {
        'hero zone': ('hero', 'headline', 'herometric'),
        'KPI belt': ('kpi', 'secondarymetrics', 'metricbelt'),
        'primary trend': ('trend', 'primarytrend', 'monthlytrend'),
        'comparison/ranking zone': ('ranking', 'rank', 'primaryranking', 'primarycategory', 'comparison'),
        'detail zone': ('matrix', 'detail', 'primarymatrix', 'table'),
    }
    for zone_name, tokens in zone_checks.items():
        if not any(token in full_markup for token in tokens):
            issues.append(f'parity-class 页面缺少 {zone_name}，未达到目标报表结构。')

    if not _has_integrated_filter_zone(html, js):
        issues.append('parity-class 页面缺少集成式筛选区或 canonical filter wiring。')

    if 'addeventlistener' not in full_markup and not any(hint in interaction_hints for hint in ('canonicalFilters', 'rankingInteraction')):
        issues.append('parity-class 页面缺少真实交互 wiring，当前更像静态装饰页面。')

    if _looks_like_generic_card_grid(html, section_hints, slot_hints):
        issues.append('parity-class 页面退化为 generic cards/grid，缺少明确的叙事分区。')

    return issues


def _detect_parity_profile_warnings(spec: GeneratedCreativeSpec) -> list[str]:
    if not _is_parity_profile_candidate(spec):
        return []

    warnings: list[str] = []
    html = spec.html or ''
    js = spec.js or ''
    binding_names = [binding.name for binding in spec.bindings if binding.name]
    aliases = [binding.alias for binding in spec.bindings if binding.alias]

    if re.search(r'\bpart\d+\b', ' '.join([*binding_names, *aliases]), flags=re.IGNORECASE):
        warnings.append('绑定命名仍偏占位符，建议改成与页面语义一致的 section/binding 名称。')

    if len(_extract_interaction_hints(js)) < 2:
        warnings.append('交互语义较弱，建议增加更明确的页面状态与事件组织。')

    if len(_extract_section_hints(html)) < 3 and len(_extract_slot_hints(html)) < 4:
        warnings.append('页面分区语义仍偏薄，建议加强 section/slot 命名结构。')

    return warnings


def _has_runtime_data_consumption(markup: str) -> bool:
    lowered = (markup or '').lower()
    runtime_tokens = (
        'context.reportdata',
        'context.data',
        'context.rowsbyquery',
        'helpers.dataset(',
        '.dataset(',
    )
    return any(token in lowered for token in runtime_tokens)


def _is_parity_profile_candidate(spec: GeneratedCreativeSpec) -> bool:
    runtime = spec.runtimeHints.model_dump(mode='json') if spec.runtimeHints else {}
    style_family = _normalize_token(str(runtime.get('styleFamily') or ''))
    layout_archetype = _normalize_token(str(runtime.get('layoutArchetype') or ''))

    if style_family in {_normalize_token(value) for value in EXPLICIT_PARITY_STYLE_FAMILIES}:
        return True

    if layout_archetype in {_normalize_token(value) for value in EXPLICIT_PARITY_LAYOUT_ARCHETYPES}:
        return True

    return False


def _has_integrated_filter_zone(html: str, js: str) -> bool:
    combined = f'{html}\n{js}'.lower()
    has_filter_surface = any(token in combined for token in ('filter-bar', 'filter-panel', 'filter-zone', 'data-filter', 'filter-pill', 'pill-group'))
    has_filter_logic = any(token in combined for token in ('context.filters', 'filters.set(', 'filters.clear(', 'filters.clearall(', 'filterdefinitions'))
    return has_filter_surface and has_filter_logic


def _looks_like_generic_card_grid(html: str, section_hints: list[str], slot_hints: list[str]) -> bool:
    lowered = (html or '').lower()
    card_count = len(re.findall(r'card', lowered))
    repeated_grid = 'repeat(' in lowered or 'grid-template-columns' in lowered
    semantic_markers = len(section_hints) + len(slot_hints)
    return card_count >= 4 and repeated_grid and semantic_markers < 6


def _resolve_query_ref(raw_value: str | None, dataset_index: dict[str, DatasetIndexEntry]) -> str | None:
    if not raw_value:
        return None

    if raw_value in dataset_index:
        return raw_value

    token = _normalize_token(raw_value)
    for query_ref, entry in dataset_index.items():
        if token == _normalize_token(query_ref) or token in entry.alias_tokens:
            return query_ref

    for query_ref, entry in dataset_index.items():
        if any(token and (token in alias or alias in token) for alias in entry.alias_tokens):
            return query_ref

    return None


def _resolve_field(raw_value: str | None, entry: DatasetIndexEntry) -> str | None:
    if not raw_value:
        return None

    for field in entry.visible_fields:
        if raw_value == field.name or raw_value == field.label:
            return field.name

    token = _normalize_token(raw_value)
    for field in entry.visible_fields:
        if token == _normalize_token(field.name) or token == _normalize_token(field.label or field.name):
            return field.name

    for field in entry.visible_fields:
        field_tokens = (_normalize_token(field.name), _normalize_token(field.label or field.name))
        if any(token and (token in field_token or field_token in token) for field_token in field_tokens):
            return field.name

    return None


def _build_synthesized_binding(
    entry: DatasetIndexEntry,
    existing_names: set[str],
    existing_aliases: set[str],
) -> FreeformBindingDefinition:
    kind, shape_hint = _infer_binding_shape(entry)
    base_name = _slugify_binding_name(entry.dataset.name or entry.query.name or entry.query.id)
    if base_name.startswith('part') or base_name == 'datasetBinding':
        suffix_match = re.search(r'(\d+)$', entry.query.id)
        suffix = suffix_match.group(1) if suffix_match else str(len(existing_names) + 1)
        prefix_map = {
            'metric': 'metricCard',
            'chart': 'chartSection',
            'table': 'detailTable',
            'list': 'detailList',
        }
        base_name = f"{prefix_map.get(kind, 'reportSection')}{suffix}"
    name = _dedupe_identifier(base_name or 'datasetBinding', existing_names)
    alias = _dedupe_identifier(f'{name}Data', existing_aliases)
    return FreeformBindingDefinition(
        name=name,
        alias=alias,
        kind=kind,
        queryRef=entry.query.id,
        label=entry.dataset.name or entry.query.name,
        description=f'Auto-synthesized binding for {entry.dataset.name or entry.query.name}',
        shapeHint=shape_hint,
        fields=[],
        recommendedFields=[],
        structuralFields=[],
        columns=[],
        schema=[],
    )


def _infer_binding_shape(
    entry: DatasetIndexEntry,
) -> tuple[str, str]:
    rows = [row for row in entry.preview_rows if isinstance(row, dict)]
    columns = entry.field_names or _collect_columns(rows)
    numeric_fields = [field for field in columns if _looks_numeric_field(field, rows)]
    text_fields = [field for field in columns if field not in numeric_fields]
    temporal_fields = [field for field in columns if _looks_temporal_field(field, rows)]
    has_column_index = any(_normalize_token(field) == 'columnindex' for field in columns)
    query_name = entry.query.name or entry.dataset.name

    if has_column_index or '明细' in query_name or '透视' in query_name or 'pivot' in query_name.lower():
        return 'table', 'matrix'

    if len(rows) <= 2 and numeric_fields:
        return 'metric', 'value'

    if numeric_fields and (temporal_fields or text_fields):
        return 'chart', 'series'

    if rows and len(columns) <= 3:
        return 'list', 'list'

    return 'table', 'rows'


def _score_dataset_for_binding(
    binding: FreeformBindingDefinition,
    entry: DatasetIndexEntry,
) -> int:
    haystacks = [
        entry.dataset.name,
        entry.dataset.sourceLabel,
        entry.query.name,
        entry.query.id,
        *entry.field_names[:8],
    ]
    needles = [
        binding.name,
        binding.alias,
        binding.label,
        binding.description,
        binding.className,
    ]

    score = 0
    for needle in needles:
        normalized_needle = _normalize_token(needle)
        if not normalized_needle:
            continue
        for haystack in haystacks:
            normalized_haystack = _normalize_token(haystack)
            if not normalized_haystack:
                continue
            if normalized_needle == normalized_haystack:
                score += 5
            elif normalized_needle in normalized_haystack or normalized_haystack in normalized_needle:
                score += 2

    inferred_kind, _ = _infer_binding_shape(entry)
    if binding.kind in ('metric', 'value') and inferred_kind == 'metric':
        score += 4
    elif binding.kind == 'chart' and inferred_kind == 'chart':
        score += 4
    elif binding.kind in ('table', 'list') and inferred_kind in ('table', 'list'):
        score += 4

    if binding.kind == 'chart':
        chart_tokens = (_normalize_token(binding.name), _normalize_token(binding.label), _normalize_token(binding.description))
        if any(token and ('trend' in token or 'month' in token or 'rank' in token or 'ship' in token or 'route' in token) for token in chart_tokens):
            if inferred_kind == 'chart':
                score += 2

    return score


def _slugify_binding_name(value: str) -> str:
    parts = [
        part
        for part in re.split(r"[^0-9A-Za-z\u4e00-\u9fff]+", value.strip())
        if part
    ]
    if not parts:
        return 'datasetBinding'

    normalized: list[str] = []
    for index, part in enumerate(parts):
        if re.fullmatch(r'[A-Za-z0-9]+', part):
            lowered = part.lower()
            normalized.append(lowered if index == 0 else lowered[:1].upper() + lowered[1:])
            continue
        normalized.append(f'part{index + 1}')

    slug = ''.join(normalized) or 'datasetBinding'
    if slug[:1].isdigit():
        slug = f'dataset{slug}'
    return slug


def _dedupe_identifier(base: str, existing: set[str]) -> str:
    candidate = base
    index = 2
    while candidate in existing:
        candidate = f'{base}{index}'
        index += 1
    return candidate


def _collect_columns(rows: list[dict[str, Any]]) -> list[str]:
    seen: OrderedDict[str, None] = OrderedDict()
    for row in rows:
        for key in row.keys():
            if key == '__rowIndex':
                continue
            seen.setdefault(key, None)
    return list(seen.keys())


def _looks_numeric_field(field: str, rows: list[dict[str, Any]]) -> bool:
    values = [row.get(field) for row in rows[:12] if row.get(field) not in (None, '')]
    if not values:
        return False
    numeric_count = sum(1 for value in values if _to_number(value) is not None)
    return numeric_count / len(values) >= 0.75


def _looks_temporal_field(field: str, rows: list[dict[str, Any]]) -> bool:
    if re.search(r'(date|time|month|year|week|quarter|period|年月|月份|日期|时间|年度|年份|月|周|季度)', field, re.IGNORECASE):
        return True
    return any(_looks_temporal_value(row.get(field)) for row in rows[:10])


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


def _pick_numeric_field(entry: DatasetIndexEntry) -> str | None:
    for field in entry.visible_fields:
        if (field.semanticRole or '').lower() in ('measure', 'metric'):
            return field.name
    for field in entry.visible_fields:
        if field.dataType.lower() in ('number', 'decimal', 'double', 'int64', 'int32', 'integer', 'currency'):
            return field.name
    return None


def _pick_category_field(entry: DatasetIndexEntry) -> str | None:
    for field in entry.visible_fields:
        semantic_role = (field.semanticRole or '').lower()
        if semantic_role in ('dimension', 'category', 'date', 'text', 'identifier'):
            return field.name
    for field in entry.visible_fields:
        if field.dataType.lower() not in ('number', 'decimal', 'double', 'int64', 'int32', 'integer', 'currency'):
            return field.name
    return entry.field_names[0] if entry.field_names else None


def _pick_first_field(entry: DatasetIndexEntry) -> str | None:
    return entry.field_names[0] if entry.field_names else None


def _format_field_summary(field: DatasetField) -> str:
    label = field.label or field.name
    semantic = f'/{field.semanticRole}' if field.semanticRole else ''
    visibility = '' if field.isVisible else '/hidden'
    return f'{label}<{field.name}:{field.dataType}{semantic}{visibility}>'


def _collect_binding_fields(binding: FreeformBindingDefinition) -> list[str]:
    values = [
        binding.field,
        binding.categoryField,
        binding.valueField,
        binding.secondaryField,
        *(binding.fields or []),
        *(binding.columns or []),
        *(binding.recommendedFields or []),
        *(binding.structuralFields or []),
    ]
    return _dedupe(values)


def _complete_theme(theme: ThemeDefinition) -> ThemeDefinition:
    if theme.typography.fontFamily.strip():
        return theme
    return ThemeDefinition(
        name=theme.name,
        colors=theme.colors,
        typography=ThemeTypography(
            fontFamily='"Source Han Sans SC", "Noto Sans SC", "Microsoft YaHei UI", "Microsoft YaHei", "PingFang SC", sans-serif'
        ),
        components=theme.components or ThemeComponents(),
    )


def _safe_existing_id(source: dict[str, Any] | None, key: str) -> str | None:
    if not isinstance(source, dict):
        return None
    value = source.get(key)
    return value if isinstance(value, str) and value.strip() else None


def _safe_existing_page_id(pages: list[dict[str, Any]]) -> str | None:
    if not pages:
        return None
    first_page = pages[0]
    if not isinstance(first_page, dict):
        return None
    value = first_page.get('id')
    return value if isinstance(value, str) and value.strip() else None


def _safe_page_name(page: dict[str, Any]) -> str | None:
    if not isinstance(page, dict):
        return None
    value = page.get('name')
    return value if isinstance(value, str) and value.strip() else None


def _normalize_token(value: str | None) -> str:
    if not value:
        return ''
    return re.sub(r'[\s_\-./\\:：|()\[\]{}]+', '', value.strip().lower())


def _dedupe(values: Any) -> list[str]:
    ordered: OrderedDict[str, None] = OrderedDict()
    for value in values:
        if isinstance(value, str) and value.strip():
            ordered[value] = None
    return list(ordered.keys())


def _try_close_json(candidate: str) -> str:
    stack: list[str] = []
    in_string = False
    escaped = False

    for char in candidate:
        if in_string:
            if escaped:
                escaped = False
            elif char == '\\':
                escaped = True
            elif char == '"':
                in_string = False
            continue

        if char == '"':
            in_string = True
        elif char in '{[':
            stack.append('}' if char == '{' else ']')
        elif char in '}]' and stack and stack[-1] == char:
            stack.pop()

    repaired = candidate
    if in_string:
        repaired += '"'
    while stack:
        repaired += stack.pop()
    return repaired


def _repair_creative_spec_candidate(candidate: str) -> Any | None:
    ordered_keys = [
        'assistantMessage',
        'reportName',
        'reportDescription',
        'runtimeHints',
        'viewport',
        'theme',
        'html',
        'css',
        'js',
        'bindings',
        'usedQueryRefs',
    ]
    key_positions: dict[str, int] = {}
    for key in ordered_keys:
        marker = f'"{key}"'
        position = candidate.find(marker)
        if position < 0:
            return None
        key_positions[key] = position

    result: dict[str, Any] = {}
    for index, key in enumerate(ordered_keys):
        next_position = key_positions[ordered_keys[index + 1]] if index + 1 < len(ordered_keys) else len(candidate)
        raw_value = _extract_top_level_value(candidate, key_positions[key], next_position)
        if raw_value is None:
            return None

        if key in ('assistantMessage', 'reportName', 'reportDescription', 'html', 'css', 'js'):
            result[key] = _coerce_loose_string_value(raw_value)
            continue

        try:
            result[key] = json.loads(raw_value)
        except json.JSONDecodeError:
            balanced = _extract_balanced_value(raw_value)
            if balanced is None:
                return None
            result[key] = json.loads(balanced)

    return result


def _extract_top_level_value(candidate: str, key_position: int, next_position: int) -> str | None:
    colon_position = candidate.find(':', key_position)
    if colon_position < 0:
        return None
    raw = candidate[colon_position + 1:next_position].strip()
    if raw.endswith(','):
        raw = raw[:-1].rstrip()
    return raw or None


def _coerce_loose_string_value(raw_value: str) -> str | None:
    if raw_value == 'null':
        return None
    trimmed = raw_value.strip()
    if trimmed.startswith('"'):
        trimmed = trimmed[1:]
    if trimmed.endswith('"'):
        trimmed = trimmed[:-1]
    return trimmed.replace('\\"', '"')


def _extract_balanced_value(raw_value: str) -> str | None:
    trimmed = raw_value.strip()
    if not trimmed:
        return None
    opener = trimmed[0]
    if opener not in '{[':
        return None
    closer = '}' if opener == '{' else ']'
    depth = 0
    in_string = False
    escaped = False
    for index, char in enumerate(trimmed):
        if in_string:
            if escaped:
                escaped = False
            elif char == '\\':
                escaped = True
            elif char == '"':
                in_string = False
            continue
        if char == '"':
            in_string = True
        elif char == opener:
            depth += 1
        elif char == closer:
            depth -= 1
            if depth == 0:
                return trimmed[:index + 1]
    return None


async def _execute_query(api_base_url: str, connection_string: str, query: QueryDefinition) -> dict[str, Any]:
    dax = query.executionDax or query.dax
    last_error: Exception | None = None
    async with httpx.AsyncClient(timeout=httpx.Timeout(90.0, connect=20.0)) as client:
        for candidate_base_url in _candidate_api_base_urls(api_base_url):
            try:
                response = await client.post(
                    f'{candidate_base_url.rstrip("/")}/api/query/execute',
                    json={
                        'connectionString': connection_string,
                        'dax': dax,
                    },
                )
            except httpx.ConnectError as exc:
                last_error = exc
                continue

            if response.status_code >= 400:
                try:
                    payload = response.json()
                except json.JSONDecodeError:
                    last_error = RuntimeError(response.text.strip() or response.reason_phrase)
                    continue

                if isinstance(payload, dict):
                    message = payload.get('message')
                    if isinstance(message, str) and message.strip():
                        last_error = RuntimeError(message)
                        raise last_error

                last_error = RuntimeError(response.text.strip() or response.reason_phrase)
                continue

            return response.json()

    if last_error:
        raise last_error
    raise RuntimeError('All connection attempts failed')


def _candidate_api_base_urls(primary: str | None) -> list[str]:
    values = [primary, *COMMON_API_BASE_URLS]
    unique: list[str] = []
    for value in values:
        if not value or value in unique:
            continue
        unique.append(value)
    return unique
