from __future__ import annotations

import argparse
import asyncio
from datetime import datetime
import json
import os
from pathlib import Path
import re
from typing import Any
from uuid import uuid4

import httpx

from .graph import run_agent_graph
from .models import (
    AgentDatasetContext,
    AgentExecutionContext,
    AgentRunRequest,
    AiAgentSettings,
    DatasetField,
    QueryDefinition,
    QueryResult,
    QueryResultColumn,
)

FALLBACK_CONTEXT_FILES = (
    Path('artifacts/latest-preview-queries.json'),
)

COMMON_API_BASE_URLS = (
    'http://127.0.0.1:5119',
    'http://localhost:5119',
    'http://127.0.0.1:5120',
    'http://localhost:5120',
)


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description='Run a LangGraph creative-html self-check against a saved context.')
    parser.add_argument('--context', required=True, help='Path to a saved context JSON file.')
    parser.add_argument('--message', required=True, help='User message to send into the agent graph.')
    parser.add_argument('--base-url', required=True, help='Model base URL.')
    parser.add_argument('--api-key', required=True, help='Model API key.')
    parser.add_argument('--model', required=True, help='Model name.')
    parser.add_argument('--provider', choices=['anthropic', 'openai'], default='anthropic')
    parser.add_argument('--max-repair-rounds', type=int, default=2)
    parser.add_argument('--trace-verbosity', choices=['summary', 'detailed'], default='detailed')
    parser.add_argument('--out-dir', default='.codex-logs/langgraph-selfcheck')
    return parser.parse_args()


def _timestamp_slug() -> str:
    return datetime.now().strftime('%Y%m%d-%H%M%S')


def _load_context(context_path: Path) -> AgentExecutionContext:
    payload = json.loads(context_path.read_text(encoding='utf-8'))
    candidate = payload.get('context') if isinstance(payload, dict) and isinstance(payload.get('context'), dict) else payload

    if isinstance(candidate, dict) and 'datasets' in candidate and 'currentPages' in candidate:
        return AgentExecutionContext.model_validate(candidate)

    fallback_payload = {
        'apiBaseUrl': payload.get('apiBaseUrl') or candidate.get('apiBaseUrl') or 'http://127.0.0.1:5000',
        'connectionString': payload.get('connectionString') or candidate.get('connectionString'),
        'datasets': candidate.get('datasets') or payload.get('datasets') or [],
        'currentReport': candidate.get('currentReport') or payload.get('report'),
        'currentPages': candidate.get('currentPages') or payload.get('pages') or [],
        'currentQueries': candidate.get('currentQueries') or payload.get('queries') or [],
        'baselineQueries': candidate.get('baselineQueries') or payload.get('baselineQueries') or [],
        'theme': candidate.get('theme') or payload.get('theme') or (payload.get('report') or {}).get('theme'),
    }
    return AgentExecutionContext.model_validate(fallback_payload)


async def _hydrate_context(context: AgentExecutionContext) -> AgentExecutionContext:
    context = _enrich_context_from_fallbacks(context)
    if context.datasets or not context.currentQueries or not context.connectionString:
        return context

    datasets = await _materialize_datasets_from_queries(context)
    return AgentExecutionContext(
        apiBaseUrl=context.apiBaseUrl,
        connectionString=context.connectionString,
        modelMetadata=context.modelMetadata,
        datasets=datasets,
        currentReport=context.currentReport,
        currentPages=context.currentPages,
        currentQueries=context.currentQueries,
        baselineQueries=context.baselineQueries,
        theme=context.theme,
    )


def _enrich_context_from_fallbacks(context: AgentExecutionContext) -> AgentExecutionContext:
    if context.connectionString and context.currentQueries:
        return context

    discovered_connection_string = _discover_power_bi_connection_string()
    if discovered_connection_string:
        return AgentExecutionContext(
            apiBaseUrl=context.apiBaseUrl,
            connectionString=context.connectionString or discovered_connection_string,
            modelMetadata=context.modelMetadata,
            datasets=context.datasets,
            currentReport=context.currentReport,
            currentPages=context.currentPages,
            currentQueries=context.currentQueries,
            baselineQueries=context.baselineQueries,
            theme=context.theme,
        )

    for fallback_path in FALLBACK_CONTEXT_FILES:
        fallback = _load_context_seed(fallback_path)
        if not fallback:
            continue

        connection_string = context.connectionString or fallback.get('connectionString')
        api_base_url = _prefer_api_base_url(context.apiBaseUrl, fallback.get('apiBaseUrl'))
        current_queries = context.currentQueries or fallback.get('currentQueries') or []
        baseline_queries = context.baselineQueries or fallback.get('baselineQueries') or current_queries

        if connection_string or current_queries:
            return AgentExecutionContext(
                apiBaseUrl=api_base_url,
                connectionString=connection_string,
                modelMetadata=context.modelMetadata,
                datasets=context.datasets,
                currentReport=context.currentReport,
                currentPages=context.currentPages,
                currentQueries=current_queries,
                baselineQueries=baseline_queries,
                theme=context.theme,
            )

    return context


def _discover_power_bi_connection_string() -> str | None:
    candidate_roots = [
        Path.home() / 'Microsoft' / 'Power BI Desktop Store App' / 'AnalysisServicesWorkspaces',
        Path(os.getenv('LOCALAPPDATA', '')) / 'Microsoft' / 'Power BI Desktop SSRS' / 'AnalysisServicesWorkspaces',
        Path(os.getenv('LOCALAPPDATA', '')) / 'Microsoft' / 'Power BI Desktop' / 'AnalysisServicesWorkspaces',
    ]

    workspaces: list[Path] = []
    for root in candidate_roots:
        if not root.exists():
            continue
        workspaces.extend([path for path in root.glob('AnalysisServicesWorkspace_*') if path.is_dir()])

    for workspace in sorted(workspaces, key=lambda item: item.stat().st_mtime, reverse=True):
        port = _read_workspace_port(workspace)
        catalog = _read_workspace_catalog(workspace)
        if port and catalog:
            return f'Provider=MSOLAP;Data Source=localhost:{port};Initial Catalog={catalog};'

    return None


def _read_workspace_port(workspace: Path) -> str | None:
    port_file = workspace / 'Data' / 'msmdsrv.port.txt'
    if not port_file.exists():
        return None

    try:
        content = port_file.read_text(encoding='utf-8', errors='ignore')
    except OSError:
        return None

    digits = ''.join(character for character in content if character.isdigit())
    return digits or None


def _read_workspace_catalog(workspace: Path) -> str | None:
    data_dir = workspace / 'Data'
    if not data_dir.exists():
        return None

    for db_xml in sorted(data_dir.glob('*.db.xml'), key=lambda item: item.stat().st_mtime, reverse=True):
        try:
            content = db_xml.read_text(encoding='utf-8', errors='ignore')
        except OSError:
            continue

        match = re.search(r'<ID>([^<]+)</ID>', content)
        if match:
            return match.group(1).strip()

    return None


def _load_context_seed(path: Path) -> dict[str, Any] | None:
    try:
        resolved = path.resolve()
    except OSError:
        resolved = path

    if not resolved.exists():
        return None

    try:
        payload = json.loads(resolved.read_text(encoding='utf-8'))
    except (OSError, json.JSONDecodeError):
        return None

    candidate = payload.get('context') if isinstance(payload, dict) and isinstance(payload.get('context'), dict) else payload
    if not isinstance(candidate, dict):
        return None

    current_queries = candidate.get('currentQueries') or candidate.get('queries') or payload.get('queries') or []
    baseline_queries = candidate.get('baselineQueries') or payload.get('baselineQueries') or []
    return {
        'apiBaseUrl': payload.get('apiBaseUrl') or candidate.get('apiBaseUrl'),
        'connectionString': payload.get('connectionString') or candidate.get('connectionString'),
        'currentQueries': [
            QueryDefinition.model_validate(query)
            for query in current_queries
            if isinstance(query, dict)
        ],
        'baselineQueries': [
            QueryDefinition.model_validate(query)
            for query in baseline_queries
            if isinstance(query, dict)
        ],
    }


def _prefer_api_base_url(primary: str | None, fallback: str | None) -> str:
    if primary and primary != 'http://127.0.0.1:5000':
        return primary
    if fallback:
        return fallback
    return primary or 'http://127.0.0.1:5000'


async def _materialize_datasets_from_queries(context: AgentExecutionContext) -> list[AgentDatasetContext]:
    datasets: list[AgentDatasetContext] = []
    timeout = httpx.Timeout(90.0, connect=15.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        selected_api_base_url: str | None = None
        for query in context.currentQueries:
            payload, selected_api_base_url = await _execute_query_with_fallback(
                client=client,
                query=query,
                connection_string=context.connectionString,
                preferred_api_base_url=selected_api_base_url or context.apiBaseUrl,
            )
            preview_result = QueryResult(
                columns=[
                    QueryResultColumn(
                        name=column.get('name', ''),
                        dataType=column.get('dataType'),
                    )
                    for column in payload.get('columns', [])
                    if isinstance(column, dict) and isinstance(column.get('name'), str)
                ],
                rows=[
                    row
                    for row in payload.get('rows', [])
                    if isinstance(row, dict)
                ],
            )
            fields = [
                DatasetField(
                    name=column.name,
                    label=column.name,
                    dataType=column.dataType or 'unknown',
                    isVisible=column.name != '__rowIndex',
                    semanticRole=_infer_semantic_role(column.name, column.dataType),
                )
                for column in preview_result.columns
                if column.name != '__rowIndex'
            ]
            datasets.append(AgentDatasetContext(
                id=f'dataset-{query.id}',
                name=query.name,
                type='query-result',
                queryMode='imported',
                sourceLabel=query.name,
                fields=fields,
                charts=[],
                previewResult=preview_result,
                query=query,
            ))
    return datasets


async def _execute_query_with_fallback(
    client: httpx.AsyncClient,
    query: QueryDefinition,
    connection_string: str | None,
    preferred_api_base_url: str,
) -> tuple[dict[str, Any], str]:
    last_error: Exception | None = None
    for api_base_url in _candidate_api_base_urls(preferred_api_base_url):
        try:
            response = await client.post(
                f'{api_base_url.rstrip("/")}/api/query/execute',
                headers={'Content-Type': 'application/json'},
                json={
                    'connectionString': connection_string,
                    'dax': query.executionDax or query.dax,
                },
            )
            response.raise_for_status()
            return response.json(), api_base_url
        except httpx.ConnectError as exc:
            last_error = exc
            continue
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code in (404, 405):
                last_error = exc
                continue
            raise

    if last_error:
        raise last_error
    raise RuntimeError('No available API base URL for query execution.')


def _candidate_api_base_urls(preferred_api_base_url: str | None) -> list[str]:
    values = [preferred_api_base_url, *COMMON_API_BASE_URLS]
    unique: list[str] = []
    for value in values:
        if not value or value in unique:
            continue
        unique.append(value)
    return unique


def _infer_semantic_role(field_name: str, data_type: str | None) -> str | None:
    lowered = field_name.lower()
    if any(token in lowered for token in ('date', 'time', 'month', 'year', '年月', '月份', '日期', '时间', '月', '年')):
        return 'date'
    if any(token in lowered for token in ('count', 'ratio', 'amount', 'sum', '同比', '增长', '数量', '占比', '汇总')):
        return 'measure'
    if data_type and data_type.lower() in ('number', 'decimal', 'double', 'int64', 'int32', 'integer', 'currency'):
        return 'measure'
    return 'dimension'


async def _run(args: argparse.Namespace) -> int:
    context_path = Path(args.context).resolve()
    out_dir = Path(args.out_dir).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    request = AgentRunRequest(
        message=args.message,
        settings=AiAgentSettings(
            provider=args.provider,
            baseUrl=args.base_url,
            apiKey=args.api_key,
            model=args.model,
            maxRepairRounds=max(0, min(5, int(args.max_repair_rounds))),
            traceVerbosity=args.trace_verbosity,
        ),
        context=await _hydrate_context(_load_context(context_path)),
    )

    session_id = f'selfcheck-{uuid4().hex[:10]}'
    run_id = f'run-{uuid4().hex[:10]}'
    events: list[dict[str, Any]] = []
    timestamp = _timestamp_slug()

    async def emit(event: dict[str, Any]) -> None:
        events.append(event)

    exit_code = 0
    state: dict[str, Any] | None = None
    error_message: str | None = None
    try:
        state = await run_agent_graph(
            session_id=session_id,
            run_id=run_id,
            request=request,
            emit=emit,
        )
    except Exception as exc:  # noqa: BLE001
        exit_code = 1
        error_message = str(exc)

    artifact_event = next((event for event in reversed(events) if event.get('type') == 'artifact-produced'), None)
    assistant_event = next((event for event in reversed(events) if event.get('type') == 'assistant-message'), None)
    validation_issues = [event.get('issue') for event in events if event.get('type') == 'validation-issue' and isinstance(event.get('issue'), str)]
    final_validation_issues = state.get('issues') if isinstance(state, dict) and isinstance(state.get('issues'), list) else []
    run_statuses = [event.get('status') for event in events if event.get('type') == 'run-status' and isinstance(event.get('status'), str)]

    summary = {
        'ok': exit_code == 0 and artifact_event is not None and len(final_validation_issues) == 0,
        'timestamp': datetime.now().isoformat(),
        'sessionId': session_id,
        'runId': run_id,
        'message': args.message,
        'contextPath': str(context_path),
        'provider': args.provider,
        'model': args.model,
        'statusTrail': run_statuses,
        'assistantMessage': assistant_event.get('content') if assistant_event else None,
        'artifactReady': artifact_event is not None,
        'validationIssueCount': len(validation_issues),
        'validationIssues': validation_issues,
        'finalValidationIssueCount': len(final_validation_issues),
        'finalValidationIssues': final_validation_issues,
        'error': error_message,
        'stateKeys': sorted(state.keys()) if isinstance(state, dict) else [],
        'artifact': artifact_event.get('artifact') if artifact_event else None,
    }

    prefix = 'pass' if summary['ok'] else 'fail'
    events_path = out_dir / f'{prefix}-events-{timestamp}.json'
    summary_path = out_dir / f'{prefix}-summary-{timestamp}.json'
    events_path.write_text(json.dumps(events, ensure_ascii=False, indent=2), encoding='utf-8')
    summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf-8')

    print(summary_path)
    return exit_code


def main() -> None:
    args = _parse_args()
    raise SystemExit(asyncio.run(_run(args)))


if __name__ == '__main__':
    main()
