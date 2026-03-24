import React, { useEffect, useRef, useState } from 'react';
import { ReportRenderer, primeQueryCache } from '@vibe-bi/renderer';
import type { ReportDefinition, PageDefinition, QueryDefinition, ThemeDefinition, DataSourceConfig, QueryResult } from '@vibe-bi/core';
import {
  CommandButton,
  InfoPill,
  PaneCard,
  PaneSurface,
  PaneTabs,
  RibbonBar,
  RibbonGroup,
  RibbonTabs,
  RightPaneSurface,
  SideRail,
  WorkspaceHeader,
  WorkspaceLayout,
  WorkspaceWelcome,
  shellPalette,
} from './components/DesktopShell';

// Model metadata types
interface TableMetadata {
  name: string;
  columns: string[];
}

interface MeasureMetadata {
  name: string;
  expression: string;
  table: string;
}

interface ModelMetadata {
  databaseName: string;
  tables: TableMetadata[];
  measures: MeasureMetadata[];
  relationships: unknown[];
}

// Sample report for testing
const sampleReport: ReportDefinition = {
  formatVersion: '1.0.0',
  id: 'test-report-001',
  name: '测试报表',
  description: '这是一个测试报表',
  createdAt: new Date().toISOString(),
  modifiedAt: new Date().toISOString(),
  generationMode: 'manual',
  pages: ['page1'],
  defaultPage: 'page1',
};

const samplePage: PageDefinition = {
  id: 'page1',
  name: '概览',
  layout: {
    type: 'grid',
    columns: 12,
    rowHeight: 60,
    gap: 16,
    padding: 24,
  },
  filters: [],
  components: [
    {
      id: 'kpi1',
      type: 'kpi-card',
      position: { x: 0, y: 0, w: 3, h: 2 },
      queryRef: 'q1',
      config: {
        title: '总收入',
        valueField: 'revenue',
        format: { type: 'currency', currency: 'CNY', decimals: 0 },
      },
    },
    {
      id: 'chart1',
      type: 'echarts',
      position: { x: 0, y: 2, w: 8, h: 5 },
      queryRef: 'q2',
      config: {
        chartType: 'line',
        title: '月度趋势',
        xAxis: { field: 'month', type: 'category' },
        yAxis: [{ field: 'value', name: '收入', type: 'value' }],
        series: [{ field: 'value', type: 'line', smooth: true }],
      },
    },
    {
      id: 'chart2',
      type: 'echarts',
      position: { x: 8, y: 2, w: 4, h: 5 },
      queryRef: 'q3',
      config: {
        chartType: 'pie',
        title: '分类占比',
      },
    },
  ],
};

const sampleQueries: QueryDefinition[] = [
  {
    id: 'q1',
    name: '总收入',
    dax: 'EVALUATE SUMMARIZECOLUMNS("revenue", [Total Revenue])',
    parameters: [],
  },
  {
    id: 'q2',
    name: '月度趋势',
    dax: 'EVALUATE SUMMARIZECOLUMNS(Calendar[MonthName], "value", [Total Revenue])',
    parameters: [],
  },
  {
    id: 'q3',
    name: '分类占比',
    dax: 'EVALUATE SUMMARIZECOLUMNS(Products[Category], "value", [Total Revenue])',
    parameters: [],
  },
];

const sampleTheme: ThemeDefinition = {
  name: 'Vibe Desktop Light',
  colors: {
    primary: '#0F6CBD',
    secondary: '#8764B8',
    background: '#F3F2F1',
    surface: '#FFFFFF',
    text: '#201F1E',
    textSecondary: '#605E5C',
    chart: ['#0F6CBD', '#8764B8', '#038387', '#CA5010', '#107C10', '#B146C2'],
  },
  typography: {
    fontFamily: '"Segoe UI", "Segoe UI Variable", system-ui, sans-serif',
  },
  components: {
    card: {
      borderRadius: 10,
      shadow: '0 1px 2px rgba(0,0,0,0.08)',
      padding: 18,
    },
  },
};

// Mock data for testing without actual AS connection
const mockData: Record<string, unknown[]> = {
  q1: [{ revenue: 1250000 }],
  q2: [
    { month: '1月', value: 98000 },
    { month: '2月', value: 112000 },
    { month: '3月', value: 105000 },
    { month: '4月', value: 128000 },
    { month: '5月', value: 135000 },
    { month: '6月', value: 142000 },
  ],
  q3: [
    { category: '电子产品', value: 450000 },
    { category: '服装', value: 320000 },
    { category: '食品', value: 280000 },
    { category: '家居', value: 200000 },
  ],
};

const sampleDataSource: DataSourceConfig = {
  type: 'local',
  connection: {
    server: 'mock',
    database: 'Test',
  },
};

type QueryRow = Record<string, unknown>;
type RibbonTabId = 'home' | 'data' | 'ai' | 'view';
type LeftPaneSectionId = 'start' | 'import' | 'ai' | 'model';
type RightPaneTabId = 'visuals' | 'fields' | 'properties';

function createGradientIcon(
  glyph: string,
  start: string,
  end: string,
  size = 22,
  fontSize = 12,
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
        fontSize,
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
      <span style={{ transform: 'translateY(1px)' }}>{glyph}</span>
    </span>
  );
}

function createMonoIcon(glyph: string, size = 16): React.ReactNode {
  return (
    <span
      aria-hidden="true"
      style={{
        color: 'currentColor',
        fontSize: size,
        fontWeight: 700,
        lineHeight: 1,
      }}
    >
      {glyph}
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
  chartType: 'line' | 'bar' | 'pie',
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

type ImportedVisualCategory = 'display' | 'functional' | 'decorative';

interface ImportSummaryItem {
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
  isRendered: boolean;
  sourceOrder: number;
}

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
  const [resultsByTab, setResultsByTab] = useState<Record<number, { loading: boolean; rows?: QueryRow[]; error?: string }>>({});

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
  const previewColumns = getPreviewColumnsFromRows(previewRows);

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
                  {previewRows.map((row, index) => (
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
                  ))}
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
                fontSize: 20,
                lineHeight: 1,
              }}
            >
              ×
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
  const [connectionString, setConnectionString] = useState<string>('localhost:12345');
  const [connectionDatabase, setConnectionDatabase] = useState<string>('');
  const [connectionMode, setConnectionMode] = useState<'pbi' | 'tabular'>('pbi');
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string>('');
  const [modelMetadata, setModelMetadata] = useState<ModelMetadata | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [activeTab, setActiveTab] = useState<'tables' | 'measures'>('tables');
  const [showConnectDialog, setShowConnectDialog] = useState(false);

  // AI Generation state
  const [userPrompt, setUserPrompt] = useState<string>('创建一个销售分析报表，包含关键指标、趋势图表和分类占比');
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
  const [activeImportedComponentId, setActiveImportedComponentId] = useState<string | undefined>(undefined);
  const [showInspectorActions, setShowInspectorActions] = useState(false);
  const [collapsedImportGroups, setCollapsedImportGroups] = useState<Record<ImportedVisualCategory, boolean>>(defaultImportGroupCollapsedState);
  const [importInspectorState, setImportInspectorState] = useState<ImportInspectorState | null>(null);
  const importFileInputRef = useRef<HTMLInputElement>(null);
  const [activeRibbonTab, setActiveRibbonTab] = useState<RibbonTabId>('home');
  const [activeLeftPaneSection, setActiveLeftPaneSection] = useState<LeftPaneSectionId>('start');
  const [activeRightPaneTab, setActiveRightPaneTab] = useState<RightPaneTabId>('properties');
  const [showLeftPane] = useState(true);
  const [showRightPane, setShowRightPane] = useState(true);
  const [isRibbonCollapsed, setIsRibbonCollapsed] = useState(false);

  // AI Dialogue state for incremental modification
  interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: string;
  }
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState<string>('');
  const [isRefining, setIsRefining] = useState(false);
  const [showChatPanel, setShowChatPanel] = useState(false);

  useEffect(() => {
    console.log('App mounted, electronAPI:', window.electronAPI);

    // Get API URL from main process
    if (window.electronAPI?.getApiUrl) {
      window.electronAPI.getApiUrl()
        .then((url) => {
          console.log('API URL received:', url);
          setApiUrl(url);
        })
        .catch((err) => {
          console.error('Failed to get API URL:', err);
          setError(String(err));
        });
    } else {
      console.error('electronAPI not available');
      setError('electronAPI not available');
    }
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
    setShowConnectDialog(true);
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
      setActiveRightPaneTab('fields');
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
  const handleImportPerformanceAnalyzer = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !isConnected || !apiUrl) return;

    setIsImporting(true);
    setImportError('');
    setGenerationProgress('正在解析 Performance Analyzer 文件...');
    setActiveLeftPaneSection('import');
    setShowRightPane(true);

    try {
      const content = await file.text();
      const perfData = JSON.parse(content);

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
      const visualQueries: QueryDefinition[] = [];
      const components: PageDefinition['components'] = [];
      let yPos = 0;

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
        const queryId = `q_${filteredIndex}`;
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

        visualQueries.push({
          id: queryId,
          name: visualName,
          dax: queryText,
          executionDax: selectedDax,
          evaluateQueries,
          selectedEvaluateIndex,
          parameters: [],
        });

        const componentId = `comp_${filteredIndex}`;
        const componentHeight = componentType === 'kpi-card' ? 2 : componentType === 'data-table' ? 6 : 5;
        components.push({
          id: componentId,
          type: componentType as PageDefinition['components'][number]['type'],
          position: { x: 0, y: yPos, w: 12, h: componentHeight },
          queryRef: queryId,
          config: buildComponentConfig(
            componentType as PageDefinition['components'][number]['type'],
            chartType as 'line' | 'bar' | 'pie',
            visualName,
            queryResult
          ),
        });

        upsertSummaryItem(candidate.summaryKey, candidate.sourceOrder, {
          name: visualName,
          type: visualType,
          hasQuery: true,
          isRendered: true,
          queryId,
          componentId,
          score,
          rowCount: queryResult?.rowCount || rowCount,
          executionTime,
          fullQuery: queryText,
          executionDax: selectedDax,
          evaluateQueries,
          selectedEvaluateIndex,
        });

        yPos += componentHeight;
      }

      if (visualQueries.length === 0) {
        throw new Error('未找到有效的 DAX 查询（请确保文件包含 "Execute DAX Query" 事件）');
      }

      // Create report from imported data
      const reportId = `imported-${Date.now()}`;
      const pageId = `page-${Date.now()}`;

      setGeneratedReport({
        formatVersion: '1.0.0',
        id: reportId,
        name: `导入: ${file.name.replace('.json', '')}`,
        description: `从 Performance Analyzer 导入的报表 (${visualQueries.length} 个视觉对象)`,
        createdAt: new Date().toISOString(),
        modifiedAt: new Date().toISOString(),
        generationMode: 'imported',
        pages: [pageId],
        defaultPage: pageId,
      });

      setGeneratedPages([{
        id: pageId,
        name: '导入的报表',
        layout: {
          type: 'grid',
          columns: 12,
          rowHeight: 60,
          gap: 16,
          padding: 24,
        },
        filters: [],
        components,
      }]);

      setGeneratedQueries(visualQueries);
      setImportSummary(Array.from(summaryMap.values()).sort((a, b) => a.sourceOrder - b.sourceOrder));
      setActiveImportedComponentId(components[0]?.id);
      setShowInspectorActions(false);
      setCollapsedImportGroups(defaultImportGroupCollapsedState);
      setImportInspectorState(null);
      setGenerationProgress(`成功识别 ${summaryMap.size} 个视觉对象，生成 ${visualQueries.length} 个图表`);

    } catch (err) {
      setImportError(err instanceof Error ? err.message : '导入失败');
      setGenerationProgress('');
    } finally {
      setIsImporting(false);
      // Reset file input
      event.target.value = '';
    }
  };

  // AI Generate from Import - use imported DAX queries to generate optimized report
  const handleAiGenerateFromImport = async () => {
    const importableVisuals = importSummary.filter((item) => item.category === 'display' && item.hasQuery && item.fullQuery);
    if (!apiUrl || !isConnected || importableVisuals.length === 0) return;

    const apiKey = localStorage.getItem('vibeBiAiApiKey');
    if (!apiKey) {
      setGenerationProgress('请先配置 AI API Key（点击设置按钮）');
      setShowSettings(true);
      return;
    }

    setIsGenerating(true);
    setGenerationProgress('正在分析导入的数据...');
    setActiveLeftPaneSection('ai');

    try {
      // Build prompt from imported visuals
      const promptLines: string[] = [];
      promptLines.push('基于以下从 Power BI 导入的视觉对象，生成一个现代化的报表：');
      promptLines.push('');
      promptLines.push('### 可用视觉对象');
      importableVisuals.forEach((item, idx) => {
        promptLines.push(`${idx + 1}. ${item.name} (${item.type})`);
        promptLines.push(`   数据行数: ${item.rowCount}, 执行时间: ${item.executionTime.toFixed(0)}ms`);
        promptLines.push(`   DAX: ${item.fullQuery!.slice(0, 150)}${item.fullQuery!.length > 150 ? '...' : ''}`);
        promptLines.push('');
      });
      promptLines.push('');
      promptLines.push('要求：');
      promptLines.push('1. 根据 DAX 查询的语义选择合适的图表类型（如趋势数据用折线图、占比用饼图等）');
      promptLines.push('2. 使用美观的现代化布局，重要的图表占更大空间');
      promptLines.push('3. 保持数据的逻辑关联性，相关的图表放在一起');
      promptLines.push('4. 添加清晰的标题和标签');

      const prompt = promptLines.join('\n');

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
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('无法读取响应流');
      }

      let reportJson = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const json = line.substring(6);
            try {
              const progress = JSON.parse(json);
              setGenerationProgress(progress.message || progress.step);

              if (progress.step === 'complete' && progress.report) {
                // 使用 AI 生成的 report，但需要基于导入的数据创建 pages
                const reportId = progress.report.id || `ai-generated-${Date.now()}`;
                const pageId = `page-${Date.now()}`;

                // 基于导入的 summary 创建新的查询和组件
                const newQueries: QueryDefinition[] = [];
                const newComponents: PageDefinition['components'] = [];
                const renderedSummaryMap = new Map<string, { queryId: string; componentId: string }>();
                let yPos = 0;

                importableVisuals.forEach((item, idx) => {
                  const queryId = `q_${idx}`;

                  newQueries.push({
                    id: queryId,
                    name: item.name,
                    dax: item.fullQuery!,
                    executionDax: item.executionDax || item.fullQuery!,
                    evaluateQueries: item.evaluateQueries,
                    selectedEvaluateIndex: item.selectedEvaluateIndex,
                    parameters: [],
                  });

                  // 根据类型推断最佳组件类型
                  // Power BI visual types: clusteredColumnChart, lineChart, pieChart, card, table, matrix, slicer
                  let componentType = 'data-table';
                  let chartType = 'bar';

                  const visualType = item.type.toLowerCase();
                  console.log(`[AI Generate] Visual ${idx}: name="${item.name}", type="${item.type}" (lower="${visualType}")`);

                  if (visualType.includes('line') || visualType.includes('area')) {
                    componentType = 'echarts';
                    chartType = 'line';
                  } else if (visualType.includes('column') || visualType.includes('bar') || visualType.includes('clustered')) {
                    componentType = 'echarts';
                    chartType = 'bar';
                  } else if (visualType.includes('pie') || visualType.includes('doughnut') || visualType.includes('donut')) {
                    componentType = 'echarts';
                    chartType = 'pie';
                  } else if (visualType.includes('card') || visualType.includes('kpi') || visualType.includes('single')) {
                    componentType = 'kpi-card';
                  } else if (visualType.includes('table') || visualType.includes('matrix')) {
                    componentType = 'data-table';
                  } else {
                    // 默认为柱状图而不是表格
                    componentType = 'echarts';
                    chartType = 'bar';
                  }

                  console.log(`[AI Generate] Selected componentType="${componentType}", chartType="${chartType}"`);

                  // 根据重要性分数决定组件大小
                  const isHighPriority = item.score >= 15;
                  const height = componentType === 'kpi-card' ? 2 : isHighPriority ? 6 : 4;
                  const width = isHighPriority ? 12 : 6;

                  const componentId = `comp_${idx}`;

                  newComponents.push({
                    id: componentId,
                    type: componentType,
                    position: { x: 0, y: yPos, w: width, h: height },
                    queryRef: queryId,
                    config: {
                      title: item.name,
                      ...(componentType === 'echarts' ? {
                        chartType,
                        // Leave fields empty for auto-detection from data
                        series: [],
                      } : {}),
                      ...(componentType === 'kpi-card' ? { valueField: '' } : {}),
                      ...(componentType === 'data-table' ? { columns: [] } : {}),
                    },
                  });
                  renderedSummaryMap.set(item.id, { queryId, componentId });

                  yPos += height;
                });

                setGeneratedReport({
                  ...progress.report,
                  id: reportId,
                  name: progress.report.name || `AI生成: ${importSummary.length}个视觉对象`,
                  description: progress.report.description || `基于 Performance Analyzer 导入数据智能生成的报表`,
                  pages: [pageId],
                  defaultPage: pageId,
                });

                setGeneratedPages([{
                  id: pageId,
                  name: 'AI生成的报表',
                  layout: {
                    type: 'grid',
                    columns: 12,
                    rowHeight: 60,
                    gap: 16,
                    padding: 24,
                  },
                  filters: [],
                  components: newComponents,
                }]);

                setGeneratedQueries(newQueries);
                setImportSummary((previous) => previous.map((item) => {
                  const rendered = renderedSummaryMap.get(item.id);
                  return {
                    ...item,
                    queryId: rendered?.queryId,
                    componentId: rendered?.componentId,
                    isRendered: Boolean(rendered),
                  };
                }));
                setActiveImportedComponentId(newComponents[0]?.id);
                setGenerationProgress(`生成完成！已创建 ${newQueries.length} 个查询，${newComponents.length} 个组件`);
              } else if (progress.step === 'error') {
                setGenerationProgress(`错误: ${progress.message}`);
              }

              if (progress.partialContent) {
                reportJson += progress.partialContent;
              }
            } catch {
              // Ignore parse errors
            }
          }
        }
      }
    } catch (err) {
      setGenerationProgress(`生成失败: ${err instanceof Error ? err.message : String(err)}`);
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
    setActiveImportedComponentId(undefined);
    setShowInspectorActions(false);
    setCollapsedImportGroups(defaultImportGroupCollapsedState);
    setImportInspectorState(null);
    setActiveLeftPaneSection('start');
    setActiveRightPaneTab('properties');
    setChatMessages([]);
    setShowChatPanel(false);
  };

  // Generate reverse prompt from current report
  const generateReversePrompt = (): string => {
    if (!currentReport || currentPages.length === 0) {
      return '当前没有报表。请描述你想要创建的报表。';
    }

    const page = currentPages[0];
    const lines: string[] = [];
    lines.push('当前报表包含以下组件：');
    lines.push('');

    page.components.forEach((comp, idx) => {
      const query = currentQueries.find(q => q.id === comp.queryRef);
      lines.push(`${idx + 1}. "${comp.config?.title || comp.id}" - ${comp.type}`);
      lines.push(`   位置: x=${comp.position.x}, y=${comp.position.y}, w=${comp.position.w}, h=${comp.position.h}`);
      if (query) {
        lines.push(`   DAX: ${query.dax.slice(0, 80)}${query.dax.length > 80 ? '...' : ''}`);
      }
      lines.push('');
    });

    lines.push('请描述你想要做的修改：');
    lines.push('- "把第一个图表改成折线图"');
    lines.push('- "添加一个KPI显示总票数"');
    lines.push('- "交换图表A和B的位置"');
    lines.push('- "修改配色为蓝色主题"');

    return lines.join('\n');
  };

  // Toggle chat panel and initialize with reverse prompt
  const handleToggleChatPanel = () => {
    const newState = !showChatPanel;
    setShowChatPanel(newState);
    if (newState && chatMessages.length === 0) {
      // Initialize with system message containing reverse prompt
      const reversePrompt = generateReversePrompt();
      setChatMessages([
        {
          role: 'system',
          content: reversePrompt,
          timestamp: new Date().toISOString(),
        },
      ]);
    }
  };

  // Send message to AI for refinement
  const handleSendChatMessage = async () => {
    if (!apiUrl || !isConnected || !chatInput.trim() || isRefining) return;

    const apiKey = localStorage.getItem('vibeBiAiApiKey');
    if (!apiKey) {
      setShowSettings(true);
      return;
    }

    const userMessage = chatInput.trim();
    setChatInput('');
    setChatMessages(prev => [...prev, {
      role: 'user',
      content: userMessage,
      timestamp: new Date().toISOString(),
    }]);
    setIsRefining(true);

    try {
      // Build context from current report
      const context = {
        report: currentReport,
        pages: currentPages,
        queries: currentQueries,
      };

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
          userPrompt: userMessage,
          currentContext: context,
        }),
      });

      if (!response.ok) {
        throw new Error(`优化请求失败: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('无法读取响应流');
      }

      let assistantMessage = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const json = line.substring(6);
            try {
              const progress = JSON.parse(json);

              if (progress.step === 'complete' && progress.report) {
                // Update report with refined version
                setGeneratedReport(progress.report);
                if (progress.pages) {
                  setGeneratedPages(progress.pages);
                }
                if (progress.queries) {
                  setGeneratedQueries(progress.queries);
                }
                assistantMessage = progress.message || '报表已更新';
              } else if (progress.step === 'error') {
                assistantMessage = `错误: ${progress.message}`;
              } else {
                assistantMessage = progress.message || progress.step;
              }
            } catch {
              // Ignore parse errors
            }
          }
        }
      }

      setChatMessages(prev => [...prev, {
        role: 'assistant',
        content: assistantMessage,
        timestamp: new Date().toISOString(),
      }]);
    } catch (err) {
      setChatMessages(prev => [...prev, {
        role: 'assistant',
        content: `修改失败: ${err instanceof Error ? err.message : String(err)}`,
        timestamp: new Date().toISOString(),
      }]);
    } finally {
      setIsRefining(false);
    }
  };

  // AI Generate Report
  const handleGenerateReport = async () => {
    if (!apiUrl || !isConnected || !userPrompt) return;

    const apiKey = localStorage.getItem('vibeBiAiApiKey');
    if (!apiKey) {
      setGenerationProgress('请先配置 AI API Key（点击设置按钮）');
      setShowSettings(true);
      return;
    }

    setIsGenerating(true);
    setGenerationProgress('开始生成报表...');
    setActiveLeftPaneSection('ai');

    try {
      const response = await fetch(`${apiUrl}/api/ai/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': localStorage.getItem('vibeBiAiApiKey') || '',
          'X-API-BaseUrl': localStorage.getItem('vibeBiAiBaseUrl') || '',
          'X-API-Model': localStorage.getItem('vibeBiAiModel') || '',
        },
        body: JSON.stringify({
          connectionString: buildModelConnectionString(),
          userPrompt,
          pageCount: 1,
        }),
      });

      if (!response.ok) {
        throw new Error(`生成请求失败: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('无法读取响应流');
      }

      let reportJson = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const json = line.substring(6);
            try {
              const progress = JSON.parse(json);
              setGenerationProgress(progress.message || progress.step);

              if (progress.step === 'complete' && progress.report) {
                // Parse generated report
                setGeneratedReport(progress.report);
                // For now use sample pages/queries - in real implementation
                // the AI would generate these too
                setGeneratedPages([samplePage]);
                setGeneratedQueries(sampleQueries);
              } else if (progress.step === 'error') {
                setGenerationProgress(`错误: ${progress.message}`);
              }

              if (progress.partialContent) {
                reportJson += progress.partialContent;
              }
            } catch {
              // Ignore parse errors
            }
          }
        }
      }
    } catch (err) {
      setGenerationProgress(`生成失败: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsGenerating(false);
    }
  };

  // Get current report/pages/queries - return null if nothing generated/imported
  const currentReport = generatedReport;
  const currentPages = generatedPages.length > 0 ? generatedPages : [];
  const currentQueries = generatedQueries.length > 0 ? generatedQueries : [];
  const importSummaryGroups = React.useMemo(() => {
    const groups: Record<ImportedVisualCategory, ImportSummaryItem[]> = {
      display: [],
      functional: [],
      decorative: [],
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
    if (importSummary.length > 0) {
      setActiveRightPaneTab('visuals');
    }
  }, [importSummary.length]);

  useEffect(() => {
    if (modelMetadata && activeRightPaneTab === 'properties') {
      setActiveRightPaneTab('fields');
    }
  }, [modelMetadata, activeRightPaneTab]);

  const hasReport = currentReport && currentPages.length > 0;
  const hasImportedVisuals = importSummary.length > 0;
  const openImportDialog = () => {
    importFileInputRef.current?.click();
  };
  const importableVisualCount = importSummaryGroups.display.filter((item) => item.hasQuery && item.fullQuery).length;
  const ribbonTabs: Array<{ id: RibbonTabId; label: string; color: string }> = [
    { id: 'home', label: '主页', color: '#22C983' },
    { id: 'data', label: '数据', color: '#3B82F6' },
    { id: 'ai', label: 'AI', color: '#8B5CF6' },
    { id: 'view', label: '视图', color: '#F59E0B' },
  ];
  const leftPaneItems: Array<{ id: LeftPaneSectionId; label: string; icon: React.ReactNode; color: string }> = [
    { id: 'start', label: '开始', color: '#22C983', icon: createMonoIcon('⌂', 16) },
    { id: 'import', label: '导入', color: '#3B82F6', icon: createMonoIcon('↓', 17) },
    { id: 'ai', label: 'AI', color: '#8B5CF6', icon: createMonoIcon('◇', 16) },
    { id: 'model', label: '模型', color: '#F59E0B', icon: createMonoIcon('▦', 14) },
  ];
  const rightPaneTabs: Array<{ id: RightPaneTabId; label: string; color: string }> = [
    { id: 'visuals', label: '视觉对象', color: '#22C983' },
    { id: 'fields', label: '字段', color: '#3B82F6' },
    { id: 'properties', label: '属性', color: '#F59E0B' },
  ];
  const activeLeftPaneMeta = leftPaneItems.find((item) => item.id === activeLeftPaneSection) || leftPaneItems[0];
  const collapseChromeButtonStyle: React.CSSProperties = {
    width: 20,
    height: 20,
    borderRadius: 3,
    border: '1px solid transparent',
    background: 'transparent',
    color: shellPalette.textSubtle,
    fontSize: 12,
    lineHeight: 1,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  };
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
  const renderLeftPaneContent = () => {
    if (activeLeftPaneSection === 'import') {
      return (
        <PaneSurface
          title="导入任务"
          subtitle="导入 JSON 并检查识别结果。"
          borderSide="left"
          actions={(
            <button
              type="button"
              onClick={() => setShowRightPane(false)}
              title="收起设置"
              aria-label="收起设置"
              style={collapseChromeButtonStyle}
            >
              «
            </button>
          )}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <PaneCard
              title="Performance Analyzer JSON"
              subtitle="解析标题、类型并补取数据。"
              tone="accent"
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
                {importSummary.length > 0
                  ? '下方可继续查看 visual 列表。'
                  : '当前还没有导入 visual。'}
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
        </PaneSurface>
      );
    }

    if (activeLeftPaneSection === 'ai') {
      return (
        <PaneSurface
          title="AI 工作区"
          subtitle="生成报表或继续调整。"
          borderSide="left"
          actions={(
            <button
              type="button"
              onClick={() => setShowRightPane(false)}
              title="收起设置"
              aria-label="收起设置"
              style={collapseChromeButtonStyle}
            >
              «
            </button>
          )}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <PaneCard
              title="报表生成"
              subtitle="按模型或导入结果生成报表。"
              tone="accent"
            >
              <textarea
                value={userPrompt}
                onChange={(event) => setUserPrompt(event.target.value)}
                placeholder="描述你想要的报表..."
                rows={5}
                style={{
                  width: '100%',
                  resize: 'vertical',
                  minHeight: 116,
                  borderRadius: 10,
                  border: `1px solid ${shellPalette.border}`,
                  background: shellPalette.paneBg,
                  color: shellPalette.text,
                  fontSize: 13,
                  lineHeight: 1.6,
                  padding: 12,
                  boxSizing: 'border-box',
                  fontFamily: '"Segoe UI", "Segoe UI Variable", system-ui, sans-serif',
                }}
              />
              <div style={{ marginTop: 12, color: shellPalette.textMuted, fontSize: 12, lineHeight: 1.6 }}>
                在这里输入提示词，生成入口在顶部。
              </div>
              {generationProgress ? (
                <div style={{ marginTop: 12, fontSize: 12, color: shellPalette.textMuted }}>
                  {generationProgress}
                </div>
              ) : null}
            </PaneCard>
            <PaneCard
              title="AI 对话修改"
              subtitle="继续调整图表和布局。"
            >
              <div style={{ marginBottom: 12, color: shellPalette.textMuted, fontSize: 12, lineHeight: 1.6 }}>
                对话开关在顶部。
              </div>
              {showChatPanel ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div
                    style={{
                      maxHeight: 260,
                      overflow: 'auto',
                      borderRadius: 10,
                      border: `1px solid ${shellPalette.border}`,
                      background: shellPalette.ribbonMutedBg,
                      padding: 12,
                    }}
                  >
                    {chatMessages.length === 0 ? (
                      <div style={{ color: shellPalette.textMuted, fontSize: 12, textAlign: 'center', padding: 20 }}>
                        AI 对话记录显示在这里。
                      </div>
                    ) : chatMessages.map((msg, idx) => (
                      <div
                        key={idx}
                        style={{
                          marginBottom: 10,
                          padding: 10,
                          borderRadius: 8,
                          background: msg.role === 'user'
                            ? '#F7FBFF'
                            : msg.role === 'assistant'
                              ? '#F4FBF4'
                              : '#FAF9F8',
                          borderLeft: `3px solid ${msg.role === 'user'
                            ? shellPalette.accent
                            : msg.role === 'assistant'
                              ? shellPalette.success
                              : shellPalette.borderStrong}`,
                        }}
                      >
                        <div
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            color: msg.role === 'user'
                              ? shellPalette.accent
                              : msg.role === 'assistant'
                                ? shellPalette.success
                                : shellPalette.textMuted,
                            marginBottom: 4,
                            textTransform: 'uppercase',
                          }}
                        >
                          {msg.role === 'user' ? '你' : msg.role === 'assistant' ? 'AI' : '当前报表'}
                        </div>
                        <div
                          style={{
                            color: shellPalette.text,
                            fontSize: 12,
                            whiteSpace: 'pre-wrap',
                            fontFamily: msg.role === 'system' ? 'Consolas, monospace' : 'inherit',
                          }}
                        >
                          {msg.content}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      type="text"
                      value={chatInput}
                      onChange={(event) => setChatInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          handleSendChatMessage();
                        }
                      }}
                      placeholder="描述你想要的修改..."
                      disabled={isRefining}
                      style={{
                        flex: 1,
                        padding: '10px 12px',
                        borderRadius: 10,
                        border: `1px solid ${shellPalette.border}`,
                        background: shellPalette.paneBg,
                        color: shellPalette.text,
                        fontSize: 13,
                        outline: 'none',
                      }}
                    />
                    <button
                      type="button"
                      onClick={handleSendChatMessage}
                      disabled={isRefining || !chatInput.trim()}
                      style={{
                        padding: '10px 16px',
                        borderRadius: 10,
                        border: 'none',
                        background: isRefining ? '#EDEBE9' : shellPalette.accent,
                        color: isRefining ? shellPalette.textSubtle : '#FFFFFF',
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: isRefining || !chatInput.trim() ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {isRefining ? '处理中...' : '发送'}
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ color: shellPalette.textMuted, fontSize: 12 }}>
                  对话面板已折叠。
                </div>
              )}
            </PaneCard>
          </div>
        </PaneSurface>
      );
    }

    if (activeLeftPaneSection === 'model') {
      return (
        <PaneSurface
          title="模型概览"
          subtitle="查看模型和字段。"
          borderSide="left"
          actions={(
            <button
              type="button"
              onClick={() => setShowRightPane(false)}
              title="收起设置"
              aria-label="收起设置"
              style={collapseChromeButtonStyle}
            >
              «
            </button>
          )}
        >
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
                      key={`${measure.table}-${measure.name}-${idx}`}
                      style={{
                        padding: 10,
                        borderRadius: 8,
                        border: `1px solid ${shellPalette.border}`,
                        background: shellPalette.ribbonMutedBg,
                      }}
                    >
                      <div style={{ color: shellPalette.text, fontSize: 12, fontWeight: 600 }}>{measure.name}</div>
                      <div style={{ marginTop: 4, color: shellPalette.textMuted, fontSize: 11 }}>
                        {measure.table}
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
        </PaneSurface>
      );
    }

    return (
        <PaneSurface
          title="开始"
          subtitle="开始当前工作流。"
        borderSide="left"
        actions={(
          <button
            type="button"
            onClick={() => setShowRightPane(false)}
            title="收起设置"
            aria-label="收起设置"
            style={collapseChromeButtonStyle}
          >
            «
          </button>
        )}
      >
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
      </PaneSurface>
    );
  };
  const renderRightPaneContent = () => {
    if (activeRightPaneTab === 'visuals') {
      return (
        <RightPaneSurface>
          <PaneTabs items={rightPaneTabs} activeId={activeRightPaneTab} onChange={setActiveRightPaneTab} />
          <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 12 }}>
            {renderImportSummaryList()}
          </div>
        </RightPaneSurface>
      );
    }

    if (activeRightPaneTab === 'fields') {
      return (
        <RightPaneSurface>
          <PaneTabs items={rightPaneTabs} activeId={activeRightPaneTab} onChange={setActiveRightPaneTab} />
          <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <PaneCard title="模型字段" subtitle="这里模拟 Power BI Desktop 的 Fields pane。">
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
                      key={`${measure.table}-${measure.name}-${idx}`}
                      style={{
                        padding: 10,
                        borderRadius: 8,
                        border: `1px solid ${shellPalette.border}`,
                        background: shellPalette.ribbonMutedBg,
                      }}
                    >
                      <div style={{ color: shellPalette.text, fontSize: 12, fontWeight: 600 }}>{measure.name}</div>
                      <div style={{ marginTop: 4, color: shellPalette.textMuted, fontSize: 11 }}>
                        {measure.table}
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
        </RightPaneSurface>
      );
    }

    return (
      <RightPaneSurface>
        <PaneTabs items={rightPaneTabs} activeId={activeRightPaneTab} onChange={setActiveRightPaneTab} />
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <PaneCard title="画布属性" subtitle="当前布局状态。">
            <div style={{ display: 'grid', gap: 10 }}>
              <InfoPill label="左侧导航" value={showLeftPane ? '显示中' : '已隐藏'} tone={showLeftPane ? 'accent' : 'default'} />
              <InfoPill label="右侧设置" value={showRightPane ? '显示中' : '已折叠'} tone={showRightPane ? 'accent' : 'default'} />
              <InfoPill label="DAX / 数据按钮" value={showInspectorActions ? '显示中' : '已隐藏'} tone={showInspectorActions ? 'success' : 'default'} />
            </div>
            <div style={{ marginTop: 12, color: shellPalette.textMuted, fontSize: 12, lineHeight: 1.6 }}>
              这里显示当前状态。
            </div>
          </PaneCard>
          <PaneCard title="当前状态" subtitle="当前报表、选中视觉对象和生成状态。">
            <div style={{ display: 'grid', gap: 10 }}>
              <InfoPill label="报表" value={currentReport?.name || '未生成'} tone={hasReport ? 'accent' : 'default'} />
              <InfoPill label="页面" value={String(currentPages.length)} />
              <InfoPill label="查询" value={String(currentQueries.length)} />
              <InfoPill label="选中视觉对象" value={activeImportedComponentId || '未选中'} tone={activeImportedComponentId ? 'success' : 'default'} />
            </div>
            {generationProgress ? (
              <div style={{ marginTop: 12, color: shellPalette.textMuted, fontSize: 12 }}>
                {generationProgress}
              </div>
            ) : null}
          </PaneCard>
          <PaneCard title="应用设置" subtitle="当前工作区上下文。">
            <div style={{ display: 'grid', gap: 10 }}>
              <InfoPill label="当前左侧上下文" value={activeLeftPaneMeta.label} tone="accent" />
              <InfoPill label="当前右侧页签" value={rightPaneTabs.find((tab) => tab.id === activeRightPaneTab)?.label || activeRightPaneTab} />
            </div>
            <div style={{ marginTop: 12, color: shellPalette.textMuted, fontSize: 12, lineHeight: 1.6 }}>
              相关入口都在顶部。
            </div>
          </PaneCard>
        </div>
      </RightPaneSurface>
    );
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
        title="展开设置"
        aria-label="展开设置"
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
            color: activeLeftPaneMeta.color,
            fontSize: 15,
            fontWeight: 800,
            lineHeight: 1,
          }}
        >
          «
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
          {activeLeftPaneMeta.label}
        </span>
      </button>
    </div>
  );
  const renderRibbonContent = () => {
    if (activeRibbonTab === 'data') {
      return (
        <>
          <RibbonGroup title="导入">
            <CommandButton
              icon={createGradientIcon('↓', '#60A5FA', '#2563EB')}
              label="导入 JSON"
              description="导入 Performance Analyzer 文件"
              onClick={openImportDialog}
              disabled={!isConnected || isImporting}
              tone="accent"
              showDescription={false}
            />
            <CommandButton
              icon={createGradientIcon('▥', '#34D399', '#0F8C72')}
              label="视觉对象"
              description="切换到导入设置并查看 visual 列表"
              onClick={() => {
                setActiveLeftPaneSection('import');
                setShowRightPane(true);
              }}
              showDescription={false}
            />
          </RibbonGroup>
          <RibbonGroup title="模型">
            <CommandButton
              icon={createGradientIcon('☰', '#FBBF24', '#F97316')}
              label="字段 pane"
              description="切换到模型设置并查看表与度量"
              onClick={() => {
                setActiveLeftPaneSection('model');
                setShowRightPane(true);
              }}
              showDescription={false}
            />
            <CommandButton
              icon={createGradientIcon('↺', '#4ADE80', '#0F8C72')}
              label="重新连接"
              description="刷新模型元数据"
              onClick={handleOpenConnectDialog}
              disabled={isConnecting || !apiUrl}
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
              icon={createGradientIcon('✧', '#A78BFA', '#7C3AED')}
              label={isGenerating ? '生成中...' : '生成报表'}
              description="根据模型元数据生成"
              onClick={handleGenerateReport}
              disabled={isGenerating}
              tone="accent"
              showDescription={false}
            />
            <CommandButton
              icon={createGradientIcon('◈', '#7DD3FC', '#3B82F6')}
              label="从导入生成"
              description="根据导入的展示型 visual 生成"
              onClick={handleAiGenerateFromImport}
              disabled={isGenerating || importableVisualCount === 0}
              showDescription={false}
            />
          </RibbonGroup>
          <RibbonGroup title="对话">
            <CommandButton
              icon={createGradientIcon('⋯', '#818CF8', '#4F46E5')}
              label={showChatPanel ? '收起对话' : '打开对话'}
              description="对当前报表继续微调"
              onClick={() => {
                setActiveLeftPaneSection('ai');
                handleToggleChatPanel();
              }}
              active={showChatPanel}
              showDescription={false}
            />
            <CommandButton
              icon={createGradientIcon('⚙', '#FDBA74', '#F97316')}
              label="AI 设置"
              description="配置 Provider、Key、Base URL"
              onClick={() => {
                setShowSettings(true);
                setAiTestStatus('idle');
                setAiTestMessage('');
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
              icon={createGradientIcon('«', '#34D399', '#0F8C72')}
              label={showRightPane ? '收起设置' : '展开设置'}
              description="折叠或展开右侧设置面板"
              onClick={() => setShowRightPane((prev) => !prev)}
              active={showRightPane}
              showDescription={false}
            />
            <CommandButton
              icon={createGradientIcon('⊞', '#7DD3FC', '#2563EB')}
              label={showInspectorActions ? '隐藏按钮' : '显示按钮'}
              description="控制图表右上角 DAX / 数据按钮"
              onClick={() => setShowInspectorActions((prev) => !prev)}
              active={showInspectorActions}
              showDescription={false}
            />
          </RibbonGroup>
          <RibbonGroup title="检查">
            <CommandButton
              icon={createGradientIcon('⌂', '#39D98A', '#0F8C72')}
              label="开始"
              description="切换到开始设置"
              onClick={() => {
                setActiveLeftPaneSection('start');
                setShowRightPane(true);
              }}
              active={activeLeftPaneSection === 'start'}
              showDescription={false}
            />
            <CommandButton
              icon={createGradientIcon('✦', '#A78BFA', '#7C3AED')}
              label="AI"
              description="定位到 AI 设置"
              onClick={() => {
                setActiveLeftPaneSection('ai');
                setShowRightPane(true);
              }}
              active={activeLeftPaneSection === 'ai'}
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
            icon={createGradientIcon('⊕', '#39D98A', '#0F8C72')}
            label={isConnected ? '已连接' : isConnecting ? '连接中...' : '连接数据源'}
            description={isConnected ? 'Power BI Desktop 已就绪' : '连接本地 Power BI Desktop'}
            onClick={handleOpenConnectDialog}
            disabled={!apiUrl}
            tone="accent"
            showDescription={false}
          />
          <CommandButton
            icon={createGradientIcon('×', '#FB7185', '#E11D48')}
            label="断开连接"
            description="清空模型和报表状态"
            onClick={handleDisconnect}
            disabled={!isConnected}
            showDescription={false}
          />
        </RibbonGroup>
        <RibbonGroup title="开始">
          <CommandButton
            icon={createGradientIcon('↓', '#60A5FA', '#2563EB')}
            label="导入 JSON"
            description="导入 Performance Analyzer 导出文件"
            onClick={openImportDialog}
            disabled={!isConnected || isImporting}
            tone="accent"
            showDescription={false}
          />
            <CommandButton
              icon={createGradientIcon('✦', '#A78BFA', '#7C3AED')}
              label="AI 工作区"
              description="切换到 AI 生成与对话区域"
              onClick={() => {
                setActiveLeftPaneSection('ai');
                setActiveRibbonTab('ai');
                setShowRightPane(true);
              }}
              showDescription={false}
            />
        </RibbonGroup>
        <RibbonGroup title="系统">
          <CommandButton
            icon={createGradientIcon('⚙', '#FDBA74', '#F97316')}
            label="设置"
            description="配置 AI Provider、Key 与 Base URL"
            onClick={() => {
              setShowSettings(true);
              setAiTestStatus('idle');
              setAiTestMessage('');
            }}
            showDescription={false}
          />
            <CommandButton
              icon={createGradientIcon('▦', '#FBBF24', '#F97316')}
              label="模型"
              description="切换到模型概览和字段浏览器"
              onClick={() => {
                setActiveLeftPaneSection('model');
                setActiveRibbonTab('data');
                setShowRightPane(true);
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
        <pre style={{ color: shellPalette.textMuted }}>{JSON.stringify(window.electronAPI, null, 2)}</pre>
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
      <input
        ref={importFileInputRef}
        type="file"
        accept=".json"
        onChange={handleImportPerformanceAnalyzer}
        disabled={!isConnected || isImporting}
        style={{ display: 'none' }}
      />
      <div style={{ display: 'flex', alignItems: 'stretch', background: shellPalette.ribbonBg }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <RibbonTabs items={ribbonTabs} activeId={activeRibbonTab} onChange={setActiveRibbonTab} />
        </div>
        <button
          type="button"
          onClick={() => setIsRibbonCollapsed((prev) => !prev)}
          title={isRibbonCollapsed ? '展开功能区' : '折叠功能区'}
          style={{
            width: 28,
            border: 'none',
            borderBottom: `1px solid ${shellPalette.border}`,
            borderLeft: `1px solid ${shellPalette.border}`,
            background: shellPalette.ribbonMutedBg,
            color: shellPalette.textSubtle,
            fontSize: 10,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {isRibbonCollapsed ? '▾' : '▴'}
        </button>
      </div>
      {!isRibbonCollapsed ? (
        <RibbonBar>
          {renderRibbonContent()}
        </RibbonBar>
      ) : null}
      <WorkspaceLayout
        leftWidth="56px"
        rightWidth={showRightPane ? '380px' : '28px'}
        leftPane={showLeftPane ? (
          <div style={{ minWidth: 0, minHeight: 0, display: 'flex', background: shellPalette.paneBg }}>
            <SideRail
              items={leftPaneItems}
              activeId={activeLeftPaneSection}
              onChange={(id) => {
                setActiveLeftPaneSection(id);
                setShowRightPane(true);
              }}
            />
          </div>
        ) : undefined}
        center={(
          <div style={{ minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', background: shellPalette.workspaceBg }}>
            <WorkspaceHeader
              title={hasReport ? (currentReport?.name || '报表画布') : '报表画布'}
              subtitle={hasReport
                ? `页面 ${currentPages.length} · 查询 ${currentQueries.length}${importSummary.length > 0 ? ` · 导入视觉对象 ${importSummary.length}` : ''}`
                : '连接模型、导入 JSON，或直接从 AI 工作区开始生成报表。'}
              actions={(
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <InfoPill label="查询" value={String(currentQueries.length)} />
                  <InfoPill label="Visual" value={String(importSummary.length)} tone={importSummary.length > 0 ? 'accent' : 'default'} />
                  <button
                    type="button"
                    onClick={() => setShowInspectorActions((prev) => !prev)}
                    style={{
                      padding: '6px 10px',
                      borderRadius: 999,
                      border: `1px solid ${shellPalette.border}`,
                      background: showInspectorActions ? shellPalette.accentSoft : shellPalette.ribbonMutedBg,
                      color: showInspectorActions ? shellPalette.accent : shellPalette.textMuted,
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {showInspectorActions ? '已显示 DAX 按钮' : '隐藏 DAX 按钮'}
                  </button>
                </div>
              )}
            />
            {!apiUrl ? (
              <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: shellPalette.textMuted }}>
                正在连接后端服务...
              </div>
            ) : !hasReport ? (
              <WorkspaceWelcome
                onConnect={handleOpenConnectDialog}
                onImport={openImportDialog}
                onGenerate={() => {
                  setActiveLeftPaneSection('ai');
                  setActiveRibbonTab('ai');
                }}
                onOpenAi={() => {
                  setActiveLeftPaneSection('ai');
                  setActiveRibbonTab('ai');
                  setShowChatPanel(true);
                }}
                isConnected={isConnected}
                hasImportedVisuals={hasImportedVisuals}
                canGenerate={isConnected && hasImportedVisuals}
                canOpenAi={hasReport}
              />
            ) : (
              <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 20 }}>
                <div
                  style={{
                    minHeight: '100%',
                    borderRadius: 14,
                    border: `1px solid ${shellPalette.border}`,
                    background: shellPalette.canvasBg,
                    boxShadow: shellPalette.shadow,
                    overflow: 'hidden',
                  }}
                >
                  <ReportRenderer
                    report={currentReport!}
                    pages={currentPages}
                    queries={currentQueries}
                    theme={sampleTheme}
                    dataSource={isConnected ? { type: 'local', connection: { server: connectionString, database: modelMetadata?.databaseName || connectionDatabase || 'Default' } } : sampleDataSource}
                    apiBaseUrl={apiUrl}
                    activeComponentId={activeImportedComponentId}
                    showInspectorActions={showInspectorActions}
                  />
                </div>
              </div>
            )}
          </div>
        )}
        rightPane={showRightPane ? renderLeftPaneContent() : renderCollapsedRightPane()}
      />

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
          onClick={() => setShowConnectDialog(false)}
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
              {createGradientIcon('◉', '#39D98A', '#0F8C72', 26, 12)}
              <div>
                <div style={{ color: shellPalette.text, fontSize: 18, fontWeight: 700 }}>
                  连接数据源
                </div>
                <div style={{ marginTop: 4, color: shellPalette.textMuted, fontSize: 12 }}>
                  选择连接模式并填写地址。
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
                  onClick={() => setConnectionMode('tabular')}
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
                    {connectionMode === 'pbi' ? 'Power BI Desktop 地址' : '服务器地址'}
                  </div>
                  <input
                    type="text"
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
                </div>

                {connectionMode === 'tabular' ? (
                  <div>
                    <div style={{ color: shellPalette.textMuted, fontSize: 12, marginBottom: 6 }}>
                      数据库名（可选）
                    </div>
                    <input
                      type="text"
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
                    ? '提示：在 Power BI Desktop 中使用“在 Excel 中分析”可看到当前本地 Analysis Services 端口，然后填入 localhost:端口。'
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
                }}
              >
                {aiTestStatus === 'testing' ? '测试中...' : '🔌 测试连接'}
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
                  <span style={{ fontSize: 14 }}>
                    {aiTestStatus === 'success' ? '✓' :
                     aiTestStatus === 'testing' ? '⏳' :
                     '✗'}
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
