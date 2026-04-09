import type {
  AiAgentSettings,
  AiConnectionProbeResult,
  AgentRunRequest,
  AgentRunResponse,
  AgentSessionResponse,
  AgentStreamEvent,
} from './types';

export async function createAgentSession(agentBaseUrl: string): Promise<AgentSessionResponse> {
  const response = await fetch(`${agentBaseUrl}/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });

  if (!response.ok) {
    throw new Error(await extractErrorMessage(response, '创建 AI 会话失败。'));
  }

  return response.json() as Promise<AgentSessionResponse>;
}

export async function submitAgentMessage(
  agentBaseUrl: string,
  sessionId: string,
  payload: AgentRunRequest,
): Promise<AgentRunResponse> {
  const response = await fetch(`${agentBaseUrl}/sessions/${sessionId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(await extractErrorMessage(response, '提交 AI 任务失败。'));
  }

  return response.json() as Promise<AgentRunResponse>;
}

export async function cancelAgentRun(
  agentBaseUrl: string,
  runId: string,
): Promise<void> {
  const response = await fetch(`${agentBaseUrl}/runs/${runId}/cancel`, {
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error(await extractErrorMessage(response, '取消 AI 任务失败。'));
  }
}

export async function probeAgentConnection(
  agentBaseUrl: string,
  settings: AiAgentSettings,
): Promise<AiConnectionProbeResult> {
  const response = await fetch(`${agentBaseUrl}/probe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });

  if (!response.ok) {
    throw new Error(await extractErrorMessage(response, 'AI 连接测试失败。'));
  }

  return response.json() as Promise<AiConnectionProbeResult>;
}

export function openAgentSessionStream(
  agentBaseUrl: string,
  sessionId: string,
  onEvent: (event: AgentStreamEvent) => void,
  onError: (error: Error) => void,
): EventSource {
  const eventSource = new EventSource(`${agentBaseUrl}/sessions/${sessionId}/stream`);
  eventSource.onmessage = (event) => {
    try {
      const parsed = JSON.parse(event.data) as AgentStreamEvent;
      onEvent(parsed);
    } catch (error) {
      onError(error instanceof Error ? error : new Error(String(error)));
    }
  };
  eventSource.onerror = () => {
    onError(new Error('AI 会话事件流已中断。'));
  };
  return eventSource;
}

async function extractErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = await response.json() as { detail?: string; message?: string };
    return body.detail || body.message || fallback;
  } catch {
    const text = await response.text();
    return text || fallback;
  }
}
