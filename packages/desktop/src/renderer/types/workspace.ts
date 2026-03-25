import type {
  ChartType,
  ComponentDefinition,
  QueryResult,
} from '@vibe-bi/core';

export interface TableMetadata {
  name: string;
  columns: Array<{
    name: string;
    dataType: string;
    isHidden?: boolean;
    isKey?: boolean;
    sortByColumn?: string;
  }>;
}

export interface MeasureMetadata {
  name: string;
  expression?: string;
  tableName?: string;
}

export interface ModelMetadata {
  databaseName: string;
  tables: TableMetadata[];
  measures: MeasureMetadata[];
  relationships: unknown[];
}

export type WorkspaceMode = 'report' | 'data';
export type DatasetCreationMode = 'library' | 'import-json' | 'custom-dax' | 'query-builder';
export type DatasetImportMode = 'incremental' | 'replace';
export type ImportedVisualCategory = 'display' | 'functional' | 'decorative' | 'custom';
export type DatasetVisualType = ChartType | 'kpi-card' | 'data-table' | 'filter';
export type DatasetQueryMode = 'import-json' | 'custom-dax' | 'query-builder';
export type QueryBuilderOperator = 'equals' | 'contains';
export type QueryBuilderSelectionKind = 'column' | 'measure';

export interface DatasetField {
  name: string;
  dataType: string;
  isVisible: boolean;
}

export interface DatasetChart {
  id: string;
  name: string;
  componentType: ComponentDefinition['type'];
  chartType: DatasetVisualType;
  isVisible: boolean;
}

export interface ImportSummaryItem {
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
  queryMode: DatasetQueryMode;
  sourceLabel: string;
  isVisible: boolean;
  fields: DatasetField[];
  charts: DatasetChart[];
  previewResult?: QueryResult;
}

export interface CustomDatasetDraft {
  name: string;
  dax: string;
  chartType: DatasetVisualType;
}

export interface QueryBuilderFilter {
  id: string;
  fieldId: string;
  tableName: string;
  fieldName: string;
  dataType: string;
  operator: QueryBuilderOperator;
  value: string;
}

export interface QueryBuilderSelection {
  id: string;
  kind: QueryBuilderSelectionKind;
  tableName: string;
  name: string;
  dataType?: string;
}

export interface QueryBuilderDraft {
  name: string;
  selections: QueryBuilderSelection[];
  filters: QueryBuilderFilter[];
  chartType: DatasetVisualType;
}
