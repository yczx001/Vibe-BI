/**
 * Vibe BI Core Types
 * 前后端共享的报表定义类型系统
 */

// ============================================================================
// Report Definition
// ============================================================================

export interface ReportDefinition {
  formatVersion: string;
  id: string;
  name: string;
  description?: string;
  author?: string;
  createdAt: string;
  modifiedAt: string;
  generationMode?: 'ai-generated' | 'manual' | 'imported';
  renderMode?: 'grid' | 'html-page' | 'freeform-html' | 'creative-html';
  pages: string[];
  defaultPage?: string;
  theme?: ThemeDefinition;
  runtimeHints?: ReportRuntimeHints;
}

export interface ReportRuntimeHints {
  filterPlacement?: 'top' | 'left' | 'right';
  styleFamily?: string;
  layoutArchetype?: string;
  designTone?: string;
}

// ============================================================================
// Data Source
// ============================================================================

export interface DataSourceConfig {
  type: 'power-bi-xmla' | 'ssas' | 'tabular-server' | 'local';
  connection: ConnectionConfig;
  model?: ModelSnapshot;
}

export interface ConnectionConfig {
  server: string;
  database: string;
  authMethod?: 'windows' | 'service-principal' | 'basic' | 'anonymous';
}

import type { RelationshipInfo } from './metadata';

export interface ModelSnapshot {
  tables: TableSnapshot[];
  relationships: RelationshipInfo[];
}

export interface TableSnapshot {
  name: string;
  columns: string[];
  measures: MeasureSnapshot[];
}

export interface MeasureSnapshot {
  name: string;
  expression?: string;
}

// ============================================================================
// Page & Layout
// ============================================================================

export interface PageDefinition {
  id: string;
  name: string;
  layout?: LayoutConfig;
  filters: FilterDefinition[];
  components: ComponentDefinition[];
  html?: string;
  css?: string;
  js?: string;
  template?: string;
  stylesheet?: string;
  script?: string;
  bindings?: FreeformBindingDefinition[];
  viewport?: CreativeViewportConfig;
}

export interface CreativeViewportConfig {
  width?: number;
  height?: number;
  mode?: 'fixed' | 'responsive';
}

export interface LayoutConfig {
  type: 'grid';
  columns: number;
  rowHeight: number;
  gap: number;
  padding: number;
}

export type FreeformBindingKind = 'value' | 'metric' | 'table' | 'list' | 'chart' | 'text' | 'html';
export type BindingFieldSemanticRole =
  | 'dimension'
  | 'category'
  | 'measure'
  | 'metric'
  | 'date'
  | 'text'
  | 'identifier'
  | 'structural'
  | 'unknown';

export interface BindingFieldSchema {
  name: string;
  label?: string;
  dataType?: string;
  semanticRole?: BindingFieldSemanticRole;
  isRecommended?: boolean;
  isStructural?: boolean;
  isVisible?: boolean;
}

export interface FreeformBindingDefinition {
  name: string;
  kind: FreeformBindingKind;
  queryRef?: string;
  alias?: string;
  field?: string;
  fields?: string[];
  categoryField?: string;
  valueField?: string;
  secondaryField?: string;
  label?: string;
  description?: string;
  shapeHint?: 'rows' | 'value' | 'series' | 'matrix' | 'list';
  columns?: string[];
  schema?: BindingFieldSchema[];
  recommendedFields?: string[];
  structuralFields?: string[];
  chartType?: ChartType;
  orientation?: 'vertical' | 'horizontal';
  limit?: number;
  format?: ValueFormat;
  emptyText?: string;
  itemTemplate?: string;
  className?: string;
}

// ============================================================================
// Filters
// ============================================================================

export interface FilterDefinition {
  id: string;
  type: 'date-range' | 'dropdown' | 'multi-select' | 'text' | 'number';
  target: FilterTarget;
  default?: FilterDefault;
}

export interface FilterTarget {
  table: string;
  column: string;
}

export interface FilterDefault {
  relative?: 'last-7-days' | 'last-30-days' | 'last-90-days' | 'last-12-months' | 'this-year' | 'last-year';
  value?: unknown;
}

// ============================================================================
// Components
// ============================================================================

export type ComponentType = 'echarts' | 'kpi-card' | 'data-table' | 'text' | 'filter';

export interface ComponentDefinition {
  id: string;
  type: ComponentType;
  position: PositionConfig;
  queryRef?: string;
  config?: ChartConfig | KpiConfig | TableConfig | TextConfig | FilterComponentConfig;
  style?: ComponentStyle;
}

export interface PositionConfig {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ComponentStyle {
  backgroundColor?: string;
  borderRadius?: string | number;
  boxShadow?: string;
  padding?: string | number;
}

// ============================================================================
// Chart Config (ECharts)
// ============================================================================

export type ChartType = 'line' | 'bar' | 'pie' | 'area' | 'scatter' | 'radar' | 'gauge';

export interface ChartConfig {
  chartType: ChartType;
  orientation?: 'vertical' | 'horizontal';
  title?: string;
  xAxis?: AxisConfig;
  yAxis?: AxisConfig[];
  series: SeriesConfig[];
  legend?: LegendConfig;
  tooltip?: TooltipConfig;
  dataLabels?: DataLabelsConfig;
}

export interface AxisConfig {
  field: string;
  type: 'category' | 'value' | 'time';
  name?: string;
  format?: string;
}

export interface SeriesConfig {
  field: string;
  type: ChartType;
  name?: string;
  smooth?: boolean;
  stack?: string;
  color?: string;
}

export interface LegendConfig {
  show?: boolean;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

export interface TooltipConfig {
  show?: boolean;
  trigger?: 'item' | 'axis';
}

export interface DataLabelsConfig {
  show?: boolean;
  position?: 'inside' | 'outside' | 'center';
}

// ============================================================================
// KPI Card Config
// ============================================================================

export interface KpiConfig {
  title: string;
  valueField: string;
  format?: ValueFormat;
  comparison?: ComparisonConfig;
  comparisonField?: string;
  compareField?: string;
  comparisonTitle?: string;
  showCompare?: boolean;
  icon?: string;
}

export interface ValueFormat {
  type: 'number' | 'currency' | 'percentage' | 'custom';
  currency?: string;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  customFormat?: string;
}

export interface ComparisonConfig {
  type: 'previous-period' | 'previous-year' | 'target';
  label?: string;
  targetField?: string;
}

// ============================================================================
// Table Config
// ============================================================================

export interface TableConfig {
  title?: string;
  columns: TableColumnConfig[];
  pagination?: PaginationConfig;
  sortable?: boolean;
  filterable?: boolean;
}

export interface TableColumnConfig {
  field: string;
  header: string;
  title?: string;
  width?: number | string;
  align?: 'left' | 'center' | 'right';
  sortable?: boolean;
  format?: ValueFormat;
}

export interface PaginationConfig {
  enabled: boolean;
  pageSize: number;
}

// ============================================================================
// Text Config
// ============================================================================

export interface TextConfig {
  content: string;
  html?: boolean;
  fontSize?: number;
  fontWeight?: 'normal' | 'bold' | 'lighter';
  color?: string;
  align?: 'left' | 'center' | 'right';
}

// ============================================================================
// Filter Component Config
// ============================================================================

export interface FilterComponentConfig {
  filterId: string;
  label?: string;
  placeholder?: string;
  definition?: FilterDefinition;
}

// ============================================================================
// Queries
// ============================================================================

export interface QueryDefinition {
  id: string;
  name: string;
  dax: string;
  executionDax?: string;
  evaluateQueries?: string[];
  selectedEvaluateIndex?: number;
  parameters: QueryParameter[];
  cache?: QueryCacheConfig;
}

export interface QueryParameter {
  name: string;
  filterRef?: string;
  applyTo?: string;
}

export interface QueryCacheConfig {
  ttl: number;
  strategy: 'stale-while-revalidate' | 'cache-first' | 'no-cache';
}

// ============================================================================
// Theme
// ============================================================================

export interface ThemeDefinition {
  name: string;
  colors: ThemeColors;
  typography: ThemeTypography;
  components: ThemeComponents;
}

export interface ThemeColors {
  primary: string;
  secondary: string;
  background: string;
  surface: string;
  text: string;
  textSecondary: string;
  chart: string[];
}

export interface ThemeTypography {
  fontFamily: string;
  h1?: TypographyStyle;
  h2?: TypographyStyle;
  h3?: TypographyStyle;
  body?: TypographyStyle;
  kpiValue?: TypographyStyle;
}

export interface TypographyStyle {
  size: number;
  weight: number | string;
}

export interface ThemeComponents {
  card: ComponentTheme;
  button?: ComponentTheme;
  input?: ComponentTheme;
}

export interface ComponentTheme {
  borderRadius: number;
  shadow: string;
  padding: number;
}

// ============================================================================
// Report Package (Complete)
// ============================================================================

export interface ReportPackage {
  manifest: ReportDefinition;
  dataSource: DataSourceConfig;
  pages: PageDefinition[];
  queries: QueryDefinition[];
  theme: ThemeDefinition;
  assets?: Record<string, Uint8Array>;
  aiContext?: unknown;
}
