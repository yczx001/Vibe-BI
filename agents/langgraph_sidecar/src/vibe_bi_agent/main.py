from __future__ import annotations

import argparse
import asyncio
from dataclasses import dataclass, field
from datetime import datetime
import json
from typing import Any
from uuid import uuid4

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from .graph import run_agent_graph
from .models import AgentRunRequest, AiAgentSettings, utc_now_iso
from .provider import CompatibilityModelProvider, ProviderError


@dataclass(slots=True)
class RunRecord:
    run_id: str
    status: str
    started_at: str
    completed_at: str | None = None
    task: asyncio.Task[None] | None = None


@dataclass(slots=True)
class SessionRecord:
    session_id: str
    created_at: str
    messages: list[dict[str, Any]] = field(default_factory=list)
    events: list[dict[str, Any]] = field(default_factory=list)
    subscribers: list[asyncio.Queue[dict[str, Any]]] = field(default_factory=list)
    runs: dict[str, RunRecord] = field(default_factory=dict)
    active_run_id: str | None = None


app = FastAPI(title='Vibe BI LangGraph Agent', version='0.1.0')
app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_methods=['*'],
    allow_headers=['*'],
)

SESSIONS: dict[str, SessionRecord] = {}


@app.get('/health')
async def health() -> dict[str, Any]:
    return {
        'ok': True,
        'service': 'vibe-bi-langgraph-agent',
        'timestamp': utc_now_iso(),
        'sessions': len(SESSIONS),
    }


@app.post('/probe')
async def probe_connection(settings: AiAgentSettings) -> dict[str, Any]:
    provider = CompatibilityModelProvider(settings)
    try:
        result = await provider.complete(
            system_prompt='You are a connection probe. Reply with a short confirmation only.',
            user_prompt='Reply with OK.',
            temperature=0.0,
            max_tokens=32,
            json_mode=False,
        )
    except ProviderError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {
        'ok': True,
        'protocol': result.protocol,
        'preview': result.text.strip()[:120],
        'timestamp': utc_now_iso(),
    }


@app.post('/sessions')
async def create_session() -> dict[str, str]:
    session_id = f'session-{uuid4().hex[:10]}'
    session = SessionRecord(session_id=session_id, created_at=utc_now_iso())
    SESSIONS[session_id] = session
    return {
        'sessionId': session_id,
        'createdAt': session.created_at,
    }


@app.get('/sessions/{session_id}/state')
async def get_session_state(session_id: str) -> dict[str, Any]:
    session = _get_session(session_id)
    return {
        'sessionId': session.session_id,
        'createdAt': session.created_at,
        'activeRunId': session.active_run_id,
        'messages': session.messages,
        'events': session.events,
        'runs': [
            {
                'runId': run.run_id,
                'status': run.status,
                'startedAt': run.started_at,
                'completedAt': run.completed_at,
            }
            for run in session.runs.values()
        ],
    }


@app.get('/debug/sessions')
async def debug_list_sessions() -> dict[str, Any]:
    return {
        'count': len(SESSIONS),
        'sessions': [
            {
                'sessionId': session.session_id,
                'createdAt': session.created_at,
                'activeRunId': session.active_run_id,
                'messageCount': len(session.messages),
                'eventCount': len(session.events),
                'runs': [
                    {
                        'runId': run.run_id,
                        'status': run.status,
                        'startedAt': run.started_at,
                        'completedAt': run.completed_at,
                    }
                    for run in session.runs.values()
                ],
            }
            for session in SESSIONS.values()
        ],
    }


@app.get('/debug/sessions/{session_id}/events')
async def debug_session_events(session_id: str, limit: int = 120) -> dict[str, Any]:
    session = _get_session(session_id)
    safe_limit = max(1, min(limit, 500))
    return {
        'sessionId': session.session_id,
        'activeRunId': session.active_run_id,
        'events': session.events[-safe_limit:],
    }


@app.post('/sessions/{session_id}/messages')
async def submit_message(session_id: str, request: AgentRunRequest) -> dict[str, str]:
    session = _get_session(session_id)

    run_id = f'run-{uuid4().hex[:10]}'
    run = RunRecord(run_id=run_id, status='queued', started_at=utc_now_iso())
    session.runs[run_id] = run
    session.active_run_id = run_id
    session.messages.append({
        'id': f'user-{run_id}',
        'role': 'user',
        'content': request.message,
        'timestamp': utc_now_iso(),
        'runId': run_id,
    })

    await _publish(
        session,
        {
            'type': 'run-status',
            'sessionId': session_id,
            'runId': run_id,
            'timestamp': utc_now_iso(),
            'status': 'queued',
            'message': '任务已进入队列。',
        },
    )

    run.task = asyncio.create_task(_execute_run(session, run, request))
    return {
        'sessionId': session_id,
        'runId': run_id,
        'status': run.status,
    }


@app.post('/runs/{run_id}/cancel')
async def cancel_run(run_id: str) -> dict[str, str]:
    session, run = _find_run(run_id)
    if run.task and not run.task.done():
        run.task.cancel()
    run.status = 'cancelled'
    run.completed_at = utc_now_iso()
    await _publish(
        session,
        {
            'type': 'run-status',
            'sessionId': session.session_id,
            'runId': run_id,
            'timestamp': utc_now_iso(),
            'status': 'cancelled',
            'message': '任务已取消。',
        },
    )
    return {'runId': run_id, 'status': 'cancelled'}


@app.get('/sessions/{session_id}/stream')
async def stream_session(session_id: str):
    session = _get_session(session_id)
    queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
    session.subscribers.append(queue)

    async def event_generator():
        try:
            for event in session.events:
                yield _sse_encode(event)

            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=15.0)
                    yield _sse_encode(event)
                except asyncio.TimeoutError:
                    yield ': keep-alive\n\n'
        finally:
            if queue in session.subscribers:
                session.subscribers.remove(queue)

    return StreamingResponse(event_generator(), media_type='text/event-stream')


async def _execute_run(session: SessionRecord, run: RunRecord, request: AgentRunRequest) -> None:
    async def emit(event: dict[str, Any]) -> None:
        if event.get('type') == 'assistant-message':
            session.messages.append({
                'id': event.get('messageId') or f'assistant-{run.run_id}',
                'role': 'assistant',
                'content': event.get('content', ''),
                'timestamp': event.get('timestamp') or utc_now_iso(),
                'runId': run.run_id,
            })

        if event.get('type') == 'run-status' and isinstance(event.get('status'), str):
            run.status = event['status']
            if run.status in ('completed', 'failed', 'cancelled'):
                run.completed_at = event.get('timestamp') or utc_now_iso()

        await _publish(session, event)

    try:
        await run_agent_graph(
            session_id=session.session_id,
            run_id=run.run_id,
            request=request,
            emit=emit,
        )
        if run.status not in ('completed', 'failed', 'cancelled'):
            run.status = 'completed'
            run.completed_at = utc_now_iso()
    except asyncio.CancelledError:
        run.status = 'cancelled'
        run.completed_at = utc_now_iso()
        await _publish(
            session,
            {
                'type': 'run-status',
                'sessionId': session.session_id,
                'runId': run.run_id,
                'timestamp': utc_now_iso(),
                'status': 'cancelled',
                'message': '任务被中断。',
            },
        )
        raise
    except Exception as exc:  # noqa: BLE001
        run.status = 'failed'
        run.completed_at = utc_now_iso()
        await _publish(
            session,
            {
                'type': 'run-failed',
                'sessionId': session.session_id,
                'runId': run.run_id,
                'timestamp': utc_now_iso(),
                'error': str(exc),
            },
        )
        await _publish(
            session,
            {
                'type': 'run-status',
                'sessionId': session.session_id,
                'runId': run.run_id,
                'timestamp': utc_now_iso(),
                'status': 'failed',
                'message': str(exc),
            },
        )
    finally:
        if session.active_run_id == run.run_id:
            session.active_run_id = None


async def _publish(session: SessionRecord, event: dict[str, Any]) -> None:
    session.events.append(event)
    for subscriber in list(session.subscribers):
        await subscriber.put(event)


def _sse_encode(event: dict[str, Any]) -> str:
    return f'data: {json.dumps(event, ensure_ascii=False)}\n\n'


def _get_session(session_id: str) -> SessionRecord:
    session = SESSIONS.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail='会话不存在。')
    return session


def _find_run(run_id: str) -> tuple[SessionRecord, RunRecord]:
    for session in SESSIONS.values():
        run = session.runs.get(run_id)
        if run:
            return session, run
    raise HTTPException(status_code=404, detail='任务不存在。')


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description='Vibe BI LangGraph sidecar')
    parser.add_argument('--host', default='127.0.0.1')
    parser.add_argument('--port', type=int, default=8797)
    return parser.parse_args()


def main() -> None:
    import uvicorn

    args = _parse_args()
    uvicorn.run(app, host=args.host, port=args.port, log_level='info')


if __name__ == '__main__':
    main()
