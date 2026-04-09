from __future__ import annotations

import asyncio
import json
from typing import Any, Awaitable, Callable

from langgraph.graph import END, START, StateGraph
from typing_extensions import TypedDict

from .design_rules import (
    FRONTEND_DESIGN_SYSTEM_PROMPT,
    build_design_brief_prompt,
    build_generation_prompt,
    build_repair_prompt,
    build_reply_prompt,
)
from .models import AgentRunRequest, DesignBrief
from .provider import CompatibilityModelProvider
from .semantic_summary import build_semantic_report_summary
from .validators import (
    NormalizedSpecResult,
    determine_intent,
    normalize_creative_spec,
    parse_design_brief,
    run_self_test,
    summarize_generated_spec,
    summarize_context,
    summarize_current_report,
)


EmitCallback = Callable[[dict[str, Any]], Awaitable[None]]


PARITY_STYLE_FAMILIES = {
    'boardroom-editorial',
}

PARITY_LAYOUT_ARCHETYPES = {
    'parity-operational-single-page',
}


class AgentGraphState(TypedDict, total=False):
    session_id: str
    run_id: str
    request: AgentRunRequest
    provider: CompatibilityModelProvider
    emit: EmitCallback
    intent: str
    context_summary: str
    semantic_summary: str
    current_report_summary: str | None
    parity_requested: bool
    design_brief: DesignBrief
    raw_output: str
    normalized: NormalizedSpecResult
    issues: list[str]
    warnings: list[str]
    repair_round: int
    assistant_message: str


def _should_preserve_existing_report(message: str) -> bool:
    lowered = message.strip().lower()
    redesign_hints = (
        '重新生成',
        '重新设计',
        '重新做',
        '重做',
        '完全不同',
        '换一种',
        '换个风格',
        '随机切换',
        '全新',
        'new style',
        'different style',
        'redesign',
        'regenerate',
        'from scratch',
    )
    return not any(hint in lowered for hint in redesign_hints)


def _should_enable_parity_lane(
    message: str,
    current_report_summary: str | None,
    context_summary: str | None = None,
    semantic_summary: str | None = None,
) -> bool:
    lowered_message = (message or '').lower()
    parity_request_hints = (
        '独立html',
        '独立 html',
        'standalone html',
        'boardroom',
        'editorial',
        '海运',
        '航运',
        'shipping',
    )
    if any(token in lowered_message for token in parity_request_hints):
        return True

    semantic_corpus = ' '.join([
        current_report_summary or '',
        context_summary or '',
        semantic_summary or '',
    ]).lower()
    semantic_hints = (
        'ship',
        'shipping',
        '海运',
        '航运',
        '船舶',
        '船型',
        '船龄',
        '运作天数',
        'teu',
    )
    if sum(token in semantic_corpus for token in semantic_hints) >= 3:
        return True

    if not current_report_summary:
        return False

    lowered_summary = current_report_summary.lower()
    return any(token in lowered_summary for token in [*PARITY_STYLE_FAMILIES, *PARITY_LAYOUT_ARCHETYPES])


def create_agent_graph():
    graph = StateGraph(AgentGraphState)
    graph.add_node('route_intent', route_intent)
    graph.add_node('load_context', load_context)
    graph.add_node('build_design_brief', build_design_brief)
    graph.add_node('generate_creative', generate_creative)
    graph.add_node('validate_output', validate_output)
    graph.add_node('repair_output', repair_output)
    graph.add_node('fail_report', fail_report)
    graph.add_node('finalize_report', finalize_report)
    graph.add_node('reply_directly', reply_directly)

    graph.add_edge(START, 'route_intent')
    graph.add_conditional_edges(
        'route_intent',
        lambda state: 'reply_directly' if state['intent'] == 'reply' else 'load_context',
        {
            'reply_directly': 'reply_directly',
            'load_context': 'load_context',
        },
    )
    graph.add_edge('load_context', 'build_design_brief')
    graph.add_edge('build_design_brief', 'generate_creative')
    graph.add_edge('generate_creative', 'validate_output')
    graph.add_conditional_edges(
        'validate_output',
        _after_validate,
        {
            'repair_output': 'repair_output',
            'finalize_report': 'finalize_report',
            'fail_report': 'fail_report',
        },
    )
    graph.add_edge('repair_output', 'validate_output')
    graph.add_edge('reply_directly', END)
    graph.add_edge('finalize_report', END)
    graph.add_edge('fail_report', END)
    return graph.compile()

async def run_agent_graph(
    *,
    session_id: str,
    run_id: str,
    request: AgentRunRequest,
    emit: EmitCallback,
) -> AgentGraphState:
    provider = CompatibilityModelProvider(request.settings)
    initial_state: AgentGraphState = {
        'session_id': session_id,
        'run_id': run_id,
        'request': request,
        'provider': provider,
        'emit': emit,
        'repair_round': 0,
    }
    return await AGENT_GRAPH.ainvoke(initial_state)


async def route_intent(state: AgentGraphState) -> AgentGraphState:
    request = state['request']
    intent = determine_intent(request.message, request.context)
    await _emit_run_status(state, 'planning', '正在识别任务类型。')
    if intent == 'reply':
        await _emit_step_started(state, 'intent', '识别任务类型', '本轮更适合直接回答，不触发报表生成。')
        await _emit_step_completed(state, 'intent', '识别任务类型', '已路由为直接问答。')
    else:
        await _emit_step_started(state, 'intent', '识别任务类型', '本轮将进入报表设计与执行流程。')
        await _emit_step_completed(state, 'intent', '识别任务类型', '已路由为报表任务。')
    return {'intent': intent}


async def load_context(state: AgentGraphState) -> AgentGraphState:
    context = state['request'].context
    await _emit_step_started(state, 'context', '加载上下文', '整理当前模型、数据集和现有报表状态。')
    await _emit_progress(state, 'context', '正在整理数据集、查询和当前报表快照。', level='activity', tag='上下文')
    context_summary = summarize_context(context)
    semantic_summary = build_semantic_report_summary(context)
    current_report_summary = summarize_current_report(context)
    await _emit_step_completed(
        state,
        'context',
        '加载上下文',
        '数据上下文已整理完成。',
        details=[
            f'数据集数量: {len(context.datasets)}',
            f'当前页面数量: {len(context.currentPages)}',
            f'当前查询数量: {len(context.currentQueries)}',
        ],
    )
    return {
        'context_summary': context_summary,
        'semantic_summary': semantic_summary,
        'current_report_summary': current_report_summary,
    }


async def build_design_brief(state: AgentGraphState) -> AgentGraphState:
    request = state['request']
    await _emit_step_started(state, 'design-brief', '生成设计 brief', '根据任务和数据先确定视觉方向与版式叙事。')
    current_report_summary = state.get('current_report_summary') if _should_preserve_existing_report(request.message) else None
    parity_enabled = _should_enable_parity_lane(
        request.message,
        current_report_summary,
        state.get('context_summary', ''),
        state.get('semantic_summary', ''),
    )
    prompt = build_design_brief_prompt(
        request.message,
        state.get('context_summary', ''),
        state.get('semantic_summary', ''),
        current_report_summary,
    )
    result = await _complete_with_progress(
        state,
        step_id='design-brief',
        system_prompt=FRONTEND_DESIGN_SYSTEM_PROMPT,
        user_prompt=prompt,
        temperature=0.3,
        max_tokens=4000,
        json_mode=True,
        request_timeout_seconds=90,
    )
    try:
        design_brief = parse_design_brief(result.text)
    except Exception:  # noqa: BLE001
        design_brief = DesignBrief(
            styleFamily='boardroom-editorial' if parity_enabled else 'Editorial Signal',
            designTone='Boardroom editorial with operational clarity' if parity_enabled else 'Confident, data-rich, and cinematic',
            layoutArchetype='parity-operational-single-page' if parity_enabled else 'Hero plus modular narrative bands',
            heroFocus='Lead with the most decision-critical comparison from the available data.',
            filterPlacement='top',
            narrative=[
                'Start with one dominant insight zone.',
                'Use supporting modules for trend, structure, and detail.',
            ],
            mustKeep=[],
            mustAvoid=['Generic dashboard card grids', 'Anonymous typography'],
        )

    if parity_enabled:
        design_brief = DesignBrief(
            styleFamily='boardroom-editorial',
            designTone=design_brief.designTone,
            layoutArchetype='parity-operational-single-page',
            heroFocus=design_brief.heroFocus,
            filterPlacement=design_brief.filterPlacement,
            narrative=design_brief.narrative,
            mustKeep=design_brief.mustKeep,
            mustAvoid=design_brief.mustAvoid,
        )

    await _emit_step_completed(
        state,
        'design-brief',
        '生成设计 brief',
        f'视觉方向已确定为 {design_brief.styleFamily} / {design_brief.layoutArchetype}。',
        details=[
            f'风格族: {design_brief.styleFamily}',
            f'布局原型: {design_brief.layoutArchetype}',
            f'筛选区位置: {design_brief.filterPlacement}',
        ],
    )
    return {
        'design_brief': design_brief,
        'parity_requested': parity_enabled,
    }


async def generate_creative(state: AgentGraphState) -> AgentGraphState:
    request = state['request']
    await _emit_run_status(state, 'running', '正在生成 creative-html 报表。')
    await _emit_step_started(state, 'generate', '生成 creative-html', '基于内置 front-end design 规则生成完整页面。')
    await _emit_progress(state, 'generate', '正在拼装 creative-html 生成输入，注入内置 front-end design 规则。', level='activity', tag='生成')
    current_report_summary = state.get('current_report_summary') if _should_preserve_existing_report(request.message) else None
    prompt = build_generation_prompt(
        request.message,
        state['design_brief'].model_dump(mode='json'),
        state.get('context_summary', ''),
        state.get('semantic_summary', ''),
        current_report_summary,
    )
    result = await _complete_with_progress(
        state,
        step_id='generate',
        system_prompt=FRONTEND_DESIGN_SYSTEM_PROMPT,
        user_prompt=prompt,
        temperature=0.35,
        max_tokens=9000,
        json_mode=True,
        request_timeout_seconds=240,
    )
    await _emit_step_completed(
        state,
        'generate',
        '生成 creative-html',
        '已收到模型输出，开始执行结构、自检和运行时校验。',
        details=[f'协议: {result.protocol}'],
    )
    return {'raw_output': result.text}


async def validate_output(state: AgentGraphState) -> AgentGraphState:
    await _emit_step_started(state, 'validate', '校验与自检', '校验 queryRef、字段映射、设计强度与运行时数据可用性。')
    issues: list[str] = []
    warnings: list[str] = []
    normalized: NormalizedSpecResult | None = None
    try:
        await _emit_progress(state, 'validate', '正在解析 creative-html 规格并映射到现有数据集。', level='activity', tag='校验')
        normalized = normalize_creative_spec(
            state['raw_output'],
            state['request'].context,
            force_parity_lane=bool(state.get('parity_requested')),
        )
        issues.extend(normalized.issues)
        warnings.extend(normalized.warnings)
        issues.extend(_detect_preservation_regressions(state, normalized))
        await _emit_progress(state, 'validate', '结构归一化完成，开始执行运行时数据自检。', level='info', tag='校验')
        issues.extend(await run_self_test(normalized.artifact, state['request'].context))
        issues, warnings = _downgrade_parity_tolerable_issues(
            parity_requested=bool(state.get('parity_requested')),
            issues=issues,
            warnings=warnings,
        )
    except Exception as exc:  # noqa: BLE001
        issues.append(str(exc))

    for issue in issues:
        await state['emit']({
            'type': 'validation-issue',
            'sessionId': state['session_id'],
            'runId': state['run_id'],
            'timestamp': _timestamp(),
            'issue': issue,
        })

    for warning in warnings:
        await state['emit']({
            'type': 'progress',
            'sessionId': state['session_id'],
            'runId': state['run_id'],
            'timestamp': _timestamp(),
            'stepId': 'validate',
            'message': warning,
            'level': 'warning',
            'tag': '设计建议',
        })

    if issues:
        await _emit_step_completed(
            state,
            'validate',
            '校验与自检',
            f'发现 {len(issues)} 个问题，需要继续修复。',
            details=issues[:6],
            status='failed',
        )
    else:
        await _emit_step_completed(
            state,
            'validate',
            '校验与自检',
            '结构校验与数据自检已通过。' if not warnings else f'结构校验与数据自检已通过，附带 {len(warnings)} 条设计建议。',
            details=warnings[:4],
            status='completed',
        )

    result: AgentGraphState = {'issues': issues, 'warnings': warnings}
    if normalized is not None:
        result['normalized'] = normalized
    return result


async def repair_output(state: AgentGraphState) -> AgentGraphState:
    next_round = state.get('repair_round', 0) + 1
    await _emit_run_status(state, 'repairing', f'正在执行第 {next_round} 轮修复。')
    await state['emit']({
        'type': 'repair-started',
        'sessionId': state['session_id'],
        'runId': state['run_id'],
        'timestamp': _timestamp(),
        'summary': f'开始第 {next_round} 轮修复。',
    })
    await _emit_step_started(state, 'repair', '执行修复', '把校验失败点反馈给模型，只修正必要部分。')
    prompt = build_repair_prompt(
        state['raw_output'],
        state.get('issues', []),
        state.get('context_summary', ''),
        state.get('semantic_summary', ''),
        state.get('current_report_summary'),
    )
    result = await _complete_with_progress(
        state,
        step_id='repair',
        system_prompt=FRONTEND_DESIGN_SYSTEM_PROMPT,
        user_prompt=prompt,
        temperature=0.2,
        max_tokens=9000,
        json_mode=True,
        request_timeout_seconds=120,
    )
    await _emit_step_completed(
        state,
        'repair',
        '执行修复',
        f'第 {next_round} 轮修复已完成，重新进入校验。',
        details=[f'协议: {result.protocol}'],
    )
    await state['emit']({
        'type': 'repair-completed',
        'sessionId': state['session_id'],
        'runId': state['run_id'],
        'timestamp': _timestamp(),
        'summary': f'第 {next_round} 轮修复完成。',
    })
    return {
        'repair_round': next_round,
        'raw_output': result.text,
    }


async def finalize_report(state: AgentGraphState) -> AgentGraphState:
    normalized = state['normalized']
    await _emit_step_started(state, 'finalize', '发布产物', '把通过自检的 creative-html 报表写回桌面端。')
    await _emit_progress(state, 'finalize', '正在把 creative-html 产物同步回客户端工作区。', level='activity', tag='发布')
    await state['emit']({
        'type': 'artifact-produced',
        'sessionId': state['session_id'],
        'runId': state['run_id'],
        'timestamp': _timestamp(),
        'artifact': normalized.artifact.model_dump(mode='json'),
    })
    assistant_message = _normalize_assistant_message(
        normalized.spec.assistantMessage,
        report_name=normalized.artifact.report.name,
        style_family=state.get('design_brief').styleFamily if state.get('design_brief') else None,
        hero_focus=state.get('design_brief').heroFocus if state.get('design_brief') else None,
    )
    await state['emit']({
        'type': 'assistant-message',
        'sessionId': state['session_id'],
        'runId': state['run_id'],
        'timestamp': _timestamp(),
        'messageId': f'msg-{state["run_id"]}',
        'content': assistant_message,
    })
    await _emit_step_completed(state, 'finalize', '发布产物', '产物已写回客户端。')
    await _emit_run_status(state, 'completed', '报表生成完成。')
    return {'assistant_message': assistant_message}


async def reply_directly(state: AgentGraphState) -> AgentGraphState:
    request = state['request']
    await _emit_run_status(state, 'running', '正在准备回答。')
    result = await _complete_with_progress(
        state,
        step_id='reply',
        system_prompt=FRONTEND_DESIGN_SYSTEM_PROMPT,
        user_prompt=build_reply_prompt(request.message, summarize_context(request.context)),
        temperature=0.25,
        max_tokens=4000,
        json_mode=False,
        request_timeout_seconds=90,
    )
    message = result.text.strip()
    await state['emit']({
        'type': 'assistant-message',
        'sessionId': state['session_id'],
        'runId': state['run_id'],
        'timestamp': _timestamp(),
        'messageId': f'msg-{state["run_id"]}',
        'content': message,
    })
    await _emit_run_status(state, 'completed', '回答完成。')
    return {'assistant_message': message}


def _normalize_assistant_message(
    raw_message: str | None,
    *,
    report_name: str,
    style_family: str | None,
    hero_focus: str | None,
) -> str:
    message = (raw_message or '').strip()
    banned_markers = (
        '已完成本轮处理',
        '结果校验',
        '已校验',
        '当前主题',
        '组件 ',
        '查询 ',
        '页面 ',
    )
    if message and not any(marker in message for marker in banned_markers):
        return message

    fallback_parts = [f'已生成《{report_name}》。']
    if style_family:
        fallback_parts.append(f'当前采用 {style_family} 的版式与视觉方向。')
    if hero_focus:
        fallback_parts.append(f'这版重点围绕 {hero_focus.strip()} 展开。')
    return ' '.join(fallback_parts)


def _after_validate(state: AgentGraphState) -> str:
    issues = state.get('issues', [])
    if not issues:
        return 'finalize_report'
    if state.get('repair_round', 0) < state['request'].settings.maxRepairRounds:
        return 'repair_output'
    return 'fail_report'


def _detect_preservation_regressions(
    state: AgentGraphState,
    normalized: NormalizedSpecResult,
) -> list[str]:
    if bool(state.get('parity_requested')):
        return []

    if not _should_preserve_existing_report(state['request'].message):
        return []

    current_summary_raw = state.get('current_report_summary')
    if not current_summary_raw:
        return []

    try:
        current_summary = json.loads(current_summary_raw)
    except json.JSONDecodeError:
        return []

    current_page = current_summary.get('page') if isinstance(current_summary, dict) else None
    if not isinstance(current_page, dict):
        return []

    current_sections = current_page.get('sectionHints') or []
    current_slots = current_page.get('slotHints') or []
    current_interactions = current_page.get('interactionHints') or []
    current_filters = bool(current_page.get('hasIntegratedFilters'))

    if not any((current_sections, current_slots, current_interactions, current_filters)):
        return []

    next_summary = summarize_generated_spec(normalized.spec)
    next_sections = next_summary.get('sectionHints') or []
    next_slots = next_summary.get('slotHints') or []
    next_interactions = next_summary.get('interactionHints') or []
    next_filters = bool(next_summary.get('hasIntegratedFilters'))

    issues: list[str] = []
    if len(current_sections) >= 4 and len(next_sections) < max(3, len(current_sections) // 2):
        issues.append('修改结果丢失了过多页面分区语义，未能保留原有 section 结构。')
    if len(current_slots) >= 4 and len(next_slots) < max(3, len(current_slots) // 2):
        issues.append('修改结果丢失了过多命名 slot，未能保留原有模块挂载结构。')
    if len(current_interactions) >= 2 and len(next_interactions) < max(1, len(current_interactions) // 2):
        issues.append('修改结果弱化了原有交互 wiring，未能保留既有页面交互骨架。')
    if current_filters and not next_filters:
        issues.append('修改结果移除了原有集成式筛选区或 canonical filter wiring。')

    return issues


def _downgrade_parity_tolerable_issues(
    *,
    parity_requested: bool,
    issues: list[str],
    warnings: list[str],
) -> tuple[list[str], list[str]]:
    if not parity_requested or not issues:
        return issues, warnings

    tolerated_markers = (
        'parity-class 页面没有显式消费 context.reportData/context.data',
        'creative-html 页面没有使用 context.reportData 语义层',
        'creative-html 页面过度硬编码 queryRef',
        'parity-class 页面缺少 comparison/ranking zone',
        'parity-class 页面缺少集成式筛选区或 canonical filter wiring',
        'parity-class 页面缺少真实交互 wiring',
        'parity-class 页面退化为 generic cards/grid',
    )

    remaining: list[str] = []
    next_warnings = list(warnings)
    for issue in issues:
        if any(marker in issue for marker in tolerated_markers):
            next_warnings.append(f'Parity canonical fallback 已接管: {issue}')
        else:
            remaining.append(issue)

    return remaining, next_warnings


async def fail_report(state: AgentGraphState) -> AgentGraphState:
    issues = state.get('issues', [])
    raise RuntimeError(' | '.join(issues[:8]) or '报表生成失败。')


async def _emit_run_status(state: AgentGraphState, status: str, message: str) -> None:
    await state['emit']({
        'type': 'run-status',
        'sessionId': state['session_id'],
        'runId': state['run_id'],
        'timestamp': _timestamp(),
        'status': status,
        'message': message,
    })


async def _emit_step_started(state: AgentGraphState, step_id: str, title: str, summary: str) -> None:
    await state['emit']({
        'type': 'step-started',
        'sessionId': state['session_id'],
        'runId': state['run_id'],
        'timestamp': _timestamp(),
        'stepId': step_id,
        'title': title,
        'summary': summary,
    })


async def _emit_step_completed(
    state: AgentGraphState,
    step_id: str,
    title: str,
    summary: str,
    *,
    details: list[str] | None = None,
    status: str = 'completed',
) -> None:
    await state['emit']({
        'type': 'step-completed',
        'sessionId': state['session_id'],
        'runId': state['run_id'],
        'timestamp': _timestamp(),
        'stepId': step_id,
        'title': title,
        'summary': summary,
        'details': details or [],
        'status': status,
    })


async def _emit_progress(
    state: AgentGraphState,
    step_id: str,
    message: str,
    *,
    level: str = 'info',
    tag: str | None = None,
) -> None:
    await state['emit']({
        'type': 'progress',
        'sessionId': state['session_id'],
        'runId': state['run_id'],
        'timestamp': _timestamp(),
        'stepId': step_id,
        'message': message,
        'level': level,
        'tag': tag,
    })


async def _complete_with_progress(
    state: AgentGraphState,
    *,
    step_id: str,
    system_prompt: str,
    user_prompt: str,
    temperature: float,
    max_tokens: int,
    json_mode: bool,
    request_timeout_seconds: float,
):
    provider = state['provider']

    async def on_progress(payload: dict[str, Any]) -> None:
        event_type = payload.get('type') if isinstance(payload.get('type'), str) else 'progress'
        await state['emit']({
            'type': event_type,
            'sessionId': state['session_id'],
            'runId': state['run_id'],
            'timestamp': _timestamp(),
            'stepId': step_id,
            'message': payload.get('message', ''),
            'level': payload.get('level', 'info'),
            'tag': payload.get('tag'),
            'elapsedMs': payload.get('elapsedMs'),
        })

    return await provider.complete(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        temperature=temperature,
        max_tokens=max_tokens,
        json_mode=json_mode,
        on_progress=on_progress,
        request_timeout_seconds=request_timeout_seconds,
    )


def _timestamp() -> str:
    from .models import utc_now_iso

    return utc_now_iso()


AGENT_GRAPH = create_agent_graph()
