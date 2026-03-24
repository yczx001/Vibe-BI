/**
 * Model Metadata Types
 * Power BI / Analysis Services 模型元数据类型
 */

export interface ModelMetadata {
  databaseName: string;
  compatibilityLevel: string;
  tables: TableInfo[];
  relationships: RelationshipInfo[];
  measures: MeasureInfo[];
}

export interface TableInfo {
  name: string;
  description?: string;
  isHidden: boolean;
  columns: ColumnInfo[];
  measures: MeasureInfo[];
}

export interface ColumnInfo {
  name: string;
  description?: string;
  dataType: string;
  isHidden: boolean;
  isKey: boolean;
  sortByColumn?: string;
}

export interface MeasureInfo {
  name: string;
  description?: string;
  expression?: string;
  formatString?: string;
  displayFolder?: string;
  tableName?: string;
}

export interface RelationshipInfo {
  name: string;
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
  cardinality: string;
}

// ============================================================================
// Query Result
// ============================================================================

export interface QueryResult {
  columns: ColumnSchema[];
  rows: Record<string, unknown>[];
  rowCount: number;
  executionTimeMs: number;
}

export interface ColumnSchema {
  name: string;
  dataType: string;
}

// ============================================================================
// API Request/Response Types
// ============================================================================

export interface ConnectRequest {
  connectionString: string;
}

export interface ExecuteQueryRequest {
  connectionString: string;
  dax: string;
}

export interface ExecuteBatchRequest {
  connectionString: string;
  queries: string[];
}

export interface GenerateReportRequest {
  connectionString: string;
  userPrompt: string;
  pageCount?: number;
  style?: string;
}

export interface GenerationProgress {
  step: string;
  progressPercent: number;
  message?: string;
  partialContent?: string;
  report?: ReportDefinition;
}

// Re-export from report.ts for convenience
import type { ReportDefinition, ReportPackage } from './report';
export type { ReportDefinition, ReportPackage };
