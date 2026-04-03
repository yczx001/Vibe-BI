import React from 'react';
import type { KpiConfig, ValueFormat } from '@vibe-bi/core';
import { useTheme } from '../../theme/ThemeProvider';
import { mixColors, withAlpha } from '../../theme/colorUtils';
import { resolveFieldReference } from '../../utils/fieldResolution';

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
  const rows = React.useMemo(() => data.filter((row): row is Record<string, unknown> => (
    !!row && typeof row === 'object' && !Array.isArray(row)
  )), [data]);
  const availableFields = React.useMemo(() => {
    if (rows.length === 0) {
      return [];
    }

    return Object.keys(rows[0]).filter((field) => field !== '__rowIndex');
  }, [rows]);

  const valueField = React.useMemo(() => {
    const resolvedConfiguredField = resolveFieldReference(config.valueField, availableFields);
    if (resolvedConfiguredField) {
      return resolvedConfiguredField;
    }

    if (rows.length === 0) {
      return '';
    }

    const numericField = availableFields.find((field) => rows.some((row) => {
      const value = row[field];
      return typeof value === 'number' || (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value)));
    }));

    return numericField || availableFields[0] || '';
  }, [availableFields, config.valueField, rows]);

  const value = React.useMemo(() => {
    if (rows.length === 0 || !valueField) return null;
    const row = rows[0];
    return row[valueField];
  }, [rows, valueField]);

  React.useEffect(() => {
    if (rows.length === 0 || !config.valueField || value !== undefined) {
      return;
    }

    if (!valueField) {
      console.warn('[KpiCard] Value field not found in row:', {
        title: config.title,
        valueField: config.valueField,
        availableFields,
      });
      return;
    }
  }, [availableFields, config.title, config.valueField, rows, value, valueField]);

  const comparisonTargetField = React.useMemo(() => {
    const targetField = config.comparison?.targetField
      || configAliases.comparisonField
      || configAliases.compareField;

    return resolveFieldReference(targetField, availableFields);
  }, [availableFields, config.comparison?.targetField, configAliases.comparisonField, configAliases.compareField]);

  const comparisonValue = React.useMemo(() => {
    if (rows.length === 0 || !comparisonTargetField) return null;
    return rows[0][comparisonTargetField];
  }, [comparisonTargetField, rows]);

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
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          marginBottom: 12,
        }}
      >
        <div
          style={{
            fontSize: 10,
            letterSpacing: 0.6,
            color: theme.colors.textSecondary,
            fontWeight: 600,
            textTransform: 'uppercase',
          }}
        >
          关键指标
        </div>
        {config.icon ? (
          <div
            aria-hidden="true"
            style={{
              width: 34,
              height: 34,
              display: 'grid',
              placeItems: 'center',
              borderRadius: 12,
              background: withAlpha(theme.colors.primary, 0.12),
              color: theme.colors.primary,
              fontSize: 18,
              lineHeight: 1,
              boxShadow: `inset 0 0 0 1px ${withAlpha(theme.colors.primary, 0.14)}`,
            }}
          >
            {config.icon}
          </div>
        ) : null}
      </div>
      <div style={{ display: 'grid', gap: 8 }}>
        <div
          style={{
            fontSize: 15,
            fontWeight: 700,
            color: theme.colors.text,
            lineHeight: 1.3,
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
