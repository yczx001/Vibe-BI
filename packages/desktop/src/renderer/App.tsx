import React, { useEffect, useState } from 'react';
import { ReportRenderer, primeQueryCache } from '@vibe-bi/renderer';
import type { ReportDefinition, PageDefinition, QueryDefinition, ThemeDefinition, DataSourceConfig, QueryResult } from '@vibe-bi/core';
import {
  CommandButton,
  InfoPill,
  PaneCard,
  RightPaneSurface,
  RibbonBar,
  RibbonGroup,
  RibbonTabs,
  SideRail,
  WorkspaceHeader,
  WorkspaceLayout,
  WorkspaceWelcome,
  shellPalette,
} from './components/DesktopShell';
import { ShellIcon, type ShellIconName } from './components/ShellIcon';
import { DataWorkbench } from './components/DataWorkbench';
import { BasicDatasetPreview } from './components/BasicDatasetPreview';
import { ReportCanvasViewport } from './components/ReportCanvasViewport';
import { AiSessionPane } from './components/AiSessionPane';
import type {
  AiDesignColorMode,
  AiDesignDensity,
  AiDesignFilterPlacement,
  AiDesignFocus,
  AiDesignInteractionLevel,
  AiDesignIntakeDraft,
  AiDesignStylePreset,
} from './components/AiDesignIntakeDialog';
import { cancelAgentRun, createAgentSession, openAgentSessionStream, probeAgentConnection, submitAgentMessage } from './ai/agent-api';
import type {
  AgentDatasetContext,
  AgentExecutionContext,
  AgentStreamEvent,
  AiAgentSettings,
  AiConnectionProbeResult,
  AiMessage,
  AiRunStep,
  AiRunTrace,
} from './ai/types';
import type {
  CustomDatasetDraft,
  DatasetImportMode,
  DatasetVisualType,
  ImportSummaryItem,
  ImportedVisualCategory,
  ModelMetadata,
  QueryBuilderDraft,
  WorkspaceMode,
} from './types/workspace';

const sampleTheme: ThemeDefinition = {
  name: 'Vibe Editorial Light',
  colors: {
    primary: '#0E7490',
    secondary: '#C97A32',
    background: '#F4F1EA',
    surface: '#FCFBF8',
    text: '#152132',
    textSecondary: '#617082',
    chart: ['#0E7490', '#2563EB', '#C97A32', '#7C9A4D', '#8B5E3C', '#C2410C'],
  },
  typography: {
    fontFamily: '"Source Han Sans SC", "Microsoft YaHei UI", "Microsoft YaHei", "Noto Sans SC", "PingFang SC", "Segoe UI Variable", "Segoe UI", system-ui, sans-serif',
  },
  components: {
    card: {
      borderRadius: 22,
      shadow: '0 18px 40px rgba(15, 23, 42, 0.08), inset 0 1px 0 rgba(255,255,255,0.76)',
      padding: 22,
    },
  },
};

const sampleDataSource: DataSourceConfig = {
  type: 'local',
  connection: {
    server: 'mock',
    database: 'Test',
  },
};

const DEFAULT_REPORT_CANVAS_WIDTH = 1920;
const DEFAULT_REPORT_CANVAS_HEIGHT = 1080;
const REPORT_CANVAS_MIN_ZOOM_PERCENT = 30;
const REPORT_CANVAS_MAX_ZOOM_PERCENT = 180;

function clampReportCanvasZoom(value: number): number {
  if (!Number.isFinite(value)) {
    return 100;
  }

  return Math.max(
    REPORT_CANVAS_MIN_ZOOM_PERCENT,
    Math.min(REPORT_CANVAS_MAX_ZOOM_PERCENT, Math.round(value))
  );
}

function mergeThemeWithFallback(theme?: ThemeDefinition | null): ThemeDefinition {
  return {
    ...sampleTheme,
    ...theme,
    colors: {
      ...sampleTheme.colors,
      ...(theme?.colors || {}),
      chart: theme?.colors?.chart?.length ? theme.colors.chart : sampleTheme.colors.chart,
    },
    typography: {
      ...sampleTheme.typography,
      ...(theme?.typography || {}),
    },
    components: {
      ...sampleTheme.components,
      ...(theme?.components || {}),
      card: {
        ...sampleTheme.components.card,
        ...(theme?.components?.card || {}),
      },
    },
  };
}

const defaultAiSettings: AiAgentSettings = {
  provider: 'anthropic',
  baseUrl: '',
  apiKey: '',
  model: '',
  maxRepairRounds: 2,
  traceVerbosity: 'detailed',
};

const settingsInputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid rgba(32, 31, 30, 0.12)',
  background: '#FFFFFF',
  color: '#201F1E',
  fontSize: 13,
  boxSizing: 'border-box',
};

function buildDirectGeneratePrompt(datasetCount: number): string {
  const datasetHint = datasetCount > 0
    ? `当前已导入 ${datasetCount} 个可用数据集，请直接基于这些数据生成完整报表。`
    : '请基于当前模型上下文直接生成完整报表。';

  return [
    datasetHint,
    '不要先进入闲聊，也不要只给建议，直接开始生成首版报表。',
    '必须使用内置的 front-end design 设计能力，做出有设计感、有重点、有层次的页面。',
    '优先形成一个可直接展示的完整首页，包含清晰的信息主线、关键指标区、趋势区和明细区。',
    '如存在可用筛选器或适合做筛选的字段，请合理布局到页面中，并让整体排版协调。',
    '避免模板化和机械式均分布局，优先保证视觉层次、对齐、留白和可读性。',
  ].join('\n');
}

const defaultAiDesignIntakeDraft: AiDesignIntakeDraft = {
  stylePreset: 'boardroom-editorial',
  colorMode: 'light',
  focus: 'hero-metric',
  density: 'balanced',
  filterPlacement: 'top',
  interactionLevel: 'standard',
  notes: '',
};

function describeStylePreset(value: AiDesignStylePreset): string {
  switch (value) {
    case 'boardroom-editorial':
      return 'Boardroom Editorial：偏经营汇报，层级清晰、可读性优先。';
    case 'harbor-ledger':
      return 'Harbor Ledger：更像运营台账，强调细节、节奏和数据密度。';
    case 'midnight-industrial':
      return 'Midnight Industrial：深色工业风，强调沉稳、强对比和控制台感。';
    case 'atlas-feature':
      return 'Atlas Feature：更像专题页，强调叙事和视觉张力。';
  }
}

function describeColorMode(value: AiDesignColorMode): string {
  switch (value) {
    case 'light':
      return '整体以浅色为主，不要做成深色控制台。';
    case 'dark':
      return '整体以深色为主，但要控制灰雾感和低对比问题。';
    case 'auto':
      return '由 AI 自主选择最适合当前风格的明暗方向。';
  }
}

function describeFocus(value: AiDesignFocus): string {
  switch (value) {
    case 'hero-metric':
      return '首屏优先突出一个最关键的 hero 指标。';
    case 'trend-story':
      return '优先把趋势区做成最重要的叙事区。';
    case 'ranking-comparison':
      return '优先强调排行和结构对比。';
    case 'detail-ledger':
      return '优先保证明细和台账区更强、更有存在感。';
  }
}

function describeDensity(value: AiDesignDensity): string {
  switch (value) {
    case 'airy':
      return '整体留白更大，模块数量宁少勿乱。';
    case 'balanced':
      return '整体保持平衡的留白与信息密度。';
    case 'dense':
      return '允许更高的信息密度，但必须保持可读和分区清楚。';
  }
}

function describeFilterPlacement(value: AiDesignFilterPlacement): string {
  switch (value) {
    case 'top':
      return '筛选器优先放在顶部，并且做成页面的一部分。';
    case 'left':
      return '筛选器优先放在左侧，形成稳定边栏。';
    case 'right':
      return '筛选器优先放在右侧，但不要抢主视觉。';
  }
}

function describeInteractionLevel(value: AiDesignInteractionLevel): string {
  switch (value) {
    case 'subtle':
      return '交互要克制，只保留必要联动。';
    case 'standard':
      return '交互保持标准强度，至少有筛选联动和关键模块聚焦。';
    case 'rich':
      return '交互可以更丰富，但不能牺牲可读性和稳定性。';
  }
}

function buildGuidedGeneratePrompt(datasetCount: number, draft: AiDesignIntakeDraft): string {
  const datasetHint = datasetCount > 0
    ? `当前已导入 ${datasetCount} 个可用数据集，请直接基于这些数据生成完整报表。`
    : '请基于当前模型上下文直接生成完整报表。';

  return [
    datasetHint,
    '先按已确认的风格设置生成首版报表，不要先闲聊。',
    '必须使用内置 front-end design 设计能力，并优先保证真实数据可见、页面可读、后续可继续微调。',
    describeStylePreset(draft.stylePreset),
    describeColorMode(draft.colorMode),
    describeFocus(draft.focus),
    describeDensity(draft.density),
    describeFilterPlacement(draft.filterPlacement),
    describeInteractionLevel(draft.interactionLevel),
    '请在生成时先形成一个完整首页，再通过后续对话继续微调。',
    draft.notes.trim() ? `补充要求：${draft.notes.trim()}` : '',
  ].filter(Boolean).join('\n');
}

function buildGuidedGenerateDisplayMessage(draft: AiDesignIntakeDraft): string {
  return [
    '生成前已确认风格',
    `主题：${draft.stylePreset}`,
    `色调：${draft.colorMode}`,
    `重点：${draft.focus}`,
    `密度：${draft.density}`,
    `筛选：${draft.filterPlacement}`,
    `交互：${draft.interactionLevel}`,
    draft.notes.trim() ? `补充：${draft.notes.trim()}` : '',
  ].filter(Boolean).join(' · ');
}

type AiDesignQuestionField = 'stylePreset' | 'colorMode' | 'focus' | 'density' | 'filterPlacement' | 'interactionLevel';
type AiDesignQuestion = {
  field: AiDesignQuestionField;
  title: string;
  prompt: string;
  options: Array<{
    value: string;
    label: string;
    description?: string;
  }>;
};

function inferDesignFocusOptions(items: ImportSummaryItem[]): AiDesignFocus[] {
  const names = items.map((item) => `${item.name} ${item.type}`.toLowerCase()).join(' ');
  const options: AiDesignFocus[] = ['hero-metric'];

  if (/趋势|年月|月份|line|area|time|month/.test(names)) {
    options.push('trend-story');
  }
  if (/排名|排行|船舶|结构|船型|船龄|bar|pie/.test(names)) {
    options.push('ranking-comparison');
  }
  if (/明细|detail|table|matrix|透视/.test(names)) {
    options.push('detail-ledger');
  }

  return Array.from(new Set(options));
}

function hasFilterableFields(items: ImportSummaryItem[]): boolean {
  return items.some((item) => item.fields.some((field) => {
    const type = String(field.dataType || '').toLowerCase();
    return field.isVisible && !/(number|decimal|double|int|currency)/.test(type);
  }));
}

function buildAiDesignQuestions(
  items: ImportSummaryItem[],
  draft: AiDesignIntakeDraft,
  askedFields: AiDesignQuestionField[],
): AiDesignQuestion[] {
  const questions: AiDesignQuestion[] = [];
  const focusOptions = inferDesignFocusOptions(items);

  if (!askedFields.includes('stylePreset')) {
    questions.push({
      field: 'stylePreset',
      title: '先选这版的主题方向',
      prompt: '我先给你几个更适合当前报表的方向，你选一个起点，后面我再继续细化。',
      options: [
        { value: 'boardroom-editorial', label: 'Boardroom Editorial', description: '偏经营汇报，层级清晰、稳定。' },
        { value: 'harbor-ledger', label: 'Harbor Ledger', description: '更像运营台账，强调细节和节奏。' },
        { value: 'midnight-industrial', label: 'Midnight Industrial', description: '深色工业风，强调强对比。' },
        { value: 'atlas-feature', label: 'Atlas Feature', description: '更像专题页，适合做故事化表达。' },
      ],
    });
  }

  if (!askedFields.includes('colorMode')) {
    questions.push({
      field: 'colorMode',
      title: '这版更偏浅色还是深色？',
      prompt: `当前主题起点是 ${draft.stylePreset}，我需要确认整体明暗方向。`,
      options: [
        { value: 'light', label: '浅色', description: '更适合经营汇报和打印。' },
        { value: 'dark', label: '深色', description: '更适合工业风和大屏氛围。' },
        { value: 'auto', label: '自动', description: '让我根据主题自己决定。' },
      ],
    });
  }

  if (!askedFields.includes('focus') && focusOptions.length > 1) {
    questions.push({
      field: 'focus',
      title: '首屏最该强调什么？',
      prompt: '我会根据当前数据素材，把首屏的主要视觉重量放在你选的这类信息上。',
      options: focusOptions.map((value) => ({
        value,
        label: {
          'hero-metric': '重点指标优先',
          'trend-story': '趋势叙事优先',
          'ranking-comparison': '排行对比优先',
          'detail-ledger': '明细台账优先',
        }[value],
      })),
    });
  }

  if (!askedFields.includes('filterPlacement') && hasFilterableFields(items)) {
    questions.push({
      field: 'filterPlacement',
      title: '筛选器放哪更顺手？',
      prompt: '当前数据有足够的筛选字段，我会把筛选器做成页面的一部分，而不是孤立控件。',
      options: [
        { value: 'top', label: '顶部', description: '适合 boardroom 和专题页。' },
        { value: 'left', label: '左侧', description: '适合明细密度更高的页面。' },
        { value: 'right', label: '右侧', description: '适合不想干扰主视觉时。' },
      ],
    });
  }

  if (!askedFields.includes('density')) {
    questions.push({
      field: 'density',
      title: '这版信息密度要多大？',
      prompt: '我可以偏留白，也可以更紧凑，但会保持可读性优先。',
      options: [
        { value: 'airy', label: '留白更大' },
        { value: 'balanced', label: '平衡' },
        { value: 'dense', label: '信息更密' },
      ],
    });
  }

  if (!askedFields.includes('interactionLevel')) {
    questions.push({
      field: 'interactionLevel',
      title: '交互要多丰富？',
      prompt: '我会决定首轮交互密度，后续仍然可以再微调。',
      options: [
        { value: 'subtle', label: '克制' },
        { value: 'standard', label: '标准' },
        { value: 'rich', label: '更丰富' },
      ],
    });
  }

  return questions;
}

function createInitialTrace(runId: string): AiRunTrace {
  return {
    runId,
    status: 'queued',
    title: 'AI 执行链路',
    summary: '等待开始。',
    startedAt: new Date().toISOString(),
    steps: [],
    logs: [],
    issues: [],
    artifactReady: false,
  };
}

function upsertTraceStep(
  steps: AiRunStep[],
  step: AiRunStep,
): AiRunStep[] {
  const existingIndex = steps.findIndex((entry) => entry.stepId === step.stepId);
  if (existingIndex < 0) {
    return [...steps, step];
  }

  const next = [...steps];
  next[existingIndex] = {
    ...next[existingIndex],
    ...step,
    details: step.details ?? next[existingIndex].details,
  };
  return next;
}

function appendTraceLog(
  logs: AiRunTrace['logs'],
  nextLog: AiRunTrace['logs'][number],
): AiRunTrace['logs'] {
  const existing = logs.find((item) => item.id === nextLog.id);
  if (existing) {
    return logs;
  }

  const merged = [...logs, nextLog];
  if (merged.length > 80) {
    return merged.slice(merged.length - 80);
  }
  return merged;
}

function appendSystemMessage(
  messages: AiMessage[],
  content: string,
  timestamp: string,
  runId?: string,
): AiMessage[] {
  const trimmed = content.trim();
  if (!trimmed) {
    return messages;
  }

  const last = messages[messages.length - 1];
  if (last?.role === 'system' && last.content === trimmed && last.runId === runId) {
    return messages;
  }

  return [
    ...messages,
    {
      id: `system-${runId || 'global'}-${timestamp}-${messages.length}`,
      role: 'system',
      content: trimmed,
      timestamp,
      runId,
    },
  ];
}

function createQueryDefinitionFromDataset(item: ImportSummaryItem): QueryDefinition | null {
  const queryId = item.queryId?.trim();
  const baseDax = item.fullQuery?.trim();
  const executionDax = item.executionDax?.trim()
    || (typeof item.selectedEvaluateIndex === 'number' && item.evaluateQueries?.[item.selectedEvaluateIndex]
      ? item.evaluateQueries[item.selectedEvaluateIndex]?.trim()
      : undefined)
    || baseDax;

  if (!queryId || !baseDax) {
    return null;
  }

  return {
    id: queryId,
    name: item.name,
    dax: baseDax,
    executionDax,
    evaluateQueries: item.evaluateQueries || [],
    selectedEvaluateIndex: item.selectedEvaluateIndex,
    parameters: [],
  };
}

function buildAgentDatasetContexts(items: ImportSummaryItem[]): AgentDatasetContext[] {
  return items
    .filter((item) => item.hasQuery)
    .map((item) => ({
      id: item.id,
      name: item.name,
      type: item.type,
      queryMode: item.queryMode,
      sourceLabel: item.sourceLabel,
      fields: item.fields,
      charts: item.charts,
      previewResult: item.previewResult,
      query: createQueryDefinitionFromDataset(item) || undefined,
    }))
    .filter((item) => Boolean(item.query)) as AgentDatasetContext[];
}

function buildBaselineQueries(
  queries: QueryDefinition[],
  datasets: AgentDatasetContext[] = [],
): QueryDefinition[] {
  const baselineById = new Map<string, QueryDefinition>();

  queries.forEach((query) => {
    baselineById.set(query.id, {
      ...query,
      executionDax: query.dax,
      evaluateQueries: [],
      selectedEvaluateIndex: undefined,
    });
  });

  datasets.forEach((dataset) => {
    const query = dataset.query;
    if (!query?.id || !query.dax?.trim()) {
      return;
    }

    const existing = baselineById.get(query.id);
    baselineById.set(query.id, {
      ...(existing || query),
      id: query.id,
      name: query.name,
      dax: query.dax,
      executionDax: query.dax,
      evaluateQueries: [],
      selectedEvaluateIndex: undefined,
      parameters: query.parameters || existing?.parameters || [],
    });
  });

  return Array.from(baselineById.values());
}

type QueryRow = Record<string, unknown>;
type RibbonTabId = 'home' | 'dataset' | 'ai' | 'view';
type WorkspaceRailId = WorkspaceMode;
type LeftPaneSectionId = 'start' | 'import' | 'ai' | 'model';
type PowerBiScanItem = {
  id: string;
  processId: number;
  windowTitle: string;
  port: number;
  connectionTarget: string;
  label: string;
};
type DatasetDialogMode = 'import-json' | 'custom-dax' | 'query-builder';
type SettingsTabId = 'ai' | 'runtime';
type BrowserPreviewPayload = {
  report: ReportDefinition;
  pages: PageDefinition[];
  queries: QueryDefinition[];
  theme?: ThemeDefinition | null;
  apiBaseUrl?: string;
  dataSource?: DataSourceConfig;
  activeComponentId?: string;
  prefetchedRowsByQuery?: Record<string, QueryResult>;
};

function quoteDaxString(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function quoteDaxIdentifier(tableName: string, fieldName: string): string {
  return `'${tableName.replace(/'/g, "''")}'[${fieldName}]`;
}

function getQueryBuilderSelectionId(kind: 'column' | 'measure', tableName: string, name: string): string {
  return `${kind}:${tableName}:${name}`;
}

function buildQueryBuilderDax(draft: QueryBuilderDraft): string {
  if (draft.selections.length === 0 && draft.filters.length === 0) {
    return 'EVALUATE ROW("Hint", "请从左侧拖入字段或度量值开始构建查询")';
  }

  const columnSelections = draft.selections.filter((selection) => selection.kind === 'column');
  const measureSelections = draft.selections.filter((selection) => selection.kind === 'measure');
  const args: string[] = [];
  columnSelections.forEach((selection) => {
    args.push(quoteDaxIdentifier(selection.tableName, selection.name));
  });
  draft.filters
    .map((filter) => {
      if (!filter.fieldName || !filter.value.trim()) {
        return null;
      }

      const fieldRef = quoteDaxIdentifier(filter.tableName, filter.fieldName);
      if (filter.operator === 'contains') {
        return `KEEPFILTERS(FILTER(VALUES(${fieldRef}), CONTAINSSTRING(${fieldRef}, ${quoteDaxString(filter.value.trim())})))`;
      }

      return `KEEPFILTERS(FILTER(VALUES(${fieldRef}), ${fieldRef} = ${quoteDaxString(filter.value.trim())}))`;
    })
    .filter((value): value is string => Boolean(value))
    .forEach((value) => {
      args.push(value);
    });
  measureSelections.forEach((selection) => {
    args.push(`${quoteDaxString(selection.name)}, ${quoteDaxIdentifier(selection.tableName, selection.name)}`);
  });

  if (args.length === 0) {
    return 'EVALUATE ROW("Hint", "当前筛选条件缺少筛选值，暂时无法生成查询")';
  }

  return [
    'EVALUATE',
    'SUMMARIZECOLUMNS(',
    args.map((item) => `  ${item}`).join(',\n'),
    ')',
  ].join('\n');
}

function createGradientIcon(
  icon: ShellIconName,
  start: string,
  end: string,
  size = 22,
): React.ReactNode {
  return (
    <span
      aria-hidden="true"
      style={{
        position: 'relative',
        width: size,
        height: size,
        borderRadius: Math.max(7, Math.round(size * 0.32)),
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        background: 'linear-gradient(180deg, #FFFFFF 0%, #F4F7FB 100%)',
        border: '1px solid rgba(182, 190, 204, 0.92)',
        color: '#4B5563',
        fontWeight: 700,
        boxShadow: '0 4px 10px rgba(15, 23, 42, 0.08)',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: Math.max(3, Math.round(size * 0.18)),
          background: `linear-gradient(90deg, ${start} 0%, ${end} 100%)`,
        }}
      />
      <span style={{ transform: 'translateY(1px)' }}>
        <ShellIcon name={icon} size={Math.round(size * 0.62)} />
      </span>
    </span>
  );
}

function createDoubleChevronIcon(
  direction: 'left' | 'right' | 'up' | 'down',
  color = '#0F8C72',
  size = 22,
): React.ReactNode {
  const iconName = direction === 'up' || direction === 'down'
    ? (direction === 'up' ? 'chevron-up' : 'chevron-down')
    : 'chevron-left';
  const isHorizontal = direction === 'left' || direction === 'right';
  const overlapOffset = Math.max(6, Math.round(size * 0.48));

  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        color,
        flexDirection: isHorizontal ? 'row' : 'column',
        transform: direction === 'right' ? 'rotate(180deg)' : 'none',
      }}
    >
      <span
        style={{
          display: 'inline-flex',
          transform: isHorizontal ? 'translateY(1px)' : 'translateX(0.5px)',
        }}
      >
        <ShellIcon name={iconName} size={Math.round(size * 0.78)} strokeWidth={2.5} />
      </span>
      <span
        style={{
          display: 'inline-flex',
          marginLeft: isHorizontal ? -overlapOffset : 0,
          marginTop: isHorizontal ? 0 : -overlapOffset,
          transform: isHorizontal ? 'translateY(1px)' : 'translateX(0.5px)',
        }}
      >
        <ShellIcon name={iconName} size={Math.round(size * 0.78)} strokeWidth={2.5} />
      </span>
    </span>
  );
}

function createMonoIcon(icon: ShellIconName, size = 16): React.ReactNode {
  return (
    <span
      aria-hidden="true"
      style={{
        color: 'currentColor',
        lineHeight: 1,
        display: 'inline-flex',
      }}
    >
      <ShellIcon name={icon} size={size} />
    </span>
  );
}

function isNumericLike(value: unknown): boolean {
  return typeof value === 'number'
    || (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value)));
}

function isDateLike(value: unknown): boolean {
  return value instanceof Date
    || (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Date.parse(value)));
}

function isTemporalFieldName(field: string): boolean {
  const normalized = field.toLowerCase();
  return /(date|day|week|month|quarter|year|time|period|calendar|日期|日|周|月|季|年|时间|期间)/i.test(normalized);
}

function isTemporalFieldValue(value: unknown): boolean {
  if (isDateLike(value)) {
    return true;
  }

  if (typeof value !== 'string') {
    return false;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }

  return /^(\d{4}[-/年]\d{1,2}([-/月]\d{1,2}日?)?|\d{1,2}月|\d{1,2}季度|q[1-4]|\d{4}q[1-4]|\d{4}年)$/i.test(trimmed);
}

function getQueryFieldNames(result?: QueryResult): string[] {
  return result?.columns
    .map((column) => column.name)
    .filter((field) => field !== '__rowIndex') || [];
}

function getNumericFieldNames(rows: QueryRow[], fieldNames: string[]): string[] {
  return fieldNames.filter((field) => rows.some((row) => isNumericLike(row[field])));
}

function getCategoryFieldName(
  rows: QueryRow[],
  fieldNames: string[],
  valueFields: string[],
  preferredField?: string
): string {
  if (preferredField && fieldNames.includes(preferredField)) {
    return preferredField;
  }

  const categoryField = fieldNames.find((field) => {
    if (valueFields.includes(field)) {
      return false;
    }

    return rows.some((row) => {
      const value = row[field];
      return typeof value === 'string' || isDateLike(value);
    });
  });

  if (categoryField) {
    return categoryField;
  }

  return fieldNames.find((field) => !valueFields.includes(field)) || '__rowIndex';
}

function getDistinctValueCount(rows: QueryRow[], field: string): number {
  return new Set(
    rows
      .map((row) => row[field])
      .filter((value) => value !== null && value !== undefined && String(value).trim() !== '')
      .map((value) => String(value))
  ).size;
}

function getPieCategoryFieldName(rows: QueryRow[], fieldNames: string[], valueFields: string[]): string {
  const dimensionFields = fieldNames.filter((field) => !valueFields.includes(field));
  const getNonTemporalFields = (fields: string[]) => fields.filter((field) => {
    if (isTemporalFieldName(field)) {
      return false;
    }

    return rows.some((row) => !isTemporalFieldValue(row[field]));
  });

  const nonTemporalFields = getNonTemporalFields(dimensionFields);

  const rankedFields = (nonTemporalFields.length > 0 ? nonTemporalFields : dimensionFields)
    .map((field) => ({
      field,
      distinctCount: getDistinctValueCount(rows, field),
    }))
    .filter((item) => item.distinctCount > 0)
    .sort((a, b) => a.distinctCount - b.distinctCount);

  if (rankedFields.length > 0) {
    return rankedFields[0].field;
  }

  return getCategoryFieldName(rows, fieldNames, valueFields);
}

function resolveComponentTypeFromDatasetChartType(chartType: DatasetVisualType): PageDefinition['components'][number]['type'] {
  if (chartType === 'kpi-card') {
    return 'kpi-card';
  }
  if (chartType === 'data-table') {
    return 'data-table';
  }
  if (chartType === 'filter') {
    return 'filter';
  }
  return 'echarts';
}

function createDatasetFields(result?: QueryResult) {
  if (!result) {
    return [];
  }

  return result.columns
    .filter((column) => column.name !== '__rowIndex')
    .map((column) => ({
      name: column.name,
      label: column.name,
      dataType: column.dataType,
      isVisible: true,
    }));
}

function filterQueryResultByVisibleFields(result: QueryResult | undefined, item: ImportSummaryItem): QueryResult | undefined {
  if (!result) {
    return undefined;
  }

  const visibleFieldNames = new Set(item.fields.filter((field) => field.isVisible).map((field) => field.name));
  if (visibleFieldNames.size === 0) {
    return undefined;
  }

  return {
    ...result,
    columns: result.columns.filter((column) => column.name === '__rowIndex' || visibleFieldNames.has(column.name)),
    rows: result.rows.map((row) => Object.fromEntries(
      Object.entries(row).filter(([key]) => key === '__rowIndex' || visibleFieldNames.has(key))
    )),
  };
}

function createDatasetAsset(input: {
  id: string;
  name: string;
  type: string;
  category: ImportedVisualCategory;
  score: number;
  rowCount: number;
  executionTime: number;
  fullQuery?: string;
  executionDax?: string;
  evaluateQueries?: string[];
  selectedEvaluateIndex?: number;
  queryId?: string;
  componentId?: string;
  hasQuery: boolean;
  isRendered?: boolean;
  sourceOrder: number;
  queryMode: 'import-json' | 'custom-dax' | 'query-builder';
  sourceLabel: string;
  chartType: DatasetVisualType;
  previewResult?: QueryResult;
  isVisible?: boolean;
}): ImportSummaryItem {
  const componentType = resolveComponentTypeFromDatasetChartType(input.chartType);
  const chartId = `${input.id}-chart-0`;
  return {
    id: input.id,
    name: input.name,
    type: input.type,
    category: input.category,
    score: input.score,
    rowCount: input.rowCount,
    executionTime: input.executionTime,
    fullQuery: input.fullQuery,
    executionDax: input.executionDax,
    evaluateQueries: input.evaluateQueries,
    selectedEvaluateIndex: input.selectedEvaluateIndex,
    queryId: input.queryId,
    componentId: input.componentId,
    hasQuery: input.hasQuery,
    isRendered: input.isRendered ?? false,
    sourceOrder: input.sourceOrder,
    queryMode: input.queryMode,
    sourceLabel: input.sourceLabel,
    isVisible: input.isVisible ?? (input.category !== 'functional' && input.category !== 'decorative'),
    fields: createDatasetFields(input.previewResult),
    charts: [
      {
        id: chartId,
        name: `${input.name} 图表`,
        componentType,
        chartType: input.chartType,
        isVisible: input.category !== 'functional' && input.category !== 'decorative',
      },
    ],
    previewResult: input.previewResult,
  };
}

type PerformanceAnalyzerEvent = {
  name?: string;
  id?: string;
  parentId?: string;
  metrics?: unknown;
  [key: string]: unknown;
};

type VisualLookupEntry = {
  title?: string;
  type?: string;
  summaryKey?: string;
};

type VisualMetadataCandidate = {
  index: number;
  ids: string[];
  title?: string;
  type?: string;
  eventName?: string;
  isLifecycleEvent?: boolean;
  summaryKey?: string;
};

function normalizeLookupToken(value: string): string {
  return value.replace(/[^a-z0-9]/gi, '').toLowerCase();
}

function canonicalizeEventId(value: string): string {
  return normalizeLookupToken(value);
}

function isObjectLike(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function tryParseJsonFragment(value: string): unknown {
  const trimmed = value.trim();
  if (
    trimmed.length < 2
    || !(
      (trimmed.startsWith('{') && trimmed.endsWith('}'))
      || (trimmed.startsWith('[') && trimmed.endsWith(']'))
    )
  ) {
    return undefined;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return undefined;
  }
}

function flattenPrimitiveValues(value: unknown): string[] {
  if (value == null) {
    return [];
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return [String(value)];
  }

  if (Array.isArray(value)) {
    return value.flatMap(flattenPrimitiveValues);
  }

  if (isObjectLike(value)) {
    for (const candidateKey of [
      'value',
      'text',
      'data',
      'content',
      'stringvalue',
      'formattedvalue',
      'displayvalue',
      'numbervalue',
      'integervalue',
      'intvalue',
      'doublevalue',
      'longvalue',
      'floatvalue',
      'decimalvalue',
      'boolvalue',
      'booleanvalue',
    ]) {
      const entry = Object.entries(value).find(([rawKey]) => normalizeLookupToken(rawKey) === candidateKey);
      if (entry) {
        return flattenPrimitiveValues(entry[1]);
      }
    }
  }

  return [];
}

function findMetricValues(source: unknown, targetKeys: string[], maxDepth = 6): unknown[] {
  const normalizedTargets = new Set(targetKeys.map(normalizeLookupToken));
  const visited = new WeakSet<object>();
  const results: unknown[] = [];

  const walk = (value: unknown, depth: number) => {
    if (value == null || depth > maxDepth) {
      return;
    }

    if (typeof value === 'string') {
      const parsed = tryParseJsonFragment(value);
      if (parsed !== undefined) {
        walk(parsed, depth + 1);
      }
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((item) => walk(item, depth + 1));
      return;
    }

    if (!isObjectLike(value)) {
      return;
    }

    if (visited.has(value)) {
      return;
    }
    visited.add(value);

    const namedEntryName = Object.entries(value).find(([rawKey]) => {
      const normalizedKey = normalizeLookupToken(rawKey);
      return normalizedKey === 'name'
        || normalizedKey === 'key'
        || normalizedKey === 'metric'
        || normalizedKey === 'metricname'
        || normalizedKey === 'label';
    });
    const namedEntryValue = Object.entries(value).find(([rawKey]) => {
      const normalizedKey = normalizeLookupToken(rawKey);
      return normalizedKey === 'value'
        || normalizedKey === 'metricvalue'
        || normalizedKey === 'text'
        || normalizedKey === 'data'
        || normalizedKey === 'content'
        || normalizedKey === 'stringvalue'
        || normalizedKey === 'formattedvalue'
        || normalizedKey === 'displayvalue'
        || normalizedKey === 'numbervalue'
        || normalizedKey === 'integervalue'
        || normalizedKey === 'intvalue'
        || normalizedKey === 'doublevalue'
        || normalizedKey === 'longvalue'
        || normalizedKey === 'floatvalue'
        || normalizedKey === 'decimalvalue'
        || normalizedKey === 'boolvalue'
        || normalizedKey === 'booleanvalue';
    });

    if (namedEntryName && namedEntryValue) {
      const metricName = flattenPrimitiveValues(namedEntryName[1])[0];
      if (metricName && normalizedTargets.has(normalizeLookupToken(metricName))) {
        results.push(namedEntryValue[1]);
      }
    }

    for (const [rawKey, rawValue] of Object.entries(value)) {
      if (normalizedTargets.has(normalizeLookupToken(rawKey))) {
        results.push(rawValue);
      }
      walk(rawValue, depth + 1);
    }
  };

  walk(source, 0);
  return results;
}

function extractStringCandidates(source: unknown, keys: string[]): string[] {
  const seen = new Set<string>();
  const values: string[] = [];

  for (const rawValue of findMetricValues(source, keys)) {
    for (const candidate of flattenPrimitiveValues(rawValue)) {
      if (!seen.has(candidate)) {
        seen.add(candidate);
        values.push(candidate);
      }
    }
  }

  return values;
}

function extractFirstStringMetric(
  source: unknown,
  keys: string[],
  predicate?: (value: string) => boolean,
  preferLongest = false
): string | undefined {
  for (const key of keys) {
    const candidates = extractStringCandidates(source, [key])
      .filter((value) => (predicate ? predicate(value) : true));

    if (candidates.length === 0) {
      continue;
    }

    if (preferLongest) {
      return [...candidates].sort((a, b) => b.length - a.length)[0];
    }

    return candidates[0];
  }

  return undefined;
}

function parseNumberLike(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const cleaned = value.replace(/,/g, '').trim();
    if (!cleaned) {
      return undefined;
    }

    const parsed = Number(cleaned);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
}

function extractNumberMetric(source: unknown, keys: string[]): number | undefined {
  for (const key of keys) {
    for (const rawValue of findMetricValues(source, [key])) {
      const directValue = parseNumberLike(rawValue);
      if (directValue !== undefined) {
        return directValue;
      }

      for (const candidate of flattenPrimitiveValues(rawValue)) {
        const parsed = parseNumberLike(candidate);
        if (parsed !== undefined) {
          return parsed;
        }
      }
    }
  }

  return undefined;
}

function isLikelyVisualTitle(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 200) {
    return false;
  }

  return !/^(visual container lifecycle|execute dax query)$/i.test(trimmed)
    && !/\b(EVALUATE|DEFINE|SUMMARIZECOLUMNS|TOPN|CALCULATETABLE)\b/i.test(trimmed);
}

function isLikelyVisualType(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 100 || /\r|\n/.test(trimmed)) {
    return false;
  }

  return !/\b(EVALUATE|DEFINE|SUMMARIZECOLUMNS|TOPN|CALCULATETABLE)\b/i.test(trimmed);
}

function looksLikeDaxQuery(value: string): boolean {
  return /\b(EVALUATE|DEFINE|SUMMARIZECOLUMNS|CALCULATETABLE|ROW|TOPN)\b/i.test(value);
}

function extractVisualTitle(event: PerformanceAnalyzerEvent): string | undefined {
  return extractFirstStringMetric(
    event,
    ['visualTitle', 'visualName', 'displayName', 'objectTitle', 'displayTitle', 'titleText', 'title'],
    isLikelyVisualTitle
  );
}

function extractVisualType(event: PerformanceAnalyzerEvent): string | undefined {
  return extractFirstStringMetric(
    event,
    ['visualType', 'visualTypeName', 'visualClassName', 'visualKind', 'typeName', 'chartType', 'type'],
    isLikelyVisualType
  );
}

function extractQueryText(event: PerformanceAnalyzerEvent): string | undefined {
  const directQuery = extractFirstStringMetric(
    event,
    ['QueryText', 'queryText', 'Query', 'query', 'CommandText', 'commandText', 'textData', 'statement'],
    looksLikeDaxQuery,
    true
  );

  if (directQuery) {
    return directQuery;
  }

  const fallbackCandidates = extractStringCandidates(
    event,
    ['QueryText', 'queryText', 'Query', 'query', 'CommandText', 'commandText', 'textData', 'statement']
  )
    .filter((value) => value.length >= 10);

  return fallbackCandidates.sort((a, b) => b.length - a.length)[0];
}

function countEvaluateStatements(queryText: string): number {
  return (queryText.match(/^\s*EVALUATE\b/gim) || []).length;
}

function splitDaxEvaluateCandidates(queryText: string): string[] {
  const lines = queryText.split(/\r?\n/);
  const defineLines: string[] = [];
  const evaluateBlocks: string[][] = [];
  let currentBlock: string[] | null = null;

  for (const line of lines) {
    if (/^\s*EVALUATE\b/i.test(line)) {
      if (currentBlock && currentBlock.length > 0) {
        evaluateBlocks.push(currentBlock);
      }
      currentBlock = [line];
      continue;
    }

    if (currentBlock) {
      currentBlock.push(line);
    } else {
      defineLines.push(line);
    }
  }

  if (currentBlock && currentBlock.length > 0) {
    evaluateBlocks.push(currentBlock);
  }

  if (evaluateBlocks.length <= 1) {
    return [queryText.trim()];
  }

  const definePrefix = defineLines.join('\n').trim();
  return evaluateBlocks
    .map((block) => [definePrefix, block.join('\n').trim()].filter(Boolean).join('\n'))
    .filter(Boolean);
}

function inferVisualTitleFromQuery(queryText: string): string | undefined {
  const fieldMatches = [...queryText.matchAll(/(?:'[^']+'|[A-Za-z0-9_]+)\[([^\]]+)\]/g)]
    .map((match) => match[1]?.trim())
    .filter((value): value is string => Boolean(value));

  const aliasMatches = [...queryText.matchAll(/"([^"\r\n]{1,80})"\s*,/g)]
    .map((match) => match[1]?.trim())
    .filter((value): value is string => Boolean(value));

  const preferredField = fieldMatches.find((field) => !isTemporalFieldName(field));
  const preferredAlias = aliasMatches.find((alias) => isLikelyVisualTitle(alias));

  if (preferredField && /分析|占比|分布|结构|趋势/i.test(preferredAlias || '')) {
    return preferredAlias;
  }

  if (preferredField) {
    return `${preferredField}分析`;
  }

  return preferredAlias || fieldMatches[0];
}

function isLikelyTableLikeQuery(queryText: string): boolean {
  const lowerQuery = queryText.toLowerCase();
  const fieldReferenceCount = (queryText.match(/(?:'[^']+'|[A-Za-z0-9_]+)\[[^\]]+\]/g) || []).length;

  return /rollupaddissubtotal|rollupgroup|subtotal|topnskip|substitutewithindex|naturalleftouterjoin|totalflag|issubtotal/i.test(lowerQuery)
    || countEvaluateStatements(queryText) > 1
    || fieldReferenceCount >= 6;
}

function resolveVisualCategory(visualType: string, hasQuery: boolean): ImportedVisualCategory {
  const type = visualType.toLowerCase();

  if (/slicer|navigator|button|drill|filter/.test(type)) {
    return 'functional';
  }

  if (/table|matrix|pivot|chart|card|kpi|bar|column|linechart|area|pie|doughnut|donut|funnel|scatter|combo|map|gauge|radar/.test(type)) {
    return 'display';
  }

  if (/shape|textbox|text|image|icon|blank|^line$/.test(type)) {
    return 'decorative';
  }

  return hasQuery ? 'display' : 'decorative';
}

function getVisualCategoryLabel(category: ImportedVisualCategory): string {
  switch (category) {
    case 'display':
      return '展示型';
    case 'functional':
      return '功能型';
    case 'custom':
      return '自定义';
    case 'decorative':
    default:
      return '装饰型';
  }
}

function isWeakVisualName(value?: string): boolean {
  if (!value) {
    return true;
  }

  return /^Visual \d+$/i.test(value.trim());
}

function isWeakVisualType(value?: string): boolean {
  if (!value) {
    return true;
  }

  return value.trim().toLowerCase() === 'unknown';
}

function buildImportSummaryKey(
  ids: string[],
  title: string | undefined,
  type: string | undefined,
  fallbackIndex: number
): string {
  const canonicalId = ids.map(canonicalizeEventId).find(Boolean);
  if (canonicalId) {
    return canonicalId;
  }

  const token = normalizeLookupToken([title, type].filter(Boolean).join('-'));
  return token ? `meta-${token}-${fallbackIndex}` : `meta-${fallbackIndex}`;
}

function extractEventIds(event: PerformanceAnalyzerEvent): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];

  for (const key of ['parentId', 'visualId', 'visualContainerId', 'activityId', 'objectId', 'id']) {
    for (const candidate of extractStringCandidates(event, [key])) {
      const canonical = canonicalizeEventId(candidate);
      if (!canonical || seen.has(canonical)) {
        continue;
      }

      seen.add(canonical);
      ids.push(candidate.trim());
    }
  }

  return ids;
}

function registerVisualLookup(
  visualMap: Map<string, VisualLookupEntry>,
  ids: string[],
  title?: string,
  type?: string,
  summaryKey?: string
) {
  ids.forEach((rawId) => {
    const canonicalId = canonicalizeEventId(rawId);
    if (!canonicalId) {
      return;
    }

    const existing = visualMap.get(canonicalId);
    visualMap.set(canonicalId, {
      title: title || existing?.title,
      type: type || existing?.type,
      summaryKey: summaryKey || existing?.summaryKey,
    });
  });
}

function resolveVisualLookup(
  visualMap: Map<string, VisualLookupEntry>,
  ids: string[]
): (VisualLookupEntry & { matchedId?: string }) | undefined {
  for (const rawId of ids) {
    const canonicalId = canonicalizeEventId(rawId);
    if (!canonicalId) {
      continue;
    }

    const exactMatch = visualMap.get(canonicalId);
    if (exactMatch) {
      return { ...exactMatch, matchedId: rawId };
    }

    for (const [storedId, entry] of visualMap.entries()) {
      if (storedId.includes(canonicalId) || canonicalId.includes(storedId)) {
        return { ...entry, matchedId: storedId };
      }
    }
  }

  return undefined;
}

function getMetricKeySummary(metrics: unknown): string[] {
  if (Array.isArray(metrics)) {
    return metrics.flatMap((item) => {
      if (!isObjectLike(item)) {
        return [];
      }

      const namedMetric = extractFirstStringMetric(item, ['name', 'key', 'metric', 'metricName', 'label']);
      return namedMetric ? [namedMetric] : Object.keys(item);
    });
  }

  if (isObjectLike(metrics)) {
    return Object.keys(metrics);
  }

  return [];
}

function isVisualLifecycleEvent(name?: string): boolean {
  const normalized = normalizeLookupToken(name || '');
  return normalized.includes('visualcontainerlifecycle')
    || (normalized.includes('visual') && normalized.includes('lifecycle'));
}

function isDaxQueryEvent(name?: string): boolean {
  const normalized = normalizeLookupToken(name || '');
  return normalized.includes('executedaxquery')
    || (normalized.includes('dax') && normalized.includes('query'));
}

type ImportInspectorMode = 'dax' | 'data';

interface ImportInspectorState {
  item: ImportSummaryItem;
  mode: ImportInspectorMode;
}

const defaultImportGroupCollapsedState: Record<ImportedVisualCategory, boolean> = {
  display: true,
  functional: true,
  decorative: true,
  custom: true,
};

function CopyTextButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch (error) {
      console.error('Failed to copy text:', error);
    }
  };

  return (
    <button
      onClick={handleCopy}
      style={{
        border: '1px solid rgba(32, 31, 30, 0.14)',
        backgroundColor: '#F3F2F1',
        color: '#201F1E',
        borderRadius: 8,
        padding: '6px 10px',
        fontSize: 12,
        cursor: 'pointer',
      }}
    >
      {copied ? '已复制' : '复制'}
    </button>
  );
}

function getPreviewColumnsFromRows(rows: QueryRow[]): string[] {
  if (rows.length === 0) {
    return [];
  }

  const firstRow = rows.find((row) => row && typeof row === 'object' && !Array.isArray(row));
  return firstRow
    ? Object.keys(firstRow).filter((key) => key !== '__rowIndex')
    : [];
}

interface ImportedDataViewerProps {
  item: ImportSummaryItem;
  executeQuery: (dax: string) => Promise<QueryResult>;
}

function ImportedDataViewer({ item, executeQuery }: ImportedDataViewerProps) {
  const evaluateQueries = item.evaluateQueries && item.evaluateQueries.length > 0
    ? item.evaluateQueries
    : [item.executionDax || item.fullQuery || ''].filter(Boolean);
  const defaultTab = Math.min(
    Math.max(item.selectedEvaluateIndex || 0, 0),
    Math.max(evaluateQueries.length - 1, 0)
  );
  const [activeTab, setActiveTab] = useState(defaultTab);
  const [resultsByTab, setResultsByTab] = useState<Record<number, {
    loading: boolean;
    rows?: QueryRow[];
    columns?: string[];
    error?: string;
  }>>({});

  useEffect(() => {
    setActiveTab(defaultTab);
    setResultsByTab({});
  }, [item.id, defaultTab]);

  const activeQuery = evaluateQueries[activeTab];
  const activeResult = resultsByTab[activeTab];

  useEffect(() => {
    if (!activeQuery || activeResult?.loading || activeResult?.rows || activeResult?.error) {
      return;
    }

    let cancelled = false;
    setResultsByTab((previous) => ({
      ...previous,
      [activeTab]: {
        loading: true,
      },
    }));

    executeQuery(activeQuery)
      .then((result) => {
        if (cancelled) {
          return;
        }

        setResultsByTab((previous) => ({
          ...previous,
          [activeTab]: {
            loading: false,
            rows: (result.rows || []) as QueryRow[],
            columns: (result.columns || []).map((column) => column.name).filter((name) => name !== '__rowIndex'),
          },
        }));
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        setResultsByTab((previous) => ({
          ...previous,
          [activeTab]: {
            loading: false,
            error: error instanceof Error ? error.message : String(error),
          },
        }));
      });

    return () => {
      cancelled = true;
    };
  }, [activeQuery, activeResult, activeTab, executeQuery]);

  const previewRows = (activeResult?.rows || []).slice(0, 200);
  const previewColumns = activeResult?.columns && activeResult.columns.length > 0
    ? activeResult.columns
    : getPreviewColumnsFromRows(previewRows);

  if (evaluateQueries.length === 0) {
    return <div style={{ color: '#605E5C' }}>当前视觉对象没有可执行的查询。</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {evaluateQueries.length > 1 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {evaluateQueries.map((_, index) => (
            <button
              key={index}
              onClick={() => setActiveTab(index)}
              style={{
                padding: '6px 12px',
                borderRadius: 999,
                border: '1px solid rgba(32, 31, 30, 0.14)',
                backgroundColor: activeTab === index ? '#0F6CBD' : '#F3F2F1',
                color: activeTab === index ? '#FFFFFF' : '#201F1E',
                cursor: 'pointer',
                fontSize: 12,
              }}
            >
              结果 {index + 1}
            </button>
          ))}
        </div>
      )}
      {activeResult?.loading ? (
        <div style={{ color: '#605E5C' }}>正在加载查询结果...</div>
      ) : activeResult?.error ? (
        <div style={{ color: '#F87171' }}>查询结果加载失败: {activeResult.error}</div>
      ) : (
        <>
          <div style={{ color: '#605E5C', fontSize: 13 }}>
            共 {activeResult?.rows?.length || 0} 行，当前预览前 {previewRows.length} 行
          </div>
          {previewColumns.length > 0 ? (
            <div
              style={{
                overflow: 'auto',
                border: '1px solid rgba(32, 31, 30, 0.12)',
                borderRadius: 10,
              }}
            >
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ backgroundColor: '#F3F2F1' }}>
                    {previewColumns.map((column) => (
                      <th
                        key={column}
                        style={{
                          padding: '10px 12px',
                          textAlign: 'left',
                          color: '#201F1E',
                          borderBottom: '1px solid rgba(32, 31, 30, 0.12)',
                          position: 'sticky',
                          top: 0,
                        }}
                      >
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.length > 0 ? previewRows.map((row, index) => (
                    <tr key={(row.__rowIndex as string | number | undefined) ?? index}>
                      {previewColumns.map((column) => (
                        <td
                          key={`${index}-${column}`}
                          style={{
                            padding: '10px 12px',
                            color: '#201F1E',
                            borderBottom: '1px solid #E1DFDD',
                            verticalAlign: 'top',
                          }}
                        >
                          {typeof row[column] === 'object' ? JSON.stringify(row[column]) : String(row[column] ?? '')}
                        </td>
                      ))}
                    </tr>
                  )) : (
                    <tr>
                      <td
                        colSpan={previewColumns.length}
                        style={{
                          padding: '14px 12px',
                          color: '#605E5C',
                          borderBottom: '1px solid #E1DFDD',
                        }}
                      >
                        当前查询已成功执行，但没有返回数据行。
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ color: '#605E5C' }}>当前没有可展示的数据。</div>
          )}
        </>
      )}
    </div>
  );
}

interface ImportInspectorModalProps {
  state: ImportInspectorState | null;
  onClose: () => void;
  executeQuery: (dax: string) => Promise<QueryResult>;
}

function ImportInspectorModal({ state, onClose, executeQuery }: ImportInspectorModalProps) {
  useEffect(() => {
    if (!state) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state, onClose]);

  if (!state) {
    return null;
  }

  const { item, mode } = state;
  const title = mode === 'dax' ? `${item.name} - DAX` : `${item.name} - 查询结果`;
  const daxText = item.fullQuery || item.executionDax || '';

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(32, 31, 30, 0.22)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: 24,
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          width: 'min(1100px, 100%)',
          maxHeight: '80vh',
          backgroundColor: '#FFFFFF',
          border: '1px solid rgba(32, 31, 30, 0.12)',
          borderRadius: 16,
          boxShadow: '0 24px 64px rgba(0, 0, 0, 0.18)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid rgba(32, 31, 30, 0.12)',
          }}
        >
          <div style={{ color: '#201F1E', fontWeight: 600 }}>{title}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {mode === 'dax' && daxText ? <CopyTextButton value={daxText} /> : null}
            <button
              onClick={onClose}
              style={{
                border: 'none',
                background: 'transparent',
                color: '#605E5C',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ShellIcon name="close" size={16} />
            </button>
          </div>
        </div>
        <div style={{ padding: 20, overflow: 'auto' }}>
          {mode === 'dax' ? (
            <pre
              style={{
                margin: 0,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                fontSize: 13,
                lineHeight: 1.6,
                color: '#201F1E',
              }}
            >
              {daxText}
            </pre>
          ) : (
            <ImportedDataViewer item={item} executeQuery={executeQuery} />
          )}
        </div>
      </div>
    </div>
  );
}

export function App() {
  const [apiUrl, setApiUrl] = useState<string>('');
  const [agentBaseUrl, setAgentBaseUrl] = useState<string>('');
  const [error, setError] = useState<string>('');
  const browserPreviewParams = React.useMemo(() => {
    const search = new URLSearchParams(window.location.search);
    return {
      enabled: search.get('browser-preview') === '1',
      previewUrl: search.get('preview-url')?.trim() || '',
    };
  }, []);
  const isBrowserPreview = browserPreviewParams.enabled;
  const [browserPreviewPayload, setBrowserPreviewPayload] = useState<BrowserPreviewPayload | null>(null);

  // Connection state
  const [connectionString, setConnectionString] = useState<string>('');
  const [connectionDatabase, setConnectionDatabase] = useState<string>('');
  const [connectionMode, setConnectionMode] = useState<'pbi' | 'tabular'>('pbi');
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string>('');
  const [isScanningPowerBi, setIsScanningPowerBi] = useState(false);
  const [powerBiScanItems, setPowerBiScanItems] = useState<PowerBiScanItem[]>([]);
  const [selectedPowerBiScanId, setSelectedPowerBiScanId] = useState<string>('');
  const [powerBiScanMessage, setPowerBiScanMessage] = useState<string>('');
  const [modelMetadata, setModelMetadata] = useState<ModelMetadata | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [activeTab, setActiveTab] = useState<'tables' | 'measures'>('tables');
  const [showConnectDialog, setShowConnectDialog] = useState(false);

  const [generationProgress, setGenerationProgress] = useState<string>('');
  const [generatedReport, setGeneratedReport] = useState<ReportDefinition | null>(null);
  const [generatedPages, setGeneratedPages] = useState<PageDefinition[]>([]);
  const [generatedQueries, setGeneratedQueries] = useState<QueryDefinition[]>([]);

  // Settings state
  const [showSettings, setShowSettings] = useState(false);
  const [activeSettingsTab, setActiveSettingsTab] = useState<SettingsTabId>('ai');
  const [aiSettings, setAiSettings] = useState<AiAgentSettings>(defaultAiSettings);
  const [aiSettingsLoaded, setAiSettingsLoaded] = useState(false);
  const [isTestingAiConnection, setIsTestingAiConnection] = useState(false);
  const [aiConnectionProbe, setAiConnectionProbe] = useState<AiConnectionProbeResult | null>(null);
  const [aiConnectionProbeError, setAiConnectionProbeError] = useState('');
  const [aiSessionId, setAiSessionId] = useState<string>('');
  const [aiMessages, setAiMessages] = useState<AiMessage[]>([]);
  const [aiTraceMap, setAiTraceMap] = useState<Record<string, AiRunTrace>>({});
  const [aiActiveRunId, setAiActiveRunId] = useState<string | undefined>(undefined);
  const [aiAgentError, setAiAgentError] = useState<string>('');
  const [aiDesignIntakeDraft, setAiDesignIntakeDraft] = useState<AiDesignIntakeDraft>(defaultAiDesignIntakeDraft);
  const [aiDesignAskedFields, setAiDesignAskedFields] = useState<AiDesignQuestionField[]>([]);
  const [aiDesignPendingQuestion, setAiDesignPendingQuestion] = useState<AiDesignQuestion | null>(null);

  // Performance Analyzer import state
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string>('');
  const [importSummary, setImportSummary] = useState<ImportSummaryItem[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string | undefined>(undefined);
  const [activeImportedComponentId, setActiveImportedComponentId] = useState<string | undefined>(undefined);
  const [collapsedImportGroups, setCollapsedImportGroups] = useState<Record<ImportedVisualCategory, boolean>>(defaultImportGroupCollapsedState);
  const [importInspectorState, setImportInspectorState] = useState<ImportInspectorState | null>(null);
  const [datasetDialogMode, setDatasetDialogMode] = useState<DatasetDialogMode | null>(null);
  const [jsonImportFilePath, setJsonImportFilePath] = useState('');
  const [jsonImportClearOthers, setJsonImportClearOthers] = useState(false);
  const [customDatasetDraft, setCustomDatasetDraft] = useState<CustomDatasetDraft>({
    name: '',
    dax: 'EVALUATE\nSUMMARIZECOLUMNS(\n  "Value", [Measure]\n)',
    chartType: 'bar',
  });
  const [queryBuilderDraft, setQueryBuilderDraft] = useState<QueryBuilderDraft>({
    name: '新查询',
    selections: [],
    filters: [],
    chartType: 'bar',
  });
  const [queryBuilderSearch, setQueryBuilderSearch] = useState('');
  const [queryBuilderExpandedTables, setQueryBuilderExpandedTables] = useState<Record<string, boolean>>({});
  const [activeRibbonTab, setActiveRibbonTab] = useState<RibbonTabId>('home');
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('report');
  const [activeLeftPaneSection, setActiveLeftPaneSection] = useState<LeftPaneSectionId>('start');
  const [showLeftPane] = useState(true);
  const [showRightPane, setShowRightPane] = useState(true);
  const [isRibbonCollapsed, setIsRibbonCollapsed] = useState(false);

  const [chatInput, setChatInput] = useState<string>('');
  const [reportCanvasZoomMode, setReportCanvasZoomMode] = useState<'fit' | 'manual'>('fit');
  const [reportCanvasFitZoomPercent, setReportCanvasFitZoomPercent] = useState(74);
  const [reportCanvasManualZoomPercent, setReportCanvasManualZoomPercent] = useState(100);
  const [reportCanvasZoomInputValue, setReportCanvasZoomInputValue] = useState('100');
  const aiStreamRef = React.useRef<EventSource | null>(null);

  useEffect(() => {
    if (!isBrowserPreview) {
      return;
    }

    if (!browserPreviewParams.previewUrl) {
      setError('缺少浏览器预览地址。');
      return;
    }

    let cancelled = false;
    setError('');

    fetch(browserPreviewParams.previewUrl, {
      headers: {
        Accept: 'application/json',
      },
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`浏览器预览数据加载失败: HTTP ${response.status}`);
        }

        const payload = await response.json() as BrowserPreviewPayload;
        if (!cancelled) {
          const previewDataSource = payload.dataSource;
          if (previewDataSource && payload.prefetchedRowsByQuery && payload.queries?.length) {
            Object.entries(payload.prefetchedRowsByQuery).forEach(([queryId, result]) => {
              const query = payload.queries.find((candidate) => candidate.id === queryId);
              if (!query || !Array.isArray(result?.rows)) {
                return;
              }

              primeQueryCache(query, result.rows, {
                dataSource: previewDataSource,
                executionDax: query.executionDax,
                dax: query.dax,
              });
            });
          }
          setBrowserPreviewPayload(payload);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [browserPreviewParams.previewUrl, isBrowserPreview]);

  useEffect(() => {
    if (isBrowserPreview) {
      return;
    }

    if (!window.electronAPI?.getApiUrl) {
      setError('桌面 API 不可用，请确认 Electron preload 已正确加载。');
      return;
    }

    Promise.all([
      window.electronAPI.getApiUrl(),
      window.electronAPI.getAgentUrl?.() || Promise.resolve(''),
      window.electronAPI.loadAiSettings?.() || Promise.resolve(defaultAiSettings),
    ])
      .then(([url, agentUrl, persistedAiSettings]) => {
        setApiUrl(url);
        setAgentBaseUrl(agentUrl || '');
        setAiSettings(persistedAiSettings || defaultAiSettings);
        setAiSettingsLoaded(true);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
        setAiSettingsLoaded(true);
      });
  }, [isBrowserPreview]);

  useEffect(() => {
    if (!aiSettingsLoaded || !window.electronAPI?.saveAiSettings) {
      return;
    }

    const timer = window.setTimeout(() => {
      window.electronAPI?.saveAiSettings?.(aiSettings).catch((err) => {
        console.error('[AI Settings] Failed to persist settings:', err);
      });
    }, 180);

    return () => window.clearTimeout(timer);
  }, [aiSettings, aiSettingsLoaded]);

  useEffect(() => {
    setAiConnectionProbe(null);
    setAiConnectionProbeError('');
  }, [
    aiSettings.provider,
    aiSettings.baseUrl,
    aiSettings.apiKey,
    aiSettings.model,
  ]);

  const buildModelConnectionString = () => {
    const target = connectionString.trim();
    const database = connectionDatabase.trim();
    if (!target) {
      return '';
    }
    return database
      ? `Data Source=${target};Initial Catalog=${database};`
      : `Data Source=${target};`;
  };

  const getConnectionDisplayName = () => {
    const target = connectionString.trim();
    const database = connectionDatabase.trim();
    if (!target) {
      return '-';
    }
    return database ? `${target} / ${database}` : target;
  };

  const handleOpenConnectDialog = () => {
    setConnectionError('');
    setPowerBiScanMessage('');
    setShowConnectDialog(true);
  };

  const handleSelectPowerBiScanItem = (itemId: string) => {
    setSelectedPowerBiScanId(itemId);
    const selectedItem = powerBiScanItems.find((item) => item.id === itemId);
    if (!selectedItem) {
      return;
    }

    setConnectionString(selectedItem.connectionTarget);
    setConnectionDatabase('');
  };

  const handleScanPowerBi = async () => {
    if (!window.electronAPI?.scanPowerBiInstances) {
      setPowerBiScanMessage('当前环境不支持自动扫描 Power BI Desktop。');
      return;
    }

    setIsScanningPowerBi(true);
    setPowerBiScanMessage('');
    setConnectionError('');

    try {
      const items = await window.electronAPI.scanPowerBiInstances();
      setPowerBiScanItems(items);

      if (items.length === 0) {
        setSelectedPowerBiScanId('');
        setPowerBiScanMessage('未找到已打开的 Power BI Desktop 窗口。');
        return;
      }

      const preferredItem = items.find((item) => item.connectionTarget === connectionString.trim()) || items[0];
      setSelectedPowerBiScanId(preferredItem.id);
      setConnectionString(preferredItem.connectionTarget);
      setConnectionDatabase('');
      setPowerBiScanMessage(`已找到 ${items.length} 个 Power BI 模型。`);
    } catch (err) {
      setPowerBiScanItems([]);
      setSelectedPowerBiScanId('');
      setPowerBiScanMessage(err instanceof Error ? err.message : '扫描 Power BI Desktop 失败。');
    } finally {
      setIsScanningPowerBi(false);
    }
  };

  const handleOpenSettings = () => {
    setShowSettings(true);
  };

  const activateDataWorkbench = () => {
    setWorkspaceMode('data');
    setActiveRibbonTab('dataset');
    setShowRightPane(false);
  };

  const openDatasetDialog = (mode: DatasetDialogMode) => {
    activateDataWorkbench();
    setImportError('');
    if (mode === 'import-json') {
      setJsonImportClearOthers(false);
    }
    if (mode === 'query-builder') {
      setQueryBuilderSearch('');
    }
    setDatasetDialogMode(mode);
  };

  const closeDatasetDialog = () => {
    setDatasetDialogMode(null);
  };

  const handleChooseJsonImportFile = async () => {
    if (!window.electronAPI?.selectFile) {
      setImportError('当前环境不支持文件选择。');
      return;
    }

    const selectedPath = await window.electronAPI.selectFile({
      title: '选择 Performance Analyzer JSON',
      filters: [
        { name: 'JSON Files', extensions: ['json'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });

    if (selectedPath) {
      setJsonImportFilePath(selectedPath);
    }
  };

  const appendQueryBuilderSelection = (selection: QueryBuilderDraft['selections'][number]) => {
    setQueryBuilderDraft((previous) => (
      previous.selections.some((item) => item.id === selection.id)
        ? previous
        : { ...previous, selections: [...previous.selections, selection] }
    ));
  };

  const handleToggleQueryBuilderSelection = (selection: QueryBuilderDraft['selections'][number]) => {
    setQueryBuilderDraft((previous) => ({
      ...previous,
      selections: previous.selections.some((item) => item.id === selection.id)
        ? previous.selections.filter((item) => item.id !== selection.id)
        : [...previous.selections, selection],
    }));
  };

  const handleAddQueryBuilderFilter = (
    source?: {
      id: string;
      tableName: string;
      name: string;
      dataType?: string;
      kind?: 'column' | 'measure';
    },
  ) => {
    if (source?.kind === 'measure') {
      setImportError('筛选条件仅支持字段列，不支持度量值。');
      return;
    }

    const fallbackColumn = allQueryBuilderColumns[0];
    const targetField = source || fallbackColumn;
    if (!targetField) {
      return;
    }

    setQueryBuilderDraft((previous) => ({
      ...previous,
      filters: [
        ...previous.filters,
        {
          id: `filter-${Date.now()}`,
          fieldId: targetField.id,
          tableName: targetField.tableName,
          fieldName: targetField.name,
          dataType: targetField.dataType || 'String',
          operator: 'equals',
          value: '',
        },
      ],
    }));
  };

  const handleChangeQueryBuilderFilter = (
    filterId: string,
    patch: Partial<QueryBuilderDraft['filters'][number]>,
  ) => {
    setQueryBuilderDraft((previous) => ({
      ...previous,
      filters: previous.filters.map((filter) => (
        filter.id === filterId ? { ...filter, ...patch } : filter
      )),
    }));
  };

  const handleRemoveQueryBuilderFilter = (filterId: string) => {
    setQueryBuilderDraft((previous) => ({
      ...previous,
      filters: previous.filters.filter((filter) => filter.id !== filterId),
    }));
  };

  const handleToggleQueryBuilderTableExpanded = (tableKey: string) => {
    setQueryBuilderExpandedTables((previous) => ({
      ...previous,
      [tableKey]: !previous[tableKey],
    }));
  };

  const handleQueryBuilderDragStart = (
    event: React.DragEvent<HTMLElement>,
    item: QueryBuilderDraft['selections'][number],
  ) => {
    event.dataTransfer.setData('application/x-vibe-bi-query-builder-item', JSON.stringify(item));
    event.dataTransfer.effectAllowed = 'copy';
  };

  const readQueryBuilderDraggedItem = (event: React.DragEvent<HTMLElement>) => {
    const raw = event.dataTransfer.getData('application/x-vibe-bi-query-builder-item');
    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw) as QueryBuilderDraft['selections'][number];
    } catch {
      return null;
    }
  };

  const handleDropQueryBuilderSelection = (event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
    const item = readQueryBuilderDraggedItem(event);
    if (!item) {
      return;
    }
    appendQueryBuilderSelection(item);
  };

  const handleDropQueryBuilderFilter = (event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
    const item = readQueryBuilderDraggedItem(event);
    if (!item) {
      return;
    }
    handleAddQueryBuilderFilter(item);
  };

  const handleWorkspaceModeChange = (mode: WorkspaceRailId) => {
    if (mode === 'data') {
      activateDataWorkbench();
      if (!selectedDatasetId && importSummary[0]) {
        setSelectedDatasetId(importSummary[0].id);
      }
      return;
    }

    setWorkspaceMode('report');
    setShowRightPane(true);
    if (activeRibbonTab === 'dataset') {
      setActiveRibbonTab('view');
    }
    if (activeLeftPaneSection === 'import') {
      setActiveLeftPaneSection('start');
    }
  };

  const handleRibbonTabChange = (tab: RibbonTabId) => {
    setActiveRibbonTab(tab);

    if (tab === 'ai') {
      setWorkspaceMode('report');
      setActiveLeftPaneSection('ai');
      setShowRightPane(true);
      return;
    }

    if (tab === 'view') {
      setWorkspaceMode('report');
      setActiveLeftPaneSection('start');
      setShowRightPane(true);
      return;
    }

    if (tab === 'home') {
      setActiveLeftPaneSection('start');
      if (workspaceMode === 'report') {
        setShowRightPane(true);
      }
    }
  };

  // Connect to Power BI Desktop
  const handleConnect = async () => {
    const fullConnectionString = buildModelConnectionString();
    if (!apiUrl || !fullConnectionString) return;

    setIsConnecting(true);
    setConnectionError('');
    setActiveLeftPaneSection('start');

    try {
      // Test connection
      const testResponse = await fetch(`${apiUrl}/api/model/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionString: fullConnectionString }),
      });

      if (!testResponse.ok) {
        const errorData = await testResponse.json();
        throw new Error(errorData.message || '连接失败');
      }

      // Get metadata
      const metaResponse = await fetch(`${apiUrl}/api/model/metadata`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionString: fullConnectionString }),
      });

      if (!metaResponse.ok) {
        throw new Error('无法获取模型元数据');
      }

      const metadata: ModelMetadata = await metaResponse.json();
      setModelMetadata(metadata);
      setIsConnected(true);
      setShowRightPane(true);
      setActiveLeftPaneSection('model');
      setShowConnectDialog(false);
    } catch (err) {
      setConnectionError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsConnecting(false);
    }
  };

  const executeImportedQuery = async (dax: string): Promise<QueryResult> => {
    const response = await fetch(`${apiUrl}/api/query/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        connectionString: buildModelConnectionString(),
        dax,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(errorBody || `查询执行失败: ${response.statusText}`);
    }

    return response.json() as Promise<QueryResult>;
  };

  // Import Performance Analyzer JSON
  const importPerformanceAnalyzerContent = async (
    fileName: string,
    content: string,
    mode: DatasetImportMode,
  ): Promise<boolean> => {
    if (!fileName || !isConnected || !apiUrl) {
      return false;
    }

    setIsImporting(true);
    setImportError('');
    setGenerationProgress('正在解析 Performance Analyzer 文件...');
    activateDataWorkbench();

    try {
      const perfData = JSON.parse(content.replace(/^\uFEFF/, ''));

      // Parse Power BI Performance Analyzer JSON format:
      // { "version": "1.1.0", "events": [{ "name": "Execute DAX Query", "metrics": { "QueryText": "..." } }] }
      const events: PerformanceAnalyzerEvent[] = Array.isArray(perfData.events) ? perfData.events : [];

      if (!Array.isArray(events) || events.length === 0) {
        throw new Error('无法识别的 Performance Analyzer 文件格式');
      }

      // Step 1: Build visual info map from lifecycle and visual metadata events
      const visualMap = new Map<string, VisualLookupEntry>();
      const visualMetadataCandidates: VisualMetadataCandidate[] = [];
      const summaryMap = new Map<string, ImportSummaryItem>();

      const upsertSummaryItem = (
        summaryKey: string,
        sourceOrder: number,
        updates: Partial<ImportSummaryItem>
      ): ImportSummaryItem => {
        const existing = summaryMap.get(summaryKey);
        const nextName = updates.name?.trim();
        const nextType = updates.type?.trim();
        const resolvedName = nextName && (isWeakVisualName(existing?.name) || !existing?.name)
          ? nextName
          : existing?.name || nextName || `Visual ${sourceOrder + 1}`;
        const resolvedType = nextType && (isWeakVisualType(existing?.type) || !existing?.type)
          ? nextType
          : existing?.type || nextType || 'unknown';
        const hasQuery = updates.hasQuery ?? existing?.hasQuery ?? false;

        const merged: ImportSummaryItem = {
          id: summaryKey,
          name: resolvedName,
          type: resolvedType,
          category: resolveVisualCategory(resolvedType, hasQuery),
          score: updates.score ?? existing?.score ?? 0,
          rowCount: updates.rowCount ?? existing?.rowCount ?? 0,
          executionTime: updates.executionTime ?? existing?.executionTime ?? 0,
          fullQuery: updates.fullQuery ?? existing?.fullQuery,
          executionDax: updates.executionDax ?? existing?.executionDax,
          evaluateQueries: updates.evaluateQueries ?? existing?.evaluateQueries,
          selectedEvaluateIndex: updates.selectedEvaluateIndex ?? existing?.selectedEvaluateIndex,
          queryId: updates.queryId ?? existing?.queryId,
          componentId: updates.componentId ?? existing?.componentId,
          hasQuery,
          isRendered: updates.isRendered ?? existing?.isRendered ?? false,
          sourceOrder: existing ? Math.min(existing.sourceOrder, sourceOrder) : sourceOrder,
          queryMode: updates.queryMode ?? existing?.queryMode ?? 'import-json',
          sourceLabel: updates.sourceLabel ?? existing?.sourceLabel ?? 'Performance Analyzer',
          isVisible: updates.isVisible ?? existing?.isVisible ?? true,
          fields: updates.fields ?? existing?.fields ?? [],
          charts: updates.charts ?? existing?.charts ?? [],
          previewResult: updates.previewResult ?? existing?.previewResult,
        };

        summaryMap.set(summaryKey, merged);
        return merged;
      };

      // Debug: check first few lifecycle/visual metadata events
      let visualDebugCount = 0;
      events.forEach((e, eventIndex) => {
        const extractedIds = extractEventIds(e);
        const extractedTitle = extractVisualTitle(e);
        const extractedType = extractVisualType(e);
        const hasVisualMetadata = extractedIds.length > 0 && (Boolean(extractedTitle) || Boolean(extractedType));
        const lifecycleEvent = isVisualLifecycleEvent(e.name);

        if ((lifecycleEvent || hasVisualMetadata) && visualDebugCount < 3) {
          console.log(`[Debug] Visual metadata event:`, JSON.stringify({
            name: e.name,
            id: e.id,
            parentId: e.parentId,
            topLevelKeys: Object.keys(e),
            metricKeys: getMetricKeySummary(e.metrics),
            extractedIds,
            extractedTitle,
            extractedType,
          }));
          visualDebugCount++;
        }

        if (lifecycleEvent || hasVisualMetadata) {
          const summaryKey = buildImportSummaryKey(extractedIds, extractedTitle, extractedType, eventIndex);

          visualMetadataCandidates.push({
            index: eventIndex,
            ids: extractedIds,
            title: extractedTitle,
            type: extractedType,
            eventName: e.name,
            isLifecycleEvent: lifecycleEvent,
            summaryKey,
          });
          registerVisualLookup(visualMap, extractedIds, extractedTitle, extractedType, summaryKey);
          upsertSummaryItem(summaryKey, eventIndex, {
            name: extractedTitle,
            type: extractedType,
          });

          if (extractedIds.length > 0) {
            console.log(
              `[VisualMap] Registered ids="${extractedIds.join(', ')}", title="${extractedTitle || ''}", type="${extractedType || ''}", summaryKey="${summaryKey}"`
            );
          }
        }
      });
      console.log(`[VisualMap] Total visuals found: ${visualMap.size}`);

      // Step 2: Extract DAX queries from "Execute DAX Query" events and map them back to visuals
      const importBatchId = Date.now();
      const datasetAssets: ImportSummaryItem[] = [];

      // Type importance weights for filtering
      const typeWeights: Record<string, number> = {
        // High importance - core charts
        'clusteredColumnChart': 10,
        'clusteredBarChart': 10,
        'lineChart': 10,
        'areaChart': 9,
        'pieChart': 8,
        'doughnutChart': 8,
        'funnelChart': 8,
        'scatterChart': 8,
        'barChart': 8,
        'donutChart': 8,
        'lineClusteredColumnComboChart': 8,
        // Cards and KPIs
        'card': 9,
        'KPI': 9,
        'multiRowCard': 8,
        // Tables
        'table': 7,
        'matrix': 7,
        'pivotTable': 7,
        // Unknown types - treat as chart
        'unknown': 8,
        // Low importance - filters and slicers
        'slicer': 2,
        'advancedSlicer': 2,
        // Filter out entirely
        'button': 0,
        'shape': 0,
        'textbox': 1,
        'image': 0,
        'pageNavigator': 0,
        'bookmarkNavigator': 0,
      };

      // Helper function to infer visual type from DAX query
      const inferVisualTypeFromQuery = (query: string): string => {
        const lowerQuery = query.toLowerCase();
        if (isLikelyTableLikeQuery(query)) {
          return 'pivotTable';
        }
        // If query has multiple GROUPBY or SUMMARIZECOLUMNS with multiple columns, likely a chart
        if (lowerQuery.includes('summarizecolumns') && lowerQuery.split('summarizecolumns').length > 1) {
          return 'barChart';
        }
        // If query has time intelligence functions, likely a line chart
        if (lowerQuery.includes('datesytd') || lowerQuery.includes('dateadd') || lowerQuery.includes('parallelperiod')) {
          return 'lineChart';
        }
        // Default to bar chart for unknown types
        return 'barChart';
      };

      // Calculate importance score for each visual
      const calculateVisualScore = (visualType: string, rowCount: number, executionTime: number, daxLines: number): number => {
        let score = 0;

        // 1. Type weight (0-10)
        score += typeWeights[visualType] || 5;

        // 2. Data volume weight (0-5) - visuals with data are more important
        if (rowCount > 0) {
          score += Math.min(rowCount / 10, 5);
        }

        // 3. DAX complexity weight (0-3) - complex queries usually mean core metrics
        if (daxLines > 5) {
          score += Math.min(daxLines / 10, 3);
        }

        // 4. Execution time weight (0-3) - slow queries usually involve more data
        if (executionTime > 100) {
          score += Math.min(executionTime / 500, 3);
        }

        return score;
      };

      const resolveVisualPresentation = (visualType: string) => {
        const visualTypeLower = visualType.toLowerCase();

        if (visualTypeLower.includes('combo')) {
          return { componentType: 'echarts' as const, chartType: 'line' as const };
        }
        if (visualTypeLower.includes('line') || visualTypeLower.includes('area')) {
          return { componentType: 'echarts' as const, chartType: 'line' as const };
        }
        if (visualTypeLower.includes('column') || visualTypeLower.includes('bar') || visualTypeLower.includes('clustered')) {
          return { componentType: 'echarts' as const, chartType: 'bar' as const };
        }
        if (visualTypeLower.includes('pie') || visualTypeLower.includes('doughnut') || visualTypeLower.includes('donut')) {
          return { componentType: 'echarts' as const, chartType: 'pie' as const };
        }
        if (visualTypeLower.includes('card') || visualTypeLower.includes('kpi')) {
          return { componentType: 'kpi-card' as const, chartType: 'bar' as const };
        }
        if (visualTypeLower.includes('slicer')) {
          return { componentType: 'filter' as const, chartType: 'bar' as const };
        }
        if (visualTypeLower.includes('table') || visualTypeLower.includes('matrix')) {
          return { componentType: 'data-table' as const, chartType: 'bar' as const };
        }

        return { componentType: 'echarts' as const, chartType: 'bar' as const };
      };

      const scoreQueryResultForVisual = (
        componentType: PageDefinition['components'][number]['type'],
        chartType: 'line' | 'bar' | 'pie',
        result: QueryResult
      ): number => {
        const rows = result.rows as QueryRow[];
        const fieldNames = getQueryFieldNames(result);
        const numericFields = getNumericFieldNames(rows, fieldNames);
        const dimensionFields = fieldNames.filter((field) => !numericFields.includes(field));
        let score = 0;

        if (rows.length > 0) {
          score += 4 + Math.min(rows.length / 20, 3);
        }

        if (numericFields.length > 0) {
          score += 3;
        }

        if (componentType === 'kpi-card') {
          if (rows.length === 1) score += 4;
          if (numericFields.length === 1) score += 2;
        }

        if (componentType === 'data-table') {
          score += Math.min(fieldNames.length, 6);
        }

        if (chartType === 'line') {
          const axisField = getCategoryFieldName(rows, fieldNames, numericFields);
          if (axisField && (isTemporalFieldName(axisField) || rows.some((row) => isTemporalFieldValue(row[axisField])))) {
            score += 5;
          }
        }

        if (chartType === 'bar') {
          const axisField = getCategoryFieldName(rows, fieldNames, numericFields);
          if (axisField && !isTemporalFieldName(axisField) && rows.some((row) => !isTemporalFieldValue(row[axisField]))) {
            score += 4;
          }
          if (dimensionFields.length >= 1) {
            score += 2;
          }
        }

        if (chartType === 'pie') {
          const pieField = getPieCategoryFieldName(rows, fieldNames, numericFields);
          const distinctCount = pieField ? getDistinctValueCount(rows, pieField) : 0;
          if (pieField && !isTemporalFieldName(pieField) && rows.some((row) => !isTemporalFieldValue(row[pieField]))) {
            score += 7;
          } else {
            score -= 4;
          }
          if (distinctCount >= 2 && distinctCount <= 24) {
            score += 3;
          }
          if (fieldNames.length >= 2 && fieldNames.length <= 4) {
            score += 2;
          }
        }

        return score;
      };

      const executeBestImportedQuery = async (
        rawQueryText: string,
        visualType: string,
        visualName: string
      ): Promise<{ selectedDax: string; queryResult?: QueryResult }> => {
        const candidates = splitDaxEvaluateCandidates(rawQueryText);
        if (candidates.length <= 1) {
          return {
            selectedDax: candidates[0] || rawQueryText,
            queryResult: await executeImportedQuery(candidates[0] || rawQueryText),
          };
        }

        const { componentType, chartType } = resolveVisualPresentation(visualType);
        let bestCandidate: { dax: string; result?: QueryResult; score: number } | undefined;

        for (const [candidateIndex, candidateDax] of candidates.entries()) {
          try {
            const candidateResult = await executeImportedQuery(candidateDax);
            const candidateScore = scoreQueryResultForVisual(componentType, chartType, candidateResult);
            console.log(
              `[Import] Multi-EVALUATE candidate ${candidateIndex + 1}/${candidates.length} for "${visualName}" scored ${candidateScore.toFixed(2)}`
            );

            if (!bestCandidate || candidateScore > bestCandidate.score) {
              bestCandidate = {
                dax: candidateDax,
                result: candidateResult,
                score: candidateScore,
              };
            }
          } catch (candidateError) {
            console.warn(`[Import] Multi-EVALUATE candidate failed for "${visualName}"`, candidateError);
          }
        }

        if (!bestCandidate) {
          throw new Error(`无法执行 "${visualName}" 的任何 EVALUATE 查询块`);
        }

        return {
          selectedDax: bestCandidate.dax,
          queryResult: bestCandidate.result,
        };
      };

      // First pass: collect all visuals with their scores
      const visualCandidates: Array<{
        e: PerformanceAnalyzerEvent;
        index: number;
        summaryKey: string;
        sourceOrder: number;
        category: ImportedVisualCategory;
        visualName: string;
        visualType: string;
        queryText: string;
        score: number;
        rowCount: number;
        executionTime: number;
      }> = [];

      // Debug: print first few Execute DAX Query events
      let debugCount = 0;

      const findNearbyVisualMetadata = (
        eventIndex: number,
        queryText: string,
        currentVisualType?: string,
        eventIds: string[] = []
      ): VisualMetadataCandidate | undefined => {
        let bestCandidate: VisualMetadataCandidate | undefined;
        let bestScore = Number.NEGATIVE_INFINITY;
        const inferredQueryType = currentVisualType && currentVisualType !== 'unknown'
          ? currentVisualType
          : inferVisualTypeFromQuery(queryText);
        const tableLikeQuery = isLikelyTableLikeQuery(queryText);
        const normalizedEventIds = new Set(eventIds.map(canonicalizeEventId).filter(Boolean));

        for (const candidate of visualMetadataCandidates) {
          if (!candidate.title && !candidate.type) {
            continue;
          }

          const relativeOffset = candidate.index - eventIndex;
          const distance = Math.abs(relativeOffset);
          if (distance > 18) {
            continue;
          }

          let score = 0;

          if (relativeOffset <= 0) {
            score += 30;
          } else {
            score += 8;
          }

          score -= distance * (relativeOffset <= 0 ? 1.5 : 2.5);

          if (candidate.isLifecycleEvent) {
            score += 12;
          }

          if (
            normalizedEventIds.size > 0
            && candidate.ids.some((candidateId) => normalizedEventIds.has(canonicalizeEventId(candidateId)))
          ) {
            score += 36;
          }

          if (candidate.title && candidate.type) {
            score += 10;
          } else if (candidate.title || candidate.type) {
            score += 4;
          }

          if (candidate.type) {
            const candidateType = candidate.type.toLowerCase();
            const inferredType = inferredQueryType.toLowerCase();

            if (candidateType === inferredType) {
              score += 12;
            } else if (candidateType.includes(inferredType) || inferredType.includes(candidateType)) {
              score += 8;
            }

            if (tableLikeQuery && (candidateType.includes('table') || candidateType.includes('matrix') || candidateType.includes('pivot'))) {
              score += 10;
            }

            if (!tableLikeQuery && (candidateType.includes('table') || candidateType.includes('matrix') || candidateType.includes('pivot'))) {
              score -= 4;
            }
          }

          if (candidate.title && !/^Visual \d+$/i.test(candidate.title)) {
            score += 3;
          }

          if (score > bestScore) {
            bestCandidate = candidate;
            bestScore = score;
          }
        }

        return bestCandidate;
      };

      events.forEach((e, index) => {
        const queryText = extractQueryText(e);
        if (!isDaxQueryEvent(e.name) && !queryText) return;

        // Debug first 3 events
        if (debugCount < 3) {
          const extractedIds = extractEventIds(e);
          const extractedTitle = extractVisualTitle(e);
          const extractedType = extractVisualType(e);
          console.log(`[Debug] Execute DAX Query event ${index}:`, JSON.stringify({
            name: e.name,
            id: e.id,
            parentId: e.parentId,
            topLevelKeys: Object.keys(e),
            metricKeys: getMetricKeySummary(e.metrics),
            extractedIds,
            extractedTitle,
            extractedType,
            hasQueryText: Boolean(queryText),
          }));
          debugCount++;
        }

        if (!queryText || queryText.length < 10) return;

        // Skip internal/system queries
        if (queryText.includes('SESSIONEVALUATE')) return;
        const inferredQueryType = inferVisualTypeFromQuery(queryText);

        const extractedIds = extractEventIds(e);
        const directTitle = extractVisualTitle(e);
        const directType = extractVisualType(e);
        const linkedVisual = resolveVisualLookup(visualMap, extractedIds);
        const nearbyVisual = (!directTitle || !directType || !linkedVisual?.title || !linkedVisual?.type)
          ? findNearbyVisualMetadata(index, queryText, directType || linkedVisual?.type || inferredQueryType, extractedIds)
          : undefined;

        let visualName = directTitle
          || linkedVisual?.title
          || nearbyVisual?.title
          || `Visual ${index + 1}`;
        let visualType = directType
          || linkedVisual?.type
          || nearbyVisual?.type
          || 'unknown';

        if (!directTitle && linkedVisual?.title) {
          console.log(`[Import] Event ${index} resolved title from id="${linkedVisual.matchedId}": "${linkedVisual.title}"`);
        }

        if (!directType && linkedVisual?.type) {
          console.log(`[Import] Event ${index} resolved type from id="${linkedVisual.matchedId}": "${linkedVisual.type}"`);
        }

        if (nearbyVisual) {
          console.log(
            `[Import] Event ${index} resolved from nearby metadata event ${nearbyVisual.index}: title="${nearbyVisual.title || ''}", type="${nearbyVisual.type || ''}"`
          );
        }

        if (!visualType || visualType === 'unknown') {
          visualType = inferredQueryType;
          console.log(
            `[Import] Event ${index} type fallback to inferred="${visualType}", ids="${extractedIds.join(', ')}"`
          );
        }

        if (/^Visual \d+$/i.test(visualName)) {
          const inferredTitle = inferVisualTitleFromQuery(queryText);
          if (inferredTitle) {
            visualName = inferredTitle;
            console.log(`[Import] Event ${index} title fallback to inferred="${visualName}" from DAX`);
          }
        }

        // Get execution metrics
        const rowCount = extractNumberMetric(e, ['RowCount', 'rowCount']) || 0;
        const executionTime = extractNumberMetric(e, ['Duration', 'duration', 'CpuTime', 'cpuTime']) || 0;
        const daxLines = queryText.split('\n').length;

        // Calculate importance score
        const score = calculateVisualScore(visualType, rowCount, executionTime, daxLines);
        const summaryKey = linkedVisual?.summaryKey
          || nearbyVisual?.summaryKey
          || buildImportSummaryKey(extractedIds, visualName, visualType, index);
        const existingSummary = summaryMap.get(summaryKey);
        const evaluateQueries = splitDaxEvaluateCandidates(queryText);
        const shouldReplaceQueryInfo = !existingSummary?.fullQuery || score >= (existingSummary.score || 0);
        const updatedSummary = upsertSummaryItem(summaryKey, existingSummary?.sourceOrder ?? nearbyVisual?.index ?? index, {
          name: visualName,
          type: visualType,
          hasQuery: true,
          score: Math.max(existingSummary?.score ?? 0, score),
          rowCount: shouldReplaceQueryInfo ? rowCount : (existingSummary?.rowCount ?? rowCount),
          executionTime: shouldReplaceQueryInfo ? executionTime : (existingSummary?.executionTime ?? executionTime),
          fullQuery: shouldReplaceQueryInfo ? queryText : undefined,
          executionDax: shouldReplaceQueryInfo ? queryText : undefined,
          evaluateQueries: shouldReplaceQueryInfo ? evaluateQueries : undefined,
          selectedEvaluateIndex: shouldReplaceQueryInfo ? 0 : undefined,
        });
        const category = resolveVisualCategory(visualType, true);

        visualCandidates.push({
          e,
          index,
          summaryKey,
          sourceOrder: updatedSummary.sourceOrder,
          category,
          visualName,
          visualType,
          queryText,
          score,
          rowCount,
          executionTime,
        });
      });

      const renderableVisualMap = new Map<string, typeof visualCandidates[number]>();
      visualCandidates
        .filter((candidate) => candidate.category === 'display')
        .forEach((candidate) => {
          const existingCandidate = renderableVisualMap.get(candidate.summaryKey);
          if (!existingCandidate || candidate.score > existingCandidate.score) {
            renderableVisualMap.set(candidate.summaryKey, candidate);
          }
        });

      const renderableVisuals = Array.from(renderableVisualMap.values())
        .sort((a, b) => a.sourceOrder - b.sourceOrder || b.score - a.score);

      console.log(`[Import] Found ${visualCandidates.length} query candidates, ${renderableVisuals.length} renderable visuals`);
      renderableVisuals.forEach((v, i) => {
        console.log(`[Import] Renderable[${i}]: name="${v.visualName}", type="${v.visualType}", score=${v.score.toFixed(1)}`);
      });

      // Second pass: execute imported DAX and create components from actual query results
      for (const [filteredIndex, candidate] of renderableVisuals.entries()) {
        const { visualName, visualType, queryText, score, rowCount, executionTime } = candidate;
        const assetId = `dataset-${importBatchId}-${candidate.summaryKey}`;
        const queryId = `dataset-q-${importBatchId}-${filteredIndex}`;
        const { componentType, chartType } = resolveVisualPresentation(visualType);
        const evaluateQueries = splitDaxEvaluateCandidates(queryText);
        console.log(
          `[Import] Visual ${filteredIndex}: name="${visualName}", type="${visualType}", componentType="${componentType}", chartType="${chartType}"`
        );

        let queryResult: QueryResult | undefined;
        let selectedDax = queryText;
        let selectedEvaluateIndex = 0;
        try {
          setGenerationProgress(`正在获取数据 (${filteredIndex + 1}/${renderableVisuals.length}): ${visualName}`);
          const execution = await executeBestImportedQuery(queryText, visualType, visualName);
          selectedDax = execution.selectedDax;
          selectedEvaluateIndex = Math.max(evaluateQueries.findIndex((candidateQuery) => candidateQuery.trim() === selectedDax.trim()), 0);
          queryResult = execution.queryResult;
          if (queryResult) {
            primeQueryCache(queryId, queryResult.rows);
            console.log(
              `[Import] Query executed: id="${queryId}", rows=${queryResult.rowCount}, evaluateCount=${countEvaluateStatements(queryText)}`
            );
          }
        } catch (queryErr) {
          console.error(`[Import] Query execution failed for "${visualName}":`, queryErr);
        }

        const datasetChartType: DatasetVisualType = componentType === 'kpi-card'
          ? 'kpi-card'
          : componentType === 'data-table'
            ? 'data-table'
            : componentType === 'filter'
              ? 'filter'
              : chartType;

        datasetAssets.push(createDatasetAsset({
          id: assetId,
          name: visualName,
          type: visualType,
          category: candidate.category,
          score,
          rowCount: queryResult?.rowCount || rowCount,
          executionTime,
          fullQuery: queryText,
          executionDax: selectedDax,
          evaluateQueries,
          selectedEvaluateIndex,
          queryId,
          hasQuery: true,
          isRendered: false,
          sourceOrder: candidate.sourceOrder,
          queryMode: 'import-json',
          sourceLabel: `Performance Analyzer · ${fileName}`,
          chartType: datasetChartType,
          previewResult: queryResult,
        }));

        upsertSummaryItem(candidate.summaryKey, candidate.sourceOrder, {
          name: visualName,
          type: visualType,
          hasQuery: true,
          isRendered: false,
          queryId,
          score,
          rowCount: queryResult?.rowCount || rowCount,
          executionTime,
          fullQuery: queryText,
          executionDax: selectedDax,
          evaluateQueries,
          selectedEvaluateIndex,
        });
      }

      if (datasetAssets.length === 0) {
        throw new Error('未找到有效的 DAX 查询（请确保文件包含 "Execute DAX Query" 事件）');
      }

      setImportSummary((previous) => {
        const nextItems = mode === 'replace'
          ? datasetAssets
          : [...previous, ...datasetAssets];
        return nextItems.sort((a, b) => a.sourceOrder - b.sourceOrder);
      });
      setSelectedDatasetId(datasetAssets[0]?.id);
      setActiveImportedComponentId(undefined);
      setCollapsedImportGroups(defaultImportGroupCollapsedState);
      setImportInspectorState(null);
      setGenerationProgress(`成功识别 ${summaryMap.size} 个视觉对象，创建 ${datasetAssets.length} 个数据集素材`);
      return true;

    } catch (err) {
      setImportError(err instanceof Error ? err.message : '导入失败');
      setGenerationProgress('');
      return false;
    } finally {
      setIsImporting(false);
    }
  };

  const appendDatasetAsset = (asset: ImportSummaryItem) => {
    setImportSummary((previous) => [...previous, asset].sort((a, b) => a.sourceOrder - b.sourceOrder));
    setSelectedDatasetId(asset.id);
    activateDataWorkbench();
  };

  const handleImportJsonFromDialog = async () => {
    if (!jsonImportFilePath) {
      setImportError('请选择要导入的 JSON 文件。');
      return;
    }

    if (!window.electronAPI?.readTextFile) {
      setImportError('当前环境不支持读取本地文件，请重启桌面端后重试。');
      return;
    }

    setImportError('');

    try {
      const fileContent = await window.electronAPI.readTextFile(jsonImportFilePath);
      if (fileContent == null) {
        setImportError('读取 JSON 文件失败。');
        return;
      }

      const imported = await importPerformanceAnalyzerContent(
        jsonImportFilePath.split(/[/\\\\]/).pop() || jsonImportFilePath,
        fileContent,
        jsonImportClearOthers ? 'replace' : 'incremental',
      );

      if (imported) {
        closeDatasetDialog();
        setJsonImportFilePath('');
        setJsonImportClearOthers(false);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('read-text-file')) {
        setImportError('桌面端主进程尚未刷新，请重启 Vibe BI 后再导入。');
        return;
      }

      setImportError(message || '导入 JSON 失败。');
    }
  };

  const handleCreateCustomDataset = async (draft: CustomDatasetDraft) => {
    const trimmedDax = draft.dax.trim();
    if (!trimmedDax) {
      return;
    }

    setIsImporting(true);
    setImportError('');
    setGenerationProgress(`正在执行自定义 DAX: ${draft.name}...`);

    try {
      const result = await executeImportedQuery(trimmedDax);
      const asset = createDatasetAsset({
        id: `custom-${Date.now()}`,
        name: draft.name,
        type: 'customQuery',
        category: 'custom',
        score: Math.max(result.rowCount > 0 ? 8 : 4, 6),
        rowCount: result.rowCount,
        executionTime: result.executionTimeMs,
        fullQuery: trimmedDax,
        executionDax: trimmedDax,
        evaluateQueries: [trimmedDax],
        selectedEvaluateIndex: 0,
        queryId: `custom-q-${Date.now()}`,
        hasQuery: true,
        isRendered: false,
        sourceOrder: Date.now(),
        queryMode: 'custom-dax',
        sourceLabel: '自定义 DAX',
        chartType: draft.chartType,
        previewResult: result,
      });
      primeQueryCache(asset.queryId!, result.rows);
      appendDatasetAsset(asset);
      setGenerationProgress(`已创建自定义数据集: ${draft.name}`);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : '执行自定义 DAX 失败');
    } finally {
      setIsImporting(false);
    }
  };

  const handleCreateQueryBuilderDataset = async (draft: QueryBuilderDraft) => {
    await handleCreateCustomDataset({
      name: draft.name,
      dax: buildQueryBuilderDax(draft),
      chartType: draft.chartType,
    });
  };

  const handleCreateCustomDatasetFromDialog = async () => {
    if (!customDatasetDraft.dax.trim()) {
      setImportError('请输入要执行的 DAX 查询。');
      return;
    }

    closeDatasetDialog();
    await handleCreateCustomDataset({
      ...customDatasetDraft,
      name: customDatasetDraft.name.trim() || '自定义数据集',
    });
    setCustomDatasetDraft((previous) => ({
      ...previous,
      name: '',
    }));
  };

  const handleCreateQueryBuilderDatasetFromDialog = async () => {
    const hasSelections = queryBuilderDraft.selections.length > 0;
    const hasValidFilters = queryBuilderDraft.filters.some((filter) => filter.value.trim());
    if (!hasSelections && !hasValidFilters) {
      setImportError('请先添加字段、度量值或筛选条件。');
      return;
    }

    closeDatasetDialog();
    await handleCreateQueryBuilderDataset({
      ...queryBuilderDraft,
      name: queryBuilderDraft.name.trim() || '查询生成器数据集',
    });
    setQueryBuilderDraft((previous) => ({
      ...previous,
      name: '新查询',
      selections: [],
      filters: [],
    }));
  };

  const handleSelectDataset = (datasetId: string) => {
    setSelectedDatasetId(datasetId);
    const selected = importSummary.find((item) => item.id === datasetId);
    if (selected?.componentId) {
      setActiveImportedComponentId(selected.componentId);
    } else {
      setActiveImportedComponentId(undefined);
    }
  };

  const updateDatasetAsset = (datasetId: string, updater: (item: ImportSummaryItem) => ImportSummaryItem) => {
    setImportSummary((previous) => previous.map((item) => (
      item.id === datasetId ? updater(item) : item
    )));
  };

  const handleRenameDataset = (datasetId: string, name: string) => {
    updateDatasetAsset(datasetId, (item) => ({ ...item, name, charts: item.charts.map((chart) => ({ ...chart, name: `${name} 图表` })) }));
  };

  const handleDuplicateDataset = (datasetId: string) => {
    const target = importSummary.find((item) => item.id === datasetId);
    if (!target) {
      return;
    }

    const duplicatedId = `${target.id}-copy-${Date.now()}`;
    appendDatasetAsset({
      ...target,
      id: duplicatedId,
      name: `${target.name} 副本`,
      queryId: target.queryId ? `${target.queryId}-copy-${Date.now()}` : undefined,
      charts: target.charts.map((chart) => ({
        ...chart,
        id: `${duplicatedId}-${chart.id}`,
        name: `${target.name} 副本图表`,
      })),
      sourceOrder: Date.now(),
      isRendered: false,
    });
  };

  const handleDeleteDataset = (datasetId: string) => {
    setImportSummary((previous) => previous.filter((item) => item.id !== datasetId));
    setSelectedDatasetId((previous) => (previous === datasetId ? undefined : previous));
  };

  const handleRefreshDataset = async (datasetId: string) => {
    const target = importSummary.find((item) => item.id === datasetId);
    if (!target?.executionDax && !target?.fullQuery) {
      return;
    }

    setIsImporting(true);
    setGenerationProgress(`正在刷新数据集: ${target.name}...`);
    try {
      const dax = target.executionDax || target.fullQuery || '';
      const result = await executeImportedQuery(dax);
      updateDatasetAsset(datasetId, (item) => ({
        ...item,
        rowCount: result.rowCount,
        executionTime: result.executionTimeMs,
        previewResult: result,
        fields: item.fields.length > 0
          ? item.fields.map((field) => {
              const nextColumn = result.columns.find((column) => column.name === field.name);
              return nextColumn ? { ...field, dataType: nextColumn.dataType } : field;
            })
          : createDatasetFields(result),
      }));
      if (target.queryId) {
        primeQueryCache(target.queryId, result.rows);
      }
    } catch (err) {
      setImportError(err instanceof Error ? err.message : '刷新数据集失败');
    } finally {
      setIsImporting(false);
    }
  };

  const handleToggleDatasetVisibility = (datasetId: string) => {
    updateDatasetAsset(datasetId, (item) => ({ ...item, isVisible: !item.isVisible }));
  };

  const handleToggleChartVisibility = (datasetId: string, chartId: string) => {
    updateDatasetAsset(datasetId, (item) => ({
      ...item,
      charts: item.charts.map((chart) => (
        chart.id === chartId ? { ...chart, isVisible: !chart.isVisible } : chart
      )),
    }));
  };

  const handleChangeChartType = (datasetId: string, chartId: string, chartType: DatasetVisualType) => {
    updateDatasetAsset(datasetId, (item) => ({
      ...item,
      charts: item.charts.map((chart) => (
        chart.id === chartId
          ? {
              ...chart,
              chartType,
              componentType: resolveComponentTypeFromDatasetChartType(chartType),
            }
          : chart
      )),
    }));
  };

  const handleToggleFieldVisibility = (datasetId: string, fieldName: string) => {
    updateDatasetAsset(datasetId, (item) => ({
      ...item,
      fields: item.fields.map((field) => (
        field.name === fieldName ? { ...field, isVisible: !field.isVisible } : field
      )),
    }));
  };

  // Disconnect
  const handleDisconnect = () => {
    setIsConnected(false);
    setModelMetadata(null);
    setConnectionError('');
    setShowConnectDialog(false);
    setGeneratedReport(null);
    setGeneratedPages([]);
    setGeneratedQueries([]);
    setImportSummary([]);
    setSelectedDatasetId(undefined);
    setActiveImportedComponentId(undefined);
    setCollapsedImportGroups(defaultImportGroupCollapsedState);
    setImportInspectorState(null);
    setDatasetDialogMode(null);
    setJsonImportFilePath('');
    setJsonImportClearOthers(false);
    setActiveRibbonTab('home');
    setWorkspaceMode('report');
    setActiveLeftPaneSection('start');
    setShowRightPane(true);
    setGenerationProgress('');
    setChatInput('');
    setAiSessionId('');
    setAiMessages([]);
    setAiTraceMap({});
    setAiActiveRunId(undefined);
    setAiAgentError('');
  };

  const currentReport = browserPreviewPayload?.report ?? generatedReport;
  const currentPages = browserPreviewPayload?.pages?.length
    ? browserPreviewPayload.pages
    : generatedPages.length > 0
      ? generatedPages
      : [];
  const currentQueries = browserPreviewPayload?.queries?.length
    ? browserPreviewPayload.queries
    : generatedQueries.length > 0
      ? generatedQueries
      : [];
  const currentTheme = React.useMemo(
    () => mergeThemeWithFallback(browserPreviewPayload?.theme ?? currentReport?.theme),
    [browserPreviewPayload?.theme, currentReport]
  );
  const effectiveApiUrl = browserPreviewPayload?.apiBaseUrl || apiUrl;
  const currentDataSource = React.useMemo<DataSourceConfig>(() => {
    if (browserPreviewPayload?.dataSource) {
      return browserPreviewPayload.dataSource;
    }

    return isConnected
      ? {
        type: 'local',
        connection: {
          server: connectionString,
          database: modelMetadata?.databaseName || connectionDatabase || 'Default',
        },
      }
      : sampleDataSource;
  }, [
    browserPreviewPayload?.dataSource,
    isConnected,
    connectionString,
    modelMetadata?.databaseName,
    connectionDatabase,
  ]);
  const agentDatasets = React.useMemo(
    () => buildAgentDatasetContexts(importSummary),
    [importSummary]
  );
  const baselineQueries = React.useMemo(
    () => buildBaselineQueries(currentQueries, agentDatasets),
    [currentQueries, agentDatasets]
  );
  const agentExecutionContext = React.useMemo<AgentExecutionContext>(() => ({
    apiBaseUrl: effectiveApiUrl,
    connectionString: buildModelConnectionString() || undefined,
    modelMetadata,
    datasets: agentDatasets,
    currentReport,
    currentPages,
    currentQueries,
    baselineQueries,
    theme: currentTheme,
  }), [
    effectiveApiUrl,
    buildModelConnectionString,
    modelMetadata,
    agentDatasets,
    currentReport,
    currentPages,
    currentQueries,
    baselineQueries,
    currentTheme,
  ]);
  const aiTraces = React.useMemo(
    () => Object.values(aiTraceMap).sort((left, right) => {
      const leftTime = Date.parse(left.startedAt) || 0;
      const rightTime = Date.parse(right.startedAt) || 0;
      return leftTime - rightTime;
    }),
    [aiTraceMap]
  );

  const ensureAiSession = async (): Promise<string> => {
    if (!agentBaseUrl) {
      throw new Error('AI sidecar 未启动。');
    }

    if (aiSessionId) {
      return aiSessionId;
    }

    const session = await createAgentSession(agentBaseUrl);
    setAiSessionId(session.sessionId);
    return session.sessionId;
  };

  const closeAiStream = React.useCallback(() => {
    if (aiStreamRef.current) {
      aiStreamRef.current.close();
      aiStreamRef.current = null;
    }
  }, []);

  const applyArtifactToWorkspace = React.useCallback((artifact: {
    report: ReportDefinition;
    pages: PageDefinition[];
    queries: QueryDefinition[];
    theme?: ThemeDefinition | null;
  }) => {
    setGeneratedReport(artifact.report);
    setGeneratedPages(artifact.pages || []);
    setGeneratedQueries(artifact.queries || []);
    setGenerationProgress('AI 已生成新的报表产物。');
    setWorkspaceMode('report');
    setActiveLeftPaneSection('ai');
    setShowRightPane(true);
    setActiveRibbonTab('ai');
  }, []);

  const handleOpenBrowserPreview = React.useCallback(async () => {
    if (!currentReport || currentPages.length === 0) {
      return;
    }

    if (!window.electronAPI?.openBrowserPreview) {
      setGenerationProgress('当前环境不支持在浏览器中打开报表。');
      return;
    }

    try {
      await window.electronAPI.openBrowserPreview({
        report: currentReport,
        pages: currentPages,
        queries: currentQueries,
        theme: currentTheme,
        apiBaseUrl: effectiveApiUrl,
        dataSource: currentDataSource,
        activeComponentId: activeImportedComponentId,
      });
      setGenerationProgress('已在浏览器中打开当前报表。');
    } catch (err) {
      setGenerationProgress(`浏览器预览打开失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [
    activeImportedComponentId,
    currentDataSource,
    currentPages,
    currentQueries,
    currentReport,
    currentTheme,
    effectiveApiUrl,
  ]);

  const handleAgentStreamEvent = React.useCallback((event: AgentStreamEvent) => {
    if (!event.runId) {
      return;
    }

    setAiTraceMap((previous) => {
      const currentTrace = previous[event.runId!] || createInitialTrace(event.runId!);
      let nextTrace = currentTrace;

      if (event.type === 'run-status') {
        nextTrace = {
          ...currentTrace,
          status: event.status,
          summary: event.message || currentTrace.summary,
          title: currentTrace.title || 'AI 执行链路',
          completedAt: event.status === 'completed' || event.status === 'failed' || event.status === 'cancelled'
            ? event.timestamp
            : currentTrace.completedAt,
          activeOperation: event.status === 'completed' || event.status === 'failed' || event.status === 'cancelled'
            ? undefined
            : currentTrace.activeOperation,
          logs: event.message
            ? appendTraceLog(currentTrace.logs, {
              id: `${event.runId}-status-${event.timestamp}-${event.status}`,
              timestamp: event.timestamp,
              level: event.status === 'failed' ? 'error' : event.status === 'cancelled' ? 'warning' : 'info',
              message: event.message,
              tag: '状态',
            })
            : currentTrace.logs,
        };
      }

      if (event.type === 'step-started') {
        const shouldResetIssues = event.stepId === 'validate';
        nextTrace = {
          ...currentTrace,
          status: currentTrace.status === 'queued' ? 'running' : currentTrace.status,
          summary: event.summary,
          activeStepId: event.stepId,
          activeOperation: event.title,
          issues: shouldResetIssues ? [] : currentTrace.issues,
          steps: upsertTraceStep(currentTrace.steps, {
            stepId: event.stepId,
            title: event.title,
            status: 'running',
            summary: event.summary,
            startedAt: event.timestamp,
          }),
          logs: appendTraceLog(currentTrace.logs, {
            id: `${event.runId}-step-start-${event.stepId}-${event.timestamp}`,
            timestamp: event.timestamp,
            level: 'activity',
            message: event.summary,
            stepId: event.stepId,
            tag: event.title,
          }),
        };
      }

      if (event.type === 'step-completed') {
        const completedStep = currentTrace.steps.find((item) => item.stepId === event.stepId);
        nextTrace = {
          ...currentTrace,
          activeStepId: currentTrace.activeStepId === event.stepId ? undefined : currentTrace.activeStepId,
          activeOperation: currentTrace.activeStepId === event.stepId ? undefined : currentTrace.activeOperation,
          steps: upsertTraceStep(currentTrace.steps, {
            stepId: event.stepId,
            title: event.title,
            status: event.status || 'completed',
            summary: event.summary,
            startedAt: completedStep?.startedAt,
            details: event.details,
            completedAt: event.timestamp,
          }),
          logs: appendTraceLog(currentTrace.logs, {
            id: `${event.runId}-step-done-${event.stepId}-${event.timestamp}`,
            timestamp: event.timestamp,
            level: event.status === 'failed' ? 'error' : 'success',
            message: event.summary,
            stepId: event.stepId,
            tag: event.title,
          }),
        };
      }

      if (event.type === 'validation-issue') {
        const nextIssues = currentTrace.issues.includes(event.issue)
          ? currentTrace.issues
          : [...currentTrace.issues, event.issue];
        nextTrace = {
          ...currentTrace,
          issues: nextIssues,
          logs: appendTraceLog(currentTrace.logs, {
            id: `${event.runId}-issue-${event.timestamp}-${currentTrace.issues.length}`,
            timestamp: event.timestamp,
            level: 'warning',
            message: event.issue,
            tag: '校验',
          }),
        };
      }

      if (event.type === 'repair-started') {
        nextTrace = {
          ...currentTrace,
          status: 'repairing',
          summary: event.summary,
          activeOperation: '修复中',
          logs: appendTraceLog(currentTrace.logs, {
            id: `${event.runId}-repair-start-${event.timestamp}`,
            timestamp: event.timestamp,
            level: 'activity',
            message: event.summary,
            tag: '修复',
          }),
        };
      }

      if (event.type === 'repair-completed') {
        nextTrace = {
          ...currentTrace,
          status: 'running',
          summary: event.summary,
          activeOperation: '重新校验',
          logs: appendTraceLog(currentTrace.logs, {
            id: `${event.runId}-repair-done-${event.timestamp}`,
            timestamp: event.timestamp,
            level: 'success',
            message: event.summary,
            tag: '修复',
          }),
        };
      }

      if (event.type === 'artifact-produced') {
        nextTrace = {
          ...currentTrace,
          artifactReady: true,
          logs: appendTraceLog(currentTrace.logs, {
            id: `${event.runId}-artifact-${event.timestamp}`,
            timestamp: event.timestamp,
            level: 'success',
            message: '报表产物已经生成并回写到当前工作区。',
            tag: '产物',
          }),
        };
      }

      if (event.type === 'run-failed') {
        nextTrace = {
          ...currentTrace,
          status: 'failed',
          summary: event.error,
          completedAt: event.timestamp,
          issues: [...currentTrace.issues, event.error],
          activeStepId: undefined,
          activeOperation: undefined,
          logs: appendTraceLog(currentTrace.logs, {
            id: `${event.runId}-failed-${event.timestamp}`,
            timestamp: event.timestamp,
            level: 'error',
            message: event.error,
            tag: '失败',
          }),
        };
      }

      if (event.type === 'progress') {
        nextTrace = {
          ...currentTrace,
          summary: event.message,
          activeStepId: event.stepId || currentTrace.activeStepId,
          activeOperation: event.tag || currentTrace.activeOperation,
          logs: appendTraceLog(currentTrace.logs, {
            id: `${event.runId}-progress-${event.timestamp}-${currentTrace.logs.length}`,
            timestamp: event.timestamp,
            level: event.level || 'info',
            message: event.message,
            stepId: event.stepId,
            tag: event.tag,
          }),
        };
      }

      if (event.type === 'heartbeat') {
        nextTrace = {
          ...currentTrace,
          summary: event.message,
          activeStepId: event.stepId || currentTrace.activeStepId,
          activeOperation: event.tag || currentTrace.activeOperation,
          lastHeartbeatAt: event.timestamp,
          logs: appendTraceLog(currentTrace.logs, {
            id: `${event.runId}-heartbeat-${event.timestamp}`,
            timestamp: event.timestamp,
            level: 'info',
            message: event.message,
            stepId: event.stepId,
            tag: event.tag || '等待',
          }),
        };
      }

      return {
        ...previous,
        [event.runId!]: nextTrace,
      };
    });

    if (event.type === 'assistant-message') {
      setAiMessages((previous) => {
        const existingIndex = previous.findIndex((item) => item.id === event.messageId);
        if (existingIndex >= 0) {
          const next = [...previous];
          next[existingIndex] = {
            ...next[existingIndex],
            content: event.content,
            timestamp: event.timestamp,
          };
          return next;
        }
        return [
          ...previous,
          {
            id: event.messageId,
            role: 'assistant',
            content: event.content,
            timestamp: event.timestamp,
            runId: event.runId,
          },
        ];
      });
      setAiActiveRunId(undefined);
      setGenerationProgress('AI 已完成本轮回复。');
    }

    if (event.type === 'run-status') {
      const statusText = event.message?.trim();
      if (statusText) {
        setAiMessages((previous) => appendSystemMessage(previous, statusText, event.timestamp, event.runId));
      }
    }

    if (event.type === 'step-started') {
      setAiMessages((previous) => appendSystemMessage(previous, `${event.title}：${event.summary}`, event.timestamp, event.runId));
    }

    if (event.type === 'progress') {
      const prefix = event.tag ? `[${event.tag}] ` : '';
      setAiMessages((previous) => appendSystemMessage(previous, `${prefix}${event.message}`, event.timestamp, event.runId));
    }

    if (event.type === 'heartbeat') {
      setAiMessages((previous) => appendSystemMessage(previous, event.message, event.timestamp, event.runId));
    }

    if (event.type === 'artifact-produced') {
      applyArtifactToWorkspace(event.artifact);
    }

    if (event.type === 'run-failed') {
      setAiAgentError(event.error);
      setAiActiveRunId(undefined);
      setGenerationProgress(`AI 执行失败：${event.error}`);
      setAiMessages((previous) => appendSystemMessage(previous, `执行失败：${event.error}`, event.timestamp, event.runId));
    }

    if (event.type === 'run-status' && (event.status === 'completed' || event.status === 'cancelled')) {
      setAiActiveRunId(undefined);
      if (event.status === 'cancelled') {
        setGenerationProgress('AI 任务已取消。');
      }
    }
  }, [applyArtifactToWorkspace]);

  useEffect(() => {
    if (!agentBaseUrl || !aiSessionId) {
      closeAiStream();
      return undefined;
    }

    closeAiStream();
    const stream = openAgentSessionStream(
      agentBaseUrl,
      aiSessionId,
      handleAgentStreamEvent,
      (streamError) => {
        setAiAgentError(streamError.message);
      },
    );
    aiStreamRef.current = stream;

    return () => {
      stream.close();
      if (aiStreamRef.current === stream) {
        aiStreamRef.current = null;
      }
    };
  }, [agentBaseUrl, aiSessionId, closeAiStream, handleAgentStreamEvent]);

  const queryBuilderMetadataGroups = React.useMemo(() => {
    const availableTables = modelMetadata?.tables ?? [];
    const measuresByTable = new Map<string, Array<{ name: string; tableName?: string }>>();
    (modelMetadata?.measures || []).forEach((measure) => {
      const groupKey = measure.tableName || '__ungrouped__';
      const bucket = measuresByTable.get(groupKey) || [];
      bucket.push(measure);
      measuresByTable.set(groupKey, bucket);
    });

    const groups = availableTables.map((table) => ({
      key: table.name,
      label: table.name,
      columns: table.columns
        .filter((column) => !column.isHidden)
        .map((column) => ({
          id: getQueryBuilderSelectionId('column', table.name, column.name),
          kind: 'column' as const,
          tableName: table.name,
          name: column.name,
          dataType: column.dataType,
        })),
      measures: (measuresByTable.get(table.name) || []).map((measure) => ({
        id: getQueryBuilderSelectionId('measure', table.name, measure.name),
        kind: 'measure' as const,
        tableName: table.name,
        name: measure.name,
      })),
    }));

    const ungroupedMeasures = (measuresByTable.get('__ungrouped__') || []).map((measure) => ({
      id: getQueryBuilderSelectionId('measure', measure.tableName || 'Measures', measure.name),
      kind: 'measure' as const,
      tableName: measure.tableName || 'Measures',
      name: measure.name,
    }));

    if (ungroupedMeasures.length > 0) {
      groups.push({
        key: '__ungrouped__',
        label: '未分组度量',
        columns: [],
        measures: ungroupedMeasures,
      });
    }

    const search = queryBuilderSearch.trim().toLowerCase();
    if (!search) {
      return groups;
    }

    return groups
      .map((group) => ({
        ...group,
        columns: group.columns.filter((column) => (
          column.name.toLowerCase().includes(search) || group.label.toLowerCase().includes(search)
        )),
        measures: group.measures.filter((measure) => (
          measure.name.toLowerCase().includes(search) || group.label.toLowerCase().includes(search)
        )),
      }))
      .filter((group) => group.columns.length > 0 || group.measures.length > 0);
  }, [modelMetadata?.tables, modelMetadata?.measures, queryBuilderSearch]);
  const allQueryBuilderColumns = React.useMemo(
    () => queryBuilderMetadataGroups.flatMap((group) => group.columns),
    [queryBuilderMetadataGroups]
  );
  const generatedQueryBuilderDax = buildQueryBuilderDax(queryBuilderDraft);
  const importSummaryGroups = React.useMemo(() => {
    const groups: Record<ImportedVisualCategory, ImportSummaryItem[]> = {
      display: [],
      functional: [],
      decorative: [],
      custom: [],
    };

    importSummary.forEach((item) => {
      groups[item.category].push(item);
    });

    (Object.keys(groups) as ImportedVisualCategory[]).forEach((category) => {
      groups[category].sort((a, b) => a.sourceOrder - b.sourceOrder);
    });

    return groups;
  }, [importSummary]);

  const toggleImportGroup = (category: ImportedVisualCategory) => {
    setCollapsedImportGroups((previous) => ({
      ...previous,
      [category]: !previous[category],
    }));
  };

  useEffect(() => {
    if (queryBuilderMetadataGroups.length === 0) {
      return;
    }

    setQueryBuilderExpandedTables((previous) => {
      const next = { ...previous };
      let changed = false;
      queryBuilderMetadataGroups.forEach((group, index) => {
        if (typeof next[group.key] === 'undefined') {
          next[group.key] = index < 4;
          changed = true;
        }
      });
      return changed ? next : previous;
    });
  }, [queryBuilderMetadataGroups]);

  const visibleDatasetAssets = React.useMemo(() => importSummary.filter((item) => (
    item.isVisible
    && item.hasQuery
    && Boolean(item.executionDax || item.fullQuery)
    && item.charts.some((chart) => chart.isVisible)
    && item.fields.some((field) => field.isVisible)
  )), [importSummary]);
  const selectedDataset = importSummary.find((item) => item.id === selectedDatasetId) || importSummary[0];
  const selectedDatasetChart = selectedDataset?.charts.find((chart) => chart.isVisible) || selectedDataset?.charts[0];
  const selectedDatasetPreviewResult = selectedDataset
    ? filterQueryResultByVisibleFields(selectedDataset.previewResult, selectedDataset)
    : undefined;
  const selectedDatasetPreviewQueryId = selectedDataset
    ? selectedDataset.queryId || `preview-${selectedDataset.id}`
    : undefined;

  useEffect(() => {
    if (selectedDatasetPreviewQueryId && selectedDatasetPreviewResult) {
      primeQueryCache(selectedDatasetPreviewQueryId, selectedDatasetPreviewResult.rows);
    }
  }, [selectedDatasetPreviewQueryId, selectedDatasetPreviewResult]);

  const hasReport = Boolean(currentReport && currentPages.length > 0);
  const hasImportedVisuals = importSummary.length > 0;
  const importableVisualCount = visibleDatasetAssets.length;
  const effectiveReportCanvasZoomPercent = reportCanvasZoomMode === 'fit'
    ? reportCanvasFitZoomPercent
    : reportCanvasManualZoomPercent;

  const applyReportCanvasManualZoom = (value: number) => {
    setReportCanvasZoomMode('manual');
    setReportCanvasManualZoomPercent(clampReportCanvasZoom(value));
  };

  const commitReportCanvasZoomInput = () => {
    const parsed = Number(reportCanvasZoomInputValue.replace('%', '').trim());
    if (Number.isNaN(parsed)) {
      setReportCanvasZoomInputValue(String(effectiveReportCanvasZoomPercent));
      return;
    }

    applyReportCanvasManualZoom(parsed);
  };

  useEffect(() => {
    setReportCanvasZoomInputValue(String(effectiveReportCanvasZoomPercent));
  }, [effectiveReportCanvasZoomPercent]);

  const openAiWorkspace = () => {
    setWorkspaceMode('report');
    setActiveRibbonTab('ai');
    setActiveLeftPaneSection('ai');
    setShowRightPane(true);
  };
  const ribbonTabs: Array<{ id: RibbonTabId; label: string; color: string }> = [
    { id: 'home', label: '主页', color: '#22C983' },
    { id: 'dataset', label: '数据集', color: '#3B82F6' },
    { id: 'ai', label: 'AI', color: '#8B5CF6' },
    { id: 'view', label: '视图', color: '#F59E0B' },
  ];
  const workspaceRailItems: Array<{ id: WorkspaceRailId; label: string; icon: React.ReactNode }> = [
    { id: 'report', label: '报表视图', icon: createMonoIcon('report-view', 16) },
    { id: 'data', label: '数据视图', icon: createMonoIcon('data-view', 14) },
  ];
  const inspectorSections: Array<{ id: LeftPaneSectionId; label: string; color: string }> = [
    { id: 'start', label: '主页', color: '#22C983' },
    { id: 'import', label: '导入', color: '#3B82F6' },
    { id: 'ai', label: 'AI', color: '#8B5CF6' },
    { id: 'model', label: '模型', color: '#F59E0B' },
  ];
  const activeInspectorMeta = inspectorSections.find((item) => item.id === activeLeftPaneSection) || inspectorSections[0];
  const collapsedRightPaneTitle = activeLeftPaneSection === 'ai' ? 'AI 对话' : activeInspectorMeta.label;
  const showReportRightPane = workspaceMode === 'report' && showRightPane;
  const datasetPreviewPane = (() => {
    if (!selectedDataset) {
      return (
        <div style={{ color: shellPalette.textMuted, fontSize: 12, lineHeight: 1.7 }}>
          先创建或导入一个数据集，这里会显示图表素材预览。
        </div>
      );
    }

    if (!selectedDataset.isVisible) {
      return (
        <div style={{ color: shellPalette.warning, fontSize: 12, lineHeight: 1.7 }}>
          当前数据集已隐藏。重新设为可见后才会恢复预览联动。
        </div>
      );
    }

    if (!selectedDatasetPreviewResult || selectedDataset.fields.every((field) => !field.isVisible)) {
      return (
        <div style={{ color: shellPalette.textMuted, fontSize: 12, lineHeight: 1.7 }}>
          当前没有可见字段可用于预览。请在右侧打开至少一个字段。
        </div>
      );
    }

    if (!selectedDatasetChart || !selectedDatasetChart.isVisible || selectedDatasetChart.componentType === 'filter') {
      const previewColumns = selectedDatasetPreviewResult.columns.filter((column) => column.name !== '__rowIndex');
      const previewRows = selectedDatasetPreviewResult.rows.slice(0, 8);

      return (
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ color: shellPalette.textMuted, fontSize: 12 }}>
              当前没有可视图表，以下展示可见字段的数据预览。
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setImportInspectorState({ item: selectedDataset, mode: 'dax' })}
                style={{
                  padding: '8px 12px',
                  borderRadius: 10,
                  border: `1px solid ${shellPalette.border}`,
                  background: '#FFFFFF',
                  color: shellPalette.text,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                查看 DAX
              </button>
              <button
                type="button"
                onClick={() => setImportInspectorState({ item: selectedDataset, mode: 'data' })}
                style={{
                  padding: '8px 12px',
                  borderRadius: 10,
                  border: `1px solid ${shellPalette.accentBorder}`,
                  background: shellPalette.accentSoft,
                  color: shellPalette.accent,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                数据预览
              </button>
            </div>
          </div>
          <div style={{ overflow: 'auto', border: `1px solid ${shellPalette.border}`, borderRadius: 12, background: '#FFFFFF' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: shellPalette.ribbonMutedBg }}>
                  {previewColumns.map((column) => (
                    <th key={column.name} style={{ padding: '10px 12px', textAlign: 'left', color: shellPalette.text, borderBottom: `1px solid ${shellPalette.border}` }}>
                      {column.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row, rowIndex) => (
                  <tr key={String(row.__rowIndex ?? rowIndex)}>
                    {previewColumns.map((column) => (
                      <td key={`${rowIndex}-${column.name}`} style={{ padding: '10px 12px', color: shellPalette.textMuted, borderBottom: `1px solid ${shellPalette.border}` }}>
                        {typeof row[column.name] === 'object' ? JSON.stringify(row[column.name]) : String(row[column.name] ?? '')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );
    }

    return (
      <div style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <InfoPill label="图表类型" value={selectedDatasetChart.chartType} tone="accent" />
            <InfoPill label="可见字段" value={String(selectedDataset.fields.filter((field) => field.isVisible).length)} />
            <InfoPill label="预览行数" value={String(selectedDatasetPreviewResult.rowCount)} tone="success" />
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => setImportInspectorState({ item: selectedDataset, mode: 'dax' })}
              style={{
                padding: '8px 12px',
                borderRadius: 10,
                border: `1px solid ${shellPalette.border}`,
                background: '#FFFFFF',
                color: shellPalette.text,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              查看 DAX
            </button>
            <button
              type="button"
              onClick={() => setImportInspectorState({ item: selectedDataset, mode: 'data' })}
              style={{
                padding: '8px 12px',
                borderRadius: 10,
                border: `1px solid ${shellPalette.accentBorder}`,
                background: shellPalette.accentSoft,
                color: shellPalette.accent,
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              数据预览
            </button>
          </div>
        </div>
        <div
          style={{
            minHeight: 340,
            borderRadius: 12,
            border: `1px solid ${shellPalette.border}`,
            background: '#FFFFFF',
            overflow: 'auto',
            padding: 12,
            boxSizing: 'border-box',
          }}
        >
          <BasicDatasetPreview
            datasetName={selectedDataset.name}
            chartType={selectedDatasetChart.chartType}
            result={selectedDatasetPreviewResult}
          />
        </div>
      </div>
    );
  })();
  const renderImportSummaryList = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {importSummary.length === 0 ? (
        <PaneCard
          title="还没有视觉对象"
          subtitle="导入后可在这里查看全部 visual。"
        >
          <div
            style={{
              padding: '12px 14px',
              borderRadius: 10,
              border: `1px solid ${shellPalette.border}`,
              background: shellPalette.paneBg,
              color: shellPalette.textMuted,
              fontSize: 12,
              lineHeight: 1.7,
            }}
          >
            请先连接，再从顶部导入 JSON。
          </div>
          {!isConnected ? (
            <div style={{ marginTop: 12, color: shellPalette.textMuted, fontSize: 12 }}>
              先连接模型后再获取真实数据。
            </div>
          ) : null}
        </PaneCard>
      ) : (
        <>
          <PaneCard
            title="导入概览"
            subtitle="按展示型、功能型和装饰型汇总。"
            tone="accent"
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
              <InfoPill label="全部" value={String(importSummary.length)} tone="accent" />
              <InfoPill label="展示型" value={String(importSummaryGroups.display.length)} tone="success" />
              <InfoPill label="功能型" value={String(importSummaryGroups.functional.length)} />
              <InfoPill label="装饰型" value={String(importSummaryGroups.decorative.length)} tone="warning" />
            </div>
            <div style={{ marginTop: 12, color: shellPalette.textMuted, fontSize: 12, lineHeight: 1.6 }}>
              这里用于查看分类和联动定位。
            </div>
            {generationProgress ? (
              <div style={{ marginTop: 12, color: shellPalette.textMuted, fontSize: 12 }}>
                {generationProgress}
              </div>
            ) : null}
          </PaneCard>
          {(['display', 'functional', 'decorative'] as ImportedVisualCategory[]).map((category) => {
            const items = importSummaryGroups[category];
            if (items.length === 0) {
              return null;
            }

            return (
              <PaneCard
                key={category}
                title={getVisualCategoryLabel(category)}
                subtitle={`共 ${items.length} 个视觉对象，默认折叠便于在桌面布局中管理。`}
                actions={(
                  <button
                    type="button"
                    onClick={() => toggleImportGroup(category)}
                    style={{
                      border: `1px solid ${shellPalette.border}`,
                      borderRadius: 8,
                      background: shellPalette.ribbonMutedBg,
                      color: shellPalette.textMuted,
                      padding: '6px 10px',
                      fontSize: 12,
                      cursor: 'pointer',
                    }}
                  >
                    {collapsedImportGroups[category] ? '展开' : '折叠'}
                  </button>
                )}
              >
                {!collapsedImportGroups[category] ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {items.map((item) => {
                      const canFocus = Boolean(item.componentId);
                      const isActive = canFocus && activeImportedComponentId === item.componentId;
                      const canInspect = Boolean(item.hasQuery && (item.fullQuery || item.executionDax));

                      return (
                        <div
                          key={item.id}
                          style={{
                            padding: 12,
                            borderRadius: 10,
                            border: `1px solid ${isActive ? shellPalette.accentBorder : shellPalette.border}`,
                            background: isActive ? shellPalette.accentSoft : shellPalette.paneBg,
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                            <button
                              type="button"
                              onClick={() => {
                                if (item.componentId) {
                                  setActiveImportedComponentId(item.componentId);
                                }
                              }}
                              disabled={!canFocus}
                              style={{
                                flex: 1,
                                border: 'none',
                                background: 'transparent',
                                padding: 0,
                                textAlign: 'left',
                                color: shellPalette.text,
                                cursor: canFocus ? 'pointer' : 'default',
                                opacity: canFocus ? 1 : 0.82,
                              }}
                            >
                              <div style={{ fontSize: 13, fontWeight: 600 }}>{item.name}</div>
                              <div style={{ marginTop: 4, fontSize: 11, color: shellPalette.textMuted }}>
                                类型: {item.type}
                              </div>
                            </button>
                            <span
                              style={{
                                padding: '4px 8px',
                                borderRadius: 999,
                                fontSize: 10,
                                fontWeight: 600,
                                background: item.isRendered ? shellPalette.successSoft : shellPalette.ribbonMutedBg,
                                color: item.isRendered ? shellPalette.success : shellPalette.textMuted,
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {item.isRendered ? '已展示' : item.hasQuery ? '未展示' : '无查询'}
                            </span>
                          </div>
                          {(item.rowCount > 0 || item.executionTime > 0) ? (
                            <div style={{ marginTop: 6, fontSize: 11, color: shellPalette.textSubtle }}>
                              {item.rowCount > 0 ? `行数 ${item.rowCount}` : '行数 -'}
                              {item.executionTime > 0 ? ` · 耗时 ${item.executionTime.toFixed(0)}ms` : ''}
                            </div>
                          ) : null}
                          {canInspect ? (
                            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                              <button
                                type="button"
                                onClick={() => setImportInspectorState({ item, mode: 'dax' })}
                                style={{
                                  padding: '6px 10px',
                                  borderRadius: 999,
                                  border: `1px solid ${shellPalette.border}`,
                                  background: shellPalette.ribbonMutedBg,
                                  color: shellPalette.text,
                                  fontSize: 11,
                                  cursor: 'pointer',
                                }}
                              >
                                DAX
                              </button>
                              <button
                                type="button"
                                onClick={() => setImportInspectorState({ item, mode: 'data' })}
                                style={{
                                  padding: '6px 10px',
                                  borderRadius: 999,
                                  border: `1px solid ${shellPalette.border}`,
                                  background: shellPalette.ribbonMutedBg,
                                  color: shellPalette.text,
                                  fontSize: 11,
                                  cursor: 'pointer',
                                }}
                              >
                                数据
                              </button>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ color: shellPalette.textMuted, fontSize: 12 }}>
                    分组已折叠，可展开查看。
                  </div>
                )}
              </PaneCard>
            );
          })}
        </>
      )}
    </div>
  );
  const aiPaneToggleButtonStyle: React.CSSProperties = {
    width: 28,
    height: 28,
    border: 'none',
    background: 'transparent',
    color: shellPalette.accent,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    flexShrink: 0,
  };
  const ribbonToggleButtonStyle: React.CSSProperties = {
    width: 30,
    height: 30,
    border: 'none',
    background: 'transparent',
    color: shellPalette.accent,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    flexShrink: 0,
  };
  const reportCanvasControlButtonStyle = (active = false): React.CSSProperties => ({
    height: 30,
    padding: '0 10px',
    borderRadius: 8,
    border: `1px solid ${active ? shellPalette.accentBorder : shellPalette.border}`,
    background: active ? shellPalette.accentSoft : '#FFFFFF',
    color: active ? shellPalette.accent : shellPalette.text,
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
  });
  const reportCanvasHeaderActions = hasReport ? (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
      <button
        type="button"
        onClick={() => {
          void handleOpenBrowserPreview();
        }}
        style={reportCanvasControlButtonStyle()}
      >
        在浏览器中打开
      </button>
      <InfoPill label="画布" value={`${DEFAULT_REPORT_CANVAS_WIDTH} × ${DEFAULT_REPORT_CANVAS_HEIGHT}`} />
      <button
        type="button"
        onClick={() => setReportCanvasZoomMode('fit')}
        style={reportCanvasControlButtonStyle(reportCanvasZoomMode === 'fit')}
      >
        宽度自适应
      </button>
      <button
        type="button"
        onClick={() => applyReportCanvasManualZoom(effectiveReportCanvasZoomPercent - 10)}
        style={{ ...reportCanvasControlButtonStyle(), width: 30, padding: 0 }}
      >
        -
      </button>
      <input
        type="number"
        value={reportCanvasZoomInputValue}
        onChange={(event) => setReportCanvasZoomInputValue(event.target.value)}
        onBlur={commitReportCanvasZoomInput}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commitReportCanvasZoomInput();
          }
        }}
        style={{
          width: 68,
          height: 30,
          padding: '0 8px',
          borderRadius: 8,
          border: `1px solid ${shellPalette.border}`,
          background: '#FFFFFF',
          color: shellPalette.text,
          fontSize: 12,
          fontWeight: 700,
          boxSizing: 'border-box',
        }}
      />
      <span style={{ color: shellPalette.textMuted, fontSize: 12, fontWeight: 700 }}>%</span>
      <button
        type="button"
        onClick={() => applyReportCanvasManualZoom(effectiveReportCanvasZoomPercent + 10)}
        style={{ ...reportCanvasControlButtonStyle(), width: 30, padding: 0 }}
      >
        +
      </button>
    </div>
  ) : undefined;

  const renderRightPaneShell = (
    title: string,
    body: React.ReactNode,
    options?: {
      bodyPadding?: number;
      bodyScrollable?: boolean;
      bodyStyle?: React.CSSProperties;
    }
  ) => (
    <RightPaneSurface>
      <div
        style={{
          height: '100%',
          minHeight: 0,
          display: 'grid',
          gridTemplateRows: '52px minmax(0, 1fr)',
          gap: 10,
          padding: '8px 10px 10px',
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-start',
            alignItems: 'center',
            gap: 8,
            minHeight: 0,
            padding: '0 2px',
          }}
        >
          <button
            type="button"
            onClick={() => setShowRightPane(false)}
            title={`收起 ${title}`}
            aria-label={`收起 ${title}`}
            style={aiPaneToggleButtonStyle}
          >
            {createDoubleChevronIcon('right', shellPalette.accent, 18)}
          </button>
          <div style={{ color: shellPalette.text, fontSize: 15, fontWeight: 700 }}>
            {title}
          </div>
        </div>
        <div
          style={{
            minHeight: 0,
            overflow: 'hidden',
            borderRadius: 10,
            border: `1px solid ${shellPalette.border}`,
            background: '#FFFFFF',
          }}
        >
          <div
            style={{
              height: '100%',
              minHeight: 0,
              overflow: options?.bodyScrollable === false ? 'hidden' : 'auto',
              padding: options?.bodyPadding ?? 12,
              boxSizing: 'border-box',
              ...options?.bodyStyle,
            }}
          >
            {body}
          </div>
        </div>
      </div>
    </RightPaneSurface>
  );

  const handleClearAiSession = () => {
    setChatInput('');
    setAiMessages([]);
    setAiTraceMap({});
    setAiActiveRunId(undefined);
    setAiAgentError('');
    setGenerationProgress('');
    setAiSessionId('');
    closeAiStream();
  };

  const handleCancelAiRun = async () => {
    if (!agentBaseUrl || !aiActiveRunId) {
      return;
    }

    try {
      await cancelAgentRun(agentBaseUrl, aiActiveRunId);
    } catch (cancelError) {
      setAiAgentError(cancelError instanceof Error ? cancelError.message : String(cancelError));
    }
  };

  const submitAiTask = async (
    messageInput?: string,
    options?: {
      displayMessage?: string;
      clearInput?: boolean;
    },
  ) => {
    const message = (messageInput ?? chatInput).trim();
    if (!message) {
      return;
    }

    if (!aiSettings.baseUrl.trim() || !aiSettings.apiKey.trim() || !aiSettings.model.trim()) {
      setAiAgentError('请先在设置中填写 AI baseUrl、API key 和模型名称。');
      setActiveSettingsTab('ai');
      setShowSettings(true);
      return;
    }

    try {
      setAiAgentError('');
      const sessionId = await ensureAiSession();
      const localUserMessage: AiMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: options?.displayMessage?.trim() || message,
        timestamp: new Date().toISOString(),
      };
      setAiMessages((previous) => [...previous, localUserMessage]);
      if (options?.clearInput !== false) {
        setChatInput('');
      }
      setGenerationProgress('AI 正在规划执行路径...');
      const payload = {
        message,
        settings: aiSettings,
        context: agentExecutionContext,
      };

      let run;
      try {
        run = await submitAgentMessage(agentBaseUrl, sessionId, payload);
      } catch (submitError) {
        const errorText = submitError instanceof Error ? submitError.message : String(submitError);
        const shouldRecoverSession = errorText.includes('会话不存在') || errorText.includes('HTTP 404') || errorText.includes('404');
        if (!shouldRecoverSession) {
          throw submitError;
        }

        setAiSessionId('');
        closeAiStream();
        const recoveredSession = await createAgentSession(agentBaseUrl);
        setAiSessionId(recoveredSession.sessionId);
        run = await submitAgentMessage(agentBaseUrl, recoveredSession.sessionId, payload);
      }
      setAiActiveRunId(run.runId);
      setAiTraceMap((previous) => ({
        ...previous,
        [run.runId]: previous[run.runId] || createInitialTrace(run.runId),
      }));
    } catch (sendError) {
      const messageText = sendError instanceof Error ? sendError.message : String(sendError);
      setAiAgentError(messageText);
      setGenerationProgress(`AI 执行失败：${messageText}`);
    }
  };

  const handleSendChatMessage = async () => {
    await submitAiTask();
  };

  const handleDirectGenerateReport = async () => {
    if (!isConnected) {
      setAiAgentError('请先连接模型后再生成报表。');
      openAiWorkspace();
      return;
    }

    if (importSummary.length === 0) {
      setAiAgentError('请先导入至少一个数据集，再让 AI 直接生成报表。');
      openAiWorkspace();
      return;
    }

    openAiWorkspace();
    setAiDesignAskedFields([]);
    const firstQuestion = buildAiDesignQuestions(importSummary, aiDesignIntakeDraft, [])[0] || null;
    setAiDesignPendingQuestion(firstQuestion);
    setAiMessages((previous) => [
      ...previous,
      {
        id: `assistant-design-${Date.now()}`,
        role: 'assistant',
        content: '生成前我先问你几个简短问题，确认这版报表的风格方向，再开始生成。',
        timestamp: new Date().toISOString(),
      },
    ]);
  };

  const handleConfirmAiDesignIntake = async () => {
    const prompt = buildGuidedGeneratePrompt(importSummary.length, aiDesignIntakeDraft);
    const displayMessage = buildGuidedGenerateDisplayMessage(aiDesignIntakeDraft);
    setAiDesignPendingQuestion(null);
    openAiWorkspace();
    await submitAiTask(prompt, {
      displayMessage,
      clearInput: true,
    });
  };

  const handleSelectAiDesignOption = async (value: string) => {
    const question = aiDesignPendingQuestion;
    if (!question) {
      return;
    }

    const nextDraft = {
      ...aiDesignIntakeDraft,
      [question.field]: value,
    } as AiDesignIntakeDraft;
    setAiDesignIntakeDraft(nextDraft);
    const nextAsked = [...aiDesignAskedFields, question.field];
    setAiDesignAskedFields(nextAsked);
    setAiMessages((previous) => [
      ...previous,
      {
        id: `user-design-${Date.now()}`,
        role: 'user',
        content: `${question.title}：${question.options.find((option) => option.value === value)?.label || value}`,
        timestamp: new Date().toISOString(),
      },
    ]);

    const nextQuestion = buildAiDesignQuestions(importSummary, nextDraft, nextAsked)[0] || null;
    setAiDesignPendingQuestion(nextQuestion);
    if (!nextQuestion) {
      await handleConfirmAiDesignIntake();
    }
  };

  const handleSkipAiDesignQuestion = async () => {
    const question = aiDesignPendingQuestion;
    if (!question) {
      return;
    }

    const nextAsked = [...aiDesignAskedFields, question.field];
    setAiDesignAskedFields(nextAsked);
    setAiMessages((previous) => [
      ...previous,
      {
        id: `user-design-skip-${Date.now()}`,
        role: 'user',
        content: `${question.title}：跳过`,
        timestamp: new Date().toISOString(),
      },
    ]);

    const nextQuestion = buildAiDesignQuestions(importSummary, aiDesignIntakeDraft, nextAsked)[0] || null;
    setAiDesignPendingQuestion(nextQuestion);
    if (!nextQuestion) {
      await handleConfirmAiDesignIntake();
    }
  };

  const handleTestAiConnection = async () => {
    if (!agentBaseUrl) {
      setAiConnectionProbe(null);
      setAiConnectionProbeError('AI sidecar 尚未启动。');
      return;
    }

    if (!aiSettings.baseUrl.trim() || !aiSettings.apiKey.trim() || !aiSettings.model.trim()) {
      setAiConnectionProbe(null);
      setAiConnectionProbeError('请先完整填写 AI baseUrl、API key 和模型名称。');
      setActiveSettingsTab('ai');
      return;
    }

    try {
      setIsTestingAiConnection(true);
      setAiConnectionProbeError('');
      const result = await probeAgentConnection(agentBaseUrl, aiSettings);
      setAiConnectionProbe(result);
    } catch (probeError) {
      setAiConnectionProbe(null);
      setAiConnectionProbeError(probeError instanceof Error ? probeError.message : String(probeError));
    } finally {
      setIsTestingAiConnection(false);
    }
  };

  const renderRightPaneContent = () => {
    if (activeLeftPaneSection === 'import') {
      return renderRightPaneShell('导入任务', (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <PaneCard title="Performance Analyzer JSON" subtitle="解析标题、类型并补取数据。" tone="accent">
            <div
              style={{
                padding: '12px 14px',
                borderRadius: 10,
                border: `1px solid ${shellPalette.border}`,
                background: shellPalette.paneBg,
                color: shellPalette.textMuted,
                fontSize: 12,
                lineHeight: 1.7,
              }}
            >
              从顶部导入 JSON，结果显示在下方。
            </div>
            {!isConnected ? (
              <div style={{ marginTop: 12, color: shellPalette.warning, fontSize: 12 }}>
                请先连接模型。
              </div>
            ) : null}
            {importError ? (
              <div style={{ marginTop: 12, color: shellPalette.error, fontSize: 12 }}>
                {importError}
              </div>
            ) : null}
          </PaneCard>
          <PaneCard title="导入统计" subtitle="导入状态和识别结果摘要。">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
              <InfoPill label="视觉对象" value={String(importSummary.length)} tone="accent" />
              <InfoPill label="展示型" value={String(importSummaryGroups.display.length)} tone="success" />
              <InfoPill label="功能型" value={String(importSummaryGroups.functional.length)} />
              <InfoPill label="装饰型" value={String(importSummaryGroups.decorative.length)} tone="warning" />
            </div>
            <div style={{ marginTop: 12, fontSize: 12, color: shellPalette.textMuted, lineHeight: 1.6 }}>
              {importSummary.length > 0 ? '下方可继续查看 visual 列表。' : '当前还没有导入 visual。'}
            </div>
          </PaneCard>
          <PaneCard title="后续步骤" subtitle="导入后可继续生成或查看模型。">
            <div style={{ display: 'grid', gap: 10 }}>
              <InfoPill label="可生成 visual" value={String(importableVisualCount)} tone={importableVisualCount > 0 ? 'success' : 'default'} />
              <InfoPill label="模型状态" value={isConnected ? '可用' : '未连接'} tone={isConnected ? 'accent' : 'warning'} />
            </div>
            <div style={{ marginTop: 12, color: shellPalette.textMuted, fontSize: 12, lineHeight: 1.6 }}>
              生成和查看模型都在顶部入口。
            </div>
            {generationProgress ? (
              <div style={{ marginTop: 12, color: shellPalette.textMuted, fontSize: 12 }}>
                {generationProgress}
              </div>
            ) : null}
          </PaneCard>
          {renderImportSummaryList()}
        </div>
      ));
    }

    if (activeLeftPaneSection === 'ai') {
      return renderRightPaneShell('AI 对话', (
        <div style={{ height: '100%', minHeight: 0, display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr)', gap: 10 }}>
          {aiAgentError ? (
            <div
              style={{
                margin: '0 12px',
                padding: '10px 12px',
                borderRadius: 10,
                border: `1px solid rgba(180, 35, 53, 0.16)`,
                background: shellPalette.errorSoft,
                color: shellPalette.error,
                fontSize: 12,
                lineHeight: 1.6,
              }}
            >
              {aiAgentError}
            </div>
          ) : null}
          {!agentBaseUrl ? (
            <div style={{ padding: 16, color: shellPalette.textMuted, fontSize: 12, lineHeight: 1.7 }}>
              AI sidecar 尚未就绪。请检查桌面端主进程是否已成功启动 Python agent。
            </div>
          ) : (
            <AiSessionPane
              messages={aiMessages}
              traces={aiTraces}
              activeRunId={aiActiveRunId}
              input={chatInput}
              onInputChange={setChatInput}
              onSend={() => { void handleSendChatMessage(); }}
              onQuickGenerate={() => { void handleDirectGenerateReport(); }}
              onCancel={() => { void handleCancelAiRun(); }}
              onClear={handleClearAiSession}
              isRunning={Boolean(aiActiveRunId)}
              pendingQuestion={aiDesignPendingQuestion}
              onSelectPendingOption={(value) => { void handleSelectAiDesignOption(value); }}
              onSkipPendingQuestion={() => { void handleSkipAiDesignQuestion(); }}
            />
          )}
        </div>
      ), { bodyPadding: 0, bodyScrollable: false });
    }

    if (activeLeftPaneSection === 'model') {
      return renderRightPaneShell('模型概览', (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <PaneCard title="连接状态" subtitle="当前模型连接。" tone={isConnected ? 'success' : 'warning'}>
            <div style={{ display: 'grid', gap: 10 }}>
              <InfoPill label="状态" value={isConnected ? '已连接' : '未连接'} tone={isConnected ? 'success' : 'warning'} />
              <InfoPill label="数据库" value={modelMetadata?.databaseName || '未加载'} />
              <InfoPill label="地址" value={getConnectionDisplayName()} />
            </div>
          </PaneCard>
          <PaneCard title="模型规模" subtitle="表、度量、关系数量摘要。">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
              <InfoPill label="表" value={String(modelMetadata?.tables.length || 0)} tone="accent" />
              <InfoPill label="度量" value={String(modelMetadata?.measures.length || 0)} tone="success" />
              <InfoPill label="关系" value={String(modelMetadata?.relationships.length || 0)} />
              <InfoPill label="查询" value={String(currentQueries.length)} tone="warning" />
            </div>
          </PaneCard>
          <PaneCard title="字段浏览器" subtitle="按表和度量浏览。">
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <button
                type="button"
                onClick={() => setActiveTab('tables')}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: 'none',
                  background: activeTab === 'tables' ? shellPalette.accent : shellPalette.ribbonMutedBg,
                  color: activeTab === 'tables' ? '#FFFFFF' : shellPalette.textMuted,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                表 ({modelMetadata?.tables.length || 0})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('measures')}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: 'none',
                  background: activeTab === 'measures' ? shellPalette.accent : shellPalette.ribbonMutedBg,
                  color: activeTab === 'measures' ? '#FFFFFF' : shellPalette.textMuted,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                度量 ({modelMetadata?.measures.length || 0})
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {activeTab === 'measures'
                ? modelMetadata?.measures.map((measure, idx) => (
                  <div
                    key={`${measure.tableName || 'unknown'}-${measure.name}-${idx}`}
                    style={{
                      padding: 10,
                      borderRadius: 8,
                      border: `1px solid ${shellPalette.border}`,
                      background: shellPalette.ribbonMutedBg,
                    }}
                  >
                    <div style={{ color: shellPalette.text, fontSize: 12, fontWeight: 600 }}>{measure.name}</div>
                    <div style={{ marginTop: 4, color: shellPalette.textMuted, fontSize: 11 }}>
                      {measure.tableName || '未分组'}
                    </div>
                  </div>
                ))
                : modelMetadata?.tables.map((table, idx) => (
                  <div
                    key={`${table.name}-${idx}`}
                    style={{
                      padding: 10,
                      borderRadius: 8,
                      border: `1px solid ${shellPalette.border}`,
                      background: shellPalette.ribbonMutedBg,
                    }}
                  >
                    <div style={{ color: shellPalette.text, fontSize: 12, fontWeight: 600 }}>{table.name}</div>
                    <div style={{ marginTop: 4, color: shellPalette.textMuted, fontSize: 11 }}>
                      {table.columns.length} 列
                    </div>
                  </div>
                ))}
              {!modelMetadata ? (
                <div style={{ color: shellPalette.textMuted, fontSize: 12 }}>
                  连接成功后会在这里展示表和度量。
                </div>
              ) : null}
            </div>
          </PaneCard>
        </div>
      ));
    }

    return renderRightPaneShell('开始', (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <PaneCard title="Power BI 连接" subtitle="当前连接状态。" tone={isConnected ? 'success' : 'default'}>
          {!isConnected ? (
            <>
              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: 10,
                  border: `1px solid ${shellPalette.border}`,
                  background: shellPalette.paneBg,
                }}
              >
                <div style={{ color: shellPalette.text, fontSize: 13, fontWeight: 600 }}>
                  当前目标
                </div>
                <div style={{ marginTop: 6, color: shellPalette.textMuted, fontSize: 12 }}>
                  {getConnectionDisplayName()}
                </div>
                <div style={{ marginTop: 8, color: shellPalette.textSubtle, fontSize: 11 }}>
                  从顶部入口连接。
                </div>
              </div>
              <div style={{ marginTop: 12, color: shellPalette.textMuted, fontSize: 12, lineHeight: 1.6 }}>
                连接和设置都在顶部。
              </div>
              {connectionError ? (
                <div style={{ marginTop: 12, color: shellPalette.error, fontSize: 12 }}>
                  {connectionError}
                </div>
              ) : null}
            </>
          ) : (
            <>
              <div style={{ display: 'grid', gap: 10 }}>
                <InfoPill label="状态" value="已连接" tone="success" />
                <InfoPill label="数据库" value={modelMetadata?.databaseName || '未加载'} tone="accent" />
                <InfoPill label="地址" value={getConnectionDisplayName()} />
                <InfoPill label="表" value={String(modelMetadata?.tables.length || 0)} />
              </div>
              <div style={{ marginTop: 12, color: shellPalette.textMuted, fontSize: 12, lineHeight: 1.6 }}>
                重新连接和导入都在顶部。
              </div>
            </>
          )}
        </PaneCard>
        <PaneCard title="工作流" subtitle="按顺序连接、导入、生成、检查。">
          <div style={{ display: 'grid', gap: 10 }}>
            <InfoPill label="连接" value={isConnected ? '完成' : '待处理'} tone={isConnected ? 'success' : 'warning'} />
            <InfoPill label="导入" value={importSummary.length > 0 ? '完成' : '待处理'} tone={importSummary.length > 0 ? 'accent' : 'default'} />
            <InfoPill label="生成" value={hasReport ? '完成' : '待处理'} tone={hasReport ? 'success' : 'default'} />
          </div>
          <div style={{ marginTop: 12, color: shellPalette.textMuted, fontSize: 12, lineHeight: 1.6 }}>
            左侧切换上下文，顶部执行命令。
          </div>
        </PaneCard>
      </div>
    ));
  };
  const renderCollapsedRightPane = () => (
    <div
      style={{
        minWidth: 0,
        minHeight: 0,
        display: 'flex',
        alignItems: 'stretch',
        justifyContent: 'center',
        background: 'linear-gradient(180deg, #FBFCF8 0%, #F1F5FB 100%)',
        borderLeft: `1px solid ${shellPalette.border}`,
        boxShadow: 'inset 1px 0 0 rgba(255, 255, 255, 0.7)',
      }}
    >
      <button
        type="button"
        onClick={() => setShowRightPane(true)}
        title={`展开 ${collapsedRightPaneTitle}`}
        aria-label={`展开 ${collapsedRightPaneTitle}`}
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
          padding: 0,
          background: 'transparent',
          cursor: 'pointer',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        <span
          aria-hidden="true"
          style={{
            marginTop: 14,
            color: shellPalette.accent,
            lineHeight: 1,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {createDoubleChevronIcon('left', shellPalette.accent, 18)}
        </span>
        <span
          aria-hidden="true"
          style={{
            marginTop: 22,
            writingMode: 'vertical-rl',
            color: shellPalette.textMuted,
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: 1.6,
          }}
        >
          {collapsedRightPaneTitle}
        </span>
      </button>
    </div>
  );
  const renderRibbonContent = () => {
    if (activeRibbonTab === 'dataset') {
      return (
        <>
          <RibbonGroup title="创建">
            <CommandButton
              icon={createGradientIcon('import', '#60A5FA', '#2563EB')}
              label="导入 JSON"
              description="导入 Performance Analyzer 导出的 JSON"
              onClick={() => openDatasetDialog('import-json')}
              disabled={!isConnected || isImporting}
              tone="accent"
              showDescription={false}
            />
            <CommandButton
              icon={createGradientIcon('custom-dax', '#34D399', '#0F8C72')}
              label="自定义"
              description="手动编写 DAX 创建数据集"
              onClick={() => openDatasetDialog('custom-dax')}
              disabled={!isConnected || isImporting}
              showDescription={false}
            />
            <CommandButton
              icon={createGradientIcon('query-builder', '#FBBF24', '#F97316')}
              label="查询生成器"
              description="拖拽维度和度量生成 DAX 查询"
              onClick={() => openDatasetDialog('query-builder')}
              disabled={!isConnected || isImporting}
              showDescription={false}
            />
          </RibbonGroup>
        </>
      );
    }

    if (activeRibbonTab === 'ai') {
      return (
        <>
          <RibbonGroup title="生成">
            <CommandButton
              icon={createGradientIcon('sparkle', '#2563EB', '#7C3AED')}
              label="生成报表"
              description="基于当前数据直接生成一版完整报表"
              onClick={() => { void handleDirectGenerateReport(); }}
              disabled={!isConnected || importSummary.length === 0 || Boolean(aiActiveRunId)}
              tone="accent"
              showDescription={false}
            />
          </RibbonGroup>
          <RibbonGroup title="面板">
            <CommandButton
              icon={createGradientIcon('message', '#A78BFA', '#7C3AED')}
              label="打开对话"
              description="打开右侧 AI 对话面板"
              onClick={openAiWorkspace}
              tone="accent"
              showDescription={false}
            />
            <CommandButton
              icon={createGradientIcon('refresh', '#7DD3FC', '#3B82F6')}
              label="清空输入"
              description="清空当前对话输入框"
              onClick={() => setChatInput('')}
              showDescription={false}
            />
          </RibbonGroup>
        </>
      );
    }

    if (activeRibbonTab === 'view') {
      return (
        <>
          <RibbonGroup title="面板">
            <CommandButton
              icon={createDoubleChevronIcon(showReportRightPane ? 'right' : 'left', '#0F8C72', 20)}
              label={showReportRightPane ? '收起设置' : '展开设置'}
              description="折叠或展开右侧设置面板"
              onClick={() => setShowRightPane((prev) => !prev)}
              active={showReportRightPane}
              showDescription={false}
            />
          </RibbonGroup>
          <RibbonGroup title="定位">
            <CommandButton
              icon={createGradientIcon('home', '#39D98A', '#0F8C72')}
              label="主页面板"
              description="查看连接、导入和系统状态"
              onClick={() => {
                setActiveLeftPaneSection('start');
                setShowRightPane(true);
              }}
              active={activeLeftPaneSection === 'start'}
              showDescription={false}
            />
            <CommandButton
              icon={createGradientIcon('sparkle', '#A78BFA', '#7C3AED')}
              label="AI 面板"
              description="定位到右侧 AI 对话面板"
              onClick={() => {
                setActiveLeftPaneSection('ai');
                setShowRightPane(true);
              }}
              active={activeLeftPaneSection === 'ai'}
              showDescription={false}
            />
            <CommandButton
              icon={createGradientIcon('model', '#FBBF24', '#F97316')}
              label="模型面板"
              description="查看模型表、字段和度量"
              onClick={() => {
                setActiveLeftPaneSection('model');
                setShowRightPane(true);
              }}
              active={activeLeftPaneSection === 'model'}
              showDescription={false}
            />
          </RibbonGroup>
        </>
      );
    }

    return (
      <>
        <RibbonGroup title="连接">
          <CommandButton
            icon={createGradientIcon('connect', '#39D98A', '#0F8C72')}
            label={isConnected ? '已连接' : isConnecting ? '连接中...' : '连接模型'}
            description={isConnected ? '当前模型连接已就绪' : '连接 Power BI Desktop 或 Tabular Server'}
            onClick={handleOpenConnectDialog}
            disabled={!apiUrl}
            tone="accent"
            showDescription={false}
          />
          <CommandButton
            icon={createGradientIcon('disconnect', '#FB7185', '#E11D48')}
            label="断开连接"
            description="清空模型和报表状态"
            onClick={handleDisconnect}
            disabled={!isConnected}
            showDescription={false}
          />
        </RibbonGroup>
        <RibbonGroup title="系统">
          <CommandButton
            icon={createGradientIcon('settings', '#FDBA74', '#F97316')}
            label="设置"
            description="打开系统设置"
            onClick={handleOpenSettings}
            showDescription={false}
          />
          <CommandButton
            icon={createGradientIcon('refresh', '#60A5FA', '#2563EB')}
            label="刷新连接"
            description="重新打开连接窗口并刷新模型元数据"
            onClick={handleOpenConnectDialog}
            disabled={!apiUrl}
            showDescription={false}
          />
        </RibbonGroup>
        <RibbonGroup title="发布">
          <CommandButton
            icon={createGradientIcon('publish', '#7DD3FC', '#2563EB')}
            label="发布"
            description="预留报表发布与共享入口"
            onClick={() => setGenerationProgress('发布能力预留在主页 Ribbon，后续可接入导出与发布流程。')}
            showDescription={false}
          />
          <CommandButton
            icon={createGradientIcon('sparkle', '#A78BFA', '#7C3AED')}
            label="进入 AI"
            description="切换到 AI 对话面板"
            onClick={() => {
              handleRibbonTabChange('ai');
            }}
            showDescription={false}
          />
        </RibbonGroup>
      </>
    );
  };

  if (isBrowserPreview) {
    if (error) {
      return (
        <div style={{ width: '100vw', minHeight: '100vh', background: shellPalette.appBg, color: shellPalette.error, padding: 24 }}>
          <h1>浏览器预览失败</h1>
          <p>{error}</p>
        </div>
      );
    }

    if (!browserPreviewPayload || !currentReport || currentPages.length === 0) {
      return (
        <div
          style={{
            width: '100vw',
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: shellPalette.appBg,
            color: shellPalette.textMuted,
            padding: 24,
          }}
        >
          正在加载浏览器预览...
        </div>
      );
    }

    return (
      <div
        style={{
          minHeight: '100vh',
          background: currentTheme.colors.background || shellPalette.appBg,
          padding: 0,
          boxSizing: 'border-box',
        }}
      >
        <div style={{ width: '100%', margin: 0 }}>
          <ReportRenderer
            report={currentReport}
            pages={currentPages}
            queries={currentQueries}
            theme={currentTheme}
            dataSource={currentDataSource}
            apiBaseUrl={effectiveApiUrl}
            activeComponentId={browserPreviewPayload.activeComponentId}
            viewportMode="document"
          />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ width: '100vw', height: '100vh', background: shellPalette.appBg, color: shellPalette.error, padding: 24 }}>
        <h1>错误</h1>
        <p>{error}</p>
        <p style={{ color: shellPalette.textMuted }}>
          请检查桌面端主进程、preload 与 .NET 后端是否已正常启动。
        </p>
      </div>
    );
  }

  return (
      <div
        style={{
          width: '100vw',
          height: '100vh',
          background: shellPalette.appBg,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'stretch', background: shellPalette.ribbonBg }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <RibbonTabs items={ribbonTabs} activeId={activeRibbonTab} onChange={handleRibbonTabChange} />
        </div>
        {isRibbonCollapsed ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'center',
              padding: '6px 8px 0 0',
              borderBottom: `1px solid ${shellPalette.border}`,
              background: 'linear-gradient(180deg, #FFFDF8 0%, #F7F8FB 100%)',
            }}
          >
            <button
              type="button"
              onClick={() => setIsRibbonCollapsed(false)}
              title="展开功能区"
              style={ribbonToggleButtonStyle}
            >
              {createDoubleChevronIcon('down', shellPalette.accent, 16)}
            </button>
          </div>
        ) : null}
      </div>
      {!isRibbonCollapsed ? (
        <RibbonBar>
          <div style={{ display: 'flex', alignItems: 'stretch', gap: 12, minWidth: 0, flex: 1 }}>
            {renderRibbonContent()}
          </div>
          <div
            style={{
              marginLeft: 'auto',
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'center',
              padding: '0 0 2px 4px',
            }}
          >
            <button
              type="button"
              onClick={() => setIsRibbonCollapsed(true)}
              title="折叠功能区"
              style={ribbonToggleButtonStyle}
            >
              {createDoubleChevronIcon('up', shellPalette.accent, 16)}
            </button>
          </div>
        </RibbonBar>
      ) : null}
      <WorkspaceLayout
        leftWidth="56px"
        rightWidth={showReportRightPane ? '380px' : '28px'}
        leftPane={showLeftPane ? (
          <div style={{ minWidth: 0, minHeight: 0, display: 'flex', background: shellPalette.paneBg }}>
            <SideRail
              items={workspaceRailItems}
              activeId={workspaceMode}
              onChange={handleWorkspaceModeChange}
            />
          </div>
        ) : undefined}
        center={(
          workspaceMode === 'data' ? (
            <div style={{ minWidth: 0, minHeight: 0, display: 'flex', background: shellPalette.workspaceBg }}>
              <DataWorkbench
                modelMetadata={modelMetadata}
                datasets={importSummary}
                selectedDatasetId={selectedDataset?.id}
                previewPane={datasetPreviewPane}
                isBusy={isImporting}
                onSelectDataset={handleSelectDataset}
                onRenameDataset={handleRenameDataset}
                onDuplicateDataset={handleDuplicateDataset}
                onDeleteDataset={handleDeleteDataset}
                onRefreshDataset={handleRefreshDataset}
                onToggleDatasetVisibility={handleToggleDatasetVisibility}
                onToggleChartVisibility={handleToggleChartVisibility}
                onChangeChartType={handleChangeChartType}
                onToggleFieldVisibility={handleToggleFieldVisibility}
              />
            </div>
          ) : (
            <div style={{ minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', background: shellPalette.workspaceBg }}>
              <WorkspaceHeader
                title={hasReport ? (currentReport?.name || '报表画布') : '报表画布'}
                subtitle={hasReport
                  ? `页面 ${currentPages.length} · 查询 ${currentQueries.length}${importSummary.length > 0 ? ` · 数据集 ${importSummary.length}` : ''}`
                  : '连接模型，进入数据视图准备素材。'}
                actions={reportCanvasHeaderActions}
              />
              {!apiUrl ? (
                <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: shellPalette.textMuted }}>
                  正在连接后端服务...
                </div>
              ) : !hasReport ? (
                <WorkspaceWelcome
                  onConnect={handleOpenConnectDialog}
                  onImport={() => openDatasetDialog('import-json')}
                  onGenerate={() => {
                    handleRibbonTabChange('ai');
                  }}
                  onOpenAi={() => {
                    openAiWorkspace();
                  }}
                  isConnected={isConnected}
                  hasImportedVisuals={hasImportedVisuals}
                  canGenerate={isConnected && importableVisualCount > 0}
                  canOpenAi={hasReport}
                />
              ) : (
                <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', padding: 20, boxSizing: 'border-box' }}>
                  <ReportCanvasViewport
                    contentKey={currentReport?.id}
                    width={DEFAULT_REPORT_CANVAS_WIDTH}
                    height={DEFAULT_REPORT_CANVAS_HEIGHT}
                    zoomMode={reportCanvasZoomMode}
                    fitZoomPercent={reportCanvasFitZoomPercent}
                    manualZoomPercent={reportCanvasManualZoomPercent}
                    onZoomModeChange={setReportCanvasZoomMode}
                    onFitZoomPercentChange={setReportCanvasFitZoomPercent}
                    onManualZoomPercentChange={setReportCanvasManualZoomPercent}
                  >
                    <ReportRenderer
                      report={currentReport!}
                      pages={currentPages}
                      queries={currentQueries}
                      theme={currentTheme}
                      dataSource={currentDataSource}
                      apiBaseUrl={effectiveApiUrl}
                      activeComponentId={activeImportedComponentId}
                    />
                  </ReportCanvasViewport>
                </div>
              )}
            </div>
          )
        )}
        rightPane={workspaceMode === 'report' ? (showReportRightPane ? renderRightPaneContent() : renderCollapsedRightPane()) : undefined}
      />

      {datasetDialogMode === 'import-json' && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(32, 31, 30, 0.24)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 24,
          }}
        >
          <div
            style={{
              width: 560,
              maxWidth: '92%',
              borderRadius: 18,
              border: `1px solid ${shellPalette.border}`,
              background: 'linear-gradient(180deg, #FFFEFB 0%, #F8FAFE 100%)',
              boxShadow: '0 24px 64px rgba(15, 23, 42, 0.18)',
              overflow: 'hidden',
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '18px 20px 14px',
                borderBottom: `1px solid ${shellPalette.border}`,
                background: 'linear-gradient(180deg, #FFFFFF 0%, #F7FAFE 100%)',
              }}
            >
              {createGradientIcon('import', '#60A5FA', '#2563EB', 26)}
              <div>
                <div style={{ color: shellPalette.text, fontSize: 18, fontWeight: 700 }}>
                  导入 JSON
                </div>
                <div style={{ marginTop: 4, color: shellPalette.textMuted, fontSize: 12 }}>
                  选择 Power BI Performance Analyzer 导出的 JSON 文件。
                </div>
              </div>
            </div>

            <div style={{ padding: 18, display: 'grid', gap: 14 }}>
              <div>
                <div style={{ color: shellPalette.textMuted, fontSize: 12, marginBottom: 6 }}>
                  文件路径
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 8 }}>
                  <input
                    type="text"
                    value={jsonImportFilePath}
                    onChange={(event) => setJsonImportFilePath(event.target.value)}
                    placeholder="选择要导入的 JSON 文件"
                    style={{
                      width: '100%',
                      padding: '11px 12px',
                      borderRadius: 10,
                      border: `1px solid ${shellPalette.border}`,
                      background: '#FFFFFF',
                      color: shellPalette.text,
                      fontSize: 13,
                      boxSizing: 'border-box',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => { void handleChooseJsonImportFile(); }}
                    style={{
                      padding: '11px 14px',
                      borderRadius: 10,
                      border: `1px solid ${shellPalette.accentBorder}`,
                      background: '#FFFFFF',
                      color: shellPalette.accent,
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    选择文件
                  </button>
                </div>
              </div>

              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '12px 14px',
                  borderRadius: 10,
                  border: `1px solid ${shellPalette.border}`,
                  background: shellPalette.ribbonMutedBg,
                  color: shellPalette.text,
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={jsonImportClearOthers}
                  onChange={(event) => setJsonImportClearOthers(event.target.checked)}
                />
                清空其它图表
              </label>

              {importError ? (
                <div style={{ color: shellPalette.error, fontSize: 12 }}>
                  {importError}
                </div>
              ) : null}
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 10,
                padding: '0 18px 18px',
              }}
            >
              <button
                type="button"
                onClick={closeDatasetDialog}
                style={{
                  padding: '10px 16px',
                  borderRadius: 10,
                  border: `1px solid ${shellPalette.border}`,
                  background: '#FFFFFF',
                  color: shellPalette.textMuted,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => { void handleImportJsonFromDialog(); }}
                disabled={!isConnected || isImporting || !jsonImportFilePath.trim()}
                style={{
                  padding: '10px 18px',
                  borderRadius: 10,
                  border: 'none',
                  background: 'linear-gradient(135deg, #2563EB 0%, #60A5FA 100%)',
                  color: '#FFFFFF',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: !isConnected || isImporting || !jsonImportFilePath.trim() ? 'not-allowed' : 'pointer',
                  opacity: !isConnected || isImporting || !jsonImportFilePath.trim() ? 0.68 : 1,
                }}
              >
                {isImporting ? '导入中...' : '开始导入'}
              </button>
            </div>
          </div>
        </div>
      )}

      {datasetDialogMode === 'custom-dax' && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(32, 31, 30, 0.24)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 24,
          }}
        >
          <div
            style={{
              width: 760,
              maxWidth: '94%',
              borderRadius: 18,
              border: `1px solid ${shellPalette.border}`,
              background: 'linear-gradient(180deg, #FFFEFB 0%, #F8FAFE 100%)',
              boxShadow: '0 24px 64px rgba(15, 23, 42, 0.18)',
              overflow: 'hidden',
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '18px 20px 14px',
                borderBottom: `1px solid ${shellPalette.border}`,
                background: 'linear-gradient(180deg, #FFFFFF 0%, #F7FAFE 100%)',
              }}
            >
              {createGradientIcon('custom-dax', '#34D399', '#0F8C72', 26)}
              <div>
                <div style={{ color: shellPalette.text, fontSize: 18, fontWeight: 700 }}>
                  自定义数据集
                </div>
                <div style={{ marginTop: 4, color: shellPalette.textMuted, fontSize: 12 }}>
                  手动编写 DAX 查询并生成数据集素材。
                </div>
              </div>
            </div>

            <div style={{ padding: 18, display: 'grid', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 200px', gap: 12 }}>
                <input
                  type="text"
                  value={customDatasetDraft.name}
                  onChange={(event) => setCustomDatasetDraft((previous) => ({ ...previous, name: event.target.value }))}
                  placeholder="数据集名称"
                  style={{
                    width: '100%',
                    padding: '11px 12px',
                    borderRadius: 10,
                    border: `1px solid ${shellPalette.border}`,
                    background: '#FFFFFF',
                    color: shellPalette.text,
                    fontSize: 13,
                    boxSizing: 'border-box',
                  }}
                />
                <select
                  value={customDatasetDraft.chartType}
                  onChange={(event) => setCustomDatasetDraft((previous) => ({ ...previous, chartType: event.target.value as DatasetVisualType }))}
                  style={{
                    width: '100%',
                    padding: '11px 12px',
                    borderRadius: 10,
                    border: `1px solid ${shellPalette.border}`,
                    background: '#FFFFFF',
                    color: shellPalette.text,
                    fontSize: 13,
                    boxSizing: 'border-box',
                  }}
                >
                  {[
                    { value: 'bar', label: '柱状图' },
                    { value: 'line', label: '折线图' },
                    { value: 'pie', label: '饼图' },
                    { value: 'area', label: '面积图' },
                    { value: 'scatter', label: '散点图' },
                    { value: 'kpi-card', label: 'KPI 卡片' },
                    { value: 'data-table', label: '数据表' },
                  ].map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>

              <textarea
                rows={15}
                value={customDatasetDraft.dax}
                onChange={(event) => setCustomDatasetDraft((previous) => ({ ...previous, dax: event.target.value }))}
                style={{
                  width: '100%',
                  resize: 'vertical',
                  minHeight: 300,
                  padding: 14,
                  borderRadius: 12,
                  border: `1px solid ${shellPalette.border}`,
                  background: '#FAFCFF',
                  color: shellPalette.text,
                  fontSize: 12,
                  lineHeight: 1.65,
                  boxSizing: 'border-box',
                  fontFamily: 'Consolas, "Courier New", monospace',
                }}
              />

              {importError ? (
                <div style={{ color: shellPalette.error, fontSize: 12 }}>
                  {importError}
                </div>
              ) : null}
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 10,
                padding: '0 18px 18px',
              }}
            >
              <button
                type="button"
                onClick={closeDatasetDialog}
                style={{
                  padding: '10px 16px',
                  borderRadius: 10,
                  border: `1px solid ${shellPalette.border}`,
                  background: '#FFFFFF',
                  color: shellPalette.textMuted,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => { void handleCreateCustomDatasetFromDialog(); }}
                disabled={!isConnected || isImporting || !customDatasetDraft.dax.trim()}
                style={{
                  padding: '10px 18px',
                  borderRadius: 10,
                  border: 'none',
                  background: 'linear-gradient(135deg, #0F8C72 0%, #22C983 100%)',
                  color: '#FFFFFF',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: !isConnected || isImporting || !customDatasetDraft.dax.trim() ? 'not-allowed' : 'pointer',
                  opacity: !isConnected || isImporting || !customDatasetDraft.dax.trim() ? 0.68 : 1,
                }}
              >
                {isImporting ? '执行中...' : '保存并执行'}
              </button>
            </div>
          </div>
        </div>
      )}

      {datasetDialogMode === 'query-builder' && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(32, 31, 30, 0.24)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 24,
          }}
        >
          <div
            style={{
              width: 920,
              maxWidth: '96%',
              maxHeight: '88vh',
              borderRadius: 18,
              border: `1px solid ${shellPalette.border}`,
              background: 'linear-gradient(180deg, #FFFEFB 0%, #F8FAFE 100%)',
              boxShadow: '0 24px 64px rgba(15, 23, 42, 0.18)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '18px 20px 14px',
                borderBottom: `1px solid ${shellPalette.border}`,
                background: 'linear-gradient(180deg, #FFFFFF 0%, #F7FAFE 100%)',
              }}
            >
              {createGradientIcon('query-builder', '#FBBF24', '#F97316', 26)}
              <div>
                <div style={{ color: shellPalette.text, fontSize: 18, fontWeight: 700 }}>
                  查询生成器
                </div>
                <div style={{ marginTop: 4, color: shellPalette.textMuted, fontSize: 12 }}>
                  参考 DAX Studio Query Builder，通过选择维度、度量和筛选生成查询。
                </div>
              </div>
            </div>

            <div style={{ padding: 18, display: 'grid', gap: 14, overflow: 'auto' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 220px', gap: 12 }}>
                <input
                  type="text"
                  value={queryBuilderDraft.name}
                  onChange={(event) => setQueryBuilderDraft((previous) => ({ ...previous, name: event.target.value }))}
                  placeholder="数据集名称"
                  style={{
                    width: '100%',
                    padding: '11px 12px',
                    borderRadius: 10,
                    border: `1px solid ${shellPalette.border}`,
                    background: '#FFFFFF',
                    color: shellPalette.text,
                    fontSize: 13,
                    boxSizing: 'border-box',
                  }}
                />
                <select
                  value={queryBuilderDraft.chartType}
                  onChange={(event) => setQueryBuilderDraft((previous) => ({ ...previous, chartType: event.target.value as DatasetVisualType }))}
                  style={{
                    width: '100%',
                    padding: '11px 12px',
                    borderRadius: 10,
                    border: `1px solid ${shellPalette.border}`,
                    background: '#FFFFFF',
                    color: shellPalette.text,
                    fontSize: 13,
                    boxSizing: 'border-box',
                  }}
                >
                  {[
                    { value: 'bar', label: '柱状图' },
                    { value: 'line', label: '折线图' },
                    { value: 'pie', label: '饼图' },
                    { value: 'area', label: '面积图' },
                    { value: 'scatter', label: '散点图' },
                    { value: 'kpi-card', label: 'KPI 卡片' },
                    { value: 'data-table', label: '数据表' },
                  ].map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '320px minmax(0, 1fr)', gap: 12, minHeight: 560 }}>
                <div
                  style={{
                    borderRadius: 12,
                    border: `1px solid ${shellPalette.border}`,
                    background: '#FFFFFF',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                  }}
                >
                  <div style={{ padding: 12, borderBottom: `1px solid ${shellPalette.border}`, display: 'grid', gap: 10 }}>
                    <div style={{ color: shellPalette.text, fontSize: 12, fontWeight: 700 }}>
                      字段池
                    </div>
                    <input
                      type="text"
                      value={queryBuilderSearch}
                      onChange={(event) => setQueryBuilderSearch(event.target.value)}
                      placeholder="搜索表、字段或度量值"
                      style={{
                        width: '100%',
                        padding: '9px 10px',
                        borderRadius: 10,
                        border: `1px solid ${shellPalette.border}`,
                        background: '#F8FAFD',
                        color: shellPalette.text,
                        fontSize: 12,
                        boxSizing: 'border-box',
                      }}
                    />
                    <div style={{ color: shellPalette.textMuted, fontSize: 11, lineHeight: 1.5 }}>
                      参考 DAX Studio Query Builder。字段和度量值都从这里拖到右侧查询区域，也可把字段拖到筛选区域。
                    </div>
                  </div>
                  <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 12, display: 'grid', gap: 10 }}>
                    {queryBuilderMetadataGroups.length === 0 ? (
                      <div style={{ color: shellPalette.textMuted, fontSize: 12 }}>
                        当前模型没有可用于查询生成器的字段，请先连接模型。
                      </div>
                    ) : queryBuilderMetadataGroups.map((group) => {
                      const isExpanded = queryBuilderExpandedTables[group.key] ?? true;
                      return (
                        <div
                          key={group.key}
                          style={{
                            borderRadius: 10,
                            border: `1px solid ${shellPalette.border}`,
                            background: '#FCFDFC',
                            overflow: 'hidden',
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => handleToggleQueryBuilderTableExpanded(group.key)}
                            style={{
                              width: '100%',
                              padding: '10px 12px',
                              border: 'none',
                              borderBottom: isExpanded ? `1px solid ${shellPalette.border}` : 'none',
                              background: 'transparent',
                              color: shellPalette.text,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: 8,
                              cursor: 'pointer',
                              textAlign: 'left',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <ShellIcon name="model" size={15} />
                              <span style={{ fontSize: 12, fontWeight: 700 }}>{group.label}</span>
                            </div>
                            <ShellIcon name={isExpanded ? 'chevron-up' : 'chevron-down'} size={14} />
                          </button>
                          {isExpanded ? (
                            <div style={{ display: 'grid', gap: 6, padding: 10 }}>
                              {[...group.columns, ...group.measures].map((item) => {
                                const isSelected = queryBuilderDraft.selections.some((selection) => selection.id === item.id);
                                return (
                                  <div
                                    key={item.id}
                                    draggable
                                    onDragStart={(event) => handleQueryBuilderDragStart(event, item)}
                                    style={{
                                      display: 'grid',
                                      gridTemplateColumns: 'minmax(0, 1fr) auto',
                                      gap: 8,
                                      alignItems: 'center',
                                      padding: '8px 10px',
                                      borderRadius: 10,
                                      border: `1px solid ${isSelected ? shellPalette.accentBorder : shellPalette.border}`,
                                      background: isSelected ? shellPalette.accentSoft : '#FFFFFF',
                                    }}
                                  >
                                    <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                                      <ShellIcon name={item.kind === 'measure' ? 'measure' : 'column'} size={14} />
                                      <div style={{ minWidth: 0 }}>
                                        <div style={{ color: shellPalette.text, fontSize: 12, fontWeight: 600, lineHeight: 1.35 }}>
                                          {item.name}
                                        </div>
                                        <div style={{ marginTop: 3, color: shellPalette.textMuted, fontSize: 10 }}>
                                          {item.kind === 'measure' ? '度量值' : item.dataType || '字段'}
                                        </div>
                                      </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: 6 }}>
                                      <button
                                        type="button"
                                        onClick={() => handleToggleQueryBuilderSelection(item)}
                                        title={isSelected ? '移出查询区域' : '加入 Columns / Measures'}
                                        style={{
                                          width: 28,
                                          height: 28,
                                          borderRadius: 8,
                                          border: `1px solid ${isSelected ? shellPalette.accentBorder : shellPalette.border}`,
                                          background: isSelected ? shellPalette.accentSoft : '#FFFFFF',
                                          color: isSelected ? shellPalette.accent : shellPalette.textMuted,
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          cursor: 'pointer',
                                        }}
                                      >
                                        <ShellIcon name="add" size={14} />
                                      </button>
                                      {item.kind === 'column' ? (
                                        <button
                                          type="button"
                                          onClick={() => handleAddQueryBuilderFilter(item)}
                                          title="添加为筛选条件"
                                          style={{
                                            width: 28,
                                            height: 28,
                                            borderRadius: 8,
                                            border: `1px solid ${shellPalette.border}`,
                                            background: '#FFFFFF',
                                            color: shellPalette.textMuted,
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            cursor: 'pointer',
                                          }}
                                        >
                                          <ShellIcon name="filter" size={14} />
                                        </button>
                                      ) : null}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div
                  style={{ minWidth: 0, display: 'grid', gap: 12, gridTemplateRows: 'minmax(220px, 1fr) minmax(180px, auto) minmax(220px, auto)' }}
                >
                  <div
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={handleDropQueryBuilderSelection}
                    style={{
                      borderRadius: 12,
                      border: `1px solid ${shellPalette.border}`,
                      background: '#FFFFFF',
                      display: 'flex',
                      flexDirection: 'column',
                      overflow: 'hidden',
                    }}
                  >
                    <div style={{ padding: 12, borderBottom: `1px solid ${shellPalette.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      <div>
                        <div style={{ color: shellPalette.text, fontSize: 12, fontWeight: 700 }}>
                          Columns / Measures
                        </div>
                        <div style={{ marginTop: 4, color: shellPalette.textMuted, fontSize: 11 }}>
                          把字段或度量值拖到这里，统一构成查询结果列。
                        </div>
                      </div>
                      <InfoPill label="已选" value={String(queryBuilderDraft.selections.length)} tone={queryBuilderDraft.selections.length > 0 ? 'accent' : 'default'} />
                    </div>
                    <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 12, display: 'grid', gap: 8, background: 'linear-gradient(180deg, #FCFDFF 0%, #F7FAFE 100%)' }}>
                      {queryBuilderDraft.selections.length === 0 ? (
                        <div
                          style={{
                            minHeight: 120,
                            borderRadius: 10,
                            border: `1px dashed ${shellPalette.accentBorder}`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: shellPalette.textMuted,
                            fontSize: 12,
                            textAlign: 'center',
                            padding: 16,
                          }}
                        >
                          从左侧拖入字段或度量值
                        </div>
                      ) : queryBuilderDraft.selections.map((selection) => (
                        <div
                          key={selection.id}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: 'minmax(0, 1fr) auto',
                            gap: 8,
                            alignItems: 'center',
                            padding: '10px 12px',
                            borderRadius: 10,
                            border: `1px solid ${shellPalette.border}`,
                            background: '#FFFFFF',
                          }}
                        >
                          <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <ShellIcon name={selection.kind === 'measure' ? 'measure' : 'column'} size={15} />
                            <div style={{ minWidth: 0 }}>
                              <div style={{ color: shellPalette.text, fontSize: 12, fontWeight: 700 }}>
                                {selection.name}
                              </div>
                              <div style={{ marginTop: 3, color: shellPalette.textMuted, fontSize: 10 }}>
                                {selection.tableName} · {selection.kind === 'measure' ? '度量值' : selection.dataType || '字段'}
                              </div>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleToggleQueryBuilderSelection(selection)}
                            style={{
                              width: 28,
                              height: 28,
                              borderRadius: 8,
                              border: `1px solid ${shellPalette.border}`,
                              background: '#FFFFFF',
                              color: shellPalette.textMuted,
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: 'pointer',
                            }}
                          >
                            <ShellIcon name="close" size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={handleDropQueryBuilderFilter}
                    style={{
                      borderRadius: 12,
                      border: `1px solid ${shellPalette.border}`,
                      background: '#FFFFFF',
                      display: 'flex',
                      flexDirection: 'column',
                      overflow: 'hidden',
                    }}
                  >
                    <div style={{ padding: 12, borderBottom: `1px solid ${shellPalette.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      <div>
                        <div style={{ color: shellPalette.text, fontSize: 12, fontWeight: 700 }}>
                          Filters
                        </div>
                        <div style={{ marginTop: 4, color: shellPalette.textMuted, fontSize: 11 }}>
                          支持跨表筛选。将字段拖到这里，或点击字段行上的筛选按钮。
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleAddQueryBuilderFilter()}
                        disabled={allQueryBuilderColumns.length === 0}
                        style={{
                          width: 30,
                          height: 30,
                          borderRadius: 9,
                          border: `1px solid ${shellPalette.border}`,
                          background: '#FFFFFF',
                          color: shellPalette.text,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: allQueryBuilderColumns.length === 0 ? 'not-allowed' : 'pointer',
                          opacity: allQueryBuilderColumns.length === 0 ? 0.68 : 1,
                        }}
                      >
                        <ShellIcon name="add" size={14} />
                      </button>
                    </div>
                    <div style={{ padding: 12, display: 'grid', gap: 8, background: 'linear-gradient(180deg, #FCFDFC 0%, #F8FCFA 100%)' }}>
                      {queryBuilderDraft.filters.length === 0 ? (
                        <div style={{ color: shellPalette.textMuted, fontSize: 12 }}>
                          当前没有筛选条件。
                        </div>
                      ) : queryBuilderDraft.filters.map((filter) => (
                        <div key={filter.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 100px minmax(0, 1fr) auto', gap: 8, alignItems: 'center', padding: 10, borderRadius: 10, border: `1px solid ${shellPalette.border}`, background: '#FFFFFF' }}>
                          <select
                            value={filter.fieldId}
                            onChange={(event) => {
                              const nextField = allQueryBuilderColumns.find((column) => column.id === event.target.value);
                              if (!nextField) {
                                return;
                              }
                              handleChangeQueryBuilderFilter(filter.id, {
                                fieldId: nextField.id,
                                tableName: nextField.tableName,
                                fieldName: nextField.name,
                                dataType: nextField.dataType || 'String',
                              });
                            }}
                            style={{
                              width: '100%',
                              padding: '9px 10px',
                              borderRadius: 10,
                              border: `1px solid ${shellPalette.border}`,
                              background: '#FFFFFF',
                              color: shellPalette.text,
                              fontSize: 12,
                              boxSizing: 'border-box',
                            }}
                          >
                            {queryBuilderMetadataGroups.map((group) => (
                              <optgroup key={group.key} label={group.label}>
                                {group.columns.map((column) => (
                                  <option key={column.id} value={column.id}>{column.name}</option>
                                ))}
                              </optgroup>
                            ))}
                          </select>
                          <select
                            value={filter.operator}
                            onChange={(event) => handleChangeQueryBuilderFilter(filter.id, { operator: event.target.value as QueryBuilderDraft['filters'][number]['operator'] })}
                            style={{
                              width: '100%',
                              padding: '9px 10px',
                              borderRadius: 10,
                              border: `1px solid ${shellPalette.border}`,
                              background: '#FFFFFF',
                              color: shellPalette.text,
                              fontSize: 12,
                              boxSizing: 'border-box',
                            }}
                          >
                            <option value="equals">等于</option>
                            <option value="contains">包含</option>
                          </select>
                          <input
                            type="text"
                            value={filter.value}
                            onChange={(event) => handleChangeQueryBuilderFilter(filter.id, { value: event.target.value })}
                            placeholder="筛选值"
                            style={{
                              width: '100%',
                              padding: '9px 10px',
                              borderRadius: 10,
                              border: `1px solid ${shellPalette.border}`,
                              background: '#FFFFFF',
                              color: shellPalette.text,
                              fontSize: 12,
                              boxSizing: 'border-box',
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => handleRemoveQueryBuilderFilter(filter.id)}
                            style={{
                              width: 30,
                              height: 30,
                              borderRadius: 9,
                              border: `1px solid ${shellPalette.border}`,
                              background: '#FFFFFF',
                              color: shellPalette.textMuted,
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: 'pointer',
                            }}
                          >
                            <ShellIcon name="close" size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div
                    style={{
                      borderRadius: 12,
                      border: `1px solid ${shellPalette.border}`,
                      background: '#FFFFFF',
                      display: 'flex',
                      flexDirection: 'column',
                      overflow: 'hidden',
                    }}
                  >
                    <div style={{ padding: 12, borderBottom: `1px solid ${shellPalette.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      <div>
                        <div style={{ color: shellPalette.text, fontSize: 12, fontWeight: 700 }}>
                          DAX 预览
                        </div>
                        <div style={{ marginTop: 4, color: shellPalette.textMuted, fontSize: 11 }}>
                          将按 `SUMMARIZECOLUMNS` 生成查询文本。
                        </div>
                      </div>
                      <InfoPill label="筛选" value={String(queryBuilderDraft.filters.length)} tone={queryBuilderDraft.filters.length > 0 ? 'success' : 'default'} />
                    </div>
                    <textarea
                      value={generatedQueryBuilderDax}
                      readOnly
                      rows={12}
                      style={{
                        width: '100%',
                        resize: 'none',
                        minHeight: 220,
                        padding: 14,
                        border: 'none',
                        background: '#FAFCFF',
                        color: shellPalette.text,
                        fontSize: 12,
                        lineHeight: 1.65,
                        boxSizing: 'border-box',
                        fontFamily: 'Consolas, "Courier New", monospace',
                      }}
                    />
                  </div>
                </div>
              </div>

              {importError ? (
                <div style={{ color: shellPalette.error, fontSize: 12 }}>
                  {importError}
                </div>
              ) : null}
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 10,
                padding: '0 18px 18px',
              }}
            >
              <button
                type="button"
                onClick={closeDatasetDialog}
                style={{
                  padding: '10px 16px',
                  borderRadius: 10,
                  border: `1px solid ${shellPalette.border}`,
                  background: '#FFFFFF',
                  color: shellPalette.textMuted,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => { void handleCreateQueryBuilderDatasetFromDialog(); }}
                disabled={!isConnected || isImporting}
                style={{
                  padding: '10px 18px',
                  borderRadius: 10,
                  border: 'none',
                  background: 'linear-gradient(135deg, #F59E0B 0%, #F97316 100%)',
                  color: '#FFFFFF',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: !isConnected || isImporting ? 'not-allowed' : 'pointer',
                  opacity: !isConnected || isImporting ? 0.68 : 1,
                }}
              >
                {isImporting ? '执行中...' : '保存并执行'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showConnectDialog && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(32, 31, 30, 0.24)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1001,
          }}
        >
          <div
            style={{
              width: 520,
              maxWidth: '92%',
              borderRadius: 18,
              border: `1px solid ${shellPalette.border}`,
              background: 'linear-gradient(180deg, #FFFEFB 0%, #F8FAFE 100%)',
              boxShadow: '0 24px 64px rgba(15, 23, 42, 0.18)',
              overflow: 'hidden',
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '18px 20px 14px',
                borderBottom: `1px solid ${shellPalette.border}`,
                background: 'linear-gradient(180deg, #FFFFFF 0%, #F7FAFE 100%)',
              }}
            >
              {createGradientIcon('connect', '#39D98A', '#0F8C72', 26)}
              <div>
                <div style={{ color: shellPalette.text, fontSize: 18, fontWeight: 700 }}>
                  连接模型
                </div>
                <div style={{ marginTop: 4, color: shellPalette.textMuted, fontSize: 12 }}>
                  选择模型来源并填写地址。
                </div>
              </div>
            </div>

            <div style={{ padding: 18 }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                  gap: 8,
                  padding: 4,
                  borderRadius: 12,
                  background: shellPalette.ribbonMutedBg,
                  border: `1px solid ${shellPalette.border}`,
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setConnectionMode('pbi');
                    setConnectionDatabase('');
                    setConnectionError('');
                  }}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: 'none',
                    background: connectionMode === 'pbi' ? '#FFFFFF' : 'transparent',
                    color: connectionMode === 'pbi' ? shellPalette.text : shellPalette.textMuted,
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: connectionMode === 'pbi' ? '0 6px 14px rgba(15, 23, 42, 0.06)' : 'none',
                  }}
                >
                  Power BI Desktop
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setConnectionMode('tabular');
                    setPowerBiScanMessage('');
                    setConnectionError('');
                  }}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: 'none',
                    background: connectionMode === 'tabular' ? '#FFFFFF' : 'transparent',
                    color: connectionMode === 'tabular' ? shellPalette.text : shellPalette.textMuted,
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: connectionMode === 'tabular' ? '0 6px 14px rgba(15, 23, 42, 0.06)' : 'none',
                  }}
                >
                  Tabular Server
                </button>
              </div>

              <div style={{ marginTop: 18, display: 'grid', gap: 14 }}>
                <div>
                  <div style={{ color: shellPalette.textMuted, fontSize: 12, marginBottom: 6 }}>
                    {connectionMode === 'pbi' ? '模型地址' : '服务器地址'}
                  </div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: connectionMode === 'pbi' ? 'minmax(0, 1fr) auto' : 'minmax(0, 1fr)',
                      gap: 8,
                      alignItems: 'center',
                    }}
                  >
                    <input
                      type="text"
                      className="watermark-input"
                      value={connectionString}
                      onChange={(event) => setConnectionString(event.target.value)}
                      placeholder={connectionMode === 'pbi' ? 'localhost:12345' : 'localhost:2383 / powerbi://.../工作区'}
                      style={{
                        width: '100%',
                        padding: '11px 12px',
                        borderRadius: 10,
                        border: `1px solid ${shellPalette.border}`,
                        background: '#FFFFFF',
                        color: shellPalette.text,
                        fontSize: 14,
                        boxSizing: 'border-box',
                      }}
                    />
                    {connectionMode === 'pbi' ? (
                      <button
                        type="button"
                        onClick={() => { void handleScanPowerBi(); }}
                        disabled={isScanningPowerBi}
                        style={{
                          padding: '11px 14px',
                          borderRadius: 10,
                          border: `1px solid ${shellPalette.accentBorder}`,
                          background: isScanningPowerBi ? shellPalette.accentSoft : '#FFFFFF',
                          color: shellPalette.accent,
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: isScanningPowerBi ? 'not-allowed' : 'pointer',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {isScanningPowerBi ? '扫描中...' : '扫描'}
                      </button>
                    ) : null}
                  </div>
                  {connectionMode === 'pbi' && powerBiScanItems.length > 0 ? (
                    <div style={{ marginTop: 8 }}>
                      <select
                        value={selectedPowerBiScanId}
                        onChange={(event) => handleSelectPowerBiScanItem(event.target.value)}
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          borderRadius: 10,
                          border: `1px solid ${shellPalette.border}`,
                          background: '#FFFFFF',
                          color: shellPalette.text,
                          fontSize: 13,
                          boxSizing: 'border-box',
                        }}
                      >
                        {powerBiScanItems.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                  {connectionMode === 'pbi' && powerBiScanMessage ? (
                    <div style={{ marginTop: 8, color: shellPalette.textMuted, fontSize: 12 }}>
                      {powerBiScanMessage}
                    </div>
                  ) : null}
                </div>

                {connectionMode === 'tabular' ? (
                  <div>
                    <div style={{ color: shellPalette.textMuted, fontSize: 12, marginBottom: 6 }}>
                      数据库名（可选）
                    </div>
                  <input
                    type="text"
                    className="watermark-input"
                    value={connectionDatabase}
                    onChange={(event) => setConnectionDatabase(event.target.value)}
                      placeholder="留空时按默认数据库连接"
                      style={{
                        width: '100%',
                        padding: '11px 12px',
                        borderRadius: 10,
                        border: `1px solid ${shellPalette.border}`,
                        background: '#FFFFFF',
                        color: shellPalette.text,
                        fontSize: 14,
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                ) : null}

                <div
                  style={{
                    padding: '12px 14px',
                    borderRadius: 10,
                    background: shellPalette.ribbonMutedBg,
                    border: `1px solid ${shellPalette.border}`,
                    color: shellPalette.textMuted,
                    fontSize: 12,
                    lineHeight: 1.65,
                  }}
                >
                  {connectionMode === 'pbi'
                    ? '提示：可以直接输入 localhost:端口，或点击“扫描”从已打开的 Power BI Desktop 窗口中选择模型。'
                    : '提示：Tabular Server 模式可输入 localhost:2383、服务器地址或 powerbi:// 工作区地址；如有数据库名，可一并填写。'}
                </div>

                {connectionError ? (
                  <div style={{ color: shellPalette.error, fontSize: 12 }}>
                    {connectionError}
                  </div>
                ) : null}
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 10,
                padding: '0 18px 18px',
              }}
            >
              <button
                type="button"
                onClick={() => setShowConnectDialog(false)}
                style={{
                  padding: '10px 16px',
                  borderRadius: 10,
                  border: `1px solid ${shellPalette.border}`,
                  background: '#FFFFFF',
                  color: shellPalette.textMuted,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleConnect}
                disabled={isConnecting || !apiUrl || !connectionString.trim()}
                style={{
                  padding: '10px 18px',
                  borderRadius: 10,
                  border: 'none',
                  background: 'linear-gradient(135deg, #0F8C72 0%, #22C983 100%)',
                  color: '#FFFFFF',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: isConnecting || !apiUrl || !connectionString.trim() ? 'not-allowed' : 'pointer',
                  opacity: isConnecting || !apiUrl || !connectionString.trim() ? 0.68 : 1,
                }}
              >
                {isConnecting ? '连接中...' : '连接'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(32, 31, 30, 0.22)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }} onClick={() => setShowSettings(false)}>
          <div style={{
            background: '#FFFFFF',
            border: '1px solid rgba(32, 31, 30, 0.12)',
            borderRadius: 18,
            padding: 24,
            width: 560,
            maxWidth: '90%',
            boxShadow: '0 24px 64px rgba(0, 0, 0, 0.18)',
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'grid', gap: 18 }}>
              <div style={{ display: 'grid', gap: 10 }}>
                <div style={{ color: '#201F1E', fontSize: 20, fontWeight: 800 }}>设置</div>
                <div style={{ color: '#605E5C', fontSize: 12, lineHeight: 1.7 }}>
                  按标签切换查看不同设置项。AI 设置用于模型连接，执行与自检用于控制链路行为。
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  gap: 10,
                  padding: 6,
                  borderRadius: 14,
                  background: 'linear-gradient(180deg, #F8FAFC 0%, #F1F5F9 100%)',
                  border: '1px solid rgba(32, 31, 30, 0.08)',
                }}
              >
                {[
                  { id: 'ai' as const, label: 'AI 设置' },
                  { id: 'runtime' as const, label: '执行与自检' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveSettingsTab(tab.id)}
                    style={{
                      flex: 1,
                      padding: '10px 12px',
                      borderRadius: 10,
                      border: 'none',
                      background: activeSettingsTab === tab.id
                        ? 'linear-gradient(135deg, #0F6CBD 0%, #2563EB 100%)'
                        : 'transparent',
                      color: activeSettingsTab === tab.id ? '#FFFFFF' : '#475569',
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: 'pointer',
                      boxShadow: activeSettingsTab === tab.id ? '0 10px 24px rgba(37, 99, 235, 0.22)' : 'none',
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {activeSettingsTab === 'ai' ? (
                <div
                  style={{
                    padding: '16px 18px',
                    background: '#F8FAFC',
                    border: '1px solid rgba(32, 31, 30, 0.08)',
                    borderRadius: 14,
                    display: 'grid',
                    gap: 14,
                  }}
                >
                  <div style={{ display: 'grid', gap: 8 }}>
                    <div style={{ color: '#201F1E', fontSize: 14, fontWeight: 800 }}>模型连接</div>
                    <div style={{ color: '#64748B', fontSize: 12, lineHeight: 1.7 }}>
                      这里配置 AI provider、base URL、API key 和模型名称。修改后会自动保存到本地。
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
                    <label style={{ display: 'grid', gap: 6, fontSize: 12, color: '#605E5C' }}>
                      Provider
                      <select
                        value={aiSettings.provider}
                        onChange={(event) => setAiSettings((previous) => ({
                          ...previous,
                          provider: event.target.value as AiAgentSettings['provider'],
                        }))}
                        style={settingsInputStyle}
                      >
                        <option value="anthropic">Anthropic Compatible</option>
                        <option value="openai">OpenAI Compatible</option>
                      </select>
                    </label>
                    <label style={{ display: 'grid', gap: 6, fontSize: 12, color: '#605E5C' }}>
                      Model
                      <input
                        type="text"
                        value={aiSettings.model}
                        onChange={(event) => setAiSettings((previous) => ({ ...previous, model: event.target.value }))}
                        placeholder="claude-3-7-sonnet / ark-code-latest"
                        style={settingsInputStyle}
                      />
                    </label>
                  </div>
                  <label style={{ display: 'grid', gap: 6, fontSize: 12, color: '#605E5C' }}>
                    Base URL
                    <input
                      type="text"
                      value={aiSettings.baseUrl}
                      onChange={(event) => setAiSettings((previous) => ({ ...previous, baseUrl: event.target.value }))}
                      placeholder="https://example.com/v1"
                      style={settingsInputStyle}
                    />
                  </label>
                  <label style={{ display: 'grid', gap: 6, fontSize: 12, color: '#605E5C' }}>
                    API Key
                    <input
                      type="password"
                      value={aiSettings.apiKey}
                      onChange={(event) => setAiSettings((previous) => ({ ...previous, apiKey: event.target.value }))}
                      placeholder="sk-..."
                      style={settingsInputStyle}
                    />
                  </label>

                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 12,
                      padding: '12px 14px',
                      borderRadius: 12,
                      background: '#FFFFFF',
                      border: '1px solid rgba(32, 31, 30, 0.08)',
                    }}
                  >
                    <div style={{ display: 'grid', gap: 4 }}>
                      <div style={{ color: '#201F1E', fontSize: 13, fontWeight: 700 }}>测试连接</div>
                      <div style={{ color: '#64748B', fontSize: 12, lineHeight: 1.6 }}>
                        直接调用 sidecar 探测模型是否可用，立即返回协议与错误信息。
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => { void handleTestAiConnection(); }}
                      disabled={isTestingAiConnection}
                      style={{
                        minWidth: 112,
                        padding: '10px 16px',
                        borderRadius: 10,
                        border: 'none',
                        background: isTestingAiConnection
                          ? '#CBD5E1'
                          : 'linear-gradient(135deg, #0F8C72 0%, #22C983 100%)',
                        color: '#FFFFFF',
                        fontSize: 12,
                        fontWeight: 800,
                        cursor: isTestingAiConnection ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {isTestingAiConnection ? '测试中...' : '测试连接'}
                    </button>
                  </div>

                  {aiConnectionProbeError ? (
                    <div
                      style={{
                        padding: '10px 12px',
                        borderRadius: 10,
                        background: '#FEF2F2',
                        border: '1px solid #FECACA',
                        color: '#B91C1C',
                        fontSize: 12,
                        lineHeight: 1.65,
                      }}
                    >
                      {aiConnectionProbeError}
                    </div>
                  ) : null}

                  {aiConnectionProbe ? (
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                        gap: 10,
                      }}
                    >
                      <InfoPill label="状态" value="连接成功" tone="success" />
                      <InfoPill label="协议" value={aiConnectionProbe.protocol} tone="accent" />
                      <InfoPill label="返回" value={aiConnectionProbe.preview || 'OK'} />
                    </div>
                  ) : null}
                </div>
              ) : (
                <div
                  style={{
                    padding: '16px 18px',
                    background: '#F8FAFC',
                    border: '1px solid rgba(32, 31, 30, 0.08)',
                    borderRadius: 14,
                    display: 'grid',
                    gap: 14,
                  }}
                >
                  <div style={{ display: 'grid', gap: 8 }}>
                    <div style={{ color: '#201F1E', fontSize: 14, fontWeight: 800 }}>执行与自检</div>
                    <div style={{ color: '#64748B', fontSize: 12, lineHeight: 1.7 }}>
                      控制 AI 生成链路的修复轮数、轨迹明细，以及自动校验的严格程度。
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
                    <label style={{ display: 'grid', gap: 6, fontSize: 12, color: '#605E5C' }}>
                      修复轮数
                      <input
                        type="number"
                        min={0}
                        max={5}
                        value={aiSettings.maxRepairRounds}
                        onChange={(event) => setAiSettings((previous) => ({
                          ...previous,
                          maxRepairRounds: Math.max(0, Math.min(5, Number(event.target.value) || 0)),
                        }))}
                        style={settingsInputStyle}
                      />
                    </label>
                    <label style={{ display: 'grid', gap: 6, fontSize: 12, color: '#605E5C' }}>
                      Trace 级别
                      <select
                        value={aiSettings.traceVerbosity}
                        onChange={(event) => setAiSettings((previous) => ({
                          ...previous,
                          traceVerbosity: event.target.value as AiAgentSettings['traceVerbosity'],
                        }))}
                        style={settingsInputStyle}
                      >
                        <option value="summary">Summary</option>
                        <option value="detailed">Detailed</option>
                      </select>
                    </label>
                  </div>
                  <div
                    style={{
                      padding: '12px 14px',
                      borderRadius: 12,
                      background: '#FFFFFF',
                      border: '1px solid rgba(32, 31, 30, 0.08)',
                      color: '#605E5C',
                      fontSize: 12,
                      lineHeight: 1.75,
                    }}
                  >
                    当前链路会优先走 creative-html 生成，并执行结构校验、字段绑定校验和修复循环。修复轮数越高，自动回补越积极，但整体耗时也会更长。
                  </div>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
              <button
                onClick={() => setShowSettings(false)}
                style={{
                  minWidth: 108,
                  padding: '10px 16px',
                  background: '#0F6CBD',
                  border: 'none',
                  borderRadius: 8,
                  color: '#fff',
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      <ImportInspectorModal
        state={importInspectorState}
        onClose={() => setImportInspectorState(null)}
        executeQuery={executeImportedQuery}
      />
    </div>
  );
}
