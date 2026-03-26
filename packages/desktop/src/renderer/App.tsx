import React, { useEffect, useState } from 'react';
import { ReportRenderer, primeQueryCache } from '@vibe-bi/renderer';
import type { ChartType, ReportDefinition, PageDefinition, QueryDefinition, ThemeDefinition, DataSourceConfig, QueryResult } from '@vibe-bi/core';
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

function summarizeUserIntentPreview(text: string, maxLength = 72): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1)}…`;
}

function buildAiExecutionPlanLines(mode: PersistedAiComposerMode, intent: string): string[] {
  const intentPreview = summarizeUserIntentPreview(intent);
  const planLines = mode === 'refine'
    ? [
      '先分析当前报表结构、主题和组件约束。',
      '再锁定本轮需要调整的主题、图表类型、布局或标题文案。',
      '生成新的报表 JSON 后继续校验，必要时自动修复查询与结构问题。',
    ]
    : [
      '先分析模型或当前素材，提炼本页的业务叙事和重点指标。',
      '再规划主视觉区、KPI 区、趋势区和结构区，避免平均平铺。',
      '生成完整报表 JSON 后继续校验，必要时自动修复查询与结构问题。',
    ];

  return [
    `已接收需求：${intentPreview || '开始新的 AI 会话。'}`,
    ...planLines,
  ];
}

function mapAiProgressToTraceLine(step?: string, message?: string): string | null {
  switch (step) {
    case 'reading_metadata':
      return `分析数据模型：${message || '正在读取表、字段和度量。'}`;
    case 'validating':
      return `分析当前报表：${message || '正在整理页面、组件和查询上下文。'}`;
    case 'building_prompt':
      return `制定执行方案：${message || '正在生成本轮可落地的设计与修改约束。'}`;
    case 'generating':
      return `生成报表定义：${message || '正在组织主题、布局和图表配置。'}`;
    case 'refining':
      return `修改报表定义：${message || '正在按要求调整主题、图表和版式。'}`;
    case 'parsing':
      return `校验返回结果：${message || '正在解析 JSON 并补齐必需结构。'}`;
    case 'repairing_queries':
      return `自动修复问题：${message || '检测到查询或字段映射问题，继续修复。'}`;
    case 'complete':
      return `执行完成：${message || '本轮结果已应用到当前画布。'}`;
    case 'error':
      return `执行异常：${message || 'AI 返回了错误。'}`;
    default:
      if (!message?.trim()) {
        return null;
      }

      return message.trim();
  }
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

function normalizeReportForRuntime(report: ReportDefinition, fallbackTheme?: ThemeDefinition | null): ReportDefinition {
  return {
    ...report,
    theme: mergeThemeWithFallback(report.theme || fallbackTheme || sampleTheme),
  };
}

function buildReportComparisonSnapshot(report: ReportDefinition) {
  return {
    id: report.id,
    name: report.name,
    description: report.description || '',
    generationMode: report.generationMode || '',
    pages: report.pages,
    defaultPage: report.defaultPage || '',
    theme: mergeThemeWithFallback(report.theme),
  };
}

function countChangedQueries(previousQueries: QueryDefinition[], nextQueries: QueryDefinition[]): number {
  const previousMap = new Map(previousQueries.map((query) => [query.id, JSON.stringify(query)]));
  const nextMap = new Map(nextQueries.map((query) => [query.id, JSON.stringify(query)]));
  const ids = new Set([...previousMap.keys(), ...nextMap.keys()]);
  let changed = 0;

  ids.forEach((id) => {
    if (previousMap.get(id) !== nextMap.get(id)) {
      changed += 1;
    }
  });

  return changed;
}

function countChangedComponents(previousPages: PageDefinition[], nextPages: PageDefinition[]): number {
  const previousMap = new Map(
    previousPages.flatMap((page) => page.components.map((component) => [`${page.id}/${component.id}`, JSON.stringify(component)] as const))
  );
  const nextMap = new Map(
    nextPages.flatMap((page) => page.components.map((component) => [`${page.id}/${component.id}`, JSON.stringify(component)] as const))
  );
  const ids = new Set([...previousMap.keys(), ...nextMap.keys()]);
  let changed = 0;

  ids.forEach((id) => {
    if (previousMap.get(id) !== nextMap.get(id)) {
      changed += 1;
    }
  });

  return changed;
}

function isDarkTheme(theme: ThemeDefinition): boolean {
  const background = theme.colors.background || '';
  const normalized = background.replace('#', '');
  if (normalized.length !== 6) {
    return false;
  }

  const red = parseInt(normalized.slice(0, 2), 16);
  const green = parseInt(normalized.slice(2, 4), 16);
  const blue = parseInt(normalized.slice(4, 6), 16);
  const luminance = (0.299 * red) + (0.587 * green) + (0.114 * blue);
  return luminance < 150;
}

function summarizeAppliedChanges(
  previousReport: ReportDefinition,
  previousPages: PageDefinition[],
  previousQueries: QueryDefinition[],
  nextReport: ReportDefinition,
  nextPages: PageDefinition[],
  nextQueries: QueryDefinition[],
  userIntent: string,
  aiMessage?: string
): string {
  const previousTheme = mergeThemeWithFallback(previousReport.theme);
  const nextTheme = mergeThemeWithFallback(nextReport.theme);
  const nextThemeName = nextTheme.name?.trim();
  const themeChanged = JSON.stringify(previousTheme) !== JSON.stringify(nextTheme);
  const reportChanged = JSON.stringify(buildReportComparisonSnapshot(previousReport)) !== JSON.stringify(buildReportComparisonSnapshot(nextReport));
  const changedQueries = countChangedQueries(previousQueries, nextQueries);
  const changedComponents = countChangedComponents(previousPages, nextPages);
  const parts: string[] = [];

  if (themeChanged) {
    if (nextThemeName && nextThemeName.toLowerCase().includes('dracula')) {
      parts.push('已切换为 Dracula 主题');
    } else {
      parts.push(isDarkTheme(nextTheme) ? '已切换为深色报表主题' : '已更新报表主题');
    }
  }

  if (changedComponents > 0) {
    parts.push(`已调整 ${changedComponents} 个组件的布局或样式`);
  }

  if (changedQueries > 0) {
    parts.push(`已同步更新 ${changedQueries} 条查询或字段映射`);
  }

  if (!themeChanged && /深色|浅色|配色|颜色|主题/.test(userIntent) && changedComponents > 0) {
    parts.push('当前主要变更落在图表或组件样式，整份报表主题未切换');
  }

  if (!themeChanged && /dracula/i.test(userIntent)) {
    parts.push('当前报表主题名称仍未切换到 Dracula');
  }

  if (!parts.length && reportChanged) {
    parts.push('已应用报表级修改');
  }

  if (!parts.length && aiMessage?.trim()) {
    return aiMessage.trim();
  }

  return `${parts.join('，')}。`;
}

async function* readSseDataLines(reader: ReadableStreamDefaultReader<Uint8Array>): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });

    let newlineIndex = buffer.indexOf('\n');
    while (newlineIndex >= 0) {
      const rawLine = buffer.slice(0, newlineIndex).replace(/\r$/, '');
      buffer = buffer.slice(newlineIndex + 1);

      if (rawLine.startsWith('data: ')) {
        yield rawLine.slice(6);
      }

      newlineIndex = buffer.indexOf('\n');
    }

    if (done) {
      const trailingLine = buffer.trim();
      if (trailingLine.startsWith('data: ')) {
        yield trailingLine.slice(6);
      }
      return;
    }
  }
}

type PersistedAiComposerMode = 'generate-model' | 'generate-asset' | 'refine';

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
type AiProgressPayload = {
  step?: string;
  message?: string;
  report?: ReportDefinition;
  pages?: PageDefinition[];
  queries?: QueryDefinition[];
};
type RawAiProgressPayload = AiProgressPayload & {
  Step?: string;
  Message?: string;
  Report?: ReportDefinition;
  Pages?: PageDefinition[];
  Queries?: QueryDefinition[];
};
type ComposePromptResponse = {
  prompt?: string;
  Prompt?: string;
};

const defaultGenerationPrompt = '请自动设计一份美观、专业、具有清晰信息层级的 Power BI 风格报表。';

function normalizeAiProgressPayload(raw: unknown): AiProgressPayload | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const payload = raw as RawAiProgressPayload;
  const pages = Array.isArray(payload.pages)
    ? payload.pages
    : Array.isArray(payload.Pages)
      ? payload.Pages
      : undefined;
  const queries = Array.isArray(payload.queries)
    ? payload.queries
    : Array.isArray(payload.Queries)
      ? payload.Queries
      : undefined;

  return {
    step: typeof payload.step === 'string' ? payload.step : typeof payload.Step === 'string' ? payload.Step : undefined,
    message: typeof payload.message === 'string' ? payload.message : typeof payload.Message === 'string' ? payload.Message : undefined,
    report: payload.report ?? payload.Report,
    pages,
    queries,
  };
}

function parseAiProgressPayload(json: string): AiProgressPayload | null {
  try {
    return normalizeAiProgressPayload(JSON.parse(json));
  } catch {
    return null;
  }
}

function parseComposePromptResponse(json: string): string {
  const payload = JSON.parse(json) as ComposePromptResponse;
  const prompt = typeof payload.prompt === 'string'
    ? payload.prompt
    : typeof payload.Prompt === 'string'
      ? payload.Prompt
      : '';

  return prompt.trim();
}

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

function formatFieldLabel(field: string): string {
  return field
    .replace(/'/g, '')
    .replace(/\[|\]/g, '')
    .replace(/__/g, ' ')
    .trim();
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

function buildComponentConfig(
  componentType: PageDefinition['components'][number]['type'],
  chartType: ChartType,
  title: string,
  queryResult?: QueryResult
) {
  const rows = (queryResult?.rows || []) as QueryRow[];
  const fieldNames = getQueryFieldNames(queryResult);
  const numericFields = getNumericFieldNames(rows, fieldNames);

  if (componentType === 'kpi-card') {
    const valueField = numericFields[0] || fieldNames[0] || '';
    return {
      title,
      valueField,
      format: { type: 'number' as const, decimals: 0 },
    };
  }

  if (componentType === 'data-table') {
    return {
      title,
      columns: fieldNames.map((field) => ({
        field,
        header: formatFieldLabel(field) || field,
      })),
    };
  }

  const valueFields = numericFields.length > 0
    ? numericFields
    : [fieldNames.find((field) => field !== fieldNames[0]) || fieldNames[0] || ''];
  const categoryField = getCategoryFieldName(rows, fieldNames, valueFields);

  if (chartType === 'pie') {
    const valueField = valueFields[0] || fieldNames[0] || '';
    const nameField = getPieCategoryFieldName(rows, fieldNames, valueFields)
      || categoryField
      || fieldNames.find((field) => field !== valueField)
      || '__rowIndex';

    return {
      title,
      chartType,
      xAxis: {
        field: nameField,
        type: isDateLike(rows[0]?.[nameField]) ? 'time' as const : 'category' as const,
      },
      series: valueField ? [{
        field: valueField,
        name: formatFieldLabel(valueField) || title,
        type: 'pie' as const,
      }] : [],
    };
  }

  return {
    title,
    chartType,
    xAxis: {
      field: categoryField,
      type: isDateLike(rows[0]?.[categoryField]) ? 'time' as const : 'category' as const,
    },
    yAxis: valueFields
      .filter(Boolean)
      .map((field) => ({
        field,
        name: formatFieldLabel(field) || field,
        type: 'value' as const,
      })),
    series: valueFields
      .filter(Boolean)
      .map((field) => ({
        field,
        name: formatFieldLabel(field) || field,
        type: chartType,
        smooth: chartType === 'line',
      })),
  };
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

function resolveRenderableChartType(chartType: DatasetVisualType): ChartType {
  if (chartType === 'pie') {
    return 'pie';
  }
  if (chartType === 'line') {
    return 'line';
  }
  if (chartType === 'area') {
    return 'area';
  }
  if (chartType === 'scatter') {
    return 'scatter';
  }
  return 'bar';
}

function createDatasetFields(result?: QueryResult) {
  if (!result) {
    return [];
  }

  return result.columns
    .filter((column) => column.name !== '__rowIndex')
    .map((column) => ({
      name: column.name,
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
  const [error, setError] = useState<string>('');

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

  type AiComposerMode = PersistedAiComposerMode;
  type AiGenerationMode = Exclude<AiComposerMode, 'refine'>;
  interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
  }

  // AI Generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<string>('');
  const [generatedReport, setGeneratedReport] = useState<ReportDefinition | null>(null);
  const [generatedPages, setGeneratedPages] = useState<PageDefinition[]>([]);
  const [generatedQueries, setGeneratedQueries] = useState<QueryDefinition[]>([]);

  // Settings state
  const [showSettings, setShowSettings] = useState(false);
  const [aiApiKey, setAiApiKey] = useState<string>(localStorage.getItem('vibeBiAiApiKey') || '');
  const [aiProvider, setAiProvider] = useState<string>(localStorage.getItem('vibeBiAiProvider') || 'claude');
  const [aiBaseUrl, setAiBaseUrl] = useState<string>(localStorage.getItem('vibeBiAiBaseUrl') || '');
  const [aiModel, setAiModel] = useState<string>(localStorage.getItem('vibeBiAiModel') || '');
  const [aiTestStatus, setAiTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [aiTestMessage, setAiTestMessage] = useState<string>('');

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

  // AI Dialogue state for incremental modification
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState<string>('');
  const [isRefining, setIsRefining] = useState(false);
  const [aiComposerMode, setAiComposerMode] = useState<AiComposerMode>('generate-model');
  const [isComposingPrompt, setIsComposingPrompt] = useState(false);
  const [aiExecutionTraceLines, setAiExecutionTraceLines] = useState<string[]>([]);
  const [hasHydratedAiConversation, setHasHydratedAiConversation] = useState(false);
  const [reportCanvasZoomMode, setReportCanvasZoomMode] = useState<'fit' | 'manual'>('fit');
  const [reportCanvasFitZoomPercent, setReportCanvasFitZoomPercent] = useState(74);
  const [reportCanvasManualZoomPercent, setReportCanvasManualZoomPercent] = useState(100);
  const [reportCanvasZoomInputValue, setReportCanvasZoomInputValue] = useState('100');
  const aiConversationScrollRef = React.useRef<HTMLDivElement>(null);
  const lastPersistedAiConversationRef = React.useRef('');

  useEffect(() => {
    if (!window.electronAPI?.getApiUrl) {
      setError('桌面 API 不可用，请确认 Electron preload 已正确加载。');
      return;
    }

    window.electronAPI.getApiUrl()
      .then((url) => {
        setApiUrl(url);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
      });
  }, []);

  useEffect(() => {
    setHasHydratedAiConversation(true);
  }, []);

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
    setAiTestStatus('idle');
    setAiTestMessage('');
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

  // Save settings
  const handleSaveSettings = () => {
    localStorage.setItem('vibeBiAiApiKey', aiApiKey);
    localStorage.setItem('vibeBiAiProvider', aiProvider);
    localStorage.setItem('vibeBiAiBaseUrl', aiBaseUrl);
    localStorage.setItem('vibeBiAiModel', aiModel);
    setShowSettings(false);
  };

  // Test AI connection
  const handleTestAiConnection = async () => {
    if (!aiApiKey) {
      setAiTestStatus('error');
      setAiTestMessage('请先输入 API Key');
      return;
    }

    setAiTestStatus('testing');
    setAiTestMessage('正在测试连接...');

    try {
      const response = await fetch(`${apiUrl}/api/ai/test-connection`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': aiApiKey,
          'X-API-BaseUrl': aiBaseUrl,
          'X-API-Provider': aiProvider,
          'X-API-Model': aiModel,
        },
      });

      if (response.ok) {
        const result = await response.json();
        setAiTestStatus(result.ok ? 'success' : 'error');
        setAiTestMessage(result.message || (result.ok ? '连接成功' : '连接失败'));
      } else {
        setAiTestStatus('error');
        setAiTestMessage(`请求失败: ${response.statusText}`);
      }
    } catch (err) {
      setAiTestStatus('error');
      setAiTestMessage(err instanceof Error ? err.message : '测试连接时发生错误');
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
          primeQueryCache(queryId, queryResult.rows);
          console.log(
            `[Import] Query executed: id="${queryId}", rows=${queryResult.rowCount}, evaluateCount=${countEvaluateStatements(queryText)}`
          );
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

  type DatasetAssetDraft = {
    report: ReportDefinition;
    pages: PageDefinition[];
    queries: QueryDefinition[];
    renderedSummaryMap: Map<string, { queryId: string; componentId: string }>;
  };

  const buildDraftReportFromDatasetAssets = (
    datasetAssets: ImportSummaryItem[],
    options?: {
      reportName?: string;
      reportDescription?: string;
      generationMode?: ReportDefinition['generationMode'];
    }
  ): DatasetAssetDraft | null => {
    if (datasetAssets.length === 0) {
      return null;
    }

    const reportId = `report-${Date.now()}`;
    const pageId = `page-${Date.now()}`;
    const newQueries: QueryDefinition[] = [];
    const newComponents: PageDefinition['components'] = [];
    const renderedSummaryMap = new Map<string, { queryId: string; componentId: string }>();
    let cursorX = 0;
    let cursorY = 0;
    let rowHeight = 0;

    const placeComponent = (width: number, height: number) => {
      if (width >= 12) {
        if (cursorX !== 0) {
          cursorY += rowHeight;
          cursorX = 0;
          rowHeight = 0;
        }

        const position = { x: 0, y: cursorY, w: 12, h: height };
        cursorY += height;
        return position;
      }

      if (cursorX + width > 12) {
        cursorY += rowHeight;
        cursorX = 0;
        rowHeight = 0;
      }

      const position = { x: cursorX, y: cursorY, w: width, h: height };
      cursorX += width;
      rowHeight = Math.max(rowHeight, height);

      if (cursorX >= 12) {
        cursorY += rowHeight;
        cursorX = 0;
        rowHeight = 0;
      }

      return position;
    };

    datasetAssets.forEach((item) => {
      const visibleChart = item.charts.find((chart) => chart.isVisible) || item.charts[0];
      if (!visibleChart) {
        return;
      }

      const filteredResult = filterQueryResultByVisibleFields(item.previewResult, item);
      const queryText = item.executionDax || item.fullQuery || '';
      if (!queryText) {
        return;
      }

      const queryId = item.queryId || `query-${item.id}`;
      const componentId = item.componentId || `component-${visibleChart.id}`;
      const componentType = visibleChart.componentType === 'filter' ? 'data-table' : visibleChart.componentType;
      const chartType = resolveRenderableChartType(visibleChart.chartType);
      const isHighPriority = item.score >= 15;
      const isTable = componentType === 'data-table';
      const isKpi = componentType === 'kpi-card';
      const width = isTable ? 12 : isKpi ? 3 : isHighPriority ? 12 : 6;
      const height = isTable ? 6 : isKpi ? 2 : isHighPriority ? 6 : 5;

      newQueries.push({
        id: queryId,
        name: item.name,
        dax: queryText,
        executionDax: queryText,
        evaluateQueries: item.evaluateQueries,
        selectedEvaluateIndex: item.selectedEvaluateIndex,
        parameters: [],
      });

      newComponents.push({
        id: componentId,
        type: componentType,
        position: placeComponent(width, height),
        queryRef: queryId,
        config: buildComponentConfig(componentType, chartType, item.name, filteredResult),
      });
      renderedSummaryMap.set(item.id, { queryId, componentId });

      if (filteredResult) {
        primeQueryCache(queryId, filteredResult.rows);
      }
    });

    if (newComponents.length === 0 || newQueries.length === 0) {
      return null;
    }

    const reportName = options?.reportName?.trim()
      || `${modelMetadata?.databaseName || '数据模型'} 自动报表`;
    const reportDescription = options?.reportDescription?.trim()
      || `基于 ${datasetAssets.length} 个可见数据集素材生成的报表草稿`;

    return {
      report: {
        formatVersion: '1.0.0',
        id: reportId,
        name: reportName,
        description: reportDescription,
        createdAt: new Date().toISOString(),
        modifiedAt: new Date().toISOString(),
        generationMode: options?.generationMode || 'imported',
        pages: [pageId],
        defaultPage: pageId,
        theme: sampleTheme,
      },
      pages: [{
        id: pageId,
        name: '素材草稿页面',
        layout: {
          type: 'grid',
          columns: 12,
          rowHeight: 60,
          gap: 16,
          padding: 24,
        },
        filters: [],
        components: newComponents,
      }],
      queries: newQueries,
      renderedSummaryMap,
    };
  };

  const buildAssetDrivenPrompt = (
    datasetAssets: ImportSummaryItem[],
    draft: DatasetAssetDraft,
    mode: 'model' | 'asset',
    intent: string
  ): string => {
    const lines: string[] = [];
    const normalizedIntent = intent.trim() || defaultGenerationPrompt;

    lines.push('请基于当前上下文中的现有数据集素材和查询，重新设计成真正可交付的 BI 报表。');
    lines.push(`触发来源: ${mode === 'model' ? '从模型生成' : '从素材生成'}`);
    lines.push(`用户目标: ${normalizedIntent}`);
    lines.push('');
    lines.push('必须遵守的约束:');
    lines.push('1. 只能使用 currentContext 中已有的 queries 作为数据来源，不要新增查询，不要修改 query id。');
    lines.push('2. 优先复用 currentContext 中已有的组件 id；可以调整 type、title、config、position。');
    lines.push('3. 需要返回完整的 report 和完整的 pages 数组，不能只返回说明文字。');
    lines.push('4. 不要简单平均平铺，要通过主次层级、留白、分组、对齐和尺寸变化做出专业版式。');
    lines.push('5. 优先使用全部可见素材；如果有次要素材，可以缩小或放到下方，但不要无故丢失。');
    lines.push('6. 页面仍然使用 12 列网格系统。');
    lines.push('');
    lines.push('当前可见素材清单:');
    datasetAssets.forEach((item, idx) => {
      const visibleChart = item.charts.find((chart) => chart.isVisible) || item.charts[0];
      const rendered = draft.renderedSummaryMap.get(item.id);
      const visibleFields = item.fields.filter((field) => field.isVisible).map((field) => field.name);
      lines.push(`${idx + 1}. 数据集: ${item.name}`);
      lines.push(`   queryId: ${rendered?.queryId || item.queryId || `query-${item.id}`}`);
      lines.push(`   componentId: ${rendered?.componentId || item.componentId || `component-${item.id}`}`);
      lines.push(`   推荐图表: ${visibleChart?.chartType || item.type}`);
      lines.push(`   行数: ${item.rowCount}, 评分: ${item.score.toFixed(1)}, 执行时间: ${item.executionTime.toFixed(0)}ms`);
      lines.push(`   可见字段: ${visibleFields.join(', ') || '无'}`);
      lines.push('');
    });
    lines.push('请输出修改后的完整 JSON，用于直接渲染最终报表。');

    return lines.join('\n');
  };

  const applyAiDesignedAssetReport = (
    draft: DatasetAssetDraft,
    report: ReportDefinition,
    pages: PageDefinition[],
    completionMessage: string
  ) => {
    const validQueryIds = new Set(draft.queries.map((query) => query.id));
    const draftComponentQueryMap = new Map(
      draft.pages.flatMap((page) => page.components)
        .filter((component) => component.queryRef)
        .map((component) => [component.id, component.queryRef as string])
    );
    const invalidBindings: string[] = [];

    const normalizedPages = pages.map((page) => ({
      ...page,
      components: page.components.map((component) => {
        if (!component.queryRef) {
          return component;
        }
        if (validQueryIds.has(component.queryRef)) {
          return component;
        }

        const fallbackQueryRef = draftComponentQueryMap.get(component.id);
        if (fallbackQueryRef && validQueryIds.has(fallbackQueryRef)) {
          return {
            ...component,
            queryRef: fallbackQueryRef,
          };
        }

        invalidBindings.push(`${page.id}/${component.id}:${component.queryRef}`);
        return component;
      }),
    }));

    if (invalidBindings.length > 0) {
      throw new Error(`AI 返回了无法绑定现有素材查询的组件: ${invalidBindings.join(', ')}`);
    }

    const allComponents = normalizedPages.flatMap((page) => page.components);
    const componentByQueryId = new Map(
      allComponents
        .filter((component) => component.queryRef)
        .map((component) => [component.queryRef as string, component.id])
    );
    const availableComponentIds = new Set(allComponents.map((component) => component.id));
    const defaultPageId = report.defaultPage && normalizedPages.some((page) => page.id === report.defaultPage)
      ? report.defaultPage
      : normalizedPages[0]?.id;

    setGeneratedReport(normalizeReportForRuntime({
      ...report,
      pages: normalizedPages.map((page) => page.id),
      defaultPage: defaultPageId,
      modifiedAt: new Date().toISOString(),
      generationMode: 'ai-generated',
    }, sampleTheme));
    setGeneratedPages(normalizedPages);
    setGeneratedQueries(draft.queries);
    setImportSummary((previous) => previous.map((item) => {
      const rendered = draft.renderedSummaryMap.get(item.id);
      if (!rendered) {
        return item;
      }

      const nextComponentId = componentByQueryId.get(rendered.queryId) || rendered.componentId;
      return {
        ...item,
        queryId: rendered.queryId,
        componentId: nextComponentId,
        isRendered: componentByQueryId.has(rendered.queryId) || availableComponentIds.has(nextComponentId),
      };
    }));
    setActiveImportedComponentId(allComponents[0]?.id);
    setWorkspaceMode('report');
    setShowRightPane(true);
    setGenerationProgress(completionMessage);
    pushAiExecutionTrace(`执行完成：${completionMessage}`);
  };

  const generateReportWithAiFromDatasetAssets = async (
    datasetAssets: ImportSummaryItem[],
    mode: 'model' | 'asset',
    intent: string
  ): Promise<string> => {
    if (!apiUrl) {
      throw new Error('后端服务尚未就绪，请稍后再试。');
    }

    if (!isConnected) {
      throw new Error('请先连接模型，再使用 AI 生成。');
    }

    const apiKey = localStorage.getItem('vibeBiAiApiKey');
    if (!apiKey) {
      handleOpenSettings();
      throw new Error('请先配置 AI API Key（点击设置按钮）');
    }

    const draft = buildDraftReportFromDatasetAssets(datasetAssets, {
      reportName: `${modelMetadata?.databaseName || '数据模型'} ${mode === 'model' ? 'AI 生成草稿' : '素材草稿'}`,
      reportDescription: `等待 AI 基于 ${datasetAssets.length} 个可见素材完成设计`,
      generationMode: 'imported',
    });

    if (!draft) {
      throw new Error('可见素材缺少可执行查询，无法作为 AI 设计输入。');
    }

    setIsGenerating(true);
    recordAiProgress('refining', `正在调用 AI 基于 ${datasetAssets.length} 个可见素材设计报表...`);

    try {
      const response = await fetch(`${apiUrl}/api/ai/refine`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey,
          'X-API-BaseUrl': localStorage.getItem('vibeBiAiBaseUrl') || '',
          'X-API-Model': localStorage.getItem('vibeBiAiModel') || '',
        },
        body: JSON.stringify({
          connectionString: buildModelConnectionString(),
          userPrompt: buildAssetDrivenPrompt(datasetAssets, draft, mode, intent),
          currentContext: {
            report: draft.report,
            pages: draft.pages,
            queries: draft.queries,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`生成请求失败: ${response.statusText}`);
      }

      const reader = response.body?.getReader();

      if (!reader) {
        throw new Error('无法读取响应流');
      }

      let applied = false;
      let completionMessage = `AI 已基于 ${datasetAssets.length} 个素材完成报表设计。`;

      for await (const json of readSseDataLines(reader)) {
        const progress = parseAiProgressPayload(json);
        if (!progress) {
          continue;
        }

        recordAiProgress(progress.step, progress.message);

        if (progress.step === 'error') {
          throw new Error(progress.message || 'AI 设计失败');
        }

        if (progress.step === 'complete') {
          if (!progress.report || !Array.isArray(progress.pages) || progress.pages.length === 0) {
            throw new Error('AI 已返回完成状态，但没有给出可用的页面布局。');
          }

          applyAiDesignedAssetReport(
            draft,
            progress.report,
            progress.pages,
            progress.message || completionMessage
          );
          completionMessage = progress.message || completionMessage;
          applied = true;
        }
      }

      if (!applied) {
        throw new Error('AI 未返回可用于渲染的最终报表。');
      }

      return completionMessage;
    } catch (err) {
      const message = `AI 设计失败: ${err instanceof Error ? err.message : String(err)}`;
      recordAiProgress('error', message);
      throw new Error(message);
    } finally {
      setIsGenerating(false);
    }
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
    setChatMessages([]);
    resetAiExecutionTrace();
    setChatInput('');
    setAiComposerMode('generate-model');
    setIsComposingPrompt(false);
  };

  // Get current report/pages/queries - return null if nothing generated/imported
  const currentReport = generatedReport;
  const currentPages = generatedPages.length > 0 ? generatedPages : [];
  const currentQueries = generatedQueries.length > 0 ? generatedQueries : [];
  const currentTheme = React.useMemo(
    () => mergeThemeWithFallback(currentReport?.theme),
    [currentReport]
  );
  const aiConversationPersistencePayload = React.useMemo(() => ({
    version: 1,
    chatMessages: chatMessages.map((message) => ({
      role: message.role,
      content: message.content,
      timestamp: message.timestamp,
    })),
    chatInput,
    aiComposerMode,
    generationProgress,
    context: {
      workspaceMode,
      connectionTarget: connectionString.trim() || undefined,
      connectionDatabase: connectionDatabase.trim() || undefined,
      modelName: modelMetadata?.databaseName || undefined,
      reportId: currentReport?.id || undefined,
      reportName: currentReport?.name || undefined,
      pageCount: currentPages.length,
      queryCount: currentQueries.length,
    },
  }), [
    aiComposerMode,
    chatInput,
    chatMessages,
    connectionDatabase,
    connectionString,
    currentPages.length,
    currentQueries.length,
    currentReport,
    generationProgress,
    modelMetadata?.databaseName,
    workspaceMode,
  ]);

  useEffect(() => {
    if (!hasHydratedAiConversation || !window.electronAPI?.writeAiConversationState) {
      return;
    }

    const fingerprint = JSON.stringify(aiConversationPersistencePayload);
    if (lastPersistedAiConversationRef.current === fingerprint) {
      return;
    }

    lastPersistedAiConversationRef.current = fingerprint;
    const persistedFileContent = JSON.stringify({
      ...aiConversationPersistencePayload,
      savedAt: new Date().toISOString(),
    }, null, 2);

    window.electronAPI.writeAiConversationState(persistedFileContent).catch((err) => {
      console.warn('[AI Conversation] Failed to persist session:', err);
    });
  }, [aiConversationPersistencePayload, hasHydratedAiConversation]);

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
  const isAiBusy = isGenerating || isRefining || isComposingPrompt;
  const effectiveReportCanvasZoomPercent = reportCanvasZoomMode === 'fit'
    ? reportCanvasFitZoomPercent
    : reportCanvasManualZoomPercent;

  const appendChatMessage = (role: ChatMessage['role'], content: string) => {
    setChatMessages((previous) => [
      ...previous,
      {
        role,
        content,
        timestamp: new Date().toISOString(),
      },
    ]);
  };

  const resetAiExecutionTrace = () => {
    setAiExecutionTraceLines([]);
  };

  const startAiExecutionTrace = (mode: AiComposerMode, intent: string) => {
    setAiExecutionTraceLines(buildAiExecutionPlanLines(mode, intent));
  };

  const pushAiExecutionTrace = (line: string | null | undefined) => {
    if (!line?.trim()) {
      return;
    }

    setAiExecutionTraceLines((previous) => (
      previous[previous.length - 1] === line
        ? previous
        : [...previous, line]
    ));
  };

  const recordAiProgress = (step?: string, message?: string) => {
    if (message || step) {
      setGenerationProgress(message || step || '');
    }

    pushAiExecutionTrace(mapAiProgressToTraceLine(step, message));
  };

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

  useEffect(() => {
    const scrollContainer = aiConversationScrollRef.current;
    if (!scrollContainer) {
      return undefined;
    }

    const rafId = window.requestAnimationFrame(() => {
      scrollContainer.scrollTo({
        top: scrollContainer.scrollHeight,
        behavior: 'smooth',
      });
    });

    return () => window.cancelAnimationFrame(rafId);
  }, [aiExecutionTraceLines, chatMessages, generationProgress]);

  const openAiWorkspace = () => {
    setWorkspaceMode('report');
    setActiveRibbonTab('ai');
    setActiveLeftPaneSection('ai');
    setShowRightPane(true);
  };

  const buildAiContextHint = (mode: AiGenerationMode) => {
    const assetNames = visibleDatasetAssets
      .slice(0, 5)
      .map((item) => item.name)
      .filter(Boolean);

    const lines: string[] = [];
    if (modelMetadata?.databaseName) {
      lines.push(`模型名称: ${modelMetadata.databaseName}`);
    }

    if (mode === 'generate-asset') {
      lines.push(`当前可见素材数: ${visibleDatasetAssets.length}`);
      if (assetNames.length > 0) {
        lines.push(`优先素材: ${assetNames.join('、')}`);
      }
    } else if (visibleDatasetAssets.length > 0) {
      lines.push(`当前已有 ${visibleDatasetAssets.length} 个可见素材，可作为首版布局参考。`);
    }

    return lines.join('\n');
  };

  const buildModelGenerationStarterPrompt = () => {
    const contextHint = buildAiContextHint('generate-model');
    const lines: string[] = [
      '请基于当前数据模型生成一份可直接展示的 BI 报表。',
      '先主动完成一轮规划：明确主结论、核心指标、趋势关系、结构对比和异常提醒，再输出最终版式。',
      '整体采用浅色、编辑式、具有设计感的视觉语言，强调主副层级、留白、节奏和叙事推进。',
      '不要做成模板化平铺界面，要更像真正可交付的经营分析封面页或管理汇报页。',
    ];

    if (contextHint) {
      lines.push(contextHint);
    }

    lines.push('');
    lines.push('请优先组织出主视觉结论区、KPI 区、趋势区、结构对比区和异常提示区，并拉开体量差异。');
    lines.push('标题和说明文案要像真实交付稿，不要使用空泛占位标题。');
    lines.push('至少做出一个更有存在感的主视觉区块，不要所有卡片一样大。');
    lines.push('生成完成前请自检主题、图表类型、字段映射、标题语义和布局是否匹配。');
    lines.push('如果你认为还缺少关键偏好，请在结果 message 中给出后续可继续 уточ细的方向。');
    lines.push('避免深色背景、避免平均分栏、避免紫色主导配色、避免把筛选器作为独立网格组件生成。');

    return lines.join('\n');
  };

  const buildAssetGenerationStarterPrompt = () => {
    const contextHint = buildAiContextHint('generate-asset');
    const names = visibleDatasetAssets.slice(0, 4).map((item) => item.name).filter(Boolean);
    const lines: string[] = [
      '请基于当前可见素材生成一份最终可交付的 BI 报表。',
      '先主动完成一轮规划，提炼最值得放大的主视觉结论，再安排辅助趋势、结构和明细。',
      '不要只是把素材简单拼上去，而要重新组织成有主视觉、有层级、有呼吸感的页面。',
      '整体采用浅色、编辑式、具有设计感的视觉语言，并保留关键素材的业务信息。',
    ];

    if (contextHint) {
      lines.push(contextHint);
    }

    if (names.length > 0) {
      lines.push(`当前最值得优先组织的素材: ${names.join('、')}。`);
    }

    lines.push('');
    lines.push('尽量保留全部高价值素材，但可以重排大小、位置、图表类型和标题。');
    lines.push('先形成结论，再展开趋势、结构和明细，避免平均分栏和平庸标题。');
    lines.push('至少做出一个大体量的主区块和一个辅助信息带。');
    lines.push('生成完成前请自检主题、图表类型、标题语义和组件层级是否真正落地。');
    lines.push('避免深色背景、避免紫色主导配色、避免把筛选器作为独立网格组件生成。');

    return lines.join('\n');
  };

  const buildRefinementStarterPrompt = () => {
    if (!hasReport || !currentReport) {
      return buildModelGenerationStarterPrompt();
    }

    return [
      `请继续优化当前报表《${currentReport.name}》。`,
      '先分析当前页面结构，再决定应该调整主题、图表类型、布局还是标题文案，并持续自检直到结果真实落地。',
      '优先改进布局、图表类型、标题文案、浅色视觉层次和重点信息表达，不要脱离现有数据上下文。',
      '避免平均分栏和平庸标题，优先增强视觉主次、留白和结论表达。',
    ].join('\n');
  };
  const buildDefaultGenerationIntent = (mode: AiGenerationMode) => (
    mode === 'generate-asset'
      ? buildAssetGenerationStarterPrompt()
      : buildModelGenerationStarterPrompt()
  );

  const openAiGenerationWorkspace = (mode: AiGenerationMode) => {
    openAiWorkspace();
    setAiComposerMode(mode);
    setGenerationProgress('');
    resetAiExecutionTrace();
    if (chatMessages.length === 0) {
      setChatInput('');
    }
  };

  const prepareAiComposer = (mode: AiComposerMode, presetPrompt: string) => {
    openAiWorkspace();
    setAiComposerMode(mode);
    setChatInput(presetPrompt);
    resetAiExecutionTrace();
    setGenerationProgress(
      mode === 'refine'
        ? '已填入一条修改建议，可继续编辑后发送。'
        : '已填入一条提示词，可继续编辑后发送。'
    );
  };

  const composePromptWithAi = async (mode: AiGenerationMode): Promise<string> => {
    if (!apiUrl) {
      throw new Error('后端服务尚未就绪，请稍后再试。');
    }

    if (!isConnected) {
      throw new Error('请先连接模型，再生成提示词。');
    }

    if (mode === 'generate-asset' && visibleDatasetAssets.length === 0) {
      throw new Error('当前没有可用于 AI 排版的可见数据集素材。请至少保留一个可见数据集、图表和字段。');
    }

    const apiKey = localStorage.getItem('vibeBiAiApiKey');
    if (!apiKey) {
      handleOpenSettings();
      throw new Error('请先配置 AI API Key（点击设置按钮）');
    }

    setIsComposingPrompt(true);
    startAiExecutionTrace(
      mode,
      mode === 'generate-asset'
        ? '基于当前可见素材整理一条首轮提示词。'
        : '基于当前数据模型整理一条首轮提示词。'
    );
    recordAiProgress('building_prompt', 'AI 正在整理首轮提示词...');

    try {
      const response = await fetch(`${apiUrl}/api/ai/compose-prompt`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey,
          'X-API-BaseUrl': localStorage.getItem('vibeBiAiBaseUrl') || '',
          'X-API-Model': localStorage.getItem('vibeBiAiModel') || '',
        },
        body: JSON.stringify({
          connectionString: buildModelConnectionString(),
          mode,
          userIntent: mode === 'generate-asset'
            ? '基于当前可见素材，整理一条高质量的报表生成提示词。'
            : '基于当前数据模型，整理一条高质量的报表生成提示词。',
          assets: visibleDatasetAssets.slice(0, 10).map((item) => ({
            name: item.name,
            chartType: item.charts.find((chart) => chart.isVisible)?.chartType || item.charts[0]?.chartType || item.type,
            rowCount: item.rowCount,
            score: item.score,
            visibleFields: item.fields.filter((field) => field.isVisible).map((field) => field.name),
          })),
          currentContext: hasReport && currentReport
            ? {
              report: currentReport,
              pages: currentPages,
              queries: currentQueries,
            }
            : undefined,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `生成提示词失败: ${response.statusText}`);
      }

      const prompt = parseComposePromptResponse(await response.text());
      if (!prompt) {
        throw new Error('AI 未返回可编辑的提示词。');
      }

      setAiComposerMode(mode);
      setChatInput(prompt);
      recordAiProgress('complete', 'AI 已生成首轮提示词，可继续编辑后发送。');
      return prompt;
    } catch (err) {
      const message = `生成提示词失败: ${err instanceof Error ? err.message : String(err)}`;
      recordAiProgress('error', message);
      throw new Error(message);
    } finally {
      setIsComposingPrompt(false);
    }
  };

  const generateReportFromModelWithAi = async (intent: string): Promise<string> => {
    if (!apiUrl) {
      throw new Error('后端服务尚未就绪，请稍后再试。');
    }

    if (!isConnected) {
      throw new Error('请先连接模型，再进行 AI 生成。');
    }

    const apiKey = localStorage.getItem('vibeBiAiApiKey');
    if (!apiKey) {
      handleOpenSettings();
      throw new Error('请先配置 AI API Key（点击设置按钮）');
    }

    const prompt = intent.trim() || defaultGenerationPrompt;

    setIsGenerating(true);
    recordAiProgress('generating', '开始生成报表...');

    try {
      const response = await fetch(`${apiUrl}/api/ai/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey,
          'X-API-BaseUrl': localStorage.getItem('vibeBiAiBaseUrl') || '',
          'X-API-Model': localStorage.getItem('vibeBiAiModel') || '',
        },
        body: JSON.stringify({
          connectionString: buildModelConnectionString(),
          userPrompt: prompt,
          pageCount: 1,
        }),
      });

      if (!response.ok) {
        throw new Error(`生成请求失败: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('无法读取响应流');
      }

      let applied = false;
      let completionMessage = '报表已生成。';

      for await (const json of readSseDataLines(reader)) {
        const progress = parseAiProgressPayload(json);
        if (!progress) {
          continue;
        }

        recordAiProgress(progress.step, progress.message);

        if (progress.step === 'error') {
          throw new Error(progress.message || 'AI 生成失败');
        }

        if (progress.step === 'complete' && progress.report) {
          const nextPages = Array.isArray(progress.pages) ? progress.pages : [];
          const nextQueries = Array.isArray(progress.queries) ? progress.queries : [];
          const nextReport = normalizeReportForRuntime(progress.report, sampleTheme);

          if (nextPages.length === 0) {
            throw new Error('AI 已完成生成，但没有返回任何报表页面。');
          }

          setGeneratedReport(nextReport);
          setGeneratedPages(nextPages);
          setGeneratedQueries(nextQueries);
          setActiveImportedComponentId(undefined);
          completionMessage = progress.message || `生成完成，共 ${nextPages.length} 个页面，${nextQueries.length} 个查询。`;
          recordAiProgress('complete', completionMessage);
          applied = true;
        }
      }

      if (!applied) {
        throw new Error('AI 未返回可用于渲染的最终报表。');
      }

      return completionMessage;
    } catch (err) {
      const message = `生成失败: ${err instanceof Error ? err.message : String(err)}`;
      recordAiProgress('error', message);
      throw new Error(message);
    } finally {
      setIsGenerating(false);
    }
  };

  const refineReportWithAi = async (intent: string): Promise<string> => {
    if (!apiUrl) {
      throw new Error('后端服务尚未就绪，请稍后再试。');
    }

    if (!isConnected) {
      throw new Error('请先连接模型，再进行 AI 修改。');
    }

    if (!currentReport || currentPages.length === 0) {
      throw new Error('当前还没有可修改的报表，请先发送首轮生成请求。');
    }

    const apiKey = localStorage.getItem('vibeBiAiApiKey');
    if (!apiKey) {
      handleOpenSettings();
      throw new Error('请先配置 AI API Key（点击设置按钮）');
    }

    setIsRefining(true);
    recordAiProgress('refining', '正在应用 AI 修改...');

    try {
      const response = await fetch(`${apiUrl}/api/ai/refine`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey,
          'X-API-BaseUrl': localStorage.getItem('vibeBiAiBaseUrl') || '',
          'X-API-Model': localStorage.getItem('vibeBiAiModel') || '',
        },
        body: JSON.stringify({
          connectionString: buildModelConnectionString(),
          userPrompt: intent,
          currentContext: {
            report: currentReport,
            pages: currentPages,
            queries: currentQueries,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`优化请求失败: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('无法读取响应流');
      }

      let applied = false;
      let completionMessage = '报表已更新。';

      for await (const json of readSseDataLines(reader)) {
        const progress = parseAiProgressPayload(json);
        if (!progress) {
          continue;
        }

        recordAiProgress(progress.step, progress.message);

        if (progress.step === 'error') {
          throw new Error(progress.message || 'AI 修改失败');
        }

        if (progress.step === 'complete' && progress.report) {
          const nextPages = Array.isArray(progress.pages) ? progress.pages : currentPages;
          const nextQueries = Array.isArray(progress.queries) ? progress.queries : currentQueries;
          const nextReport = normalizeReportForRuntime(progress.report, currentTheme);
          const actualMessage = summarizeAppliedChanges(
            currentReport,
            currentPages,
            currentQueries,
            nextReport,
            nextPages,
            nextQueries,
            intent,
            progress.message
          );

          setGeneratedReport(nextReport);
          setGeneratedPages(nextPages);
          setGeneratedQueries(nextQueries);
          completionMessage = actualMessage;
          recordAiProgress('complete', completionMessage);
          applied = true;
        }
      }

      if (!applied) {
        throw new Error('AI 未返回更新后的报表。');
      }

      return completionMessage;
    } catch (err) {
      const message = `修改失败: ${err instanceof Error ? err.message : String(err)}`;
      recordAiProgress('error', message);
      throw new Error(message);
    } finally {
      setIsRefining(false);
    }
  };

  const runAiGenerationRequest = async (mode: AiGenerationMode, intent: string): Promise<string> => {
    if (mode === 'generate-asset') {
      if (visibleDatasetAssets.length === 0) {
        throw new Error('当前没有可用于 AI 排版的可见数据集素材。请至少保留一个可见数据集、图表和字段。');
      }

      return generateReportWithAiFromDatasetAssets(visibleDatasetAssets, 'asset', intent);
    }

    return visibleDatasetAssets.length > 0
      ? generateReportWithAiFromDatasetAssets(visibleDatasetAssets, 'model', intent)
      : generateReportFromModelWithAi(intent);
  };

  const submitAiConversationTurn = async (
    intent: string,
    options?: {
      mode?: AiComposerMode;
      displayContent?: string;
    }
  ) => {
    const trimmedIntent = intent.trim();
    if (!trimmedIntent || isAiBusy) {
      return;
    }

    const hasCurrentReport = Boolean(currentReport && currentPages.length > 0);
    const requestedMode = options?.mode
      || (!hasCurrentReport && aiComposerMode === 'refine' ? 'generate-model' : aiComposerMode);
    const displayContent = options?.displayContent?.trim() || trimmedIntent;

    appendChatMessage('user', displayContent);
    startAiExecutionTrace(requestedMode, trimmedIntent);

    try {
      const assistantMessage = requestedMode === 'refine'
        ? await refineReportWithAi(trimmedIntent)
        : await runAiGenerationRequest(requestedMode, trimmedIntent);

      setAiComposerMode('refine');
      appendChatMessage('assistant', assistantMessage);
    } catch (err) {
      appendChatMessage('assistant', err instanceof Error ? err.message : String(err));
    }
  };

  const handleSendChatMessage = async () => {
    if (!chatInput.trim() || isAiBusy) {
      return;
    }

    const userMessage = chatInput.trim();
    setChatInput('');
    await submitAiConversationTurn(userMessage);
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
          当前数据集已隐藏，不会参与 AI 报表生成。重新设为可见后才会恢复预览联动。
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

  const handleDirectGenerateFromEmptyState = async () => {
    const generationMode: AiGenerationMode = aiComposerMode === 'generate-asset'
      ? 'generate-asset'
      : 'generate-model';

    await submitAiConversationTurn(buildDefaultGenerationIntent(generationMode), {
      mode: generationMode,
      displayContent: generationMode === 'generate-asset'
        ? '直接基于当前可见素材生成一版报表。'
        : '直接基于当前模型生成一版报表。',
    });
  };

  const handleComposePromptFromEmptyState = async () => {
    const generationMode: AiGenerationMode = aiComposerMode === 'generate-asset'
      ? 'generate-asset'
      : 'generate-model';

    await composePromptWithAi(generationMode);
  };

  const renderAiExecutionTrace = () => (
    aiExecutionTraceLines.length > 0 ? (
      <div
        style={{
          display: 'grid',
          gap: 8,
          marginBottom: 10,
          padding: '12px 12px 10px',
          borderRadius: 12,
          background: 'linear-gradient(180deg, #F8FAFC 0%, #EEF2FF 100%)',
          border: '1px solid #C7D2FE',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#4338CA' }}>
            AI 规划与执行
          </span>
          <span style={{ fontSize: 10, color: shellPalette.textSubtle }}>
            {isAiBusy ? '执行中' : '已完成'}
          </span>
        </div>
        <div style={{ display: 'grid', gap: 6 }}>
          {aiExecutionTraceLines.map((line, index) => (
            <div
              key={`${line}-${index}`}
              style={{
                display: 'grid',
                gridTemplateColumns: '16px minmax(0, 1fr)',
                gap: 8,
                alignItems: 'flex-start',
                color: shellPalette.text,
                fontSize: 12,
                lineHeight: 1.7,
              }}
            >
              <span style={{ color: '#4F46E5', fontWeight: 700 }}>
                {index + 1}.
              </span>
              <span style={{ wordBreak: 'break-word' }}>{line}</span>
            </div>
          ))}
        </div>
      </div>
    ) : null
  );

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
      const aiPlaceholder = hasReport
        ? '输入你想继续修改的内容，Ctrl+Enter 发送'
        : aiComposerMode === 'generate-asset'
          ? '输入你希望如何基于当前素材生成报表，Ctrl+Enter 发送'
          : '输入你希望 AI 生成什么样的报表，Ctrl+Enter 发送';
      const shouldShowGenerationActions = chatMessages.length === 0
        && !chatInput.trim()
        && aiComposerMode !== 'refine'
        && !isAiBusy;

      return renderRightPaneShell('AI 对话', (
        <div
          style={{
            height: '100%',
            minHeight: 0,
            display: 'grid',
            gridTemplateRows: 'minmax(0, 1fr) 196px',
            gap: 10,
          }}
        >
          <div
            ref={aiConversationScrollRef}
            style={{
              height: '100%',
              minHeight: 0,
              overflow: 'auto',
              padding: 12,
            }}
          >
            {renderAiExecutionTrace()}
            {chatMessages.length === 0 ? (
              shouldShowGenerationActions ? (
                <div
                  style={{
                    height: '100%',
                    minHeight: 220,
                    display: 'grid',
                    alignContent: 'center',
                    gap: 14,
                    padding: '0 8px',
                  }}
                >
                  <div style={{ textAlign: 'center', color: shellPalette.textMuted, fontSize: 12, lineHeight: 1.7 }}>
                    先选择一种开始方式，再进入真正的 AI 生成流程。
                  </div>
                  <button
                    type="button"
                    onClick={() => { void handleDirectGenerateFromEmptyState(); }}
                    disabled={isAiBusy}
                    style={{
                      padding: '12px 16px',
                      borderRadius: 12,
                      border: 'none',
                      background: isAiBusy ? '#E5E7EB' : shellPalette.accent,
                      color: '#FFFFFF',
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: isAiBusy ? 'not-allowed' : 'pointer',
                    }}
                  >
                    直接生成报表
                  </button>
                  <button
                    type="button"
                    onClick={() => { void handleComposePromptFromEmptyState(); }}
                    disabled={isAiBusy}
                    style={{
                      padding: '12px 16px',
                      borderRadius: 12,
                      border: `1px solid ${shellPalette.accentBorder}`,
                      background: shellPalette.accentSoft,
                      color: shellPalette.accent,
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: isAiBusy ? 'not-allowed' : 'pointer',
                      opacity: isAiBusy ? 0.7 : 1,
                    }}
                  >
                    帮我生成提示词
                  </button>
                </div>
              ) : (
                <div
                  style={{
                    height: '100%',
                    minHeight: 180,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textAlign: 'center',
                    color: shellPalette.textMuted,
                    fontSize: 12,
                    lineHeight: 1.7,
                    padding: '0 18px',
                  }}
                >
                  {chatInput.trim()
                    ? '首轮提示词已放到下方输入框，可继续编辑后发送。'
                    : '当前还没有对话，直接在下方输入你的要求即可。'}
                </div>
              )
            ) : chatMessages.map((msg, idx) => (
              <div
                key={`${msg.timestamp}-${idx}`}
                style={{
                  display: 'grid',
                  gap: 6,
                  marginBottom: idx === chatMessages.length - 1 ? 0 : 10,
                  padding: '12px',
                  borderRadius: 12,
                  background: msg.role === 'user'
                    ? 'linear-gradient(180deg, #EFF6FF 0%, #DBEAFE 100%)'
                    : 'linear-gradient(180deg, #FFF7ED 0%, #FFFBEB 100%)',
                  border: `1px solid ${msg.role === 'user' ? '#BFDBFE' : '#FCD34D'}`,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 10,
                  }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: msg.role === 'user' ? shellPalette.accent : shellPalette.textMuted,
                    }}
                  >
                    {msg.role === 'user' ? '你' : 'AI'}
                  </span>
                  <span style={{ fontSize: 10, color: shellPalette.textSubtle }}>
                    {new Date(msg.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <div
                  style={{
                    color: shellPalette.text,
                    fontSize: 12,
                    lineHeight: 1.7,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {msg.content}
                </div>
                {msg.role === 'assistant' ? (
                  <div
                    style={{
                      marginTop: 2,
                      paddingTop: 8,
                      borderTop: '1px dashed rgba(194, 65, 12, 0.22)',
                      color: '#9A3412',
                      fontSize: 11,
                      lineHeight: 1.6,
                      letterSpacing: 0.2,
                    }}
                  >
                    继续告诉我想调整的布局、配色、重点指标、图表类型或筛选方式，我会沿着当前报表继续迭代。
                  </div>
                ) : null}
              </div>
            ))}
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
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
                onKeyDown={(event) => {
                  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                    event.preventDefault();
                    void handleSendChatMessage();
                  }
                }}
                placeholder={aiPlaceholder}
                disabled={isAiBusy}
                style={{
                  width: '100%',
                  height: '100%',
                  resize: 'none',
                  border: `1px solid ${shellPalette.border}`,
                  borderRadius: 10,
                  background: '#FFFFFF',
                  color: shellPalette.text,
                  fontSize: 13,
                  lineHeight: 1.7,
                  padding: 12,
                  boxSizing: 'border-box',
                  outline: 'none',
                  fontFamily: '"Microsoft YaHei UI", "Microsoft YaHei", "Noto Sans SC", "Noto Sans CJK SC", "Source Han Sans SC", "PingFang SC", "Segoe UI Variable", "Segoe UI", system-ui, sans-serif',
                }}
              />
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-end',
                gap: 10,
                minHeight: 40,
              }}
            >
                <button
                  type="button"
                  onClick={() => {
                    setChatMessages([]);
                    setChatInput('');
                    setGenerationProgress('');
                    resetAiExecutionTrace();
                  }}
                  disabled={isAiBusy || (chatMessages.length === 0 && !chatInput.trim() && aiExecutionTraceLines.length === 0)}
                  style={{
                    padding: '10px 14px',
                    borderRadius: 10,
                    border: `1px solid ${shellPalette.border}`,
                    background: '#FFFFFF',
                    color: shellPalette.textMuted,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: isAiBusy || (chatMessages.length === 0 && !chatInput.trim() && aiExecutionTraceLines.length === 0) ? 'not-allowed' : 'pointer',
                    opacity: isAiBusy || (chatMessages.length === 0 && !chatInput.trim() && aiExecutionTraceLines.length === 0) ? 0.6 : 1,
                  }}
                >
                  清空会话
                </button>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => setChatInput('')}
                  disabled={isAiBusy || !chatInput}
                  style={{
                    padding: '10px 14px',
                    borderRadius: 10,
                    border: `1px solid ${shellPalette.border}`,
                    background: '#FFFFFF',
                    color: shellPalette.textMuted,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: isAiBusy || !chatInput ? 'not-allowed' : 'pointer',
                    opacity: isAiBusy || !chatInput ? 0.6 : 1,
                  }}
                >
                  清空输入
                </button>
                <button
                  type="button"
                  onClick={() => { void handleSendChatMessage(); }}
                  disabled={isAiBusy || !chatInput.trim()}
                  style={{
                    padding: '10px 18px',
                    borderRadius: 10,
                    border: 'none',
                    background: isAiBusy ? '#EDEBE9' : shellPalette.accent,
                    color: isAiBusy ? shellPalette.textSubtle : '#FFFFFF',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: isAiBusy || !chatInput.trim() ? 'not-allowed' : 'pointer',
                    opacity: isAiBusy || !chatInput.trim() ? 0.7 : 1,
                  }}
                >
                  {isAiBusy ? '处理中...' : '发送'}
                </button>
              </div>
            </div>
          </div>
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
              icon={createGradientIcon('sparkle', '#A78BFA', '#7C3AED')}
              label={isGenerating ? '生成中...' : '从模型生成'}
              description="打开 AI 工作区，可直接生成或先让 AI 整理提示词"
              onClick={() => {
                openAiGenerationWorkspace('generate-model');
              }}
              disabled={isAiBusy}
              tone="accent"
              showDescription={false}
            />
            <CommandButton
              icon={createGradientIcon('visual-library', '#7DD3FC', '#3B82F6')}
              label="从素材生成"
              description="打开 AI 工作区，基于当前可见素材生成报表"
              onClick={() => {
                if (importableVisualCount === 0) {
                  openAiWorkspace();
                  setAiComposerMode('generate-asset');
                  setGenerationProgress('当前没有可用于 AI 排版的可见数据集素材。请至少保留一个可见数据集、图表和字段。');
                  return;
                }

                openAiGenerationWorkspace('generate-asset');
              }}
              disabled={isAiBusy}
              showDescription={false}
            />
          </RibbonGroup>
          <RibbonGroup title="编辑">
            <CommandButton
              icon={createGradientIcon('refresh', '#818CF8', '#4F46E5')}
              label="继续修改"
              description="为当前报表预填一条修改建议，进入多轮对话"
              onClick={() => {
                prepareAiComposer('refine', buildRefinementStarterPrompt());
              }}
              showDescription={false}
            />
            <CommandButton
              icon={createGradientIcon('message', '#FDBA74', '#F97316')}
              label="打开会话"
              description="仅切换到右侧 AI 会话区，不自动发送请求"
              onClick={() => {
                openAiWorkspace();
                if (!chatInput.trim()) {
                  setAiComposerMode(hasReport ? 'refine' : 'generate-model');
                  setChatInput(hasReport ? buildRefinementStarterPrompt() : '');
                }
              }}
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
              description="定位到报表生成与微调设置"
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
            description="配置 AI Provider、Key 和代理地址"
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
            description="切换到 AI 报表生成与微调工作区"
            onClick={() => {
              handleRibbonTabChange('ai');
            }}
            showDescription={false}
          />
        </RibbonGroup>
      </>
    );
  };

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
                  : '连接模型、进入数据视图准备素材，或直接从 AI 工作区开始生成报表。'}
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
                      dataSource={isConnected ? { type: 'local', connection: { server: connectionString, database: modelMetadata?.databaseName || connectionDatabase || 'Default' } } : sampleDataSource}
                      apiBaseUrl={apiUrl}
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
            borderRadius: 14,
            padding: 24,
            width: 400,
            maxWidth: '90%',
            boxShadow: '0 24px 64px rgba(0, 0, 0, 0.18)',
          }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ color: '#201F1E', margin: '0 0 20px 0', fontSize: 18 }}>设置</h2>

            <div style={{ marginBottom: 16 }}>
              <label style={{ color: '#605E5C', fontSize: 12, display: 'block', marginBottom: 6 }}>
                AI Provider
              </label>
              <select
                value={aiProvider}
                onChange={(e) => setAiProvider(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  background: '#FFFFFF',
                  border: '1px solid rgba(32, 31, 30, 0.14)',
                  borderRadius: 8,
                  color: '#201F1E',
                  fontSize: 14,
                  boxSizing: 'border-box',
                }}
              >
                <option value="claude">Claude (Anthropic)</option>
                <option value="openai">OpenAI</option>
              </select>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ color: '#605E5C', fontSize: 12, display: 'block', marginBottom: 6 }}>
                API Key
              </label>
              <input
                type="password"
                value={aiApiKey}
                onChange={(e) => setAiApiKey(e.target.value)}
                placeholder="sk-..."
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  background: '#FFFFFF',
                  border: '1px solid rgba(32, 31, 30, 0.14)',
                  borderRadius: 8,
                  color: '#201F1E',
                  fontSize: 14,
                  boxSizing: 'border-box',
                }}
              />
              <p style={{ color: '#8A8886', fontSize: 11, margin: '6px 0 0' }}>
                API Key 仅存储在本地浏览器中
              </p>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ color: '#605E5C', fontSize: 12, display: 'block', marginBottom: 6 }}>
                Base URL (可选)
              </label>
              <input
                type="text"
                value={aiBaseUrl}
                onChange={(e) => setAiBaseUrl(e.target.value)}
                placeholder="https://api.anthropic.com 或自定义代理地址"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  background: '#FFFFFF',
                  border: '1px solid rgba(32, 31, 30, 0.14)',
                  borderRadius: 8,
                  color: '#201F1E',
                  fontSize: 14,
                  boxSizing: 'border-box',
                }}
              />
              <p style={{ color: '#8A8886', fontSize: 11, margin: '6px 0 0' }}>
                留空使用默认地址，支持自定义代理或本地模型
              </p>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ color: '#605E5C', fontSize: 12, display: 'block', marginBottom: 6 }}>
                模型名称 (可选)
              </label>
              <input
                type="text"
                value={aiModel}
                onChange={(e) => setAiModel(e.target.value)}
                placeholder="claude-3-5-sonnet-20241022"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  background: '#FFFFFF',
                  border: '1px solid rgba(32, 31, 30, 0.14)',
                  borderRadius: 8,
                  color: '#201F1E',
                  fontSize: 14,
                  boxSizing: 'border-box',
                }}
              />
              <p style={{ color: '#8A8886', fontSize: 11, margin: '6px 0 0' }}>
                留空使用默认模型 (Claude: claude-3-5-sonnet-20241022)
              </p>
            </div>

            {/* Test Connection */}
            <div style={{ marginBottom: 20 }}>
              <button
                onClick={handleTestAiConnection}
                disabled={aiTestStatus === 'testing' || !aiApiKey}
                style={{
                  width: '100%',
                  padding: '10px',
                  background: aiTestStatus === 'testing' ? '#EDEBE9' : '#0F6CBD',
                  border: 'none',
                  borderRadius: 8,
                  color: '#fff',
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: aiTestStatus === 'testing' || !aiApiKey ? 'not-allowed' : 'pointer',
                  marginBottom: 8,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                }}
              >
                <ShellIcon name="connect" size={14} />
                {aiTestStatus === 'testing' ? '测试中...' : '测试连接'}
              </button>
              {aiTestStatus !== 'idle' && (
                <div style={{
                  padding: 10,
                  background: aiTestStatus === 'success' ? 'rgba(34, 197, 94, 0.1)' :
                             aiTestStatus === 'testing' ? 'rgba(15, 108, 189, 0.1)' :
                             'rgba(164, 38, 44, 0.1)',
                  border: `1px solid ${aiTestStatus === 'success' ? 'rgba(34, 197, 94, 0.3)' :
                                      aiTestStatus === 'testing' ? 'rgba(15, 108, 189, 0.3)' :
                                      'rgba(164, 38, 44, 0.3)'}`,
                  borderRadius: 6,
                  color: aiTestStatus === 'success' ? '#22c55e' :
                         aiTestStatus === 'testing' ? '#0F6CBD' :
                         '#A4262C',
                  fontSize: 12,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}>
                  <span style={{ display: 'inline-flex' }}>
                    <ShellIcon
                      name={aiTestStatus === 'success'
                        ? 'check-circle'
                        : aiTestStatus === 'testing'
                          ? 'pending-circle'
                          : 'error-circle'}
                      size={14}
                    />
                  </span>
                  {aiTestMessage}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={() => setShowSettings(false)}
                style={{
                  flex: 1,
                  padding: '10px',
                  background: '#FFFFFF',
                  border: '1px solid rgba(32, 31, 30, 0.14)',
                  borderRadius: 8,
                  color: '#605E5C',
                  fontSize: 14,
                  cursor: 'pointer',
                }}
              >
                取消
              </button>
              <button
                onClick={handleSaveSettings}
                style={{
                  flex: 1,
                  padding: '10px',
                  background: '#0F6CBD',
                  border: 'none',
                  borderRadius: 8,
                  color: '#fff',
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                保存
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
