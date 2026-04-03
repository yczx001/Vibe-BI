import React from 'react';
import type { TableConfig, TableColumnConfig } from '@vibe-bi/core';
import { useTheme } from '../../theme/ThemeProvider';
import { mixColors, withAlpha } from '../../theme/colorUtils';
import { resolveFieldReference, toDisplayFieldLabel } from '../../utils/fieldResolution';

export interface DataTableProps {
  config: TableConfig;
  data: unknown[];
  style?: React.CSSProperties;
}

export function DataTable({ config, data, style }: DataTableProps) {
  const theme = useTheme();
  const dividerColor = withAlpha(theme.colors.text, 0.1);
  const zebraColor = withAlpha(theme.colors.primary, 0.05);
  const rows = React.useMemo(() => data.filter((row): row is Record<string, unknown> => (
    !!row && typeof row === 'object' && !Array.isArray(row)
  )), [data]);
  const availableFields = React.useMemo(() => {
    if (rows.length === 0) {
      return [];
    }

    return Object.keys(rows[0]).filter((field) => field !== '__rowIndex');
  }, [rows]);

  // Auto-generate columns from data if no columns defined
  const columns = React.useMemo<TableColumnConfig[]>(() => {
    if (config.columns && config.columns.length > 0) {
      return config.columns.map((col) => ({
        ...col,
        field: resolveFieldReference(col.field, availableFields) || col.field,
        header: col.header || col.title || (
          resolveFieldReference(col.field, availableFields) !== col.field
            ? col.field
            : toDisplayFieldLabel(col.field) || col.field
        ),
      }));
    }
    if (rows.length === 0) {
      return [];
    }
    return availableFields
      .map((key) => ({
        field: key,
        header: toDisplayFieldLabel(key) || key,
      }));
  }, [availableFields, config.columns, rows.length]);

  if (rows.length === 0) {
    return (
      <div
        style={{
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: theme.colors.textSecondary,
        }}
      >
        No data
      </div>
    );
  }

  if (columns.length === 0) {
    return (
      <div
        style={{
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: theme.colors.textSecondary,
        }}
      >
        No columns defined
      </div>
    );
  }

  return (
    <div
      style={{
        height: '100%',
        overflow: 'auto',
        padding: 16,
        borderRadius: theme.components.card.borderRadius,
        background: `linear-gradient(180deg, ${withAlpha(mixColors(theme.colors.surface, '#FFFFFF', 0.88, theme.colors.surface), 0.98)} 0%, ${withAlpha(mixColors(theme.colors.surface, theme.colors.background, 0.8, theme.colors.surface), 0.96)} 100%)`,
        border: `1px solid ${withAlpha(theme.colors.text, 0.08)}`,
        boxShadow: theme.components.card.shadow,
        ...style,
      }}
    >
      {config.title && (
        <div
          style={{
            textAlign: 'left',
            color: theme.colors.text,
            fontSize: 15,
            fontWeight: 700,
            lineHeight: 1.3,
            marginBottom: 12,
            paddingBottom: 10,
            borderBottom: `1px solid ${dividerColor}`,
          }}
        >
          {config.title}
        </div>
      )}
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: 14,
        }}
      >
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.field}
                style={{
                  padding: '12px 14px',
                  textAlign: col.align || 'left',
                  borderBottom: `1px solid ${dividerColor}`,
                  color: theme.colors.textSecondary,
                  fontWeight: 700,
                  width: typeof col.width === 'number'
                    ? `${col.width}px`
                    : col.width,
                  background: withAlpha(theme.colors.surface, 0.72),
                  position: 'sticky',
                  top: 0,
                  backdropFilter: 'blur(8px)',
                }}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr
              key={rowIndex}
              style={{
                backgroundColor: rowIndex % 2 === 0 ? 'transparent' : zebraColor,
              }}
            >
              {columns.map((col) => {
                const value = row[col.field];
                return (
                  <td
                    key={`${col.field}-${col.header}`}
                    style={{
                      padding: '12px 14px',
                      borderBottom: `1px solid ${dividerColor}`,
                      color: theme.colors.text,
                      textAlign: col.align || 'left',
                      fontWeight: rowIndex === 0 ? 600 : 500,
                    }}
                  >
                    {formatValue(value, col.format)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatValue(value: unknown, format?: { type: string; decimals?: number }): string {
  if (value === null || value === undefined) return '-';

  if (format?.type === 'number') {
    const num = Number(value);
    if (!isNaN(num)) {
      return num.toLocaleString('zh-CN', {
        minimumFractionDigits: format.decimals || 0,
        maximumFractionDigits: format.decimals || 0,
      });
    }
  }

  return String(value);
}
