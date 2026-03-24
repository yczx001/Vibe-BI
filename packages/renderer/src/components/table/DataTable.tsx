import React from 'react';
import type { TableConfig, TableColumnConfig } from '@vibe-bi/core';
import { useTheme } from '../../theme/ThemeProvider';

export interface DataTableProps {
  config: TableConfig;
  data: unknown[];
  style?: React.CSSProperties;
}

export function DataTable({ config, data, style }: DataTableProps) {
  const theme = useTheme();
  const dividerColor = 'rgba(32, 31, 30, 0.12)';
  const zebraColor = 'rgba(15, 108, 189, 0.04)';

  // Auto-generate columns from data if no columns defined
  const columns = React.useMemo<TableColumnConfig[]>(() => {
    if (config.columns && config.columns.length > 0) {
      return config.columns;
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
        ...style,
      }}
    >
      {config.title && (
        <div
          style={{
            textAlign: 'center',
            color: theme.colors.text,
            fontSize: 16,
            fontWeight: 600,
            marginBottom: 12,
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
                  padding: '12px 16px',
                  textAlign: 'left',
                  borderBottom: `1px solid ${dividerColor}`,
                  color: theme.colors.textSecondary,
                  fontWeight: 600,
                  width: col.width ? `${col.width}px` : undefined,
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
                      padding: '12px 16px',
                      borderBottom: `1px solid ${dividerColor}`,
                      color: theme.colors.text,
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
