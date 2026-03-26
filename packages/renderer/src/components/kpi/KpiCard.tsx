import React from 'react';
import type { KpiConfig, ValueFormat } from '@vibe-bi/core';
import { useTheme } from '../../theme/ThemeProvider';
import { mixColors, withAlpha } from '../../theme/colorUtils';

export interface KpiCardProps {
  config: KpiConfig;
  data: unknown[];
  style?: React.CSSProperties;
}

export function KpiCard({ config, data, style }: KpiCardProps) {
  const theme = useTheme();
  const configAliases = config as KpiConfig & {
    comparisonField?: string;
    compareField?: string;
    comparisonTitle?: string;
    showCompare?: boolean;
  };

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
    if (!data || data.length === 0) return null;
    const row = data[0] as Record<string, unknown>;
    const targetField = config.comparison?.targetField
      || configAliases.comparisonField
      || configAliases.compareField;

    if (targetField) {
      return row[targetField];
    }
    return null;
  }, [data, config.comparison, configAliases.comparisonField, configAliases.compareField]);

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
        justifyContent: 'space-between',
        alignItems: 'stretch',
        padding: 22,
        background: `linear-gradient(180deg, ${withAlpha(mixColors(theme.colors.surface, '#FFFFFF', 0.88, theme.colors.surface), 0.98)} 0%, ${withAlpha(mixColors(theme.colors.surface, theme.colors.background, 0.8, theme.colors.surface), 0.98)} 100%)`,
        borderRadius: theme.components.card.borderRadius,
        boxShadow: theme.components.card.shadow,
        border: `1px solid ${withAlpha(theme.colors.text, 0.08)}`,
        textAlign: 'left',
        position: 'relative',
        overflow: 'hidden',
        ...style,
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 4,
          background: `linear-gradient(90deg, ${theme.colors.primary} 0%, ${theme.colors.secondary} 100%)`,
          opacity: 0.92,
        }}
      />
      <div
        style={{
          fontSize: 11,
          letterSpacing: 0.9,
          color: theme.colors.textSecondary,
          marginBottom: 12,
          fontWeight: 700,
        }}
      >
        KPI SNAPSHOT
      </div>
      <div style={{ display: 'grid', gap: 8 }}>
        <div
          style={{
            fontSize: 16,
            fontWeight: 700,
            color: theme.colors.text,
            lineHeight: 1.25,
          }}
        >
          {config.title}
        </div>
        <div
          style={{
            fontSize: 38,
            fontWeight: 800,
            color: theme.colors.text,
            lineHeight: 1,
            letterSpacing: -1.2,
          }}
        >
          {formattedValue}
        </div>
      </div>
      {(percentChange !== null || configAliases.showCompare) && (
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            alignSelf: 'flex-start',
            gap: 6,
            padding: '8px 10px',
            borderRadius: 999,
            fontSize: 12,
            fontWeight: 700,
            background: percentChange !== null && percentChange >= 0
              ? 'rgba(16, 185, 129, 0.12)'
              : 'rgba(239, 68, 68, 0.10)',
            color: percentChange !== null && percentChange >= 0 ? '#0F8C72' : '#D14343',
          }}
        >
          {percentChange !== null ? (
            <>
              <span>{percentChange >= 0 ? '▲' : '▼'}</span>
              <span>{Math.abs(percentChange).toFixed(1)}%</span>
            </>
          ) : null}
          <span style={{ color: theme.colors.textSecondary, marginLeft: percentChange !== null ? 4 : 0 }}>
            {config.comparison?.label || configAliases.comparisonTitle || '对比'}
          </span>
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
  const prefix = format?.prefix || '';
  const suffix = format?.suffix || '';

  const wrapValue = (text: string) => `${prefix}${text}${suffix}`;

  switch (type) {
    case 'currency': {
      const currency = format?.currency || 'CNY';
      return wrapValue(new Intl.NumberFormat('zh-CN', {
        style: 'currency',
        currency,
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }).format(num));
    }

    case 'percentage':
      return wrapValue(`${(num * 100).toFixed(decimals)}%`);

    case 'custom':
      return wrapValue(format?.customFormat?.replace('{value}', num.toFixed(decimals)) || num.toFixed(decimals));

    case 'number':
    default:
      return wrapValue(new Intl.NumberFormat('zh-CN', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }).format(num));
  }
}
