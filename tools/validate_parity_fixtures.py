from __future__ import annotations

import json
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
SIDECAR_SRC = REPO_ROOT / 'agents' / 'langgraph_sidecar' / 'src'
if str(SIDECAR_SRC) not in sys.path:
    sys.path.insert(0, str(SIDECAR_SRC))

from vibe_bi_agent.models import (  # noqa: E402
    AgentDatasetContext,
    AgentExecutionContext,
    DatasetField,
    GeneratedCreativeSpec,
    QueryDefinition,
    QueryResult,
    QueryResultColumn,
)
from vibe_bi_agent.validators import normalize_creative_spec  # noqa: E402


FIXTURE_DIR = REPO_ROOT / 'artifacts' / 'parity-fixtures'


def _build_context(payload: dict) -> AgentExecutionContext:
    bindings = payload.get('bindings') or []
    used_query_refs = payload.get('usedQueryRefs') or []
    query_ids = sorted(
        {
            *[query_ref for query_ref in used_query_refs if isinstance(query_ref, str)],
            *[
                binding.get('queryRef')
                for binding in bindings
                if isinstance(binding, dict) and isinstance(binding.get('queryRef'), str)
            ],
        }
    )

    datasets: list[AgentDatasetContext] = []
    for query_id in query_ids:
        binding_fields = []
        for binding in bindings:
            if not isinstance(binding, dict) or binding.get('queryRef') != query_id:
                continue
            binding_fields.extend(binding.get('fields') or [])
            if isinstance(binding.get('field'), str):
                binding_fields.append(binding['field'])
            if isinstance(binding.get('categoryField'), str):
                binding_fields.append(binding['categoryField'])
            if isinstance(binding.get('valueField'), str):
                binding_fields.append(binding['valueField'])
            if isinstance(binding.get('secondaryField'), str):
                binding_fields.append(binding['secondaryField'])

        field_names = [field for field in dict.fromkeys(binding_fields) if isinstance(field, str) and field.strip()]
        if not field_names:
            field_names = ['Value']

        datasets.append(
            AgentDatasetContext(
                id=f'dataset-{query_id}',
                name=query_id,
                type='query-result',
                queryMode='fixture',
                sourceLabel='parity-fixture',
                fields=[
                    DatasetField(
                        name=field_name,
                        label=field_name,
                        dataType='string' if '月' in field_name or '船' in field_name else 'number',
                        isVisible=True,
                    )
                    for field_name in field_names
                ],
                charts=[],
                previewResult=QueryResult(
                    columns=[QueryResultColumn(name=field_name, dataType='string') for field_name in field_names],
                    rows=[{field_name: '示例' if '船' in field_name else 1 for field_name in field_names}],
                ),
                query=QueryDefinition(
                    id=query_id,
                    name=query_id,
                    dax=f'EVALUATE ROW("QueryRef", "{query_id}")',
                    executionDax=f'EVALUATE ROW("QueryRef", "{query_id}")',
                    evaluateQueries=[],
                    selectedEvaluateIndex=None,
                    parameters=[],
                ),
            )
        )

    return AgentExecutionContext(
        apiBaseUrl='http://127.0.0.1:5119',
        connectionString=None,
        modelMetadata=None,
        datasets=datasets,
        currentReport=None,
        currentPages=[],
        currentQueries=[dataset.query for dataset in datasets if dataset.query],
        baselineQueries=[dataset.query for dataset in datasets if dataset.query],
        theme=None,
    )


def _validate_fixture(file_name: str, expect_issues: bool) -> tuple[bool, str]:
    payload = json.loads((FIXTURE_DIR / file_name).read_text(encoding='utf-8'))
    GeneratedCreativeSpec.model_validate(payload)
    normalized = normalize_creative_spec(
        json.dumps(payload, ensure_ascii=False),
        _build_context(payload),
    )
    has_issues = len(normalized.issues) > 0
    if expect_issues and not has_issues:
        return False, f'{file_name}: expected issues but got none'
    if not expect_issues and has_issues:
        return False, f'{file_name}: expected no issues but got {normalized.issues}'
    return True, f'{file_name}: ok'


def main() -> int:
    checks = [
        ('shipping-parity-golden.json', False),
        ('shipping-parity-degraded-generic-cards.json', True),
    ]
    failures: list[str] = []
    for file_name, expect_issues in checks:
        ok, message = _validate_fixture(file_name, expect_issues)
        print(message)
        if not ok:
            failures.append(message)

    return 1 if failures else 0


if __name__ == '__main__':
    raise SystemExit(main())
