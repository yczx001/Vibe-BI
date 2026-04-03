import React, { useEffect, useMemo, type CSSProperties } from 'react';
import type { AxisConfig, ChartConfig, SeriesConfig, ThemeDefinition } from '@vibe-bi/core';
import { useTheme } from '../../theme/ThemeProvider';
import { mixColors, withAlpha } from '../../theme/colorUtils';
import { resolveFieldReference, toDisplayFieldLabel } from '../../utils/fieldResolution';

export interface HtmlChartRendererProps {
  config: ChartConfig;
  data: unknown[];
  style?: CSSProperties;
}

type ChartRow = Record<string, unknown>;
type SeriesModel = { key: string; label: string; color: string; values: number[] };

export function HtmlChartRenderer({ config, data, style }: HtmlChartRendererProps) {
  const theme = useTheme();
  const rows = useMemo(() => data.filter((row): row is ChartRow => !!row && typeof row === 'object' && !Array.isArray(row)), [data]);
  const fields = useMemo(() => (rows[0] ? Object.keys(rows[0]).filter((field) => field !== '__rowIndex') : []), [rows]);
  const resolvedConfig = useMemo(() => resolveChartConfigFields(config, fields), [config, fields]);

  useEffect(() => {
    const configuredFields = [
      config.xAxis?.field,
      ...config.series.map((series) => series.field),
      ...((Array.isArray(config.yAxis) ? config.yAxis : (config.yAxis ? [config.yAxis] : [])).map((axis) => axis.field)),
    ].filter(Boolean) as string[];
    const missingFields = Array.from(new Set(configuredFields.filter((field) => !resolveFieldReference(field, fields))));

    if (missingFields.length > 0 && fields.length > 0) {
      console.warn('[HtmlChartRenderer] Configured fields missing from query result, using inferred fallback fields:', {
        chartType: config.chartType,
        title: config.title,
        missingFields,
        availableFields: fields,
      });
    }
  }, [config.chartType, config.series, config.title, config.xAxis, config.yAxis, fields]);

  const body = useMemo(() => {
    if (resolvedConfig.chartType === 'pie') {
      return renderPieChart(resolvedConfig, rows, fields, theme);
    }

    if (resolvedConfig.chartType === 'line' || resolvedConfig.chartType === 'area' || resolvedConfig.chartType === 'bar') {
      return renderCartesianChart(resolvedConfig, rows, fields, theme);
    }

    return <EmptyChartState message={`纯 HTML 渲染暂未实现 ${resolvedConfig.chartType} 类型。`} />;
  }, [resolvedConfig, rows, fields, theme]);

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
      {body}
    </div>
  );
}

function renderCartesianChart(config: ChartConfig, rows: ChartRow[], fields: string[], theme: ThemeDefinition) {
  const numeric = fields.filter((field) => rows.some((row) => isNumericLike(row[field])));
  const configuredSeries = config.series.filter((series) => series.field && fields.includes(series.field) && rows.some((row) => isNumericLike(row[series.field])));
  const valueFields = configuredSeries.length > 0
    ? configuredSeries.map((series) => series.field)
    : numeric.length > 0
      ? numeric
      : [fields.find((field) => field !== config.xAxis?.field) || fields[0] || ''];
  const primaryYAxis = Array.isArray(config.yAxis) ? config.yAxis[0] : config.yAxis;
  const isHorizontal = config.chartType === 'bar'
    && (config.orientation === 'horizontal' || (config.xAxis?.type === 'value' && primaryYAxis?.type === 'category'));
  const categoryField = isHorizontal
    ? pickCategoryField(rows, fields, valueFields, primaryYAxis?.field)
    : pickCategoryField(rows, fields, valueFields, config.xAxis?.field);

  if (!categoryField || valueFields.length === 0 || rows.length === 0) {
    return <EmptyChartState message="当前数据不足以生成纯 HTML 图表。" />;
  }

  const categories = rows.map((row, index) => String(row[categoryField] ?? row.__rowIndex ?? index + 1));
  const series: SeriesModel[] = (configuredSeries.length > 0
    ? configuredSeries
    : valueFields.filter(Boolean).map((field, index) => ({
      field,
      name: formatFieldLabel(field),
      type: config.chartType === 'bar' ? 'bar' : 'line',
      color: theme.colors.chart[index % theme.colors.chart.length],
    } as SeriesConfig & { color?: string })))
    .map((item, index) => ({
      key: item.field,
      label: item.name || formatFieldLabel(item.field),
      color: (item as { color?: string }).color || theme.colors.chart[index % theme.colors.chart.length],
      values: rows.map((row) => toNumeric(row[item.field])),
    }));

  const values = series.flatMap((item) => item.values);
  const maxValue = Math.max(...values, 0, 1);
  const minValue = Math.min(...values, 0);
  const range = maxValue - minValue || 1;
  const legendPosition = config.legend?.position || 'top';

  return (
    <ChartLayout title={config.title} legendPosition={config.legend?.show === false ? undefined : legendPosition} theme={theme} legend={(
      <LegendList
        items={series.map((item) => ({ label: item.label, color: item.color }))}
        position={legendPosition}
        theme={theme}
      />
    )}>
      <CartesianSvg
        chartType={config.chartType}
        categories={categories}
        series={series}
        theme={theme}
        isHorizontal={isHorizontal}
        showDataLabels={config.dataLabels?.show === true}
        maxValue={maxValue}
        minValue={minValue}
        range={range}
      />
    </ChartLayout>
  );
}

function renderPieChart(config: ChartConfig, rows: ChartRow[], fields: string[], theme: ThemeDefinition) {
  const numeric = fields.filter((field) => rows.some((row) => isNumericLike(row[field])));
  const valueField = (config.series[0]?.field && fields.includes(config.series[0].field))
    ? config.series[0].field
    : numeric[0] || fields[1] || fields[0] || '';
  const categoryField = pickPieCategoryField(rows, fields, [valueField].filter(Boolean), config.xAxis?.field);

  if (!valueField || !categoryField || rows.length === 0) {
    return <EmptyChartState message="当前数据不足以生成纯 HTML 饼图。" />;
  }

  const totals = new Map<string, number>();
  rows.forEach((row, index) => {
    const label = String(row[categoryField] ?? row.__rowIndex ?? index + 1);
    totals.set(label, (totals.get(label) || 0) + toNumeric(row[valueField]));
  });

  const slices = Array.from(totals.entries())
    .filter(([, value]) => value > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([label, value], index, list) => ({
      label,
      value,
      color: theme.colors.chart[index % theme.colors.chart.length],
      percent: (value / list.reduce((sum, [, next]) => sum + next, 0)) * 100,
    }));

  if (slices.length === 0) {
    return <EmptyChartState message="当前数据不足以生成纯 HTML 饼图。" />;
  }

  const legendPosition = config.legend?.position || 'right';
  const gradient = slices.reduce((parts, slice, index) => {
    const start = slices.slice(0, index).reduce((sum, item) => sum + item.percent, 0);
    parts.push(`${slice.color} ${start}% ${start + slice.percent}%`);
    return parts;
  }, [] as string[]).join(', ');

  return (
    <ChartLayout title={config.title} legendPosition={config.legend?.show === false ? undefined : legendPosition} theme={theme} legend={(
      <LegendList
        items={slices.map((slice) => ({
          label: slice.label,
          color: slice.color,
          valueLabel: `${formatCompactValue(slice.value)} · ${slice.percent.toFixed(0)}%`,
        }))}
        position={legendPosition}
        theme={theme}
      />
    )}>
      <div style={{ display: 'grid', placeItems: 'center', width: '100%', height: '100%' }}>
        <div
          style={{
            width: 'min(68%, 260px)',
            aspectRatio: '1 / 1',
            borderRadius: '50%',
            background: `conic-gradient(${gradient})`,
            position: 'relative',
            boxShadow: `inset 0 0 0 1px ${withAlpha(theme.colors.text, 0.08)}`,
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: '22%',
              borderRadius: '50%',
              background: withAlpha(theme.colors.surface, 0.98),
              boxShadow: `0 0 0 1px ${withAlpha(theme.colors.text, 0.08)}`,
              display: 'grid',
              placeItems: 'center',
              textAlign: 'center',
              padding: 12,
            }}
          >
            <div>
              <div style={{ color: theme.colors.textSecondary, fontSize: 11 }}>总计</div>
              <div style={{ color: theme.colors.text, fontSize: 20, fontWeight: 700, marginTop: 4 }}>
                {formatCompactValue(slices.reduce((sum, slice) => sum + slice.value, 0))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </ChartLayout>
  );
}

function ChartLayout({
  title,
  legendPosition,
  legend,
  theme,
  children,
}: {
  title?: string;
  legendPosition?: 'top' | 'bottom' | 'left' | 'right';
  legend?: React.ReactNode;
  theme: ThemeDefinition;
  children: React.ReactNode;
}) {
  const sideLegend = legendPosition === 'left' || legendPosition === 'right';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', height: '100%', minHeight: 0 }}>
      {title ? <div style={{ color: theme.colors.text, fontSize: 15, fontWeight: 700, lineHeight: 1.3, padding: '2px 4px 0' }}>{title}</div> : null}
      {sideLegend ? (
        <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: legendPosition === 'left' ? '160px minmax(0, 1fr)' : 'minmax(0, 1fr) 160px', gap: 14 }}>
          {legendPosition === 'left' ? legend : children}
          {legendPosition === 'left' ? children : legend}
        </div>
      ) : (
        <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr) auto', gap: 12 }}>
          {legendPosition === 'top' ? legend : null}
          <div style={{ minHeight: 0 }}>{children}</div>
          {legendPosition === 'bottom' ? legend : null}
        </div>
      )}
    </div>
  );
}

function LegendList({
  items,
  position,
  theme,
}: {
  items: Array<{ label: string; color: string; valueLabel?: string }>;
  position: 'top' | 'bottom' | 'left' | 'right';
  theme: ThemeDefinition;
}) {
  const vertical = position === 'left' || position === 'right';

  return (
    <div style={{ display: 'flex', flexDirection: vertical ? 'column' : 'row', flexWrap: vertical ? 'nowrap' : 'wrap', gap: vertical ? 8 : 10, minWidth: 0 }}>
      {items.map((item) => (
        <div key={`${item.label}-${item.color}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: item.color, flexShrink: 0 }} />
          <span style={{ color: theme.colors.textSecondary, fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {item.label}{item.valueLabel ? ` · ${item.valueLabel}` : ''}
          </span>
        </div>
      ))}
    </div>
  );
}

function CartesianSvg({
  chartType,
  categories,
  series,
  theme,
  isHorizontal,
  showDataLabels,
  maxValue,
  minValue,
  range,
}: {
  chartType: ChartConfig['chartType'];
  categories: string[];
  series: SeriesModel[];
  theme: ThemeDefinition;
  isHorizontal: boolean;
  showDataLabels: boolean;
  maxValue: number;
  minValue: number;
  range: number;
}) {
  const width = 920;
  const height = 420;
  const left = isHorizontal ? 118 : 54;
  const right = 28;
  const top = 18;
  const bottom = isHorizontal ? 24 : 72;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const band = (isHorizontal ? plotHeight : plotWidth) / Math.max(categories.length, 1);
  const scale = (value: number) => isHorizontal
    ? left + (((value - minValue) / range) * plotWidth)
    : top + plotHeight - (((value - minValue) / range) * plotHeight);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: '100%', display: 'block' }}>
      {Array.from({ length: 5 }, (_, index) => {
        const ratio = index / 4;
        const value = maxValue - (range * ratio);
        if (isHorizontal) {
          const x = left + (ratio * plotWidth);
          return (
            <g key={`tick-${index}`}>
              <line x1={x} y1={top} x2={x} y2={top + plotHeight} stroke={withAlpha(theme.colors.text, 0.1)} strokeWidth="1" strokeDasharray="4 6" />
              <text x={x} y={top + plotHeight + 16} textAnchor="middle" fill={theme.colors.textSecondary} fontSize="10">{formatCompactValue(value)}</text>
            </g>
          );
        }

        const y = top + (ratio * plotHeight);
        return (
          <g key={`tick-${index}`}>
            <line x1={left} y1={y} x2={left + plotWidth} y2={y} stroke={withAlpha(theme.colors.text, 0.1)} strokeWidth="1" strokeDasharray="4 6" />
            <text x={left - 8} y={y + 3} textAnchor="end" fill={theme.colors.textSecondary} fontSize="10">{formatCompactValue(value)}</text>
          </g>
        );
      })}

      {isHorizontal ? (
        series.map((item, seriesIndex) => item.values.map((value, index) => {
          const group = Math.min(band * 0.72, 48);
          const barHeight = group / Math.max(series.length, 1);
          const centerY = top + (band * index) + (band / 2);
          const y = centerY - (group / 2) + (barHeight * seriesIndex);
          const startX = scale(Math.min(0, value));
          const endX = scale(Math.max(0, value));
          return (
            <g key={`${item.key}-${index}`}>
              <text x={left - 10} y={centerY + 4} textAnchor="end" fill={theme.colors.textSecondary} fontSize="10">{truncateLabel(categories[index], 14)}</text>
              <rect x={Math.min(startX, endX)} y={y} width={Math.max(Math.abs(endX - startX), 1)} height={Math.max(barHeight - 4, 4)} rx={4} fill={withAlpha(item.color, 0.88)} />
              {showDataLabels ? <text x={Math.max(startX, endX) + 6} y={y + Math.max(barHeight - 4, 4) / 2 + 3} fill={theme.colors.textSecondary} fontSize="10">{formatCompactValue(value)}</text> : null}
            </g>
          );
        }))
      ) : (
        <>
          <line x1={left} y1={top + plotHeight} x2={left + plotWidth} y2={top + plotHeight} stroke={withAlpha(theme.colors.text, 0.22)} strokeWidth="1" />
          <line x1={left} y1={top} x2={left} y2={top + plotHeight} stroke={withAlpha(theme.colors.text, 0.22)} strokeWidth="1" />
          {categories.map((category, index) => {
            const x = left + (band * index) + (band / 2);
            return <text key={`${category}-${index}`} x={x} y={top + plotHeight + 18} textAnchor="middle" fill={theme.colors.textSecondary} fontSize="10" opacity={categories.length > 10 && index % 2 === 1 ? 0 : 1}>{truncateLabel(category)}</text>;
          })}
          {chartType === 'bar'
            ? series.map((item, seriesIndex) => item.values.map((value, index) => {
              const group = Math.min(band * 0.72, 72);
              const barWidth = group / Math.max(series.length, 1);
              const centerX = left + (band * index) + (band / 2);
              const x = centerX - (group / 2) + (barWidth * seriesIndex);
              const y = scale(value);
              const baseY = scale(0);
              return (
                <g key={`${item.key}-${index}`}>
                  <rect x={x} y={Math.min(y, baseY)} width={Math.max(barWidth - 4, 4)} height={Math.max(Math.abs(baseY - y), 1)} rx={4} fill={withAlpha(item.color, 0.88)} />
                  {showDataLabels ? <text x={x + Math.max(barWidth - 4, 4) / 2} y={Math.min(y, baseY) - 6} textAnchor="middle" fill={theme.colors.textSecondary} fontSize="10">{formatCompactValue(value)}</text> : null}
                </g>
              );
            }))
            : series.map((item) => {
              const points = item.values.map((value, index) => ({ x: left + (band * index) + (band / 2), y: scale(value), value }));
              const polyline = points.map((point) => `${point.x},${point.y}`).join(' ');
              const area = `${left + band / 2},${scale(0)} ${polyline} ${left + band * (categories.length - 0.5)},${scale(0)}`;
              return (
                <g key={item.key}>
                  {chartType === 'area' ? <polygon points={area} fill={withAlpha(item.color, 0.18)} /> : null}
                  <polyline points={polyline} fill="none" stroke={item.color} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
                  {points.map((point) => (
                    <g key={`${item.key}-${point.x}`}>
                      <circle cx={point.x} cy={point.y} r="4" fill={item.color} stroke="#FFFFFF" strokeWidth="1.5" />
                      {showDataLabels ? <text x={point.x} y={point.y - 8} textAnchor="middle" fill={theme.colors.textSecondary} fontSize="10">{formatCompactValue(point.value)}</text> : null}
                    </g>
                  ))}
                </g>
              );
            })}
        </>
      )}
    </svg>
  );
}

function resolveChartConfigFields(config: ChartConfig, availableFields: string[]): ChartConfig {
  const resolveAxis = (axis: AxisConfig | undefined, preserveLabel: boolean) => {
    if (!axis) return undefined;
    const field = resolveFieldReference(axis.field, availableFields) || axis.field;
    return field === axis.field ? axis : { ...axis, field, name: axis.name || (preserveLabel ? axis.field : axis.name) };
  };
  const resolveSeries = (series: SeriesConfig) => {
    const field = resolveFieldReference(series.field, availableFields) || series.field;
    return field === series.field ? series : { ...series, field, name: series.name || series.field };
  };
  const rawYAxis = (config as ChartConfig & { yAxis?: AxisConfig | AxisConfig[] }).yAxis;

  return {
    ...config,
    xAxis: resolveAxis(config.xAxis, false),
    yAxis: Array.isArray(rawYAxis) ? rawYAxis.map((axis) => resolveAxis(axis, true)) as AxisConfig[] : rawYAxis ? [resolveAxis(rawYAxis, true)!] : undefined,
    series: config.series.map(resolveSeries),
  };
}

function pickCategoryField(rows: ChartRow[], fields: string[], valueFields: string[], preferredField?: string) {
  if (preferredField && fields.includes(preferredField) && !valueFields.includes(preferredField)) return preferredField;
  return fields.find((field) => !valueFields.includes(field) && rows.some((row) => typeof row[field] === 'string' || isDateLike(row[field]))) || fields.find((field) => !valueFields.includes(field)) || '__rowIndex';
}

function pickPieCategoryField(rows: ChartRow[], fields: string[], valueFields: string[], preferredField?: string) {
  if (preferredField && fields.includes(preferredField) && !valueFields.includes(preferredField)) return preferredField;
  const candidates = fields.filter((field) => !valueFields.includes(field) && !isTemporalFieldName(field));
  return candidates.sort((a, b) => distinctCount(rows, a) - distinctCount(rows, b))[0] || pickCategoryField(rows, fields, valueFields, preferredField);
}

function distinctCount(rows: ChartRow[], field: string) {
  return new Set(rows.map((row) => row[field]).filter((value) => value !== null && value !== undefined && String(value).trim() !== '').map(String)).size;
}

function isNumericLike(value: unknown) {
  return typeof value === 'number' || (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value)));
}

function isDateLike(value: unknown) {
  return value instanceof Date || (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Date.parse(value)));
}

function isTemporalFieldName(field: string) {
  return /(date|day|week|month|quarter|year|time|period|calendar|日期|日|周|月|季|年|时间|期间)/i.test(field.toLowerCase());
}

function toNumeric(value: unknown) {
  const normalized = typeof value === 'number' ? value : Number(typeof value === 'string' ? value.trim() : value);
  return Number.isFinite(normalized) ? normalized : 0;
}

function formatFieldLabel(field: string) {
  return toDisplayFieldLabel(field) || '数值';
}

function formatCompactValue(value: number) {
  return new Intl.NumberFormat('zh-CN', {
    notation: Math.abs(value) >= 10000 ? 'compact' : 'standard',
    maximumFractionDigits: Math.abs(value) >= 100 ? 0 : 1,
  }).format(value);
}

function truncateLabel(label: string, maxLength = 10) {
  return label.length > maxLength ? `${label.slice(0, maxLength - 1)}…` : label;
}

function EmptyChartState({ message }: { message: string }) {
  return <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748B', fontSize: 12, textAlign: 'center', padding: 16, boxSizing: 'border-box' }}>{message}</div>;
}
