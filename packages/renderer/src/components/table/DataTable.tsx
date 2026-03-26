import React from 'react';
import type { TableConfig, TableColumnConfig } from '@vibe-bi/core';
import { useTheme } from '../../theme/ThemeProvider';
import { mixColors, withAlpha } from '../../theme/colorUtils';

export interface DataTableProps {
  config: TableConfig;
  data: unknown[];
  style?: React.CSSProperties;
}

export function DataTable({ config, data, style }: DataTableProps) {
  const theme = useTheme();
  const dividerColor = withAlpha(theme.colors.text, 0.1);
  const zebraColor = withAlpha(theme.colors.primary, 0.05);

  // Auto-generate columns from data if no columns defined
  const columns = React.useMemo<TableColumnConfig[]>(() => {
    if (config.columns && config.columns.length > 0) {
      return config.columns.map((col) => ({
        ...col,
        header: col.header || col.title || col.field,
      }));
    }
    if (!data || data.length === 0) {
      return [];
    }
    // Generate columns from first data row
    const firstRow = data[0] as Record<string, unknown>;
    return Object.keys(firstRow)
      .filter((key) => key !== '__rowIndex')
      .map((key) => ({
        field: key,
        header: key,
      }));
  }, [config.columns, data]);

  if (!data || data.length === 0) {
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
            fontSize: 18,
            fontWeight: 700,
            marginBottom: 14,
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
          {data.map((row, rowIndex) => (
            <tr
              key={rowIndex}
              style={{
                backgroundColor: rowIndex % 2 === 0 ? 'transparent' : zebraColor,
              }}
            >
              {columns.map((col) => {
                const value = (row as Record<string, unknown>)[col.field];
                return (
                  <td
                    key={col.field}
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
