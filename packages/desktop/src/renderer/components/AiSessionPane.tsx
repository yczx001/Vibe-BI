import React from 'react';
import type { AiMessage, AiRunTrace } from '../ai/types';
import { shellPalette } from './DesktopShell';

export interface AiSessionPaneProps {
  messages: AiMessage[];
  traces: AiRunTrace[];
  activeRunId?: string;
  input: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onQuickGenerate?: () => void;
  onCancel?: () => void;
  onClear: () => void;
  isRunning: boolean;
  pendingQuestion?: {
    title: string;
    prompt: string;
    options: Array<{
      value: string;
      label: string;
      description?: string;
    }>;
  } | null;
  onSelectPendingOption?: (value: string) => void;
  onSkipPendingQuestion?: () => void;
}

export function AiSessionPane({
  messages,
  traces,
  activeRunId,
  input,
  onInputChange,
  onSend,
  onQuickGenerate,
  onCancel,
  onClear,
  isRunning,
  pendingQuestion,
  onSelectPendingOption,
  onSkipPendingQuestion,
}: AiSessionPaneProps) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const activeTrace = traces.find((trace) => trace.runId === activeRunId) || traces[traces.length - 1];

  React.useEffect(() => {
    const element = scrollRef.current;
    if (!element) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      element.scrollTo({
        top: element.scrollHeight,
        behavior: 'smooth',
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [messages, traces, isRunning, pendingQuestion]);

  return (
    <div
      style={{
        height: '100%',
        minHeight: 0,
        display: 'grid',
        gridTemplateRows: 'minmax(0, 1fr) 188px',
        gap: 10,
      }}
    >
      <div
        ref={scrollRef}
        style={{
          height: '100%',
          minHeight: 0,
          overflow: 'auto',
          padding: 12,
          display: 'grid',
          alignContent: messages.length === 0 && traces.length === 0 ? 'center' : 'start',
          gap: 12,
        }}
      >
        {messages.length === 0 && traces.length === 0 ? (
          <div
            style={{
              display: 'grid',
              gap: 14,
              padding: '0 8px',
              color: shellPalette.textMuted,
            }}
          >
            <div style={{ display: 'grid', gap: 6, textAlign: 'center' }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: shellPalette.text }}>从当前数据直接开始</div>
              <div style={{ fontSize: 12, lineHeight: 1.8 }}>
                首轮优先直接生成报表；后续再通过对话继续微调布局、主题和重点。
              </div>
            </div>
            <button
              type="button"
              onClick={onQuickGenerate}
              disabled={isRunning || !onQuickGenerate}
              style={{
                border: 'none',
                borderRadius: 16,
                padding: '14px 16px',
                background: isRunning || !onQuickGenerate
                  ? 'linear-gradient(135deg, #CBD5E1 0%, #94A3B8 100%)'
                  : 'linear-gradient(135deg, #2563EB 0%, #7C3AED 50%, #EA580C 100%)',
                color: '#FFFFFF',
                textAlign: 'left',
                cursor: isRunning || !onQuickGenerate ? 'not-allowed' : 'pointer',
                boxShadow: isRunning || !onQuickGenerate ? 'none' : '0 16px 36px rgba(37, 99, 235, 0.28)',
              }}
            >
              <div style={{ display: 'grid', gap: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 800 }}>确认风格后生成</span>
                <span style={{ fontSize: 11, lineHeight: 1.65, color: 'rgba(255,255,255,0.82)' }}>
                  先确认主题、色调和信息重点，再启动规划、执行、校验与修复链路。
                </span>
              </div>
            </button>
            <div
              style={{
                borderRadius: 14,
                border: `1px solid ${shellPalette.border}`,
                background: 'linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%)',
                padding: '12px 14px',
                fontSize: 11,
                lineHeight: 1.75,
              }}
            >
              也可以直接在下方输入更具体的要求，例如“保留当前结构，把筛选器移到左侧并换成深色工业风”。
            </div>
          </div>
        ) : null}

        {messages.map((message) => (
          <div
            key={message.id}
            style={{
              display: 'grid',
              gap: 8,
              padding: '12px 14px',
              borderRadius: 14,
              background: message.role === 'user'
                ? 'linear-gradient(180deg, #EFF6FF 0%, #DBEAFE 100%)'
                : message.role === 'assistant'
                  ? 'linear-gradient(180deg, #FFF7ED 0%, #FFFBEB 100%)'
                  : 'linear-gradient(180deg, #F8FAFC 0%, #F1F5F9 100%)',
              border: `1px solid ${message.role === 'user' ? '#BFDBFE' : message.role === 'assistant' ? '#FED7AA' : '#CBD5E1'}`,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: message.role === 'user' ? shellPalette.accent : shellPalette.textMuted,
                  letterSpacing: 0.3,
                }}
              >
                {message.role === 'user' ? '你' : message.role === 'assistant' ? 'Agent' : 'System'}
              </span>
              <span style={{ fontSize: 10, color: shellPalette.textSubtle }}>
                {new Date(message.timestamp).toLocaleTimeString('zh-CN', {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}
              </span>
            </div>
            <div
              style={{
                fontSize: 12,
                lineHeight: 1.8,
                color: shellPalette.text,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {message.content}
            </div>
          </div>
        ))}

        {traces.map((trace) => (
          <details
            key={trace.runId}
            open={trace.runId === activeTrace?.runId}
            style={{
              borderRadius: 16,
              border: `1px solid ${trace.status === 'failed' ? '#FCA5A5' : trace.artifactReady ? '#86EFAC' : '#C7D2FE'}`,
              background: 'linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%)',
              boxShadow: '0 14px 34px rgba(15, 23, 42, 0.08)',
            }}
          >
            <summary
              style={{
                listStyle: 'none',
                cursor: 'pointer',
                display: 'grid',
                gap: 6,
                padding: '14px 16px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: shellPalette.text }}>
                  {trace.title}
                </span>
                <span
                  style={{
                    padding: '4px 8px',
                    borderRadius: 999,
                    background: trace.status === 'failed'
                      ? 'rgba(239, 68, 68, 0.12)'
                      : trace.artifactReady
                        ? 'rgba(34, 197, 94, 0.12)'
                        : 'rgba(79, 70, 229, 0.12)',
                    color: trace.status === 'failed'
                      ? '#B91C1C'
                      : trace.artifactReady
                        ? '#166534'
                        : '#4338CA',
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: 0.3,
                  }}
                >
                  {mapTraceStatus(trace.status)}
                </span>
              </div>
              <div style={{ fontSize: 12, lineHeight: 1.7, color: shellPalette.textMuted }}>
                {trace.summary}
              </div>
            </summary>

            <div style={{ display: 'grid', gap: 10, padding: '0 16px 16px' }}>
              {trace.logs.length > 0 ? (
                <div
                  style={{
                    borderRadius: 14,
                    border: `1px solid ${shellPalette.border}`,
                    background: '#0F172A',
                    color: '#E2E8F0',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 12,
                      padding: '10px 12px',
                      background: 'linear-gradient(90deg, rgba(37,99,235,0.22) 0%, rgba(15,23,42,0.88) 55%, rgba(124,58,237,0.18) 100%)',
                      borderBottom: '1px solid rgba(148, 163, 184, 0.16)',
                    }}
                  >
                    <div style={{ display: 'grid', gap: 2 }}>
                      <span style={{ fontSize: 11, fontWeight: 800, color: '#F8FAFC' }}>执行流</span>
                      <span style={{ fontSize: 10, color: '#94A3B8' }}>
                        {trace.activeOperation || '等待下一步'}
                      </span>
                    </div>
                    <span style={{ fontSize: 10, color: '#93C5FD' }}>
                      {trace.lastHeartbeatAt
                        ? `心跳 ${new Date(trace.lastHeartbeatAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
                        : '实时日志'}
                    </span>
                  </div>
                  <div
                    style={{
                      display: 'grid',
                      gap: 6,
                      maxHeight: 180,
                      overflow: 'auto',
                      padding: '10px 12px 12px',
                    }}
                  >
                    {trace.logs.slice(-14).map((log) => (
                      <div
                        key={log.id}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '64px minmax(0, 1fr)',
                          gap: 10,
                          alignItems: 'start',
                          fontSize: 11,
                          lineHeight: 1.6,
                        }}
                      >
                        <span style={{ color: '#64748B' }}>
                          {new Date(log.timestamp).toLocaleTimeString('zh-CN', {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })}
                        </span>
                        <div style={{ display: 'grid', gap: 2 }}>
                          <span style={{ color: mapLogLevelColor(log.level) }}>
                            {log.tag ? `[${log.tag}] ` : ''}{log.message}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {trace.steps.map((step, index) => (
                <div
                  key={`${trace.runId}-${step.stepId}`}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '20px minmax(0, 1fr)',
                    gap: 10,
                    alignItems: 'start',
                  }}
                >
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#4338CA', paddingTop: 2 }}>
                    {index + 1}
                  </div>
                  <div
                    style={{
                      borderRadius: 12,
                      border: `1px solid ${step.status === 'failed' ? '#FECACA' : '#E2E8F0'}`,
                      background: step.status === 'failed'
                        ? 'linear-gradient(180deg, #FEF2F2 0%, #FFF7ED 100%)'
                        : 'linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%)',
                      padding: '10px 12px',
                      display: 'grid',
                      gap: 6,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: shellPalette.text }}>
                        {step.title}
                      </span>
                      <span style={{ fontSize: 10, color: shellPalette.textSubtle }}>
                        {mapStepStatus(step.status)}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, lineHeight: 1.7, color: shellPalette.textMuted }}>
                      {step.summary}
                    </div>
                    {step.details && step.details.length > 0 ? (
                      <div style={{ display: 'grid', gap: 4 }}>
                        {step.details.map((detail, detailIndex) => (
                          <div
                            key={`${step.stepId}-${detailIndex}`}
                            style={{
                              fontSize: 11,
                              lineHeight: 1.6,
                              color: shellPalette.textSubtle,
                              background: 'rgba(15, 23, 42, 0.04)',
                              borderRadius: 8,
                              padding: '6px 8px',
                            }}
                          >
                            {detail}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}

              {trace.issues.length > 0 ? (
                <div
                  style={{
                    borderRadius: 12,
                    border: '1px solid #FECACA',
                    background: 'linear-gradient(180deg, #FFF1F2 0%, #FFF7ED 100%)',
                    padding: '10px 12px',
                    display: 'grid',
                    gap: 6,
                  }}
                >
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#B91C1C' }}>校验问题</div>
                  {trace.issues.map((issue, index) => (
                    <div key={`${trace.runId}-issue-${index}`} style={{ fontSize: 11, lineHeight: 1.6, color: '#7F1D1D' }}>
                      {issue}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </details>
        ))}

        {pendingQuestion ? (
          <div
            style={{
              display: 'grid',
              gap: 10,
              padding: '14px 16px',
              borderRadius: 16,
              border: `1px solid ${shellPalette.accentBorder}`,
              background: 'linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%)',
              boxShadow: '0 14px 30px rgba(15, 23, 42, 0.08)',
            }}
          >
            <div style={{ display: 'grid', gap: 4 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: shellPalette.accent, letterSpacing: 0.4 }}>
                AI 正在确认风格
              </div>
              <div style={{ fontSize: 14, fontWeight: 800, color: shellPalette.text }}>
                {pendingQuestion.title}
              </div>
              <div style={{ fontSize: 12, lineHeight: 1.75, color: shellPalette.textMuted }}>
                {pendingQuestion.prompt}
              </div>
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              {pendingQuestion.options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => onSelectPendingOption?.(option.value)}
                  style={{
                    textAlign: 'left',
                    padding: '12px 14px',
                    borderRadius: 14,
                    border: `1px solid ${shellPalette.border}`,
                    background: '#FFFFFF',
                    cursor: 'pointer',
                    display: 'grid',
                    gap: 4,
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 700, color: shellPalette.text }}>
                    {option.label}
                  </span>
                  {option.description ? (
                    <span style={{ fontSize: 11, lineHeight: 1.6, color: shellPalette.textMuted }}>
                      {option.description}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={onSkipPendingQuestion}
                style={{
                  padding: '8px 12px',
                  borderRadius: 10,
                  border: `1px solid ${shellPalette.border}`,
                  background: '#FFFFFF',
                  color: shellPalette.textMuted,
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                跳过这题
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateRows: 'minmax(0, 1fr) auto',
          gap: 12,
          height: '100%',
          borderTop: `1px solid ${shellPalette.border}`,
          padding: '12px 12px 14px',
          boxSizing: 'border-box',
        }}
      >
        <div style={{ height: '100%', overflow: 'hidden' }}>
          <textarea
            value={input}
            onChange={(event) => onInputChange(event.target.value)}
            onKeyDown={(event) => {
              if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                event.preventDefault();
                onSend();
              }
            }}
            placeholder="描述你要生成或修改的报表，或直接提问。"
            style={{
              width: '100%',
              height: '100%',
              resize: 'none',
              border: `1px solid ${shellPalette.border}`,
              borderRadius: 12,
              background: '#FFFFFF',
              color: shellPalette.text,
              fontSize: 13,
              lineHeight: 1.7,
              padding: 12,
              boxSizing: 'border-box',
              outline: 'none',
              fontFamily: '"Microsoft YaHei UI", "Microsoft YaHei", "Noto Sans SC", "PingFang SC", "Segoe UI Variable", "Segoe UI", system-ui, sans-serif',
            }}
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-end' }}>
          <button
            type="button"
            onClick={onClear}
            disabled={isRunning || (!input.trim() && messages.length === 0 && traces.length === 0)}
            style={secondaryButtonStyle(isRunning || (!input.trim() && messages.length === 0 && traces.length === 0))}
          >
            清空会话
          </button>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
            {isRunning ? (
              <button
                type="button"
                onClick={onCancel}
                style={{
                  padding: '10px 14px',
                  borderRadius: 10,
                  border: '1px solid rgba(239, 68, 68, 0.28)',
                  background: '#FEF2F2',
                  color: '#B91C1C',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                停止
              </button>
            ) : null}
            <button
              type="button"
              onClick={onSend}
              disabled={!input.trim() || isRunning}
              style={{
                padding: '10px 18px',
                borderRadius: 10,
                border: 'none',
                background: isRunning ? '#CBD5E1' : shellPalette.accent,
                color: '#FFFFFF',
                fontSize: 13,
                fontWeight: 700,
                cursor: !input.trim() || isRunning ? 'not-allowed' : 'pointer',
                opacity: !input.trim() || isRunning ? 0.72 : 1,
              }}
            >
              {isRunning ? '执行中...' : '发送'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function mapTraceStatus(status: AiRunTrace['status']): string {
  switch (status) {
    case 'queued':
      return '排队中';
    case 'planning':
      return '规划中';
    case 'running':
      return '执行中';
    case 'repairing':
      return '修复中';
    case 'completed':
      return '已完成';
    case 'failed':
      return '失败';
    case 'cancelled':
      return '已取消';
    default:
      return '待命';
  }
}

function mapLogLevelColor(level: AiRunTrace['logs'][number]['level']): string {
  switch (level) {
    case 'activity':
      return '#93C5FD';
    case 'success':
      return '#86EFAC';
    case 'warning':
      return '#FDE68A';
    case 'error':
      return '#FCA5A5';
    default:
      return '#E2E8F0';
  }
}

function mapStepStatus(status: AiRunTrace['steps'][number]['status']): string {
  switch (status) {
    case 'running':
      return '进行中';
    case 'completed':
      return '完成';
    case 'failed':
      return '失败';
    case 'cancelled':
      return '已取消';
    default:
      return '待执行';
  }
}

function secondaryButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: '10px 14px',
    borderRadius: 10,
    border: `1px solid ${shellPalette.border}`,
    background: '#FFFFFF',
    color: shellPalette.textMuted,
    fontSize: 12,
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.6 : 1,
  };
}
