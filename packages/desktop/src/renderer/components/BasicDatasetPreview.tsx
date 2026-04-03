import React from 'react';
import type { QueryResult } from '@vibe-bi/core';
import type { DatasetVisualType } from '../types/workspace';
import { shellPalette } from './DesktopShell';

interface BasicDatasetPreviewProps {
  datasetName: string;
  chartType: DatasetVisualType;
  result: QueryResult;
}

type PreviewRow = Record<string, unknown>;

type PreviewPoint = {
  label: string;
  value: number;
  color: string;
};

const previewPalette = ['#94A3B8', '#64748B', '#3B82F6', '#0EA5E9', '#14B8A6', '#F59E0B'];

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

function getFieldNames(result: QueryResult): string[] {
  return result.columns
    .map((column) => column.name)
    .filter((field) => field !== '__rowIndex');
}

function getNumericFields(rows: PreviewRow[], fields: string[]): string[] {
  return fields.filter((field) => rows.some((row) => isNumericLike(row[field])));
}

function getCategoryField(rows: PreviewRow[], fields: string[], valueFields: string[]): string {
  const categoryField = fields.find((field) => {
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

  return fields.find((field) => !valueFields.includes(field)) || '__rowIndex';
}

function getPieCategoryField(rows: PreviewRow[], fields: string[], valueFields: string[]): string {
  const dimensionFields = fields.filter((field) => !valueFields.includes(field));
  const rankedFields = dimensionFields
    .map((field) => ({
      field,
      distinctCount: new Set(
        rows
          .map((row) => row[field])
          .filter((value) => value !== null && value !== undefined && String(value).trim() !== '')
          .map((value) => String(value))
      ).size,
      temporal: isTemporalFieldName(field) || rows.some((row) => isTemporalFieldValue(row[field])),
    }))
    .filter((item) => item.distinctCount > 0)
    .sort((a, b) => {
      if (a.temporal !== b.temporal) {
        return a.temporal ? 1 : -1;
      }
      return a.distinctCount - b.distinctCount;
    });

  return rankedFields[0]?.field || getCategoryField(rows, fields, valueFields);
}

function formatFieldLabel(field: string): string {
  return field
    .replace(/'/g, '')
    .replace(/\[|\]/g, '')
    .replace(/__/g, ' ')
    .trim();
}

function normalizeNumber(value: unknown): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  return 0;
}

function formatMetricValue(value: number): string {
  return new Intl.NumberFormat('zh-CN', {
    notation: Math.abs(value) >= 10000 ? 'compact' : 'standard',
    maximumFractionDigits: Math.abs(value) >= 100 ? 0 : 1,
  }).format(value);
}

function formatPreviewCellValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'number') {
    return new Intl.NumberFormat('zh-CN', {
      maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
    }).format(value);
  }

  if (typeof value === 'boolean') {
    return value ? '是' : '否';
  }

  if (value instanceof Date) {
    return value.toLocaleDateString('zh-CN');
  }

  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

function buildSeriesPreview(
  chartType: DatasetVisualType,
  result: QueryResult
): { categoryField: string; valueField: string; points: PreviewPoint[] } | null {
  const rows = (result.rows || []) as PreviewRow[];
  const fields = getFieldNames(result);
  const numericFields = getNumericFields(rows, fields);
  const valueField = numericFields[0] || fields.find((field) => field !== fields[0]) || fields[0] || '';

  if (!valueField || rows.length === 0) {
    return null;
  }

  if (chartType === 'pie') {
    const categoryField = getPieCategoryField(rows, fields, [valueField]);
    const aggregated = new Map<string, number>();

    rows.forEach((row, index) => {
      const label = String(row[categoryField] ?? row.__rowIndex ?? index + 1);
      aggregated.set(label, (aggregated.get(label) || 0) + normalizeNumber(row[valueField]));
    });

    const points = Array.from(aggregated.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([label, value], index) => ({
        label,
        value,
        color: previewPalette[index % previewPalette.length],
      }));

    return points.length > 0
      ? { categoryField, valueField, points }
      : null;
  }

  const categoryField = getCategoryField(rows, fields, [valueField]);
  const points = rows
    .slice(0, 6)
    .map((row, index) => ({
      label: String(row[categoryField] ?? row.__rowIndex ?? index + 1),
      value: normalizeNumber(row[valueField]),
      color: previewPalette[index % previewPalette.length],
    }));

  return points.length > 0
    ? { categoryField, valueField, points }
    : null;
}

function renderKpiPreview(datasetName: string, result: QueryResult) {
  const rows = (result.rows || []) as PreviewRow[];
  const fields = getFieldNames(result);
  const numericFields = getNumericFields(rows, fields);
  const valueField = numericFields[0] || fields[0] || '';
  const value = rows.length > 0 ? normalizeNumber(rows[0]?.[valueField]) : 0;

  return (
    <div
      style={{
        height: '100%',
        border: `1px solid ${shellPalette.border}`,
        borderRadius: 10,
        background: '#FFFFFF',
        display: 'grid',
        gridTemplateRows: 'auto auto 1fr',
        gap: 10,
        padding: 16,
        boxSizing: 'border-box',
      }}
    >
      <div style={{ color: shellPalette.text, fontSize: 13, fontWeight: 700 }}>
        {datasetName}
      </div>
      <div style={{ color: shellPalette.textMuted, fontSize: 11 }}>
        KPI · {formatFieldLabel(valueField) || '数值'}
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end' }}>
        <div style={{ color: shellPalette.text, fontSize: 36, fontWeight: 700, lineHeight: 1 }}>
          {formatMetricValue(value)}
        </div>
      </div>
    </div>
  );
}

function renderPiePreview(datasetName: string, model: { categoryField: string; valueField: string; points: PreviewPoint[] }) {
  const total = model.points.reduce((sum, point) => sum + point.value, 0);
  let cursor = 0;
  const segments = model.points.map((point) => {
    const portion = total > 0 ? (point.value / total) * 100 : 0;
    const segment = `${point.color} ${cursor}% ${cursor + portion}%`;
    cursor += portion;
    return segment;
  }).join(', ');

  return (
    <div
      style={{
        height: '100%',
        border: `1px solid ${shellPalette.border}`,
        borderRadius: 10,
        background: '#FFFFFF',
        display: 'grid',
        gridTemplateRows: 'auto auto minmax(0, 1fr)',
        gap: 12,
        padding: 16,
        boxSizing: 'border-box',
      }}
    >
      <div style={{ color: shellPalette.text, fontSize: 13, fontWeight: 700 }}>
        {datasetName}
      </div>
      <div style={{ color: shellPalette.textMuted, fontSize: 11 }}>
        饼图 · {formatFieldLabel(model.categoryField)} / {formatFieldLabel(model.valueField)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '120px minmax(0, 1fr)', gap: 16, alignItems: 'center', minHeight: 0 }}>
        <div
          style={{
            width: 120,
            height: 120,
            borderRadius: '50%',
            background: segments ? `conic-gradient(${segments})` : '#E5E7EB',
            border: `1px solid ${shellPalette.border}`,
            position: 'relative',
            justifySelf: 'center',
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: 28,
              borderRadius: '50%',
              background: '#FFFFFF',
              border: `1px solid ${shellPalette.border}`,
            }}
          />
        </div>
        <div style={{ display: 'grid', gap: 8, minWidth: 0 }}>
          {model.points.map((point) => (
            <div
              key={point.label}
              style={{
                display: 'grid',
                gridTemplateColumns: '10px minmax(0, 1fr) auto auto',
                gap: 8,
                alignItems: 'center',
                minWidth: 0,
              }}
            >
              <span style={{ width: 10, height: 10, borderRadius: 2, background: point.color }} />
              <span
                style={{
                  color: shellPalette.text,
                  fontSize: 11,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {point.label}
              </span>
              <span style={{ color: shellPalette.textMuted, fontSize: 11 }}>
                {formatMetricValue(point.value)}
              </span>
              <span style={{ color: shellPalette.textMuted, fontSize: 11 }}>
                {total > 0 ? `${((point.value / total) * 100).toFixed(0)}%` : '0%'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function renderCartesianPreview(
  datasetName: string,
  chartType: DatasetVisualType,
  model: { categoryField: string; valueField: string; points: PreviewPoint[] }
) {
  const width = 620;
  const height = 220;
  const paddingLeft = 38;
  const paddingRight = 18;
  const paddingTop = 18;
  const paddingBottom = 38;
  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;
  const maxValue = Math.max(...model.points.map((point) => point.value), 1);
  const step = model.points.length > 1 ? chartWidth / (model.points.length - 1) : chartWidth;
  const points = model.points.map((point, index) => {
    const x = paddingLeft + (model.points.length === 1 ? chartWidth / 2 : step * index);
    const y = paddingTop + chartHeight - (point.value / maxValue) * chartHeight;
    return { ...point, x, y };
  });
  const polylinePoints = points.map((point) => `${point.x},${point.y}`).join(' ');
  const areaPoints = `${paddingLeft},${paddingTop + chartHeight} ${polylinePoints} ${paddingLeft + chartWidth},${paddingTop + chartHeight}`;

  return (
    <div
      style={{
        height: '100%',
        border: `1px solid ${shellPalette.border}`,
        borderRadius: 10,
        background: '#FFFFFF',
        display: 'grid',
        gridTemplateRows: 'auto auto minmax(0, 1fr) auto',
        gap: 12,
        padding: 16,
        boxSizing: 'border-box',
      }}
    >
      <div style={{ color: shellPalette.text, fontSize: 13, fontWeight: 700 }}>
        {datasetName}
      </div>
      <div style={{ color: shellPalette.textMuted, fontSize: 11 }}>
        {chartType === 'line' ? '折线图' : chartType === 'area' ? '面积图' : chartType === 'scatter' ? '散点图' : '柱状图'}
        {' · '}
        {formatFieldLabel(model.categoryField)} / {formatFieldLabel(model.valueField)}
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: '100%', minHeight: 180 }}>
        <line x1={paddingLeft} y1={paddingTop} x2={paddingLeft} y2={paddingTop + chartHeight} stroke="#CBD5E1" strokeWidth="1" />
        <line x1={paddingLeft} y1={paddingTop + chartHeight} x2={paddingLeft + chartWidth} y2={paddingTop + chartHeight} stroke="#CBD5E1" strokeWidth="1" />
        {[0, 0.5, 1].map((ratio) => {
          const y = paddingTop + chartHeight - ratio * chartHeight;
          return (
            <line
              key={ratio}
              x1={paddingLeft}
              y1={y}
              x2={paddingLeft + chartWidth}
              y2={y}
              stroke="#E2E8F0"
              strokeWidth="1"
              strokeDasharray="4 4"
            />
          );
        })}
        {chartType === 'bar' && points.map((point) => {
          const barWidth = Math.min(44, chartWidth / Math.max(model.points.length * 1.8, 1));
          return (
            <rect
              key={point.label}
              x={point.x - (barWidth / 2)}
              y={point.y}
              width={barWidth}
              height={paddingTop + chartHeight - point.y}
              fill="#94A3B8"
              stroke="#64748B"
              strokeWidth="1"
            />
          );
        })}
        {chartType === 'area' && (
          <polygon points={areaPoints} fill="rgba(148, 163, 184, 0.28)" />
        )}
        {chartType !== 'bar' && chartType !== 'scatter' && (
          <polyline
            points={polylinePoints}
            fill="none"
            stroke="#475569"
            strokeWidth="2"
          />
        )}
        {points.map((point) => (
          <circle
            key={point.label}
            cx={point.x}
            cy={point.y}
            r={chartType === 'scatter' ? 5 : 3.5}
            fill={chartType === 'scatter' ? point.color : '#475569'}
            stroke="#FFFFFF"
            strokeWidth="1.5"
          />
        ))}
      </svg>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${Math.max(model.points.length, 1)}, minmax(0, 1fr))`,
          gap: 8,
        }}
      >
        {model.points.map((point) => (
          <div key={point.label} style={{ minWidth: 0 }}>
            <div
              style={{
                color: shellPalette.text,
                fontSize: 11,
                fontWeight: 600,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {point.label}
            </div>
            <div style={{ color: shellPalette.textMuted, fontSize: 11, marginTop: 4 }}>
              {formatMetricValue(point.value)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function renderDataTablePreview(datasetName: string, result: QueryResult) {
  const rows = (result.rows || []) as PreviewRow[];
  const fields = getFieldNames(result);
  const numericFields = new Set(getNumericFields(rows, fields));
  const dimensionFields = fields.filter((field) => !numericFields.has(field));
  const groupedFields = dimensionFields.slice(0, 2);
  const previewRows = rows.slice(0, 10).map((row, rowIndex) => {
    if (rowIndex === 0 || groupedFields.length === 0) {
      return row;
    }

    const previousRow = rows[rowIndex - 1];
    const collapsedRow: PreviewRow = { ...row };

    groupedFields.forEach((field, fieldIndex) => {
      const parentFields = groupedFields.slice(0, fieldIndex);
      const parentMatches = parentFields.every((parentField) => (
        String(previousRow[parentField] ?? '') === String(row[parentField] ?? '')
      ));
      const currentValue = String(row[field] ?? '');
      const previousValue = String(previousRow[field] ?? '');

      if (parentMatches && currentValue && currentValue === previousValue) {
        collapsedRow[field] = '';
      }
    });

    return collapsedRow;
  });

  return (
    <div
      style={{
        height: '100%',
        border: `1px solid ${shellPalette.border}`,
        borderRadius: 10,
        background: '#FFFFFF',
        display: 'grid',
        gridTemplateRows: 'auto auto minmax(0, 1fr)',
        gap: 12,
        padding: 16,
        boxSizing: 'border-box',
      }}
    >
      <div style={{ color: shellPalette.text, fontSize: 13, fontWeight: 700 }}>
        {datasetName}
      </div>
      <div style={{ color: shellPalette.textMuted, fontSize: 11 }}>
        透视表预览 · {fields.length} 列 / {rows.length} 行
      </div>
      <div
        style={{
          minHeight: 0,
          overflow: 'auto',
          borderRadius: 10,
          border: `1px solid ${shellPalette.border}`,
          background: '#F8FAFC',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 11 }}>
          <thead>
            <tr>
              {fields.map((field) => {
                const isNumericField = numericFields.has(field);
                return (
                  <th
                    key={field}
                    style={{
                      position: 'sticky',
                      top: 0,
                      zIndex: 1,
                      padding: '10px 12px',
                      textAlign: isNumericField ? 'right' : 'left',
                      color: shellPalette.text,
                      background: '#E2E8F0',
                      borderBottom: `1px solid ${shellPalette.border}`,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {formatFieldLabel(field) || field}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {previewRows.map((row, rowIndex) => (
              <tr key={String(row.__rowIndex ?? rowIndex)}>
                {fields.map((field, fieldIndex) => {
                  const isNumericField = numericFields.has(field);
                  const isGroupedField = groupedFields.includes(field);
                  const isBlankRepeatedValue = String(row[field] ?? '') === '' && isGroupedField && rowIndex > 0;

                  return (
                    <td
                      key={`${rowIndex}-${field}`}
                      style={{
                        padding: '9px 12px',
                        textAlign: isNumericField ? 'right' : 'left',
                        color: isBlankRepeatedValue ? 'transparent' : shellPalette.text,
                        fontWeight: isGroupedField && !isBlankRepeatedValue ? 600 : 400,
                        background: fieldIndex < groupedFields.length ? '#F8FAFC' : rowIndex % 2 === 0 ? '#FFFFFF' : '#FBFDFF',
                        borderBottom: `1px solid ${shellPalette.border}`,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {formatPreviewCellValue(row[field])}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function BasicDatasetPreview({ datasetName, chartType, result }: BasicDatasetPreviewProps) {
  const previewContent = React.useMemo(() => {
    if (chartType === 'kpi-card') {
      return renderKpiPreview(datasetName, result);
    }

    if (chartType === 'data-table') {
      return renderDataTablePreview(datasetName, result);
    }

    const model = buildSeriesPreview(chartType, result);
    if (!model) {
      return (
        <div
          style={{
            height: '100%',
            border: `1px solid ${shellPalette.border}`,
            borderRadius: 10,
            background: '#FFFFFF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: shellPalette.textMuted,
            fontSize: 12,
            padding: 16,
            boxSizing: 'border-box',
          }}
        >
          当前数据还不足以生成基础图表预览。
        </div>
      );
    }

    if (chartType === 'pie') {
      return renderPiePreview(datasetName, model);
    }

    return renderCartesianPreview(datasetName, chartType, model);
  }, [chartType, datasetName, result]);

  return (
    <div style={{ height: '100%', minHeight: 0 }}>
      {previewContent}
    </div>
  );
}
