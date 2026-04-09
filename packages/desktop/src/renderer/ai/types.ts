import type {
  PageDefinition,
  QueryDefinition,
  QueryResult,
  ReportDefinition,
  ThemeDefinition,
} from '@vibe-bi/core';
import type { ImportSummaryItem, ModelMetadata } from '../types/workspace';

export type AiProviderType = 'anthropic' | 'openai';
export type AiTraceVerbosity = 'summary' | 'detailed';
export type AiRunStatus = 'idle' | 'queued' | 'planning' | 'running' | 'repairing' | 'completed' | 'failed' | 'cancelled';
export type AiStepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
export type AiLogLevel = 'info' | 'activity' | 'success' | 'warning' | 'error';

export interface AiAgentSettings {
  provider: AiProviderType;
  baseUrl: string;
  apiKey: string;
  model: string;
  maxRepairRounds: number;
  traceVerbosity: AiTraceVerbosity;
}

export interface AiConnectionProbeResult {
  ok: boolean;
  protocol: AiProviderType;
  preview: string;
  timestamp: string;
}

export interface AiMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  runId?: string;
}

export interface AiRunStep {
  stepId: string;
  title: string;
  status: AiStepStatus;
  summary: string;
  details?: string[];
  startedAt?: string;
  completedAt?: string;
}

export interface AiTraceLogEntry {
  id: string;
  timestamp: string;
  level: AiLogLevel;
  message: string;
  stepId?: string;
  tag?: string;
}

export interface AiRunTrace {
  runId: string;
  status: AiRunStatus;
  title: string;
  summary: string;
  startedAt: string;
  completedAt?: string;
  steps: AiRunStep[];
  logs: AiTraceLogEntry[];
  issues: string[];
  artifactReady: boolean;
  activeStepId?: string;
  activeOperation?: string;
  lastHeartbeatAt?: string;
}

export interface AiSessionSnapshot {
  sessionId: string;
  status: AiRunStatus;
  messages: AiMessage[];
  traces: Record<string, AiRunTrace>;
  activeRunId?: string;
}

export interface AgentDatasetContext {
  id: string;
  name: string;
  type: string;
  queryMode: ImportSummaryItem['queryMode'];
  sourceLabel: string;
  fields: ImportSummaryItem['fields'];
  charts: ImportSummaryItem['charts'];
  previewResult?: QueryResult;
  query?: QueryDefinition;
}

export interface AgentExecutionContext {
  apiBaseUrl: string;
  connectionString?: string;
  modelMetadata?: ModelMetadata | null;
  datasets: AgentDatasetContext[];
  currentReport?: ReportDefinition | null;
  currentPages: PageDefinition[];
  currentQueries: QueryDefinition[];
  baselineQueries?: QueryDefinition[];
  theme?: ThemeDefinition | null;
}

export interface AgentArtifact {
  report: ReportDefinition;
  pages: PageDefinition[];
  queries: QueryDefinition[];
  theme?: ThemeDefinition | null;
}

export interface AgentRunRequest {
  message: string;
  settings: AiAgentSettings;
  context: AgentExecutionContext;
}

export interface AgentSessionResponse {
  sessionId: string;
  createdAt: string;
}

export interface AgentRunResponse {
  sessionId: string;
  runId: string;
  status: AiRunStatus;
}

export interface AgentStreamEventBase {
  type: string;
  sessionId: string;
  runId?: string;
  timestamp: string;
}

export interface AgentRunStatusEvent extends AgentStreamEventBase {
  type: 'run-status';
  status: AiRunStatus;
  message?: string;
}

export interface AgentStepStartedEvent extends AgentStreamEventBase {
  type: 'step-started';
  stepId: string;
  title: string;
  summary: string;
}

export interface AgentStepCompletedEvent extends AgentStreamEventBase {
  type: 'step-completed';
  stepId: string;
  title: string;
  summary: string;
  details?: string[];
  status?: Extract<AiStepStatus, 'completed' | 'failed' | 'cancelled'>;
}

export interface AgentValidationIssueEvent extends AgentStreamEventBase {
  type: 'validation-issue';
  issue: string;
  detail?: string;
}

export interface AgentArtifactProducedEvent extends AgentStreamEventBase {
  type: 'artifact-produced';
  artifact: AgentArtifact;
}

export interface AgentAssistantMessageEvent extends AgentStreamEventBase {
  type: 'assistant-message';
  messageId: string;
  content: string;
}

export interface AgentRunFailedEvent extends AgentStreamEventBase {
  type: 'run-failed';
  error: string;
}

export interface AgentRepairEvent extends AgentStreamEventBase {
  type: 'repair-started' | 'repair-completed';
  summary: string;
}

export interface AgentProgressEvent extends AgentStreamEventBase {
  type: 'progress';
  message: string;
  level?: AiLogLevel;
  stepId?: string;
  tag?: string;
}

export interface AgentHeartbeatEvent extends AgentStreamEventBase {
  type: 'heartbeat';
  message: string;
  stepId?: string;
  elapsedMs?: number;
  tag?: string;
}

export type AgentStreamEvent =
  | AgentRunStatusEvent
  | AgentStepStartedEvent
  | AgentStepCompletedEvent
  | AgentValidationIssueEvent
  | AgentArtifactProducedEvent
  | AgentAssistantMessageEvent
  | AgentRunFailedEvent
  | AgentRepairEvent
  | AgentProgressEvent
  | AgentHeartbeatEvent;
