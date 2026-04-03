import { useRef, useEffect, useMemo, type CSSProperties } from 'react';
import * as echarts from 'echarts';
import type { AxisConfig, ChartConfig, SeriesConfig, ThemeDefinition } from '@vibe-bi/core';
import { useTheme } from '../../theme/ThemeProvider';
import { mixColors, withAlpha } from '../../theme/colorUtils';
import { resolveFieldReference, toDisplayFieldLabel } from '../../utils/fieldResolution';

export interface EChartsWrapperProps {
  config: ChartConfig;
  data: unknown[];
  style?: CSSProperties;
}

export function EChartsWrapper({ config, data, style }: EChartsWrapperProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);
  const theme = useTheme();
  const rows = useMemo(() => getRows(data), [data]);
  const allFields = useMemo(() => getFieldNames(rows), [rows]);
  const resolvedConfig = useMemo(() => resolveChartConfigFields(config, allFields), [allFields, config]);

  useEffect(() => {
    const configuredFields = [
      config.xAxis?.field,
      ...config.series.map((series) => series.field),
      ...((Array.isArray(config.yAxis) ? config.yAxis : (config.yAxis ? [config.yAxis] : [])).map((axis) => axis.field)),
    ].filter(Boolean) as string[];

    const missingFields = Array.from(new Set(configuredFields.filter((field) => !resolveFieldReference(field, allFields))));
    if (missingFields.length === 0 || allFields.length === 0) {
      return;
    }

    console.warn('[EChartsWrapper] Configured fields missing from query result, using inferred fallback fields:', {
      chartType: config.chartType,
      title: config.title,
      missingFields,
      availableFields: allFields,
    });
  }, [allFields, config.chartType, config.series, config.title, config.xAxis, config.yAxis]);

  const option = useMemo(() => {
    return buildEChartsOption(resolvedConfig, data, theme);
  }, [data, resolvedConfig, theme]);

  useEffect(() => {
    if (!chartRef.current) return;

    // Initialize chart
    chartInstance.current = echarts.init(chartRef.current, undefined, {
      renderer: 'canvas',
    });

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
      style={{
        width: '100%',
        height: '100%',
        padding: 12,
        boxSizing: 'border-box',
        borderRadius: theme.components.card.borderRadius,
        background: `linear-gradient(180deg, ${withAlpha(mixColors(theme.colors.surface, '#FFFFFF', 0.86, theme.colors.surface), 0.98)} 0%, ${withAlpha(mixColors(theme.colors.surface, theme.colors.background, 0.82, theme.colors.surface), 0.96)} 100%)`,
        border: `1px solid ${withAlpha(theme.colors.text, 0.08)}`,
        boxShadow: theme.components.card.shadow,
        ...style,
      }}
    >
      <div
        ref={chartRef}
        style={{
          width: '100%',
          height: '100%',
        }}
      />
    </div>
  );
}

function buildEChartsOption(
  config: ChartConfig,
  data: unknown[],
  theme: ThemeDefinition
): echarts.EChartsOption {
  const colors = theme.colors.chart;
  const legendPosition = config.legend?.position || 'top';
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
      left: 8,
      top: 4,
      textStyle: {
        color: theme.colors.text,
        fontSize: 15,
        fontWeight: 700,
      },
    };
  }

  if (config.tooltip?.show !== false) {
    baseOption.tooltip = {
      trigger: config.tooltip?.trigger || 'axis',
      backgroundColor: theme.colors.surface,
      borderColor: withAlpha(theme.colors.text, 0.14),
      borderWidth: 1,
      textStyle: { color: theme.colors.text },
    };
  }

  if (config.legend?.show !== false) {
    baseOption.legend = {
      show: true,
      top: legendPosition === 'top' ? (config.title ? 28 : 4) : undefined,
      bottom: legendPosition === 'bottom' ? 4 : undefined,
      left: legendPosition === 'left' ? 8 : legendPosition === 'right' ? undefined : 'left',
      right: legendPosition === 'right' ? 8 : undefined,
      orient: legendPosition === 'left' || legendPosition === 'right' ? 'vertical' : 'horizontal',
      textStyle: { color: theme.colors.textSecondary, fontSize: 10 },
    };
  }

  switch (config.chartType) {
    case 'line':
    case 'area':
      return buildLineOption(baseOption, config, data, theme);
    case 'bar':
      return buildBarOption(baseOption, config, data, theme);
    case 'pie':
      return buildPieOption(baseOption, config, data, theme);
    default:
      return baseOption;
  }
}

function resolveCartesianGrid(config: ChartConfig) {
  const legendPosition = config.legend?.position || 'top';
  const titleSpace = config.title ? 34 : 6;
  const topLegendSpace = config.legend?.show === false || legendPosition !== 'top' ? 0 : 26;
  const bottomLegendSpace = config.legend?.show === false || legendPosition !== 'bottom' ? 0 : 34;
  const leftSpace = legendPosition === 'left' ? 132 : 56;
  const rightSpace = legendPosition === 'right' ? 148 : 28;

  return {
    top: titleSpace + topLegendSpace,
    bottom: 22 + bottomLegendSpace,
    left: leftSpace,
    right: rightSpace,
    containLabel: true,
  };
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

function isUsableNumericField(rows: ChartRow[], fields: string[], field?: string): field is string {
  return Boolean(field && fields.includes(field) && rows.some((row) => isNumericLike(row[field])));
}

function getUsableConfiguredSeries(
  config: ChartConfig,
  rows: ChartRow[],
  fields: string[]
): ChartConfig['series'] {
  return config.series.filter((series) => isUsableNumericField(rows, fields, series.field));
}

function getCategoryField(rows: ChartRow[], fields: string[], valueFields: string[], preferredField?: string): string {
  if (preferredField && fields.includes(preferredField) && !valueFields.includes(preferredField)) {
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

  if (preferredField && fields.includes(preferredField) && !valueFields.includes(preferredField)) {
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

function getPrimaryYAxis(config: ChartConfig): AxisConfig | undefined {
  if (Array.isArray(config.yAxis)) {
    return config.yAxis[0];
  }

  const rawYAxis = (config as ChartConfig & { yAxis?: AxisConfig | AxisConfig[] }).yAxis;
  return rawYAxis && !Array.isArray(rawYAxis)
    ? rawYAxis
    : undefined;
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
  return toDisplayFieldLabel(field) || '数值';
}

function resolveAxisField(axis: AxisConfig | undefined, availableFields: string[], preserveDisplayName: boolean): AxisConfig | undefined {
  if (!axis) {
    return undefined;
  }

  const resolvedField = resolveFieldReference(axis.field, availableFields) || axis.field;
  if (resolvedField === axis.field) {
    return axis;
  }

  return {
    ...axis,
    field: resolvedField,
    name: axis.name || (preserveDisplayName ? axis.field : axis.name),
  };
}

function resolveSeriesField(series: SeriesConfig, availableFields: string[]): SeriesConfig {
  const resolvedField = resolveFieldReference(series.field, availableFields) || series.field;
  if (resolvedField === series.field) {
    return series;
  }

  return {
    ...series,
    field: resolvedField,
    name: series.name || series.field,
  };
}

function resolveChartConfigFields(config: ChartConfig, availableFields: string[]): ChartConfig {
  const rawYAxis = (config as ChartConfig & { yAxis?: AxisConfig | AxisConfig[] }).yAxis;
  const resolvedYAxis = Array.isArray(rawYAxis)
    ? rawYAxis.map((axis) => resolveAxisField(axis, availableFields, true))
    : rawYAxis
      ? [resolveAxisField(rawYAxis, availableFields, true)].filter(Boolean)
      : undefined;

  return {
    ...config,
    xAxis: resolveAxisField(config.xAxis, availableFields, false),
    yAxis: resolvedYAxis as AxisConfig[] | undefined,
    series: config.series.map((series) => resolveSeriesField(series, availableFields)),
  };
}

function buildLineOption(
  baseOption: echarts.EChartsOption,
  config: ChartConfig,
  data: unknown[],
  theme: ThemeDefinition
): echarts.EChartsOption {
  const rows = getRows(data);
  const allFields = getFieldNames(rows);
  const usableConfiguredSeries = getUsableConfiguredSeries(config, rows, allFields);
  const configuredSeriesFields = usableConfiguredSeries.map((series) => series.field).filter(Boolean);
  const numericFields = getNumericFields(rows, allFields);
  const primaryYAxis = getPrimaryYAxis(config);
  const valueFields = configuredSeriesFields.length > 0
    ? configuredSeriesFields
    : numericFields.length > 0
      ? numericFields
      : [allFields.find((field) => field !== config.xAxis?.field) || allFields[0] || ''];

  const xField = getCategoryField(rows, allFields, valueFields, config.xAxis?.field);
  const xData = rows.map((row, index) => normalizeSeriesValue(row[xField] ?? row.__rowIndex ?? index + 1));

  const seriesConfig = usableConfiguredSeries.length > 0
    ? usableConfiguredSeries
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
      axisLine: { lineStyle: { color: withAlpha(theme.colors.text, 0.24) } },
      axisLabel: { color: theme.colors.textSecondary, fontSize: 10 },
    },
    yAxis: {
      type: primaryYAxis?.type === 'category' ? 'value' : (primaryYAxis?.type || 'value'),
      splitLine: { lineStyle: { color: withAlpha(theme.colors.text, 0.12) } },
      axisLabel: { color: theme.colors.textSecondary, fontSize: 10 },
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
    grid: resolveCartesianGrid(config),
  };
}

function buildBarOption(
  baseOption: echarts.EChartsOption,
  config: ChartConfig,
  data: unknown[],
  theme: ThemeDefinition
): echarts.EChartsOption {
  const rows = getRows(data);
  const allFields = getFieldNames(rows);
  const usableConfiguredSeries = getUsableConfiguredSeries(config, rows, allFields);
  const configuredSeriesFields = usableConfiguredSeries.map((series) => series.field).filter(Boolean);
  const numericFields = getNumericFields(rows, allFields);
  const primaryYAxis = getPrimaryYAxis(config);
  const valueFields = configuredSeriesFields.length > 0
    ? configuredSeriesFields
    : numericFields.length > 0
      ? numericFields
      : [allFields.find((field) => field !== config.xAxis?.field) || allFields[0] || ''];

  const isHorizontal = config.orientation === 'horizontal'
    || (config.xAxis?.type === 'value' && primaryYAxis?.type === 'category');
  const categoryField = isHorizontal
    ? getCategoryField(rows, allFields, valueFields, primaryYAxis?.field)
    : getCategoryField(rows, allFields, valueFields, config.xAxis?.field);
  const categoryData = rows.map((row, index) => normalizeSeriesValue(row[categoryField] ?? row.__rowIndex ?? index + 1));

  const seriesConfig = usableConfiguredSeries.length > 0
    ? usableConfiguredSeries
    : valueFields.filter(Boolean).map((field) => ({
      field,
      name: formatFieldLabel(field),
      type: 'bar' as const,
    }));

  return {
    ...baseOption,
    xAxis: isHorizontal
      ? {
        type: 'value',
        name: config.xAxis?.name,
        splitLine: { lineStyle: { color: withAlpha(theme.colors.text, 0.12) } },
        axisLabel: { color: theme.colors.textSecondary, fontSize: 10 },
      }
      : {
        type: config.xAxis?.type === 'time' ? 'time' : 'category',
        data: categoryData as any,
        name: config.xAxis?.name,
        axisLine: { lineStyle: { color: withAlpha(theme.colors.text, 0.24) } },
        axisLabel: { color: theme.colors.textSecondary, fontSize: 10 },
      },
    yAxis: isHorizontal
      ? {
        type: 'category',
        data: categoryData as any,
        name: primaryYAxis?.name || formatFieldLabel(categoryField),
        axisLine: { lineStyle: { color: withAlpha(theme.colors.text, 0.24) } },
        axisLabel: { color: theme.colors.textSecondary, fontSize: 10 },
      }
      : {
        type: primaryYAxis?.type === 'category' ? 'value' : (primaryYAxis?.type || 'value'),
        name: primaryYAxis?.name,
        splitLine: { lineStyle: { color: withAlpha(theme.colors.text, 0.12) } },
        axisLabel: { color: theme.colors.textSecondary, fontSize: 10 },
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
      ...resolveCartesianGrid(config),
      left: isHorizontal ? 88 : resolveCartesianGrid(config).left,
    },
  };
}

function buildPieOption(
  baseOption: echarts.EChartsOption,
  config: ChartConfig,
  data: unknown[],
  theme: ThemeDefinition
): echarts.EChartsOption {
  const rows = getRows(data);
  const allFields = getFieldNames(rows);
  const numericFields = getNumericFields(rows, allFields);
  const configuredValueField = isUsableNumericField(rows, allFields, config.series[0]?.field)
    ? config.series[0]?.field
    : undefined;
  const valueField = configuredValueField || numericFields[0] || allFields[1] || allFields[0] || '';
  const nameField = getPieCategoryField(rows, allFields, [valueField].filter(Boolean), config.xAxis?.field);
  const aggregatedData = new Map<string, number>();
  const legendPosition = config.legend?.position || 'right';
  const showDataLabels = config.dataLabels?.show === true;
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
      orient: legendPosition === 'left' || legendPosition === 'right' ? 'vertical' : 'horizontal',
      right: legendPosition === 'right' ? 10 : undefined,
      left: legendPosition === 'left' ? 10 : legendPosition === 'top' || legendPosition === 'bottom' ? 'center' : undefined,
      top: legendPosition === 'top' ? (config.title ? 28 : 4) : legendPosition === 'left' || legendPosition === 'right' ? 'middle' : undefined,
      bottom: legendPosition === 'bottom' ? 4 : undefined,
    },
    title: titleConfig,
    animationDuration: 400,
    animationDurationUpdate: 250,
    series: [
      {
        type: 'pie',
        radius: showDataLabels ? ['38%', '66%'] : ['42%', '72%'],
        center: legendPosition === 'right'
          ? ['34%', '56%']
          : legendPosition === 'left'
            ? ['66%', '56%']
            : ['50%', legendPosition === 'bottom' ? '44%' : '56%'],
        avoidLabelOverlap: true,
        itemStyle: {
          borderRadius: 8,
          borderColor: mixColors(theme.colors.surface, theme.colors.background, 0.92, theme.colors.surface),
          borderWidth: 2,
        },
        label: {
          show: showDataLabels,
          position: showDataLabels ? (config.dataLabels?.position === 'center' ? 'center' : 'outside') : 'center',
          color: theme.colors.text,
          fontSize: 10,
          formatter: '{b}: {d}%',
        },
        emphasis: {
          label: {
            show: true,
            fontSize: 12,
            fontWeight: 'bold',
            color: theme.colors.text,
          },
        },
        labelLine: { show: showDataLabels },
        labelLayout: {
          hideOverlap: true,
        },
        data: Array.from(aggregatedData.entries()).map(([name, value]) => ({
          name,
          value,
        })),
      },
    ],
  };
}
