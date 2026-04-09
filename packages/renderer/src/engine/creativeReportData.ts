import type { QueryDefinition } from '@vibe-bi/core';

type DataRow = Record<string, unknown>;

export interface CreativeMetricItem {
  queryRef: string;
  queryName: string;
  label: string;
  field: string;
  rawValue: number | null;
  formattedValue: string;
  secondaryField?: string;
  secondaryRawValue?: number | null;
  secondaryFormattedValue?: string;
}

export interface CreativeSeriesPoint {
  label: string;
  value: number | null;
  secondaryValue?: number | null;
  raw: DataRow;
}

export interface CreativeSeriesItem {
  queryRef: string;
  queryName: string;
  label: string;
  kind: 'trend' | 'category' | 'ranking';
  categoryField?: string;
  valueField?: string;
  secondaryField?: string;
  points: CreativeSeriesPoint[];
}

export interface CreativeMatrixColumn {
  key: string;
  label: string;
}

export interface CreativeMatrixRow {
  key: string;
  label: string;
  total?: number | null;
  cells: Array<number | null>;
}

export interface CreativeMatrixItem {
  queryRef: string;
  queryName: string;
  label: string;
  rowField?: string;
  columnField?: string;
  valueField?: string;
  columns: CreativeMatrixColumn[];
  rows: CreativeMatrixRow[];
}

export interface CreativeTableItem {
  queryRef: string;
  queryName: string;
  label: string;
  columns: string[];
  rows: DataRow[];
}

export interface CreativeQuerySemanticSummary {
  queryRef: string;
  queryName: string;
  kind: 'metric' | 'trend' | 'category' | 'ranking' | 'matrix' | 'table' | 'unknown';
  rowCount: number;
  columns: string[];
  label?: string;
  categoryField?: string;
  valueField?: string;
  recommendedFields?: string[];
  structuralFields?: string[];
}

export interface CreativeFilterOption {
  queryRef: string;
  queryName: string;
  field: string;
  label: string;
  values: string[];
}

export interface CreativeSectionSemanticSummary {
  heroMetricRef?: string;
  primaryTrendRef?: string;
  primaryCategoryRef?: string;
  primaryRankingRef?: string;
  primaryMatrixRef?: string;
  primaryTableRef?: string;
}

export type CreativeRequiredZoneKey =
  | 'filter-bar'
  | 'hero-zone'
  | 'kpi-belt'
  | 'trend-zone'
  | 'ranking-zone'
  | 'detail-zone';

export interface CreativeRequiredZone {
  key: CreativeRequiredZoneKey;
  label: string;
  required: boolean;
  ready: boolean;
  primaryQueryRef?: string;
}

export interface CreativeViewModelHints {
  heroMetricRef?: string;
  secondaryMetricRefs: string[];
  trendRef?: string;
  categoryRef?: string;
  rankingRef?: string;
  detailRef?: string;
  detailKind: 'matrix' | 'table' | 'none';
  filterQueryRefs: string[];
  missingZones: CreativeRequiredZoneKey[];
  renderFlow: string[];
  filterMode: 'canonical-runtime-filters';
  emptyStatePolicy: 'real-data-only';
}

export interface CreativeReportData {
  generatedAt: string;
  contractVersion: 'parity-v1';
  profile: 'parity-operational-single-page' | 'generic-creative';
  layoutProfile: 'boardroom-editorial' | 'generic-creative';
  explicitParityLane: boolean;
  requiredZones: CreativeRequiredZone[];
  queryMap: Record<string, CreativeQuerySemanticSummary>;
  metrics: CreativeMetricItem[];
  secondaryMetrics: CreativeMetricItem[];
  heroMetric: CreativeMetricItem | null;
  trends: CreativeSeriesItem[];
  primaryTrend: CreativeSeriesItem | null;
  categories: CreativeSeriesItem[];
  primaryCategory: CreativeSeriesItem | null;
  rankings: CreativeSeriesItem[];
  primaryRanking: CreativeSeriesItem | null;
  matrices: CreativeMatrixItem[];
  primaryMatrix: CreativeMatrixItem | null;
  tables: CreativeTableItem[];
  primaryTable: CreativeTableItem | null;
  filterOptions: CreativeFilterOption[];
  sections: CreativeSectionSemanticSummary;
  viewModelHints: CreativeViewModelHints;
}

const TEMPORAL_FIELD_RE = /(date|time|month|year|week|quarter|period|年月|月份|日期|时间|年度|年份|月|周|季度)/i;
const TREND_NAME_RE = /(trend|timeline|history|time|monthly|按年月|年月|趋势|月度|时间)/i;
const RANKING_NAME_RE = /(rank|top|排行|排名|按船舶|按.*排名|top\s*\d+)/i;
const MATRIX_NAME_RE = /(matrix|明细|透视|pivot|交叉)/i;
const TOTAL_MARKER_RE = /(grand.?total|合计|总计|subtotal)/i;
const PARITY_STYLE_FAMILY = 'boardroom-editorial';
const PARITY_LAYOUT_ARCHETYPE = 'parity-operational-single-page';

export function buildCreativeReportData(
  queries: Array<Pick<QueryDefinition, 'id' | 'name'>>,
  rowsByQuery: Record<string, DataRow[]>,
  options?: {
    styleFamily?: string | null;
    layoutArchetype?: string | null;
  },
): CreativeReportData {
  const metricItems: CreativeMetricItem[] = [];
  const trendItems: CreativeSeriesItem[] = [];
  const categoryItems: CreativeSeriesItem[] = [];
  const rankingItems: CreativeSeriesItem[] = [];
  const matrixItems: CreativeMatrixItem[] = [];
  const tableItems: CreativeTableItem[] = [];
  const queryMap: Record<string, CreativeQuerySemanticSummary> = {};

  queries.forEach((query) => {
    const rows = rowsByQuery[query.id] || [];
    const summary = summarizeQuery(query.id, query.name, rows);
    queryMap[query.id] = summary.semantic;

    if (summary.metric) {
      metricItems.push(summary.metric);
    }

    if (summary.series) {
      if (summary.series.kind === 'trend') {
        trendItems.push(summary.series);
      } else if (summary.series.kind === 'ranking') {
        rankingItems.push(summary.series);
      } else {
        categoryItems.push(summary.series);
      }
    }

    if (summary.matrix) {
      matrixItems.push(summary.matrix);
    }

    if (summary.table) {
      tableItems.push(summary.table);
    }
  });

  const sortedMetrics = sortMetricItems(metricItems);
  const heroMetric = sortedMetrics[0] || null;
  const secondaryMetrics = sortedMetrics.slice(1, 6);
  const explicitParityLane = isExplicitParityLane(options);
  const filterOptions = buildFilterOptions(queries, rowsByQuery);
  const requiredZones = buildRequiredZones({
    heroMetric,
    secondaryMetrics,
    trendItems,
    categoryItems,
    rankingItems,
    matrixItems,
    tableItems,
    filterOptions,
    parityRequired: explicitParityLane,
  });
  const viewModelHints = buildViewModelHints({
    heroMetric,
    secondaryMetrics,
    trendItems,
    categoryItems,
    rankingItems,
    matrixItems,
    tableItems,
    filterOptions,
    requiredZones,
  });

  const layoutProfile = explicitParityLane ? 'boardroom-editorial' : 'generic-creative';

  return {
    generatedAt: new Date().toISOString(),
    contractVersion: 'parity-v1',
    profile: layoutProfile === 'boardroom-editorial' ? 'parity-operational-single-page' : 'generic-creative',
    layoutProfile,
    explicitParityLane,
    requiredZones,
    queryMap,
    metrics: sortedMetrics,
    secondaryMetrics,
    heroMetric,
    trends: trendItems,
    primaryTrend: trendItems[0] || null,
    categories: categoryItems,
    primaryCategory: categoryItems[0] || null,
    rankings: rankingItems,
    primaryRanking: rankingItems[0] || null,
    matrices: matrixItems,
    primaryMatrix: matrixItems[0] || null,
    tables: tableItems,
    primaryTable: tableItems[0] || null,
    filterOptions,
    sections: {
      heroMetricRef: heroMetric?.queryRef,
      primaryTrendRef: trendItems[0]?.queryRef,
      primaryCategoryRef: categoryItems[0]?.queryRef,
      primaryRankingRef: rankingItems[0]?.queryRef,
      primaryMatrixRef: matrixItems[0]?.queryRef,
      primaryTableRef: tableItems[0]?.queryRef,
    },
    viewModelHints,
  };
}

function buildRequiredZones(input: {
  heroMetric: CreativeMetricItem | null;
  secondaryMetrics: CreativeMetricItem[];
  trendItems: CreativeSeriesItem[];
  categoryItems: CreativeSeriesItem[];
  rankingItems: CreativeSeriesItem[];
  matrixItems: CreativeMatrixItem[];
  tableItems: CreativeTableItem[];
  filterOptions: CreativeFilterOption[];
  parityRequired: boolean;
}): CreativeRequiredZone[] {
  return [
    {
      key: 'filter-bar',
      label: 'Integrated filters',
      required: input.parityRequired,
      ready: input.filterOptions.length > 0,
      primaryQueryRef: input.filterOptions[0]?.queryRef,
    },
    {
      key: 'hero-zone',
      label: 'Dominant hero',
      required: input.parityRequired,
      ready: Boolean(input.heroMetric),
      primaryQueryRef: input.heroMetric?.queryRef,
    },
    {
      key: 'kpi-belt',
      label: 'KPI belt',
      required: input.parityRequired,
      ready: input.secondaryMetrics.length >= 2,
      primaryQueryRef: input.secondaryMetrics[0]?.queryRef || input.heroMetric?.queryRef,
    },
    {
      key: 'trend-zone',
      label: 'Primary trend',
      required: input.parityRequired,
      ready: input.trendItems.length > 0,
      primaryQueryRef: input.trendItems[0]?.queryRef,
    },
    {
      key: 'ranking-zone',
      label: 'Comparison / ranking',
      required: input.parityRequired,
      ready: input.rankingItems.length > 0 || input.categoryItems.length > 0,
      primaryQueryRef: input.rankingItems[0]?.queryRef || input.categoryItems[0]?.queryRef,
    },
    {
      key: 'detail-zone',
      label: 'Detail zone',
      required: input.parityRequired,
      ready: input.matrixItems.length > 0 || input.tableItems.length > 0,
      primaryQueryRef: input.matrixItems[0]?.queryRef || input.tableItems[0]?.queryRef,
    },
  ];
}

function buildViewModelHints(input: {
  heroMetric: CreativeMetricItem | null;
  secondaryMetrics: CreativeMetricItem[];
  trendItems: CreativeSeriesItem[];
  categoryItems: CreativeSeriesItem[];
  rankingItems: CreativeSeriesItem[];
  matrixItems: CreativeMatrixItem[];
  tableItems: CreativeTableItem[];
  filterOptions: CreativeFilterOption[];
  requiredZones: CreativeRequiredZone[];
}): CreativeViewModelHints {
  const detailMatrix = input.matrixItems[0];
  const detailTable = input.tableItems[0];

  return {
    heroMetricRef: input.heroMetric?.queryRef,
    secondaryMetricRefs: input.secondaryMetrics.map((item) => item.queryRef),
    trendRef: input.trendItems[0]?.queryRef,
    categoryRef: input.categoryItems[0]?.queryRef,
    rankingRef: input.rankingItems[0]?.queryRef,
    detailRef: detailMatrix?.queryRef || detailTable?.queryRef,
    detailKind: detailMatrix ? 'matrix' : detailTable ? 'table' : 'none',
    filterQueryRefs: Array.from(new Set(input.filterOptions.map((item) => item.queryRef))),
    missingZones: input.requiredZones.filter((zone) => zone.required && !zone.ready).map((zone) => zone.key),
    renderFlow: ['deriveView', 'renderHero', 'renderKpis', 'renderTrend', 'renderStructure', 'renderDetail', 'wireInteractions'],
    filterMode: 'canonical-runtime-filters',
    emptyStatePolicy: 'real-data-only',
  };
}

function isExplicitParityLane(options?: {
  styleFamily?: string | null;
  layoutArchetype?: string | null;
}): boolean {
  return normalizeFieldToken(String(options?.styleFamily || '')) === normalizeFieldToken(PARITY_STYLE_FAMILY)
    && normalizeFieldToken(String(options?.layoutArchetype || '')) === normalizeFieldToken(PARITY_LAYOUT_ARCHETYPE);
}

function summarizeQuery(
  queryRef: string,
  queryName: string,
  rows: DataRow[],
): {
  semantic: CreativeQuerySemanticSummary;
  metric?: CreativeMetricItem;
  series?: CreativeSeriesItem;
  matrix?: CreativeMatrixItem;
  table?: CreativeTableItem;
} {
  const normalizedRows = rows.filter((row) => isDataRow(row));
  const columns = collectColumns(normalizedRows);
  const numericFields = columns.filter((field) => isNumericField(field, normalizedRows));
  const temporalFields = columns.filter((field) => isTemporalField(field, normalizedRows));
  const textFields = columns.filter((field) => !numericFields.includes(field));
  const nonIndexNumericFields = numericFields.filter((field) => normalizeFieldToken(field) !== 'columnindex');

  const semantic: CreativeQuerySemanticSummary = {
    queryRef,
    queryName,
    kind: 'unknown',
    rowCount: normalizedRows.length,
    columns,
    recommendedFields: [],
    structuralFields: [],
  };

  if (normalizedRows.length === 0 || columns.length === 0) {
    return {
      semantic: { ...semantic, kind: 'table', label: queryName },
      table: {
        queryRef,
        queryName,
        label: queryName,
        columns,
        rows: [],
      } satisfies CreativeTableItem,
    };
  }

  const matrix = tryBuildMatrix(queryRef, queryName, normalizedRows, textFields, nonIndexNumericFields);
  if (matrix) {
    return {
      semantic: {
        ...semantic,
        kind: 'matrix',
        label: matrix.label,
        categoryField: matrix.rowField,
        valueField: matrix.valueField,
        recommendedFields: [matrix.rowField, matrix.valueField].filter((value): value is string => Boolean(value)),
        structuralFields: [matrix.columnField].filter((value): value is string => Boolean(value)),
      },
      matrix,
      table: {
        queryRef,
        queryName,
        label: queryName,
        columns,
        rows: normalizedRows.slice(0, 24),
      },
    };
  }

  if (normalizedRows.length <= 2 && nonIndexNumericFields.length >= 1) {
    const metric = buildMetric(queryRef, queryName, normalizedRows[0], nonIndexNumericFields);
    if (metric) {
      return {
        semantic: {
          ...semantic,
          kind: 'metric',
          label: metric.label,
          valueField: metric.field,
          recommendedFields: [metric.field, metric.secondaryField].filter((value): value is string => Boolean(value)),
        },
        metric,
      };
    }
  }

  const series = buildSeries(queryRef, queryName, normalizedRows, temporalFields, textFields, nonIndexNumericFields);
  if (series) {
    const semanticKind: CreativeQuerySemanticSummary['kind'] = series.kind;
    return {
      semantic: {
        ...semantic,
        kind: semanticKind,
        label: series.label,
        categoryField: series.categoryField,
        valueField: series.valueField,
        recommendedFields: [series.categoryField, series.valueField, series.secondaryField].filter((value): value is string => Boolean(value)),
        structuralFields: [series.categoryField].filter((value): value is string => Boolean(value)),
      },
      series,
      table: series.kind === 'ranking'
        ? {
          queryRef,
          queryName,
          label: queryName,
          columns,
          rows: normalizedRows.slice(0, 16),
        }
        : undefined,
    };
  }

  return {
    semantic: {
      ...semantic,
      kind: 'table',
      label: queryName,
    },
    table: {
      queryRef,
      queryName,
      label: queryName,
      columns,
      rows: normalizedRows.slice(0, 24),
    },
  };
}

function buildMetric(
  queryRef: string,
  queryName: string,
  row: DataRow,
  numericFields: string[],
): CreativeMetricItem | null {
  const primaryField = numericFields[0];
  if (!primaryField) {
    return null;
  }

  const secondaryField = numericFields.find((field) => field !== primaryField);
  const primaryValue = toNumber(row[primaryField]);
  const secondaryValue = secondaryField ? toNumber(row[secondaryField]) : null;

  return {
    queryRef,
    queryName,
    label: cleanLabel(primaryField, queryName),
    field: primaryField,
    rawValue: primaryValue,
    formattedValue: formatCompactNumber(primaryValue),
    secondaryField,
    secondaryRawValue: secondaryValue,
    secondaryFormattedValue: secondaryField ? formatCompactNumber(secondaryValue) : undefined,
  };
}

function buildSeries(
  queryRef: string,
  queryName: string,
  rows: DataRow[],
  temporalFields: string[],
  textFields: string[],
  numericFields: string[],
): CreativeSeriesItem | null {
  const categoryField = temporalFields[0] || pickCategoryField(textFields, rows);
  const valueField = numericFields[0];
  const secondaryField = numericFields.find((field) => field !== valueField);
  if (!categoryField || !valueField) {
    return null;
  }

  const points = rows
    .filter((row) => !isTotalRow(row))
    .map((row) => ({
      label: String(row[categoryField] ?? '-'),
      value: toNumber(row[valueField]),
      secondaryValue: secondaryField ? toNumber(row[secondaryField]) : null,
      raw: row,
    }));

  if (points.length === 0) {
    return null;
  }

  const kind = resolveSeriesKind(queryName, categoryField, temporalFields, points.length);
  const normalizedPoints = kind === 'ranking'
    ? points.sort((left, right) => (right.value ?? Number.NEGATIVE_INFINITY) - (left.value ?? Number.NEGATIVE_INFINITY)).slice(0, 12)
    : kind === 'category'
      ? points.slice(0, 10)
      : points.slice(0, 18);

  return {
    queryRef,
    queryName,
    label: queryName,
    kind,
    categoryField,
    valueField,
    secondaryField,
    points: normalizedPoints,
  };
}

function tryBuildMatrix(
  queryRef: string,
  queryName: string,
  rows: DataRow[],
  textFields: string[],
  numericFields: string[],
): CreativeMatrixItem | null {
  const hasColumnIndex = rows.some((row) => Object.keys(row).some((key) => normalizeFieldToken(key) === 'columnindex'));
  if (!hasColumnIndex && !MATRIX_NAME_RE.test(queryName)) {
    return null;
  }

  const rowField = pickMatrixRowField(textFields, rows);
  const valueField = pickMatrixValueField(numericFields);
  const columnField = pickMatrixColumnField(textFields, rows, rowField);
  if (!rowField || !valueField) {
    return null;
  }

  const columnMap = new Map<string, string>();
  const grouped = new Map<string, { label: string; total?: number | null; cells: Map<string, number | null> }>();

  rows.forEach((row) => {
    if (isTotalRow(row)) {
      return;
    }

    const rowLabel = String(row[rowField] ?? '').trim();
    if (!rowLabel) {
      return;
    }

    const rawColumnLabel = columnField ? String(row[columnField] ?? '').trim() : '';
    const rawColumnIndex = getColumnIndexValue(row);
    const columnKey = rawColumnLabel || (rawColumnIndex !== null ? String(rawColumnIndex) : 'value');
    const columnLabel = rawColumnLabel || `列 ${columnKey}`;
    const numericValue = toNumber(row[valueField]);

    if (!columnMap.has(columnKey)) {
      columnMap.set(columnKey, columnLabel);
    }

    if (!grouped.has(rowLabel)) {
      grouped.set(rowLabel, {
        label: rowLabel,
        total: null,
        cells: new Map<string, number | null>(),
      });
    }

    const entry = grouped.get(rowLabel)!;
    const normalizedIndex = rawColumnIndex ?? -1;
    if (normalizedIndex >= 12 || TOTAL_MARKER_RE.test(columnLabel.toLowerCase())) {
      entry.total = numericValue;
      return;
    }

    entry.cells.set(columnKey, numericValue);
  });

  const columns = Array.from(columnMap.entries())
    .sort((left, right) => compareColumnKeys(left[0], right[0]))
    .slice(0, 12)
    .map(([key, label]) => ({ key, label }));

  const matrixRows = Array.from(grouped.values())
    .map((entry) => ({
      key: entry.label,
      label: entry.label,
      total: entry.total ?? sumMatrixValues(entry.cells),
      cells: columns.map((column) => entry.cells.get(column.key) ?? null),
    }))
    .sort((left, right) => (right.total ?? Number.NEGATIVE_INFINITY) - (left.total ?? Number.NEGATIVE_INFINITY))
    .slice(0, 14);

  if (columns.length === 0 || matrixRows.length === 0) {
    return null;
  }

  return {
    queryRef,
    queryName,
    label: queryName,
    rowField,
    columnField,
    valueField,
    columns,
    rows: matrixRows,
  };
}

function sortMetricItems(items: CreativeMetricItem[]): CreativeMetricItem[] {
  return [...items].sort((left, right) => Math.abs(right.rawValue ?? Number.NEGATIVE_INFINITY) - Math.abs(left.rawValue ?? Number.NEGATIVE_INFINITY));
}

function buildFilterOptions(
  queries: Array<Pick<QueryDefinition, 'id' | 'name'>>,
  rowsByQuery: Record<string, DataRow[]>,
): CreativeFilterOption[] {
  const options: CreativeFilterOption[] = [];

  queries.forEach((query) => {
    const rows = rowsByQuery[query.id] || [];
    if (rows.length === 0) {
      return;
    }

    const columns = collectColumns(rows);
    const candidateFields = columns.filter((field) => {
      if (isNumericField(field, rows)) {
        return false;
      }
      const count = distinctCount(rows, field);
      return count >= 2 && count <= 18;
    });

    candidateFields.slice(0, 3).forEach((field) => {
      const values = Array.from(
        new Set(
          rows
            .map((row) => row[field])
            .filter((value) => value !== null && value !== undefined && String(value).trim() !== '')
            .map((value) => String(value))
        )
      ).slice(0, 18);

      if (values.length < 2) {
        return;
      }

      options.push({
        queryRef: query.id,
        queryName: query.name,
        field,
        label: cleanLabel(field, query.name),
        values,
      });
    });
  });

  return options;
}

function resolveSeriesKind(
  queryName: string,
  categoryField: string,
  temporalFields: string[],
  pointCount: number,
): CreativeSeriesItem['kind'] {
  if (TREND_NAME_RE.test(queryName) || temporalFields.includes(categoryField) || TEMPORAL_FIELD_RE.test(categoryField)) {
    return 'trend';
  }

  if (RANKING_NAME_RE.test(queryName) || pointCount > 10) {
    return 'ranking';
  }

  return 'category';
}

function pickCategoryField(textFields: string[], rows: DataRow[]): string | undefined {
  return textFields.find((field) => distinctCount(rows, field) > 1)
    || textFields[0];
}

function pickMatrixRowField(textFields: string[], rows: DataRow[]): string | undefined {
  const candidates = textFields.filter((field) => !TEMPORAL_FIELD_RE.test(field) && normalizeFieldToken(field) !== 'isgrandtotalrowtotal');
  return candidates.find((field) => distinctCount(rows, field) > 1)
    || candidates[0]
    || textFields[0];
}

function pickMatrixColumnField(textFields: string[], rows: DataRow[], rowField?: string): string | undefined {
  const candidates = textFields.filter((field) => field !== rowField && normalizeFieldToken(field) !== 'isgrandtotalcolumntotal');
  return candidates.find((field) => TEMPORAL_FIELD_RE.test(field))
    || candidates.find((field) => distinctCount(rows, field) > 1)
    || candidates[0];
}

function pickMatrixValueField(numericFields: string[]): string | undefined {
  return numericFields.find((field) => !['columnindex', 'sortbydm00'].includes(normalizeFieldToken(field)))
    || numericFields[0];
}

function getColumnIndexValue(row: DataRow): number | null {
  const key = Object.keys(row).find((field) => normalizeFieldToken(field) === 'columnindex');
  return key ? toNumber(row[key]) : null;
}

function sumMatrixValues(cells: Map<string, number | null>): number | null {
  const values = Array.from(cells.values()).filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (values.length === 0) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0);
}

function compareColumnKeys(left: string, right: string): number {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
    return leftNumber - rightNumber;
  }

  return left.localeCompare(right, 'zh-CN');
}

function distinctCount(rows: DataRow[], field: string): number {
  return new Set(rows.map((row) => String(row[field] ?? '')).filter(Boolean)).size;
}

function isTemporalField(field: string, rows: DataRow[]): boolean {
  if (TEMPORAL_FIELD_RE.test(field)) {
    return true;
  }

  const sampleValues = rows.slice(0, 10).map((row) => row[field]).filter((value) => value !== null && value !== undefined);
  return sampleValues.some((value) => looksTemporalValue(value));
}

function looksTemporalValue(value: unknown): boolean {
  if (typeof value === 'number') {
    return value >= 1900 && value <= 2100;
  }

  if (typeof value !== 'string') {
    return false;
  }

  const trimmed = value.trim();
  return /^\d{4}[-/]\d{1,2}([-/]\d{1,2})?$/.test(trimmed)
    || /^\d{1,2}月$/.test(trimmed)
    || /^\d{4}年$/.test(trimmed)
    || /^\d{4}年\d{1,2}月$/.test(trimmed);
}

function isNumericField(field: string, rows: DataRow[]): boolean {
  const sampleValues = rows.slice(0, 12).map((row) => row[field]).filter((value) => value !== null && value !== undefined && value !== '');
  if (sampleValues.length === 0) {
    return false;
  }

  const numericCount = sampleValues.filter((value) => Number.isFinite(toNumber(value))).length;
  return numericCount / sampleValues.length >= 0.75;
}

function collectColumns(rows: DataRow[]): string[] {
  return Array.from(new Set(rows.flatMap((row) => Object.keys(row)).filter((field) => field !== '__rowIndex')));
}

function isDataRow(value: unknown): value is DataRow {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isTotalRow(row: DataRow): boolean {
  return Object.entries(row).some(([key, value]) => (
    TOTAL_MARKER_RE.test(key.toLowerCase())
    && (value === true || String(value).toLowerCase() === 'true')
  ));
}

function cleanLabel(field: string, fallback: string): string {
  const normalized = field
    .replace(/^[^[\]]+\[/, '')
    .replace(/\]$/, '')
    .replace(/^[_-]+|[_-]+$/g, '')
    .replace(/[._]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized || fallback;
}

function normalizeFieldToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/['"`]/g, '')
    .replace(/[[\]()（）{}]/g, '')
    .replace(/[_\-\s./\\:：|]+/g, '');
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string') {
    const cleaned = value.replace(/,/g, '').trim();
    if (!cleaned) {
      return null;
    }
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function formatCompactNumber(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return '-';
  }

  const absolute = Math.abs(value);
  if (absolute >= 100000000) {
    return `${(value / 100000000).toFixed(2)}亿`;
  }
  if (absolute >= 10000) {
    return `${(value / 10000).toFixed(1)}万`;
  }
  if (absolute >= 1000) {
    return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1 }).format(value);
  }
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(value);
}
