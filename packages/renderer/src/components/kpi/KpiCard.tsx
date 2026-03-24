import React from 'react';
import type { KpiConfig, ValueFormat } from '@vibe-bi/core';
import { useTheme } from '../../theme/ThemeProvider';

export interface KpiCardProps {
  config: KpiConfig;
  data: unknown[];
  style?: React.CSSProperties;
}

export function KpiCard({ config, data, style }: KpiCardProps) {
  const theme = useTheme();

  const valueField = React.useMemo(() => {
    if (config.valueField) {
      return config.valueField;
    }

    if (!data || data.length === 0) {
      return '';
    }

    const row = data[0] as Record<string, unknown>;
    const numericField = Object.keys(row).find((field) => {
      if (field === '__rowIndex') {
        return false;
      }

      const value = row[field];
      return typeof value === 'number' || (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value)));
    });

    return numericField || Object.keys(row).find((field) => field !== '__rowIndex') || '';
  }, [config.valueField, data]);

  const value = React.useMemo(() => {
    if (!data || data.length === 0) return null;
    const row = data[0] as Record<string, unknown>;
    return row[valueField];
  }, [data, valueField]);

  const comparisonValue = React.useMemo(() => {
    if (!config.comparison || !data || data.length === 0) return null;
    const row = data[0] as Record<string, unknown>;
    if (config.comparison.targetField) {
      return row[config.comparison.targetField];
    }
    return null;
  }, [data, config.comparison]);

  const formattedValue = React.useMemo(() => {
    if (value === null || value === undefined) return '-';
    return formatValue(value, config.format);
  }, [value, config.format]);

  const percentChange = React.useMemo(() => {
    if (value === null || comparisonValue === null) return null;
    const current = Number(value);
    const previous = Number(comparisonValue);
    if (previous === 0) return null;
    return ((current - previous) / previous) * 100;
  }, [value, comparisonValue]);

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
        backgroundColor: theme.colors.surface,
        borderRadius: theme.components.card.borderRadius,
        boxShadow: theme.components.card.shadow,
        border: '1px solid rgba(32, 31, 30, 0.08)',
        textAlign: 'center',
        ...style,
      }}
    >
      <div
        style={{
          fontSize: 14,
          color: theme.colors.textSecondary,
          marginBottom: 8,
          fontWeight: 600,
        }}
      >
        {config.title}
      </div>
      <div
        style={{
          fontSize: 36,
          fontWeight: 700,
          color: theme.colors.text,
          marginBottom: 8,
        }}
      >
        {formattedValue}
      </div>
      {percentChange !== null && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 14,
            color: percentChange >= 0 ? '#10B981' : '#EF4444',
          }}
        >
          <span>{percentChange >= 0 ? '▲' : '▼'}</span>
          <span>{Math.abs(percentChange).toFixed(1)}%</span>
          {config.comparison?.label && (
            <span style={{ color: theme.colors.textSecondary, marginLeft: 4 }}>
              {config.comparison.label}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function formatValue(value: unknown, format?: ValueFormat): string {
  if (value === null || value === undefined) return '-';

  const num = Number(value);
  if (isNaN(num)) return String(value);

  const type = format?.type || 'number';
  const decimals = format?.decimals ?? 0;

  switch (type) {
    case 'currency':
      const currency = format?.currency || 'CNY';
      return new Intl.NumberFormat('zh-CN', {
        style: 'currency',
        currency,
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }).format(num);

    case 'percentage':
      return `${(num * 100).toFixed(decimals)}%`;

    case 'custom':
      return format?.customFormat?.replace('{value}', num.toFixed(decimals)) || num.toFixed(decimals);

    case 'number':
    default:
      return new Intl.NumberFormat('zh-CN', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }).format(num);
  }
}
