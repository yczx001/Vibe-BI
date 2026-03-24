import { useRef, useEffect, useMemo, type CSSProperties } from 'react';
import * as echarts from 'echarts';
import type { ChartConfig, ThemeDefinition } from '@vibe-bi/core';
import { useTheme } from '../../theme/ThemeProvider';

export interface EChartsWrapperProps {
  config: ChartConfig;
  data: unknown[];
  style?: CSSProperties;
}

export function EChartsWrapper({ config, data, style }: EChartsWrapperProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);
  const theme = useTheme();

  const option = useMemo(() => {
    return buildEChartsOption(config, data, theme);
  }, [config, data, theme]);

  useEffect(() => {
    if (!chartRef.current) return;

    // Initialize chart
    chartInstance.current = echarts.init(chartRef.current, undefined, {
      renderer: 'canvas',
    });
    chartInstance.current.setOption(option);

    // Resize observer
    const resizeObserver = new ResizeObserver(() => {
      chartInstance.current?.resize();
    });
    resizeObserver.observe(chartRef.current);

    return () => {
      resizeObserver.disconnect();
      chartInstance.current?.dispose();
      chartInstance.current = null;
    };
  }, []);

  // Update option when data changes
  useEffect(() => {
    if (chartInstance.current) {
      chartInstance.current.setOption(option, true);
    }
  }, [option]);

  return (
    <div
      ref={chartRef}
      style={{
        width: '100%',
        height: '100%',
        ...style,
      }}
    />
  );
}

function buildEChartsOption(
  config: ChartConfig,
  data: unknown[],
  theme: ThemeDefinition
): echarts.EChartsOption {
  const colors = theme.colors.chart;
  const baseOption: echarts.EChartsOption = {
    backgroundColor: 'transparent',
    textStyle: {
      fontFamily: theme.typography.fontFamily,
    },
    color: colors,
  };

  if (config.title) {
    baseOption.title = {
      text: config.title,
      left: 'center',
      top: 12,
      textStyle: {
        color: theme.colors.text,
        fontSize: 16,
        fontWeight: 600,
      },
    };
  }

  if (config.tooltip?.show !== false) {
    baseOption.tooltip = {
      trigger: config.tooltip?.trigger || 'axis',
      backgroundColor: theme.colors.surface,
      borderColor: 'rgba(32, 31, 30, 0.14)',
      borderWidth: 1,
      textStyle: { color: theme.colors.text },
    };
  }

  if (config.legend?.show !== false) {
    baseOption.legend = {
      show: true,
      bottom: 0,
      textStyle: { color: theme.colors.textSecondary },
    };
  }

  switch (config.chartType) {
    case 'line':
    case 'area':
      return buildLineOption(baseOption, config, data);
    case 'bar':
      return buildBarOption(baseOption, config, data);
    case 'pie':
      return buildPieOption(baseOption, config, data);
    default:
      return baseOption;
  }
}

type ChartRow = Record<string, unknown>;

function getRows(data: unknown[]): ChartRow[] {
  return data.filter((row): row is ChartRow => !!row && typeof row === 'object' && !Array.isArray(row));
}

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

function getFieldNames(rows: ChartRow[]): string[] {
  if (rows.length === 0) {
    return [];
  }

  return Object.keys(rows[0]).filter((field) => field !== '__rowIndex');
}

function getNumericFields(rows: ChartRow[], fields: string[]): string[] {
  return fields.filter((field) => rows.some((row) => isNumericLike(row[field])));
}

function getCategoryField(rows: ChartRow[], fields: string[], valueFields: string[], preferredField?: string): string {
  if (preferredField && fields.includes(preferredField)) {
    return preferredField;
  }

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

function getDistinctValueCount(rows: ChartRow[], field: string): number {
  return new Set(
    rows
      .map((row) => row[field])
      .filter((value) => value !== null && value !== undefined && String(value).trim() !== '')
      .map((value) => String(value))
  ).size;
}

function getPieCategoryField(rows: ChartRow[], fields: string[], valueFields: string[], preferredField?: string): string {
  const dimensionFields = fields.filter((field) => !valueFields.includes(field));
  const nonTemporalFields = dimensionFields.filter((field) => {
    if (isTemporalFieldName(field)) {
      return false;
    }

    return rows.some((row) => !isTemporalFieldValue(row[field]));
  });

  const rankedFields = (nonTemporalFields.length > 0 ? nonTemporalFields : dimensionFields)
    .map((field) => ({
      field,
      distinctCount: getDistinctValueCount(rows, field),
    }))
    .filter((item) => item.distinctCount > 0)
    .sort((a, b) => a.distinctCount - b.distinctCount);

  if (preferredField && fields.includes(preferredField)) {
    const preferredLooksTemporal = isTemporalFieldName(preferredField)
      || rows.some((row) => isTemporalFieldValue(row[preferredField]));

    if (!preferredLooksTemporal || rankedFields.every((item) => item.field === preferredField)) {
      return preferredField;
    }
  }

  if (rankedFields.length > 0) {
    return rankedFields[0].field;
  }

  return getCategoryField(rows, fields, valueFields, preferredField);
}

function normalizeSeriesValue(value: unknown): number | string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') {
      return null;
    }

    const numericValue = Number(trimmed);
    return Number.isNaN(numericValue) ? trimmed : numericValue;
  }

  return String(value);
}

function formatFieldLabel(field: string): string {
  if (!field) {
    return '数值';
  }

  return field
    .replace(/'/g, '')
    .replace(/\[|\]/g, '')
    .replace(/__/g, ' ')
    .trim();
}

function buildLineOption(
  baseOption: echarts.EChartsOption,
  config: ChartConfig,
  data: unknown[]
): echarts.EChartsOption {
  const rows = getRows(data);
  const allFields = getFieldNames(rows);
  const configuredSeriesFields = config.series.map((series) => series.field).filter(Boolean);
  const numericFields = getNumericFields(rows, allFields);
  const valueFields = configuredSeriesFields.length > 0
    ? configuredSeriesFields
    : numericFields.length > 0
      ? numericFields
      : [allFields.find((field) => field !== config.xAxis?.field) || allFields[0] || ''];

  const xField = getCategoryField(rows, allFields, valueFields, config.xAxis?.field);
  const xData = rows.map((row, index) => normalizeSeriesValue(row[xField] ?? row.__rowIndex ?? index + 1));

  const seriesConfig = config.series.length > 0
    ? config.series
    : valueFields.filter(Boolean).map((field) => ({
      field,
      name: formatFieldLabel(field),
      type: 'line' as const,
      smooth: config.chartType === 'line',
    }));

  return {
    ...baseOption,
    xAxis: {
      type: config.xAxis?.type || 'category',
      data: xData as any,
      axisLine: { lineStyle: { color: 'rgba(32, 31, 30, 0.24)' } },
      axisLabel: { color: '#605E5C' },
    },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: '#E1DFDD' } },
      axisLabel: { color: '#605E5C' },
    },
    series: seriesConfig.map((s) => {
      const color = (s as { color?: string }).color;

      return ({
      type: 'line' as const,
      name: s.name || s.field,
      data: rows.map((row) => normalizeSeriesValue(row[s.field])) as any,
      smooth: s.smooth,
      areaStyle: config.chartType === 'area' ? { opacity: 0.3 } : undefined,
      itemStyle: color ? { color } : undefined,
    });
    }) as any,
    grid: {
      left: '3%',
      right: '4%',
      bottom: '10%',
      top: '15%',
      containLabel: true,
    },
  };
}

function buildBarOption(
  baseOption: echarts.EChartsOption,
  config: ChartConfig,
  data: unknown[]
): echarts.EChartsOption {
  const rows = getRows(data);
  const allFields = getFieldNames(rows);
  const configuredSeriesFields = config.series.map((series) => series.field).filter(Boolean);
  const numericFields = getNumericFields(rows, allFields);
  const valueFields = configuredSeriesFields.length > 0
    ? configuredSeriesFields
    : numericFields.length > 0
      ? numericFields
      : [allFields.find((field) => field !== config.xAxis?.field) || allFields[0] || ''];

  const xField = getCategoryField(rows, allFields, valueFields, config.xAxis?.field);
  const xData = rows.map((row, index) => normalizeSeriesValue(row[xField] ?? row.__rowIndex ?? index + 1));

  const seriesConfig = config.series.length > 0
    ? config.series
    : valueFields.filter(Boolean).map((field) => ({
      field,
      name: formatFieldLabel(field),
      type: 'bar' as const,
    }));

  return {
    ...baseOption,
    xAxis: {
      type: config.xAxis?.type || 'category',
      data: xData as any,
      axisLine: { lineStyle: { color: 'rgba(32, 31, 30, 0.24)' } },
      axisLabel: { color: '#605E5C' },
    },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: '#E1DFDD' } },
      axisLabel: { color: '#605E5C' },
    },
    series: seriesConfig.map((s) => {
      const color = (s as { color?: string }).color;
      const stack = (s as { stack?: string }).stack;

      return ({
      type: 'bar' as const,
      name: s.name || s.field,
      data: rows.map((row) => normalizeSeriesValue(row[s.field])) as any,
      itemStyle: color ? { color } : undefined,
      stack,
    });
    }) as any,
    grid: {
      left: '3%',
      right: '4%',
      bottom: '10%',
      top: '15%',
      containLabel: true,
    },
  };
}

function buildPieOption(
  baseOption: echarts.EChartsOption,
  config: ChartConfig,
  data: unknown[]
): echarts.EChartsOption {
  const rows = getRows(data);
  const allFields = getFieldNames(rows);
  const numericFields = getNumericFields(rows, allFields);
  const configuredValueField = config.series[0]?.field;
  const valueField = configuredValueField || numericFields[0] || allFields[1] || allFields[0] || '';
  const nameField = getPieCategoryField(rows, allFields, [valueField].filter(Boolean), config.xAxis?.field);
  const aggregatedData = new Map<string, number>();
  const titleConfig = config.title
    ? {
      ...((baseOption.title || {}) as Record<string, unknown>),
      left: 'center',
    }
    : baseOption.title;

  rows.forEach((row, index) => {
    const rawName = row[nameField] ?? row.__rowIndex ?? index + 1;
    const rawValue = normalizeSeriesValue(row[valueField]);
    const numericValue = typeof rawValue === 'number' ? rawValue : Number(rawValue);
    const safeValue = Number.isNaN(numericValue) ? 0 : numericValue;
    const key = String(rawName);
    aggregatedData.set(key, (aggregatedData.get(key) || 0) + safeValue);
  });

  return {
    ...baseOption,
    tooltip: {
      ...(baseOption.tooltip || {}),
      trigger: 'item',
    },
    legend: {
      ...(baseOption.legend || {}),
      orient: 'vertical',
      right: 12,
      top: 'middle',
      bottom: 'auto',
    },
    title: titleConfig,
    animationDuration: 400,
    animationDurationUpdate: 250,
    series: [
      {
        type: 'pie',
        radius: ['40%', '70%'],
        center: ['34%', '50%'],
        avoidLabelOverlap: false,
        itemStyle: {
          borderRadius: 8,
          borderColor: '#FFFFFF',
          borderWidth: 2,
        },
        label: {
          show: false,
          position: 'center',
        },
        emphasis: {
          label: {
            show: true,
            fontSize: 16,
            fontWeight: 'bold',
            color: '#201F1E',
          },
        },
        labelLine: { show: false },
        data: Array.from(aggregatedData.entries()).map(([name, value]) => ({
          name,
          value,
        })),
      },
    ],
  };
}
