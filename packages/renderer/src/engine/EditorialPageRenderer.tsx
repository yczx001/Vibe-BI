import React, { useEffect, useMemo, useState } from 'react';
import type {
  ComponentDefinition,
  DataSourceConfig,
  PageDefinition,
  QueryDefinition,
  ReportDefinition,
  ThemeDefinition,
} from '@vibe-bi/core';
import { fetchQueryRows } from '../data/useQueryData';
import { mixColors, withAlpha } from '../theme/colorUtils';
import { buildShippingEditorialBundle, ShippingEditorialPageRenderer } from './ShippingEditorialPageRenderer';

type DataRow = Record<string, unknown>;

interface EditorialPageRendererProps {
  report: ReportDefinition;
  page: PageDefinition;
  queries: QueryDefinition[];
  dataSource: DataSourceConfig;
  theme: ThemeDefinition;
  apiBaseUrl?: string;
  viewportMode?: 'contained' | 'document';
}

interface QueryAnalysis {
  columns: string[];
  numericFields: string[];
  categoricalFields: string[];
  timeFields: string[];
  primaryValueField?: string;
  secondaryValueField?: string;
  primaryCategoryField?: string;
}

interface ResolvedDataset {
  component: ComponentDefinition;
  query?: QueryDefinition;
  rows: DataRow[];
  analysis: QueryAnalysis;
  title: string;
  chartType: string;
  orientation: string;
}

interface MetricCardModel {
  id: string;
  title: string;
  value: number;
  compareValue?: number;
  note?: string;
}

interface PivotTableModel {
  rowLabel: string;
  columns: string[];
  rows: Array<{
    id: string;
    label: string;
    values: number[];
    total: number;
  }>;
}

const EDITORIAL_REPORT_STYLES = `
.vibe-editorial-page {
  width: 100%;
  height: 100%;
  position: relative;
  overflow: hidden;
  background:
    radial-gradient(circle at top left, var(--ve-accent-soft), transparent 30%),
    radial-gradient(circle at top right, var(--ve-accent-alt-soft), transparent 28%),
    linear-gradient(180deg, var(--ve-bg) 0%, var(--ve-bg-elevated) 100%);
  color: var(--ve-text);
  font-family: var(--ve-font-body);
}

.vibe-editorial-page::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image:
    linear-gradient(var(--ve-grid-line) 1px, transparent 1px),
    linear-gradient(90deg, var(--ve-grid-line) 1px, transparent 1px);
  background-size: 28px 28px;
  mask-image: radial-gradient(circle at center, rgba(0, 0, 0, 0.72) 22%, transparent 86%);
}

.vibe-editorial-shell {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-rows: auto auto minmax(0, 1.58fr) minmax(0, 1fr);
  gap: 18px;
  height: 100%;
  padding: 24px;
  box-sizing: border-box;
}

.vibe-editorial-card {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border-radius: 26px;
  border: 1px solid var(--ve-border);
  background:
    linear-gradient(180deg, var(--ve-surface) 0%, var(--ve-surface-strong) 100%);
  box-shadow: 0 22px 60px var(--ve-shadow);
  backdrop-filter: blur(16px);
}

.vibe-editorial-header {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(320px, 0.82fr);
  gap: 18px;
  align-items: stretch;
}

.vibe-editorial-hero {
  padding: 22px 24px;
  display: grid;
  grid-template-rows: auto auto 1fr;
  gap: 14px;
}

.vibe-editorial-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  width: fit-content;
  border-radius: 999px;
  background: var(--ve-badge-bg);
  color: var(--ve-accent);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.vibe-editorial-title {
  margin: 0;
  font-family: var(--ve-font-display);
  font-size: 40px;
  line-height: 1;
  letter-spacing: -0.03em;
}

.vibe-editorial-subtitle {
  margin: 0;
  color: var(--ve-muted);
  font-size: 14px;
  line-height: 1.75;
  max-width: 72ch;
}

.vibe-editorial-insights {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.vibe-editorial-insight {
  padding: 14px 16px;
  border-radius: 18px;
  border: 1px solid var(--ve-border);
  background: var(--ve-panel);
}

.vibe-editorial-insight-label {
  color: var(--ve-muted);
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.vibe-editorial-insight-value {
  display: block;
  margin-top: 8px;
  font-size: 18px;
  font-weight: 700;
}

.vibe-editorial-meta {
  padding: 20px;
  display: grid;
  gap: 12px;
}

.vibe-editorial-meta-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.vibe-editorial-meta-pill {
  padding: 12px 14px;
  border-radius: 16px;
  background: var(--ve-panel);
  border: 1px solid var(--ve-border);
}

.vibe-editorial-meta-label {
  color: var(--ve-muted);
  font-size: 10px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.vibe-editorial-meta-value {
  margin-top: 6px;
  display: block;
  font-size: 14px;
  font-weight: 700;
}

.vibe-editorial-filter-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.vibe-editorial-filter-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-radius: 999px;
  border: 1px solid var(--ve-border);
  background: var(--ve-chip-bg);
  color: var(--ve-text);
  font-size: 12px;
  font-weight: 600;
}

.vibe-editorial-kpis {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}

.vibe-editorial-kpi {
  padding: 18px 18px 16px;
  display: grid;
  gap: 10px;
}

.vibe-editorial-kpi-label {
  color: var(--ve-muted);
  font-size: 12px;
  letter-spacing: 0.04em;
}

.vibe-editorial-kpi-value {
  font-size: 34px;
  font-weight: 800;
  letter-spacing: -0.04em;
}

.vibe-editorial-kpi-note {
  color: var(--ve-muted);
  font-size: 12px;
}

.vibe-editorial-kpi-sparkline {
  width: 100%;
  height: 42px;
}

.vibe-editorial-main {
  display: grid;
  grid-template-columns: minmax(0, 1.45fr) minmax(320px, 0.9fr);
  gap: 18px;
  min-height: 0;
}

.vibe-editorial-stack {
  display: grid;
  grid-template-rows: repeat(2, minmax(0, 1fr));
  gap: 18px;
  min-height: 0;
}

.vibe-editorial-bottom {
  display: grid;
  grid-template-columns: minmax(0, 1.18fr) minmax(320px, 0.82fr);
  gap: 18px;
  min-height: 0;
}

.vibe-editorial-bottom-side {
  display: grid;
  grid-template-rows: repeat(2, minmax(0, 1fr));
  gap: 18px;
  min-height: 0;
}

.vibe-editorial-chart {
  padding: 18px 18px 16px;
  display: grid;
  grid-template-rows: auto 1fr;
  gap: 14px;
  min-height: 0;
}

.vibe-editorial-card-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}

.vibe-editorial-card-title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.vibe-editorial-card-subtitle {
  margin-top: 4px;
  color: var(--ve-muted);
  font-size: 12px;
}

.vibe-editorial-badge {
  padding: 8px 10px;
  border-radius: 999px;
  background: var(--ve-badge-bg);
  color: var(--ve-accent);
  font-size: 11px;
  font-weight: 700;
}

.vibe-editorial-chart-canvas {
  min-height: 0;
  height: 100%;
}

.vibe-editorial-chart-foot {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  color: var(--ve-muted);
  font-size: 12px;
}

.vibe-editorial-bars {
  display: grid;
  gap: 12px;
  align-content: start;
}

.vibe-editorial-bar-row {
  display: grid;
  grid-template-columns: minmax(0, 120px) minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
}

.vibe-editorial-bar-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: var(--ve-text);
}

.vibe-editorial-bar-track {
  position: relative;
  height: 10px;
  border-radius: 999px;
  overflow: hidden;
  background: var(--ve-track);
}

.vibe-editorial-bar-fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--ve-accent) 0%, var(--ve-accent-alt) 100%);
}

.vibe-editorial-bar-value {
  font-size: 12px;
  font-weight: 700;
}

.vibe-editorial-page--studio .vibe-editorial-shell {
  gap: 24px;
  padding: 28px;
}

.vibe-editorial-page--studio .vibe-editorial-card {
  border-radius: 18px;
  backdrop-filter: none;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.08);
}

.vibe-editorial-page--studio .vibe-editorial-title {
  font-size: 34px;
  letter-spacing: -0.045em;
}

.vibe-editorial-page--magazine .vibe-editorial-shell {
  grid-template-rows: auto auto minmax(0, 1.72fr) minmax(0, 0.9fr);
}

.vibe-editorial-page--magazine .vibe-editorial-header {
  grid-template-columns: minmax(0, 1fr);
}

.vibe-editorial-page--magazine .vibe-editorial-title {
  font-size: 54px;
  line-height: 0.92;
  max-width: 11ch;
}

.vibe-editorial-page--magazine .vibe-editorial-subtitle {
  max-width: 54ch;
  font-size: 15px;
}

.vibe-editorial-page--magazine .vibe-editorial-meta-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.vibe-editorial-page--brutalist::before {
  opacity: 0.32;
}

.vibe-editorial-page--brutalist .vibe-editorial-card {
  border-radius: 10px;
  border-width: 2px;
  box-shadow: 10px 10px 0 rgba(17, 17, 17, 0.16);
  backdrop-filter: none;
}

.vibe-editorial-page--brutalist .vibe-editorial-title,
.vibe-editorial-page--brutalist .vibe-editorial-kpi-value {
  letter-spacing: -0.06em;
}

.vibe-editorial-page--brutalist .vibe-editorial-badge,
.vibe-editorial-page--brutalist .vibe-editorial-eyebrow {
  border-radius: 6px;
}

.vibe-editorial-page--noir .vibe-editorial-card {
  background: linear-gradient(180deg, rgba(16, 26, 43, 0.96) 0%, rgba(8, 16, 30, 0.92) 100%);
  border-color: rgba(143, 164, 190, 0.18);
  box-shadow: 0 28px 80px rgba(2, 6, 23, 0.52);
}

.vibe-editorial-page--noir .vibe-editorial-title {
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.vibe-editorial-page--noir .vibe-editorial-filter-chip,
.vibe-editorial-page--noir .vibe-editorial-meta-pill,
.vibe-editorial-page--noir .vibe-editorial-insight {
  background: rgba(125, 211, 252, 0.08);
}
`;

export function EditorialPageRenderer({
  report,
  page,
  queries,
  dataSource,
  theme,
  apiBaseUrl,
  viewportMode = 'contained',
}: EditorialPageRendererProps) {
  const components = useMemo(() => {
    const filtered = (Array.isArray(page.components) ? page.components : [])
      .filter((component): component is ComponentDefinition => Boolean(component) && component.type !== 'filter');

    if (filtered.length > 0) {
      return filtered;
    }

    return queries.slice(0, 10).map((query, index) => {
      const type = inferSyntheticComponentType(query.name, index);
      const config = type === 'data-table'
        ? { title: query.name, columns: [] }
        : type === 'kpi-card'
          ? { title: query.name, valueField: 'value', format: { type: 'number' as const } }
          : { title: query.name, chartType: 'bar' as const, series: [] };

      return {
        id: `synthetic-${query.id}`,
        type,
        position: { x: 0, y: index, w: 12, h: 4 },
        queryRef: query.id,
        config,
      } satisfies ComponentDefinition;
    });
  }, [page.components, queries]);

  const pageQueries = useMemo(() => {
    const explicitIds = new Set(
      components
        .map((component) => component.queryRef)
        .filter((value): value is string => Boolean(value))
    );

    if (explicitIds.size === 0) {
      return queries;
    }

    return queries.filter((query) => explicitIds.has(query.id));
  }, [components, queries]);

  const [rowsByQuery, setRowsByQuery] = useState<Record<string, DataRow[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadPageQueries() {
      if (pageQueries.length === 0) {
        setRowsByQuery({});
        setLoading(false);
        setError(null);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const entries = await Promise.all(pageQueries.map(async (query) => ([
          query.id,
          await fetchQueryRows({
            query,
            dataSource,
            apiBaseUrl,
          }),
        ] as const)));

        if (!cancelled) {
          setRowsByQuery(Object.fromEntries(entries));
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadPageQueries();
    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl, dataSource, pageQueries]);

  const datasets = useMemo<ResolvedDataset[]>(() => (
    components.map((component) => {
      const query = component.queryRef
        ? queries.find((candidate) => candidate.id === component.queryRef)
        : undefined;
      const rows = query ? (rowsByQuery[query.id] || []) : [];
      return {
        component,
        query,
        rows,
        analysis: analyzeRows(rows),
        title: resolveComponentTitle(component, query),
        chartType: getComponentConfigString(component, 'chartType') || inferChartTypeFromTitle(query?.name || component.id),
        orientation: getComponentConfigString(component, 'orientation') || 'vertical',
      };
    })
  ), [components, queries, rowsByQuery]);

  const shippingBundle = useMemo(
    () => buildShippingEditorialBundle(report, datasets),
    [report, datasets]
  );

  const metricCards = useMemo(() => buildMetricCards(datasets), [datasets]);
  const charts = useMemo(() => datasets.filter((dataset) => dataset.component.type === 'echarts'), [datasets]);
  const tables = useMemo(() => datasets.filter((dataset) => dataset.component.type === 'data-table'), [datasets]);
  const heroChart = useMemo(() => selectHeroChart(charts), [charts]);
  const supportCharts = useMemo(
    () => charts.filter((dataset) => dataset.component.id !== heroChart?.component.id).slice(0, 4),
    [charts, heroChart]
  );
  const detailTable = useMemo(() => selectDetailTable(tables, charts), [charts, tables]);
  const summaryItems = useMemo(
    () => buildSummaryItems(report, page, metricCards, heroChart, supportCharts, detailTable),
    [detailTable, heroChart, metricCards, page, report, supportCharts]
  );

  const variant = useMemo(() => selectVariant(report, theme), [report, theme]);
  const darkMode = useMemo(() => isDarkTheme(theme), [theme]);

  const cssVars = useMemo<React.CSSProperties>(() => {
    const background = theme.colors.background || (darkMode ? '#0f172a' : '#f4f1ea');
    const surface = theme.colors.surface || (darkMode ? '#111827' : '#fcfbf8');
    const accent = theme.colors.primary || '#0e7490';
    const accentAlt = theme.colors.secondary || '#c97a32';
    const text = theme.colors.text || (darkMode ? '#e5eef7' : '#152132');
    const muted = theme.colors.textSecondary || mixColors(text, background, 0.42, '#617082');

    return {
      '--ve-bg': background,
      '--ve-bg-elevated': darkMode ? mixColors(background, '#020617', 0.84, background) : mixColors(background, '#ffffff', 0.86, background),
      '--ve-surface': withAlpha(surface, darkMode ? 0.92 : 0.88, surface),
      '--ve-surface-strong': withAlpha(mixColors(surface, background, 0.92, surface), darkMode ? 0.98 : 0.94),
      '--ve-panel': withAlpha(mixColors(surface, background, 0.86, surface), darkMode ? 0.72 : 0.62),
      '--ve-text': text,
      '--ve-muted': muted,
      '--ve-accent': accent,
      '--ve-accent-alt': accentAlt,
      '--ve-accent-soft': withAlpha(accent, darkMode ? 0.18 : 0.16),
      '--ve-accent-alt-soft': withAlpha(accentAlt, darkMode ? 0.16 : 0.14),
      '--ve-border': withAlpha(text, darkMode ? 0.12 : 0.08),
      '--ve-grid-line': withAlpha(text, darkMode ? 0.04 : 0.035),
      '--ve-track': withAlpha(text, darkMode ? 0.1 : 0.08),
      '--ve-hover': withAlpha(accent, darkMode ? 0.14 : 0.08),
      '--ve-chip-bg': withAlpha(surface, darkMode ? 0.74 : 0.84),
      '--ve-badge-bg': withAlpha(accent, darkMode ? 0.14 : 0.1),
      '--ve-shadow': withAlpha(text, darkMode ? 0.28 : 0.1),
      '--ve-font-body': theme.typography.fontFamily || '"Source Han Sans SC", "Microsoft YaHei UI", sans-serif',
      '--ve-font-display': resolveDisplayFont(variant),
    } as React.CSSProperties;
  }, [darkMode, theme, variant]);

  if (loading && Object.keys(rowsByQuery).length === 0) {
    return <EditorialSkeleton cssVars={cssVars} />;
  }

  if (error && datasets.every((dataset) => dataset.rows.length === 0)) {
    return (
      <div className="vibe-editorial-page" style={cssVars}>
        <style>{`${EDITORIAL_REPORT_STYLES}${EDITORIAL_REPORT_STYLES_EXTRA}`}</style>
        <div className="vibe-editorial-shell">
          <section className="vibe-editorial-card vibe-editorial-summary">
            <div className="vibe-editorial-card-head">
              <div>
                <p className="vibe-editorial-eyebrow">HTML Report</p>
                <h1 className="vibe-editorial-title">{report.name}</h1>
              </div>
            </div>
            <div className="vibe-editorial-summary-item">
              <strong>查询结果暂时不可用</strong>
              <span>{error}</span>
            </div>
          </section>
        </div>
      </div>
    );
  }

  if (shippingBundle) {
    return (
      <ShippingEditorialPageRenderer
        theme={theme}
        bundle={shippingBundle}
        pageFilters={page.filters}
        filterPlacement={report.runtimeHints?.filterPlacement}
        viewportMode={viewportMode}
      />
    );
  }

  const filterChips = (page.filters || []).slice(0, 4);
  const headerSubtitle = report.description?.trim()
    || summaryItems[0]?.detail
    || '用经营摘要、趋势、结构和明细四层信息组织当前页面，避免旧式平均切格。';

  return (
    <div
      className={`vibe-editorial-page vibe-editorial-page--${variant}`}
      style={{
        ...cssVars,
        height: viewportMode === 'document' ? 'auto' : '100%',
        minHeight: viewportMode === 'document' ? 1080 : undefined,
        overflow: viewportMode === 'document' ? 'visible' : 'hidden',
      }}
    >
      <style>{`${EDITORIAL_REPORT_STYLES}${EDITORIAL_REPORT_STYLES_EXTRA}`}</style>
      <div
        className="vibe-editorial-shell"
        style={{
          height: viewportMode === 'document' ? 'auto' : '100%',
          minHeight: viewportMode === 'document' ? 1080 : undefined,
        }}
      >
        <section className="vibe-editorial-header">
          <article className="vibe-editorial-card vibe-editorial-hero">
            <div className="vibe-editorial-eyebrow">{page.name || 'Overview'}</div>
            <div>
              <h1 className="vibe-editorial-title">{report.name}</h1>
              <p className="vibe-editorial-subtitle">{headerSubtitle}</p>
            </div>
            <div className="vibe-editorial-insights">
              {summaryItems.slice(0, 3).map((item) => (
                <div key={item.id} className="vibe-editorial-insight">
                  <span className="vibe-editorial-insight-label">{item.label}</span>
                  <span className="vibe-editorial-insight-value">{item.value}</span>
                </div>
              ))}
            </div>
          </article>
          <aside className="vibe-editorial-card vibe-editorial-meta">
            <div className="vibe-editorial-meta-grid">
              <div className="vibe-editorial-meta-pill">
                <span className="vibe-editorial-meta-label">主题</span>
                <span className="vibe-editorial-meta-value">{theme.name || 'Custom Theme'}</span>
              </div>
              <div className="vibe-editorial-meta-pill">
                <span className="vibe-editorial-meta-label">页面结构</span>
                <span className="vibe-editorial-meta-value">{metricCards.length} KPI · {charts.length} 图表</span>
              </div>
              <div className="vibe-editorial-meta-pill">
                <span className="vibe-editorial-meta-label">明细视图</span>
                <span className="vibe-editorial-meta-value">{detailTable ? detailTable.title : '未生成'}</span>
              </div>
              <div className="vibe-editorial-meta-pill">
                <span className="vibe-editorial-meta-label">布局模式</span>
                <span className="vibe-editorial-meta-value">{resolveVariantLabel(variant)}</span>
              </div>
            </div>
            {filterChips.length > 0 ? (
              <div className="vibe-editorial-filter-row">
                {filterChips.map((filter) => (
                  <span key={filter.id} className="vibe-editorial-filter-chip">
                    <strong>{cleanFieldLabel(filter.target.column)}</strong>
                    <span>{filter.type}</span>
                  </span>
                ))}
              </div>
            ) : null}
          </aside>
        </section>

        <section className="vibe-editorial-kpis">
          {metricCards.slice(0, 4).map((metric) => (
            <article key={metric.id} className="vibe-editorial-card vibe-editorial-kpi">
              <div className="vibe-editorial-kpi-label">{metric.title}</div>
              <div className="vibe-editorial-kpi-value">{formatMetricValue(metric.value, metric.title)}</div>
              <div className="vibe-editorial-kpi-note">{metric.note || '来自当前页面聚合结果'}</div>
              <SparklineStrip values={extractSparklineValues(heroChart)} />
            </article>
          ))}
        </section>

        <section className="vibe-editorial-main">
          {heroChart ? (
            <article className="vibe-editorial-card vibe-editorial-chart">
              <CardHeader
                title={heroChart.title}
                subtitle={buildDatasetSubtitle(heroChart)}
                badge={resolveChartBadge(heroChart)}
              />
              <div className="vibe-editorial-chart-canvas">
                <ChartCard dataset={heroChart} emphasis="hero" />
              </div>
            </article>
          ) : (
            <article className="vibe-editorial-card vibe-editorial-summary">
              <CardHeader title="等待图表数据" subtitle="当前页面还没有可用的图表结果。" />
            </article>
          )}
          <div className="vibe-editorial-stack">
            {supportCharts.slice(0, 2).map((dataset) => (
              <article key={dataset.component.id} className="vibe-editorial-card vibe-editorial-chart">
                <CardHeader
                  title={dataset.title}
                  subtitle={buildDatasetSubtitle(dataset)}
                  badge={resolveChartBadge(dataset)}
                />
                <div className="vibe-editorial-chart-canvas">
                  <ChartCard dataset={dataset} emphasis="support" />
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="vibe-editorial-bottom">
          {detailTable ? (
            <article className="vibe-editorial-card vibe-editorial-table">
              <CardHeader title={detailTable.title} subtitle={buildDatasetSubtitle(detailTable)} badge="Detail" />
              <div className="vibe-editorial-table-scroll">
                <DetailTable dataset={detailTable} />
              </div>
            </article>
          ) : (
            <article className="vibe-editorial-card vibe-editorial-summary">
              <CardHeader title="页面明细" subtitle="当前页没有可用于还原的透视或明细结果。" />
              <div className="vibe-editorial-summary-list">
                {summaryItems.slice(0, 3).map((item) => (
                  <div key={item.id} className="vibe-editorial-summary-item">
                    <strong>{item.label}</strong>
                    <span>{item.detail}</span>
                  </div>
                ))}
              </div>
            </article>
          )}
          <div className="vibe-editorial-bottom-side">
            {supportCharts.slice(2, 4).map((dataset) => (
              <article key={dataset.component.id} className="vibe-editorial-card vibe-editorial-chart">
                <CardHeader
                  title={dataset.title}
                  subtitle={buildDatasetSubtitle(dataset)}
                  badge={resolveChartBadge(dataset)}
                />
                <div className="vibe-editorial-chart-canvas">
                  <ChartCard dataset={dataset} emphasis="support" />
                </div>
              </article>
            ))}
            <article className="vibe-editorial-card vibe-editorial-summary">
              <CardHeader title="分析见解" subtitle="围绕当前页已加载数据自动整理出的重点。" badge="Notes" />
              <div className="vibe-editorial-summary-list">
                {summaryItems.slice(0, 4).map((item) => (
                  <div key={item.id} className="vibe-editorial-summary-item">
                    <strong>{item.label}</strong>
                    <span>{item.detail}</span>
                  </div>
                ))}
              </div>
            </article>
          </div>
        </section>
      </div>
    </div>
  );
}

const EDITORIAL_REPORT_STYLES_EXTRA = `
.vibe-editorial-donut {
  display: grid;
  grid-template-columns: 180px minmax(0, 1fr);
  gap: 18px;
  align-items: center;
  height: 100%;
}

.vibe-editorial-donut-ring {
  width: 180px;
  aspect-ratio: 1;
  border-radius: 50%;
  position: relative;
  box-shadow: inset 0 0 0 1px var(--ve-border);
}

.vibe-editorial-donut-ring::after {
  content: "";
  position: absolute;
  inset: 28px;
  border-radius: 50%;
  background: var(--ve-surface-strong);
  box-shadow: inset 0 0 0 1px var(--ve-border);
}

.vibe-editorial-donut-center {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  z-index: 1;
  text-align: center;
}

.vibe-editorial-donut-center strong {
  display: block;
  font-size: 28px;
  line-height: 1;
}

.vibe-editorial-donut-center span {
  margin-top: 6px;
  color: var(--ve-muted);
  font-size: 12px;
}

.vibe-editorial-legend {
  display: grid;
  gap: 10px;
}

.vibe-editorial-legend-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
}

.vibe-editorial-swatch {
  width: 12px;
  height: 12px;
  border-radius: 999px;
}

.vibe-editorial-table {
  padding: 18px;
  display: grid;
  grid-template-rows: auto 1fr;
  gap: 14px;
  min-height: 0;
}

.vibe-editorial-table-scroll {
  min-height: 0;
  overflow: auto;
  border-radius: 18px;
  border: 1px solid var(--ve-border);
  background: var(--ve-panel);
}

.vibe-editorial-table-grid {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.vibe-editorial-table-grid th,
.vibe-editorial-table-grid td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--ve-border);
  white-space: nowrap;
}

.vibe-editorial-table-grid thead th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--ve-surface);
  text-align: left;
}

.vibe-editorial-table-grid tbody tr:hover td {
  background: var(--ve-hover);
}

.vibe-editorial-summary {
  padding: 18px;
  display: grid;
  gap: 14px;
}

.vibe-editorial-summary-list {
  display: grid;
  gap: 12px;
}

.vibe-editorial-summary-item {
  padding: 14px 16px;
  border-radius: 18px;
  background: var(--ve-panel);
  border: 1px solid var(--ve-border);
}

.vibe-editorial-summary-item strong {
  display: block;
  font-size: 14px;
  margin-bottom: 6px;
}

.vibe-editorial-summary-item span {
  color: var(--ve-muted);
  font-size: 12px;
  line-height: 1.7;
}

.vibe-editorial-skeleton {
  background:
    linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.42) 50%, transparent 100%),
    var(--ve-panel);
  background-size: 220px 100%;
  animation: vibe-editorial-sheen 1.6s linear infinite;
}

@keyframes vibe-editorial-sheen {
  from { background-position: -220px 0; }
  to { background-position: calc(100% + 220px) 0; }
}
`;

function EditorialSkeleton({ cssVars }: { cssVars: React.CSSProperties }) {
  return (
    <div className="vibe-editorial-page" style={cssVars}>
      <style>{`${EDITORIAL_REPORT_STYLES}${EDITORIAL_REPORT_STYLES_EXTRA}`}</style>
      <div className="vibe-editorial-shell">
        <div className="vibe-editorial-header">
          <div className="vibe-editorial-card vibe-editorial-skeleton" />
          <div className="vibe-editorial-card vibe-editorial-skeleton" />
        </div>
        <div className="vibe-editorial-kpis">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="vibe-editorial-card vibe-editorial-skeleton" />
          ))}
        </div>
        <div className="vibe-editorial-main">
          <div className="vibe-editorial-card vibe-editorial-skeleton" />
          <div className="vibe-editorial-stack">
            <div className="vibe-editorial-card vibe-editorial-skeleton" />
            <div className="vibe-editorial-card vibe-editorial-skeleton" />
          </div>
        </div>
        <div className="vibe-editorial-bottom">
          <div className="vibe-editorial-card vibe-editorial-skeleton" />
          <div className="vibe-editorial-bottom-side">
            <div className="vibe-editorial-card vibe-editorial-skeleton" />
            <div className="vibe-editorial-card vibe-editorial-skeleton" />
          </div>
        </div>
      </div>
    </div>
  );
}

function CardHeader({ title, subtitle, badge }: { title: string; subtitle?: string; badge?: string }) {
  return (
    <div className="vibe-editorial-card-head">
      <div>
        <h2 className="vibe-editorial-card-title">{title}</h2>
        {subtitle ? <div className="vibe-editorial-card-subtitle">{subtitle}</div> : null}
      </div>
      {badge ? <span className="vibe-editorial-badge">{badge}</span> : null}
    </div>
  );
}

function ChartCard({ dataset, emphasis }: { dataset: ResolvedDataset; emphasis: 'hero' | 'support' }) {
  const semanticKind = resolveSemanticKind(dataset);
  if (semanticKind === 'donut') {
    return <DonutChart dataset={dataset} />;
  }

  if (semanticKind === 'trend') {
    return <LineTrendChart dataset={dataset} hero={emphasis === 'hero'} />;
  }

  return <BarComparisonChart dataset={dataset} hero={emphasis === 'hero'} />;
}

function LineTrendChart({ dataset, hero }: { dataset: ResolvedDataset; hero: boolean }) {
  const { primaryCategoryField, primaryValueField } = dataset.analysis;
  if (!primaryCategoryField || !primaryValueField || dataset.rows.length === 0) {
    return <EmptyState text="当前趋势图还没有可用数据。" />;
  }

  const points = dataset.rows.slice(0, hero ? 12 : 8).map((row) => ({
    label: String(row[primaryCategoryField] ?? ''),
    value: Number(row[primaryValueField] ?? 0),
  }));
  const max = Math.max(...points.map((point) => point.value), 1);
  const min = Math.min(...points.map((point) => point.value), 0);
  const span = Math.max(max - min, 1);
  const width = 680;
  const height = hero ? 280 : 180;
  const pointGap = points.length > 1 ? width / (points.length - 1) : width;
  const pointList = points.map((point, index) => {
    const x = index * pointGap;
    const y = height - ((point.value - min) / span) * (height - 28) - 14;
    return { ...point, x, y };
  });
  const linePath = pointList.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
  const areaPath = `${linePath} L ${pointList[pointList.length - 1]?.x ?? width} ${height} L 0 ${height} Z`;

  return (
    <div style={{ display: 'grid', gridTemplateRows: '1fr auto', gap: 12, height: '100%' }}>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
        {Array.from({ length: 4 }, (_, index) => {
          const y = (height / 4) * index + 12;
          return <line key={index} x1="0" y1={y} x2={width} y2={y} stroke="var(--ve-border)" strokeDasharray="4 6" />;
        })}
        <path d={areaPath} fill="url(#ve-area-gradient)" opacity="0.34" />
        <path d={linePath} fill="none" stroke="var(--ve-accent)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        <defs>
          <linearGradient id="ve-area-gradient" x1="0%" x2="0%" y1="0%" y2="100%">
            <stop offset="0%" stopColor="var(--ve-accent)" stopOpacity="0.42" />
            <stop offset="100%" stopColor="var(--ve-accent-alt)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {pointList.map((point, index) => (
          <g key={`${point.label}-${index}`}>
            <title>{`${point.label}: ${formatMetricValue(point.value, dataset.title)}`}</title>
            <circle cx={point.x} cy={point.y} r="5.5" fill="var(--ve-accent)" stroke="var(--ve-surface-strong)" strokeWidth="2" />
          </g>
        ))}
      </svg>
      <div className="vibe-editorial-chart-foot">
        <span>{points[0]?.label}</span>
        <strong>{formatMetricValue(points[points.length - 1]?.value || 0, dataset.title)}</strong>
        <span>{points[points.length - 1]?.label}</span>
      </div>
    </div>
  );
}

function BarComparisonChart({ dataset, hero }: { dataset: ResolvedDataset; hero: boolean }) {
  const { primaryCategoryField, primaryValueField } = dataset.analysis;
  if (!primaryCategoryField || !primaryValueField || dataset.rows.length === 0) {
    return <EmptyState text="当前比较图还没有可用数据。" />;
  }

  const items = dataset.rows
    .map((row) => ({
      label: String(row[primaryCategoryField] ?? ''),
      value: Number(row[primaryValueField] ?? 0),
    }))
    .filter((item) => item.label)
    .sort((left, right) => right.value - left.value)
    .slice(0, hero ? 8 : 6);
  const max = Math.max(...items.map((item) => item.value), 1);

  return (
    <div className="vibe-editorial-bars">
      {items.map((item) => (
        <div key={item.label} className="vibe-editorial-bar-row">
          <span className="vibe-editorial-bar-label" title={item.label}>{item.label}</span>
          <div className="vibe-editorial-bar-track">
            <div
              className="vibe-editorial-bar-fill"
              title={`${item.label}: ${formatMetricValue(item.value, dataset.title)}`}
              style={{ width: `${Math.max(6, (item.value / max) * 100)}%` }}
            />
          </div>
          <span className="vibe-editorial-bar-value">{formatMetricValue(item.value, dataset.title)}</span>
        </div>
      ))}
    </div>
  );
}

function DonutChart({ dataset }: { dataset: ResolvedDataset }) {
  const { primaryCategoryField, primaryValueField } = dataset.analysis;
  if (!primaryCategoryField || !primaryValueField || dataset.rows.length === 0) {
    return <EmptyState text="当前结构图还没有可用数据。" />;
  }

  const items = dataset.rows
    .map((row) => ({
      label: String(row[primaryCategoryField] ?? ''),
      value: Number(row[primaryValueField] ?? 0),
    }))
    .filter((item) => item.label)
    .sort((left, right) => right.value - left.value)
    .slice(0, 6);
  const total = Math.max(items.reduce((sum, item) => sum + item.value, 0), 1);
  const palette = buildPalette(items.length);
  const stops = items.reduce<{ cursor: number; stops: string[] }>((accumulator, item, index) => {
    const start = accumulator.cursor;
    const nextCursor = start + ((item.value / total) * 100);
    accumulator.stops.push(`${palette[index]} ${start.toFixed(2)}% ${nextCursor.toFixed(2)}%`);
    return {
      cursor: nextCursor,
      stops: accumulator.stops,
    };
  }, { cursor: 0, stops: [] }).stops.join(', ');

  return (
    <div className="vibe-editorial-donut">
      <div className="vibe-editorial-donut-ring" style={{ background: `conic-gradient(${stops})` }}>
        <div className="vibe-editorial-donut-center">
          <div>
            <strong>{items.length}</strong>
            <span>类目</span>
          </div>
        </div>
      </div>
      <div className="vibe-editorial-legend">
        {items.map((item, index) => (
          <div key={item.label} className="vibe-editorial-legend-row">
            <span className="vibe-editorial-swatch" style={{ background: palette[index] }} />
            <span className="vibe-editorial-bar-label" title={item.label}>{item.label}</span>
            <strong>{Math.round((item.value / total) * 100)}%</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function DetailTable({ dataset }: { dataset: ResolvedDataset }) {
  const pivotTable = buildPivotTable(dataset);
  if (pivotTable) {
    const max = Math.max(
      ...pivotTable.rows.flatMap((row) => row.values),
      1
    );

    return (
      <table className="vibe-editorial-table-grid">
        <thead>
          <tr>
            <th>{pivotTable.rowLabel}</th>
            {pivotTable.columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
            <th>合计</th>
          </tr>
        </thead>
        <tbody>
          {pivotTable.rows.map((row) => (
            <tr key={row.id}>
              <td>{row.label}</td>
              {row.values.map((value, index) => {
                const heatAlpha = Math.min(0.58, Math.max(0.08, value / max));
                return (
                  <td
                    key={`${row.id}-${pivotTable.columns[index]}`}
                    title={`${row.label} · ${pivotTable.columns[index]}: ${formatMetricValue(value, dataset.title)}`}
                    style={{
                      background: withAlpha('#0E7490', heatAlpha, `rgba(14, 116, 144, ${heatAlpha})`),
                      color: heatAlpha > 0.32 ? '#ffffff' : 'var(--ve-text)',
                      fontWeight: 700,
                      textAlign: 'center',
                    }}
                  >
                    {formatMetricValue(value, dataset.title)}
                  </td>
                );
              })}
              <td style={{ fontWeight: 800 }}>{formatMetricValue(row.total, dataset.title)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  const columns = dataset.analysis.columns.slice(0, 8);
  const rows = dataset.rows.slice(0, 10);
  return (
    <table className="vibe-editorial-table-grid">
      <thead>
        <tr>
          {columns.map((column) => (
            <th key={column}>{cleanFieldLabel(column)}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, rowIndex) => (
          <tr key={String(row.__rowIndex ?? rowIndex)}>
            {columns.map((column) => (
              <td key={`${rowIndex}-${column}`}>{stringifyValue(row[column])}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="vibe-editorial-summary-item">
      <strong>暂无数据</strong>
      <span>{text}</span>
    </div>
  );
}

function SparklineStrip({ values }: { values: number[] }) {
  if (values.length < 2) {
    return <div className="vibe-editorial-kpi-sparkline" />;
  }

  const width = 180;
  const height = 42;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = Math.max(max - min, 1);
  const gap = width / (values.length - 1);
  const path = values
    .map((value, index) => {
      const x = index * gap;
      const y = height - ((value - min) / span) * (height - 8) - 4;
      return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
    })
    .join(' ');

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="vibe-editorial-kpi-sparkline" preserveAspectRatio="none">
      <path d={path} fill="none" stroke="var(--ve-accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function buildMetricCards(datasets: ResolvedDataset[]): MetricCardModel[] {
  const fromComponents = datasets
    .filter((dataset) => dataset.component.type === 'kpi-card')
    .map(toMetricCard)
    .filter((metric): metric is MetricCardModel => Boolean(metric));

  if (fromComponents.length > 0) {
    return fromComponents.slice(0, 4);
  }

  return datasets
    .filter((dataset) => dataset.rows.length <= 2 && dataset.analysis.numericFields.length > 0)
    .map(toMetricCard)
    .filter((metric): metric is MetricCardModel => Boolean(metric))
    .slice(0, 4);
}

function toMetricCard(dataset: ResolvedDataset): MetricCardModel | null {
  const primaryField = dataset.analysis.primaryValueField;
  if (!primaryField || dataset.rows.length === 0) {
    return null;
  }

  const firstRow = dataset.rows[0];
  const compareField = dataset.analysis.secondaryValueField;
  return {
    id: dataset.component.id,
    title: dataset.title,
    value: Number(firstRow[primaryField] ?? 0),
    compareValue: compareField ? Number(firstRow[compareField] ?? 0) : undefined,
    note: compareField ? `${cleanFieldLabel(compareField)} ${formatMetricValue(Number(firstRow[compareField] ?? 0), dataset.title)}` : undefined,
  };
}

function selectHeroChart(charts: ResolvedDataset[]): ResolvedDataset | null {
  if (charts.length === 0) {
    return null;
  }

  return charts
    .slice()
    .sort((left, right) => scoreHeroChart(right) - scoreHeroChart(left))[0];
}

function scoreHeroChart(dataset: ResolvedDataset): number {
  let score = 0;
  if (dataset.analysis.timeFields.length > 0) {
    score += 40;
  }
  if (dataset.chartType === 'line' || dataset.chartType === 'area') {
    score += 26;
  }
  if (/趋势|年月|月份|month|year|time/i.test(dataset.title)) {
    score += 20;
  }
  score += Math.min(dataset.rows.length, 18);
  return score;
}

function selectDetailTable(tables: ResolvedDataset[], charts: ResolvedDataset[]): ResolvedDataset | null {
  if (tables.length > 0) {
    return tables[0];
  }

  return charts.find((dataset) => /明细|detail|matrix|透视/i.test(dataset.title) || hasPivotShape(dataset.rows)) || null;
}

function buildSummaryItems(
  report: ReportDefinition,
  page: PageDefinition,
  metricCards: MetricCardModel[],
  heroChart: ResolvedDataset | null,
  supportCharts: ResolvedDataset[],
  detailTable: ResolvedDataset | null
) {
  const items: Array<{ id: string; label: string; value: string; detail: string }> = [];

  if (metricCards[0]) {
    items.push({
      id: 'metric-0',
      label: metricCards[0].title,
      value: formatMetricValue(metricCards[0].value, metricCards[0].title),
      detail: `${metricCards[0].title} 作为当前页的主摘要指标，直接放在信息入口。`,
    });
  }

  if (heroChart) {
    const bestPoint = extractBestPoint(heroChart);
    items.push({
      id: 'hero',
      label: heroChart.title,
      value: bestPoint ? `${bestPoint.label} · ${formatMetricValue(bestPoint.value, heroChart.title)}` : '已生成',
      detail: bestPoint
        ? `${heroChart.title} 在 ${bestPoint.label} 达到当前页中最强峰值，用作主视觉区。`
        : `${heroChart.title} 被安排为主视觉区，用来承接趋势主线。`,
    });
  }

  if (supportCharts[0]) {
    items.push({
      id: 'support',
      label: supportCharts[0].title,
      value: supportCharts[0].rows.length ? `${supportCharts[0].rows.length} 条记录` : '辅助视图',
      detail: `${supportCharts[0].title} 被放入侧栏，用来补足结构或对比信息。`,
    });
  }

  if (detailTable) {
    items.push({
      id: 'detail',
      label: detailTable.title,
      value: `${detailTable.rows.length} 行`,
      detail: `${detailTable.title} 位于底部明细区，承担核对与解释作用。`,
    });
  }

  if (items.length === 0) {
    items.push({
      id: 'fallback',
      label: page.name || report.name,
      value: '1 页',
      detail: '当前页暂无足够结果用于自动提炼见解，但整页 HTML 运行时已启用。',
    });
  }

  return items;
}

function extractBestPoint(dataset: ResolvedDataset): { label: string; value: number } | null {
  const { primaryCategoryField, primaryValueField } = dataset.analysis;
  if (!primaryCategoryField || !primaryValueField) {
    return null;
  }

  const item = dataset.rows
    .map((row) => ({
      label: String(row[primaryCategoryField] ?? ''),
      value: Number(row[primaryValueField] ?? 0),
    }))
    .sort((left, right) => right.value - left.value)[0];

  return item?.label ? item : null;
}

function buildDatasetSubtitle(dataset: ResolvedDataset): string {
  if (dataset.analysis.primaryCategoryField && dataset.analysis.primaryValueField) {
    return `${cleanFieldLabel(dataset.analysis.primaryCategoryField)} × ${cleanFieldLabel(dataset.analysis.primaryValueField)}`;
  }

  if (dataset.analysis.columns.length > 0) {
    return dataset.analysis.columns.slice(0, 3).map(cleanFieldLabel).join(' · ');
  }

  return dataset.query?.name || dataset.component.id;
}

function resolveChartBadge(dataset: ResolvedDataset): string {
  const semanticKind = resolveSemanticKind(dataset);
  if (semanticKind === 'trend') {
    return 'Trend';
  }
  if (semanticKind === 'donut') {
    return 'Mix';
  }
  return dataset.orientation === 'horizontal' ? 'Rank' : 'Compare';
}

function resolveSemanticKind(dataset: ResolvedDataset): 'trend' | 'bar' | 'donut' {
  if (dataset.chartType === 'pie' || /占比|构成|结构|分布|share|mix/i.test(dataset.title)) {
    return 'donut';
  }

  if (dataset.analysis.timeFields.length > 0 || dataset.chartType === 'line' || dataset.chartType === 'area') {
    return 'trend';
  }

  return 'bar';
}

function buildPivotTable(dataset: ResolvedDataset): PivotTableModel | null {
  if (!hasPivotShape(dataset.rows)) {
    return null;
  }

  const labelField = dataset.analysis.categoricalFields.find((field) => !/grandtotal|rowindex|columnindex|level/i.test(field))
    || dataset.analysis.categoricalFields[0];
  const columnIndexField = dataset.analysis.columns.find((field) => /columnindex|月序|monthindex|月份序号/i.test(field))
    || dataset.analysis.columns.find((field) => /月份|month|月/i.test(field));
  const valueField = dataset.analysis.numericFields.find((field) => !/columnindex|sortby/i.test(field))
    || dataset.analysis.primaryValueField;

  if (!labelField || !columnIndexField || !valueField) {
    return null;
  }

  const grouped = new Map<string, { label: string; total: number; values: Map<string, number> }>();
  const rawColumns = new Set<string>();

  dataset.rows.forEach((row) => {
    if (Boolean(row['[IsGrandTotalRowTotal]']) || Boolean(row['IsGrandTotalRowTotal'])) {
      return;
    }

    const label = String(row[labelField] ?? '').trim();
    if (!label) {
      return;
    }

    const rawColumn = String(row[columnIndexField] ?? '').trim();
    const column = normalizePivotColumn(rawColumn);
    rawColumns.add(column);

    const value = Number(row[valueField] ?? 0);
    const existing = grouped.get(label) || { label, total: 0, values: new Map<string, number>() };
    existing.values.set(column, value);
    existing.total = Math.max(existing.total, Number(row['[SortBy_DM0_0]'] ?? row['SortBy_DM0_0'] ?? 0), sumValues(existing.values));
    grouped.set(label, existing);
  });

  const columns = Array.from(rawColumns).sort((left, right) => comparePivotColumns(left, right));
  const rows = Array.from(grouped.entries())
    .map(([id, entry]) => ({
      id,
      label: entry.label,
      values: columns.map((column) => entry.values.get(column) ?? 0),
      total: entry.total || sumValues(entry.values),
    }))
    .sort((left, right) => right.total - left.total)
    .slice(0, 10);

  return rows.length > 0
    ? {
      rowLabel: cleanFieldLabel(labelField),
      columns,
      rows,
    }
    : null;
}

function analyzeRows(rows: DataRow[]): QueryAnalysis {
  const columns = Object.keys(rows[0] || {}).filter((column) => column !== '__rowIndex');
  const numericFields: string[] = [];
  const categoricalFields: string[] = [];
  const timeFields: string[] = [];

  columns.forEach((column) => {
    const values = rows
      .map((row) => row[column])
      .filter((value) => value !== null && value !== undefined && value !== '');

    if (values.length === 0) {
      categoricalFields.push(column);
      return;
    }

    const numericVotes = values.filter(isNumericLike).length;
    const timeVotes = values.filter((value) => isTimeLike(column, value)).length;

    if (timeVotes >= Math.max(1, Math.floor(values.length * 0.5))) {
      timeFields.push(column);
    } else if (numericVotes >= Math.max(1, Math.floor(values.length * 0.7))) {
      numericFields.push(column);
    } else {
      categoricalFields.push(column);
    }
  });

  const primaryValueField = numericFields.find((field) => !/columnindex|rowindex|sortby/i.test(field))
    || numericFields[0];
  const secondaryValueField = numericFields.find((field) => field !== primaryValueField);
  const primaryCategoryField = timeFields[0]
    || categoricalFields.find((field) => !/rowindex|level/i.test(field))
    || categoricalFields[0];

  return {
    columns,
    numericFields,
    categoricalFields,
    timeFields,
    primaryValueField,
    secondaryValueField,
    primaryCategoryField,
  };
}

function inferSyntheticComponentType(name: string, index: number): ComponentDefinition['type'] {
  if (/明细|detail|table|matrix|透视/i.test(name)) {
    return 'data-table';
  }

  if (index < 4 || /总计|汇总|占比|数量|运力|days|total|count/i.test(name)) {
    return 'kpi-card';
  }

  return 'echarts';
}

function getComponentConfigString(component: ComponentDefinition, key: string): string {
  const value = component.config && typeof component.config === 'object'
    ? (component.config as unknown as Record<string, unknown>)[key]
    : undefined;
  return value == null ? '' : String(value);
}

function resolveComponentTitle(component: ComponentDefinition, query?: QueryDefinition): string {
  const configTitle = getComponentConfigString(component, 'title');
  return configTitle.trim() || query?.name || component.id;
}

function inferChartTypeFromTitle(name: string): string {
  if (/占比|构成|结构|share|mix/i.test(name)) {
    return 'pie';
  }
  if (/趋势|年月|月份|trend|time|year|month/i.test(name)) {
    return 'line';
  }
  return 'bar';
}

function cleanFieldLabel(field: string): string {
  const bracketMatch = field.match(/\[([^\]]+)\]/);
  return (bracketMatch?.[1] || field).replace(/^Dim_\d+_/, '').trim();
}

function normalizePivotColumn(raw: string): string {
  const value = cleanFieldLabel(raw);
  if (/^\d+$/.test(value)) {
    return `${value}月`;
  }
  return value;
}

function comparePivotColumns(left: string, right: string): number {
  const leftNumber = left.match(/^(\d+)/)?.[1];
  const rightNumber = right.match(/^(\d+)/)?.[1];
  if (leftNumber && rightNumber) {
    return Number(leftNumber) - Number(rightNumber);
  }
  return left.localeCompare(right, 'zh-CN');
}

function stringifyValue(value: unknown): string {
  if (value == null) {
    return '';
  }

  if (typeof value === 'number') {
    return Number.isInteger(value) ? value.toLocaleString('zh-CN') : value.toFixed(2);
  }

  if (typeof value === 'boolean') {
    return value ? '是' : '否';
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value);
}

function formatMetricValue(value: number, title?: string): string {
  if (!Number.isFinite(value)) {
    return '-';
  }

  if (/%|占比|ratio|share/i.test(title || '')) {
    return `${value.toFixed(value > 1 ? 1 : 2)}%`;
  }

  if (Math.abs(value) >= 100000000) {
    return `${(value / 100000000).toFixed(2)}亿`;
  }

  if (Math.abs(value) >= 10000) {
    return `${(value / 10000).toFixed(1)}万`;
  }

  if (Math.abs(value) >= 1000) {
    return value.toLocaleString('zh-CN', { maximumFractionDigits: 0 });
  }

  return value.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
}

function extractSparklineValues(dataset: ResolvedDataset | null): number[] {
  if (!dataset || !dataset.analysis.primaryValueField) {
    return [];
  }

  return dataset.rows
    .slice(0, 12)
    .map((row) => Number(row[dataset.analysis.primaryValueField!] ?? 0))
    .filter((value) => Number.isFinite(value));
}

function buildPalette(count: number): string[] {
  const base = ['var(--ve-accent)', 'var(--ve-accent-alt)', '#2563EB', '#7C9A4D', '#8B5E3C', '#C2410C'];
  return Array.from({ length: count }, (_, index) => base[index % base.length]);
}

function hasPivotShape(rows: DataRow[]): boolean {
  if (rows.length === 0) {
    return false;
  }

  const fields = Object.keys(rows[0]);
  return fields.some((field) => /columnindex|isgrandtotalrowtotal/i.test(field));
}

function isNumericLike(value: unknown): boolean {
  if (typeof value === 'number') {
    return Number.isFinite(value);
  }

  if (typeof value !== 'string') {
    return false;
  }

  const normalized = value.replace(/,/g, '').trim();
  return normalized !== '' && !Number.isNaN(Number(normalized));
}

function isTimeLike(column: string, value: unknown): boolean {
  const columnHint = /date|time|month|year|quarter|period|月份|年月|日期|年度|月份序号|月/i.test(column);
  if (columnHint) {
    return true;
  }

  if (typeof value === 'string') {
    return /^\d{4}[-/]\d{1,2}/.test(value) || /^\d{1,2}月$/.test(value) || /^Q\d$/i.test(value);
  }

  return false;
}

function sumValues(values: Map<string, number>): number {
  return Array.from(values.values()).reduce((sum, value) => sum + value, 0);
}

type EditorialVariant = 'harbor' | 'atlas' | 'magazine' | 'studio' | 'brutalist' | 'noir';

function selectVariant(report: ReportDefinition, theme: ThemeDefinition): EditorialVariant {
  const requestedFamily = normalizeStyleFamily(report.runtimeHints?.styleFamily || theme.name);
  switch (requestedFamily) {
    case 'magazine':
      return 'magazine';
    case 'studio':
      return 'studio';
    case 'brutalist':
      return 'brutalist';
    case 'noir':
      return 'noir';
    case 'editorial-atlas':
      return 'atlas';
    case 'editorial-harbor':
      return 'harbor';
    default: {
      const seed = `${report.id}|${report.name}|${theme.name || ''}`;
      const score = seed.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
      return isDarkTheme(theme) || score % 2 === 1 ? 'atlas' : 'harbor';
    }
  }
}

function resolveDisplayFont(variant: EditorialVariant): string {
  switch (variant) {
    case 'studio':
      return '"IBM Plex Sans", "Source Han Sans SC", "Microsoft YaHei UI", sans-serif';
    case 'brutalist':
      return '"Arial Black", "Source Han Sans SC", "Microsoft YaHei UI", sans-serif';
    case 'magazine':
      return '"Cormorant Garamond", "Songti SC", "Noto Serif SC", serif';
    case 'noir':
      return '"Baskerville Old Face", "Times New Roman", "Noto Serif SC", serif';
    case 'atlas':
      return '"Palatino Linotype", "Book Antiqua", "Noto Serif SC", serif';
    default:
      return '"Iowan Old Style", "Palatino Linotype", "Noto Serif SC", serif';
  }
}

function resolveVariantLabel(variant: EditorialVariant): string {
  switch (variant) {
    case 'studio':
      return 'Studio Canvas';
    case 'brutalist':
      return 'Brutalist Signal';
    case 'magazine':
      return 'Magazine Spread';
    case 'noir':
      return 'Midnight Noir';
    case 'atlas':
      return 'Atlas Editorial';
    default:
      return 'Harbor Ledger';
  }
}

function normalizeStyleFamily(value?: string | null): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized.includes('brutal') || normalized.includes('粗野')) {
    return 'brutalist';
  }

  if (normalized.includes('magazine') || normalized.includes('海报') || normalized.includes('杂志')) {
    return 'magazine';
  }

  if (normalized.includes('studio') || normalized.includes('minimal') || normalized.includes('极简')) {
    return 'studio';
  }

  if (normalized.includes('noir') || normalized.includes('电影') || normalized.includes('午夜')) {
    return 'noir';
  }

  if (normalized.includes('atlas') || normalized.includes('serif') || normalized.includes('书卷')) {
    return 'editorial-atlas';
  }

  if (normalized.includes('harbor') || normalized.includes('ledger') || normalized.includes('台账') || normalized.includes('经营')) {
    return 'editorial-harbor';
  }

  if (normalized.includes('shipping') || normalized.includes('航运')) {
    return 'shipping-ops';
  }

  return null;
}

function isDarkTheme(theme: ThemeDefinition): boolean {
  const background = (theme.colors.background || '').replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(background)) {
    return false;
  }

  const red = Number.parseInt(background.slice(0, 2), 16);
  const green = Number.parseInt(background.slice(2, 4), 16);
  const blue = Number.parseInt(background.slice(4, 6), 16);
  const luminance = (0.299 * red) + (0.587 * green) + (0.114 * blue);
  return luminance < 148;
}
