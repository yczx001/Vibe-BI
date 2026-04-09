import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  BindingFieldSchema,
  DataSourceConfig,
  FreeformBindingDefinition,
  PageDefinition,
  QueryDefinition,
  ReportDefinition,
  ThemeDefinition,
  ValueFormat,
} from '@vibe-bi/core';
import { fetchQueryRows } from '../data/useQueryData';
import { useFilters } from '../data/FilterContext';
import { mixColors, withAlpha } from '../theme/colorUtils';
import { resolveFieldReference } from '../utils/fieldResolution';
import { buildCreativeReportData, type CreativeReportData } from './creativeReportData';
import {
  buildShippingEditorialBundle,
  ShippingEditorialPageRenderer,
  type ShippingSourceDataset,
} from './ShippingEditorialPageRenderer';

type DataRow = Record<string, unknown>;

interface CreativeHtmlPageRendererProps {
  report: ReportDefinition;
  page: PageDefinition;
  queries: QueryDefinition[];
  dataSource: DataSourceConfig;
  theme: ThemeDefinition;
  apiBaseUrl?: string;
  viewportMode?: 'contained' | 'document';
}

interface CreativeDataBindingContext {
  name: string;
  alias: string;
  queryRef?: string;
  description?: string;
  label?: string;
  shapeHint?: string;
  fields: string[];
  recommendedFields: string[];
  structuralFields: string[];
  schema: BindingFieldSchema[];
  fieldMap: Record<string, BindingFieldSchema>;
  rows: DataRow[];
}

interface CreativeQueryAnalysis {
  columns: string[];
  numericFields: string[];
  categoricalFields: string[];
  timeFields: string[];
  primaryValueField?: string;
  secondaryValueField?: string;
  primaryCategoryField?: string;
}

interface CreativeScriptContext {
  report: Pick<ReportDefinition, 'id' | 'name' | 'description' | 'runtimeHints'>;
  page: Pick<PageDefinition, 'id' | 'name' | 'filters' | 'viewport'>;
  theme: ThemeDefinition;
  artifactKey: string;
  parity: {
    active: boolean;
    contractVersion: string;
    layoutProfile: string;
  };
  reportData: CreativeReportData;
  filters: {
    values: Record<string, unknown>;
    definitions: PageDefinition['filters'];
    set: (filterId: string, value: unknown) => void;
    clear: (filterId: string) => void;
    clearAll: () => void;
  };
  data: Record<string, CreativeDataBindingContext>;
  queries: Array<Pick<QueryDefinition, 'id' | 'name'>>;
  rowsByQuery: Record<string, DataRow[]>;
}

const DEFAULT_HTML = `
<section class="vcr-fallback">
  <div class="vcr-kicker">Creative HTML</div>
  <h1>{{report.name}}</h1>
  <p>{{report.description}}</p>
</section>
`;

const creativeUiStateStore = new Map<string, Record<string, unknown>>();

export function CreativeHtmlPageRenderer({
  report,
  page,
  queries,
  dataSource,
  theme,
  apiBaseUrl,
  viewportMode = 'contained',
}: CreativeHtmlPageRendererProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const scriptCleanupRef = useRef<(() => void) | null>(null);
  const { filters, setFilter, clearFilter, clearAllFilters } = useFilters();
  const [rowsByQuery, setRowsByQuery] = useState<Record<string, DataRow[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scriptError, setScriptError] = useState<string | null>(null);
  const explicitParityLane = useMemo(
    () => isExplicitParityRuntimeHints(report.runtimeHints),
    [report.runtimeHints]
  );

  const bindings = useMemo(
    () => resolveCreativeBindings(page, queries),
    [page, queries]
  );

  useEffect(() => {
    let cancelled = false;
    const activeQueryIds = explicitParityLane
      ? queries
        .map((query) => query.id)
        .filter((value, index, list) => list.indexOf(value) === index)
      : bindings
        .map((binding) => binding.queryRef)
        .filter((value): value is string => Boolean(value))
        .filter((value, index, list) => list.indexOf(value) === index);

    if (activeQueryIds.length === 0) {
      setRowsByQuery({});
      setLoading(false);
      setError(null);
      return () => undefined;
    }

    async function loadQueries() {
      setLoading(true);
      setError(null);

      try {
        const entries = await Promise.all(activeQueryIds.map(async (queryId) => {
          const query = queries.find((candidate) => candidate.id === queryId);
          if (!query) {
            return [queryId, []] as const;
          }

          return [queryId, await fetchQueryRows({
            query,
            dataSource,
            apiBaseUrl,
          })] as const;
        }));

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

    loadQueries();
    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl, bindings, dataSource, explicitParityLane, queries]);

  const reportData = useMemo(
    () => buildCreativeReportData(queries, rowsByQuery, {
      styleFamily: report.runtimeHints?.styleFamily || null,
      layoutArchetype: report.runtimeHints?.layoutArchetype || null,
    }),
    [queries, report.runtimeHints?.layoutArchetype, report.runtimeHints?.styleFamily, rowsByQuery]
  );
  const parityShippingBundle = useMemo(() => {
    if (!reportData.explicitParityLane) {
      return null;
    }

    const datasets = buildParityShippingDatasets(queries, rowsByQuery, bindings);
    return buildShippingEditorialBundle(report, datasets);
  }, [bindings, queries, report, reportData.explicitParityLane, rowsByQuery]);

  const scriptContext = useMemo<CreativeScriptContext>(() => ({
    report: {
      id: report.id,
      name: report.name,
      description: report.description,
      runtimeHints: report.runtimeHints,
    },
    page: {
      id: page.id,
      name: page.name,
      filters: page.filters,
      viewport: page.viewport,
    },
    theme,
    artifactKey: createCreativeArtifactKey(report.id, page.id),
    parity: {
      active: reportData.explicitParityLane,
      contractVersion: reportData.contractVersion,
      layoutProfile: reportData.layoutProfile,
    },
    reportData,
    filters: {
      values: filters,
      definitions: page.filters,
      set: setFilter,
      clear: clearFilter,
      clearAll: clearAllFilters,
    },
    data: buildCreativeDataContext(bindings, rowsByQuery),
    queries: queries.map((query) => ({ id: query.id, name: query.name })),
    rowsByQuery,
  }), [bindings, clearAllFilters, clearFilter, filters, page.filters, page.id, page.name, page.viewport, queries, report.description, report.id, report.name, report.runtimeHints, reportData, rowsByQuery, setFilter, theme]);

  const renderedDocument = useMemo(() => {
    const baseHtml = pickCreativeMarkup(page);
    const renderedHtml = renderCreativeTemplate(baseHtml, {
      'report.id': report.id,
      'report.name': report.name,
      'report.description': report.description || '',
      'page.id': page.id,
      'page.name': page.name,
      'theme.name': theme.name,
    });

    const baseStyles = buildCreativeBaseStyles(theme, page.viewport, viewportMode);
    const pageCss = sanitizeStylesheet(page.css || page.stylesheet || '');

    return `
      <style>${baseStyles}\n${pageCss}</style>
      <div class="vcr-stage">
        ${sanitizeHtml(renderedHtml)}
      </div>
    `;
  }, [page, report, theme, viewportMode]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    const shadowRoot = host.shadowRoot || host.attachShadow({ mode: 'open' });
    const script = page.js || page.script || '';
    let cancelled = false;
    let rafPrimary = 0;
    let rafSecondary = 0;
    let resizeTimer: number | undefined;
    let resizeObserver: ResizeObserver | null = null;
    let lastObservedWidth = -1;
    let lastObservedHeight = -1;

    const disposeScript = () => {
      if (scriptCleanupRef.current) {
        scriptCleanupRef.current();
        scriptCleanupRef.current = null;
      }
    };

    const renderAndRunScript = () => {
      if (cancelled) {
        return;
      }

      disposeScript();
      shadowRoot.innerHTML = renderedDocument;
      setScriptError(null);

      if (!script.trim()) {
        return;
      }

      const result = executeCreativePageScript(shadowRoot, script, scriptContext);
      scriptCleanupRef.current = result.cleanup;
      setScriptError(result.error);
    };

    const scheduleRender = () => {
      window.cancelAnimationFrame(rafPrimary);
      window.cancelAnimationFrame(rafSecondary);
      rafPrimary = window.requestAnimationFrame(() => {
        rafSecondary = window.requestAnimationFrame(() => {
          renderAndRunScript();
        });
      });
    };

    scheduleRender();

    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver((entries) => {
        const rect = entries[0]?.contentRect;
        const nextWidth = Math.round(rect?.width ?? host.clientWidth);
        const nextHeight = Math.round(rect?.height ?? host.clientHeight);

        if (nextWidth <= 0 || nextHeight <= 0) {
          return;
        }

        if (Math.abs(nextWidth - lastObservedWidth) <= 1 && Math.abs(nextHeight - lastObservedHeight) <= 1) {
          return;
        }

        lastObservedWidth = nextWidth;
        lastObservedHeight = nextHeight;

        if (resizeTimer !== undefined) {
          window.clearTimeout(resizeTimer);
        }
        resizeTimer = window.setTimeout(() => {
          scheduleRender();
        }, 48);
      });
      resizeObserver.observe(host);
    }

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(rafPrimary);
      window.cancelAnimationFrame(rafSecondary);
      if (resizeTimer !== undefined) {
        window.clearTimeout(resizeTimer);
      }
      resizeObserver?.disconnect();
      disposeScript();
    };
  }, [page.js, page.script, renderedDocument, scriptContext]);

  const background = theme.colors.background || '#0b1020';
  const surface = theme.colors.surface || '#101826';
  const shellHeight = viewportMode === 'document' ? 'auto' : '100%';

  if (parityShippingBundle) {
    return (
      <ShippingEditorialPageRenderer
        theme={theme}
        bundle={parityShippingBundle}
        pageFilters={page.filters}
        filterPlacement={report.runtimeHints?.filterPlacement}
        viewportMode={viewportMode}
      />
    );
  }

  return (
    <div
      style={{
        width: '100%',
        height: shellHeight,
        minHeight: viewportMode === 'document' ? (page.viewport?.height || 1080) : '100%',
        overflow: viewportMode === 'document' ? 'visible' : 'auto',
        padding: 0,
        boxSizing: 'border-box',
        background: `
          radial-gradient(circle at top left, ${withAlpha(theme.colors.primary, 0.14)}, transparent 26%),
          radial-gradient(circle at top right, ${withAlpha(theme.colors.secondary, 0.14)}, transparent 24%),
          linear-gradient(180deg, ${background} 0%, ${mixColors(background, surface, 0.86, background)} 100%)
        `,
        position: 'relative',
      }}
    >
      <div
        ref={hostRef}
        style={{
          width: '100%',
          height: shellHeight,
          minHeight: viewportMode === 'document' ? (page.viewport?.height || 1080) : '100%',
        }}
      />
      {(loading || error || scriptError) && (
        <div
          style={{
            position: 'absolute',
            right: 16,
            top: 16,
            display: 'grid',
            gap: 8,
            padding: '10px 12px',
            borderRadius: 14,
            background: withAlpha('#05070d', 0.82),
            color: '#F8FAFC',
            border: `1px solid ${withAlpha('#F8FAFC', 0.12)}`,
            fontSize: 12,
            zIndex: 10,
          }}
        >
          {loading ? <span>正在加载数据…</span> : null}
          {error ? <span>运行时数据错误: {error}</span> : null}
          {scriptError ? <span>页面脚本错误: {scriptError}</span> : null}
        </div>
      )}
    </div>
  );
}

function resolveCreativeBindings(
  page: PageDefinition,
  queries: QueryDefinition[],
): FreeformBindingDefinition[] {
  const explicitBindings = Array.isArray(page.bindings)
    ? page.bindings.filter((binding): binding is FreeformBindingDefinition => Boolean(binding?.name))
    : [];

  if (explicitBindings.length > 0) {
    return explicitBindings.map((binding) => ({
      ...binding,
      alias: binding.alias || binding.name,
      queryRef: binding.queryRef || queries.find((query) => query.id === binding.name)?.id,
      fields: Array.isArray(binding.fields) ? binding.fields : [],
    }));
  }

  return queries.map((query) => ({
    name: query.id,
    alias: query.id,
    kind: 'html',
    queryRef: query.id,
    fields: [],
    shapeHint: 'rows',
    description: query.name,
  }));
}

function buildCreativeDataContext(
  bindings: FreeformBindingDefinition[],
  rowsByQuery: Record<string, DataRow[]>,
): Record<string, CreativeDataBindingContext> {
  const context: Record<string, CreativeDataBindingContext> = {};

  bindings.forEach((binding) => {
    const rows = binding.queryRef ? (rowsByQuery[binding.queryRef] || []) : [];
    const schema = buildBindingSchema(binding, rows);
    const entry: CreativeDataBindingContext = {
      name: binding.name,
      alias: binding.alias || binding.name,
      queryRef: binding.queryRef,
      description: binding.description,
      label: binding.label,
      shapeHint: binding.shapeHint,
      fields: schema.map((field) => field.name),
      recommendedFields: getPrioritizedFieldList(binding.recommendedFields, schema, 'isRecommended'),
      structuralFields: getPrioritizedFieldList(binding.structuralFields, schema, 'isStructural'),
      schema,
      fieldMap: Object.fromEntries(schema.map((field) => [field.name, field])),
      rows,
    };

    context[entry.alias] = entry;
    if (entry.alias !== entry.name) {
      context[entry.name] = entry;
    }
  });

  return context;
}

function buildParityShippingDatasets(
  queries: QueryDefinition[],
  rowsByQuery: Record<string, DataRow[]>,
  bindings: FreeformBindingDefinition[],
): ShippingSourceDataset[] {
  const bindingByQueryRef = new Map(
    bindings
      .filter((binding) => binding.queryRef)
      .map((binding) => [binding.queryRef as string, binding]),
  );

  return queries
    .map((query) => {
      const binding = bindingByQueryRef.get(query.id);
      const rows = rowsByQuery[query.id] || [];
      const title = binding?.label || binding?.description || query.name || binding?.name || query.id;
      return {
        component: { id: binding?.name || query.id },
        query: { id: query.id, name: query.name },
        rows,
        analysis: analyzeCreativeRows(rows),
        title,
        chartType: binding?.chartType || inferParityChartType(title, binding?.kind),
        orientation: binding?.orientation || 'vertical',
      } satisfies ShippingSourceDataset;
    })
    .filter((dataset) => dataset.rows.length > 0);
}

function analyzeCreativeRows(rows: DataRow[]): CreativeQueryAnalysis {
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

function inferParityChartType(title: string, kind?: FreeformBindingDefinition['kind']): string {
  if (kind === 'table') {
    return 'table';
  }
  if (kind === 'metric' || kind === 'value') {
    return 'kpi-card';
  }
  if (/占比|构成|结构|share|mix/i.test(title)) {
    return 'pie';
  }
  if (/趋势|年月|月份|trend|time|year|month/i.test(title)) {
    return 'line';
  }
  return 'bar';
}

function isExplicitParityRuntimeHints(
  runtimeHints: Pick<ReportDefinition, 'runtimeHints'>['runtimeHints'],
): boolean {
  const styleFamily = String(runtimeHints?.styleFamily || '').trim().toLowerCase();
  const layoutArchetype = String(runtimeHints?.layoutArchetype || '').trim().toLowerCase();
  return styleFamily === 'boardroom-editorial' && layoutArchetype === 'parity-operational-single-page';
}

function buildBindingSchema(binding: FreeformBindingDefinition, rows: DataRow[]): BindingFieldSchema[] {
  const knownFields = getAvailableFields(rows, [
    ...(binding.fields || []),
    ...(binding.columns || []),
    ...(binding.recommendedFields || []),
    ...(binding.structuralFields || []),
    binding.field,
    binding.categoryField,
    binding.valueField,
    binding.secondaryField,
  ]);
  const schemaByName = new Map<string, BindingFieldSchema>();

  (binding.schema || []).forEach((field) => {
    if (!field?.name) {
      return;
    }
    schemaByName.set(field.name, {
      ...field,
      label: field.label || cleanFieldLabel(field.name),
    });
  });

  knownFields.forEach((fieldName) => {
    if (schemaByName.has(fieldName)) {
      return;
    }

    schemaByName.set(fieldName, {
      name: fieldName,
      label: cleanFieldLabel(fieldName),
      isRecommended: binding.recommendedFields?.includes(fieldName) || binding.fields?.includes(fieldName),
      isStructural: binding.structuralFields?.includes(fieldName),
    });
  });

  return Array.from(schemaByName.values()).map((field) => ({
    ...field,
    label: field.label || cleanFieldLabel(field.name),
    isRecommended: field.isRecommended
      ?? binding.recommendedFields?.includes(field.name)
      ?? binding.fields?.includes(field.name)
      ?? false,
    isStructural: field.isStructural ?? binding.structuralFields?.includes(field.name) ?? false,
    isVisible: field.isVisible ?? field.isRecommended ?? false,
  }));
}

function getAvailableFields(rows: DataRow[], preferredFields: Array<string | null | undefined> = []): string[] {
  const preferred = preferredFields
    .filter((field): field is string => typeof field === 'string' && field.trim().length > 0);
  const discovered = rows.flatMap((row) => Object.keys(row)).filter((field) => field !== '__rowIndex');
  return [...new Set([...preferred, ...discovered])];
}

function getPrioritizedFieldList(
  preferredFields: string[] | undefined,
  schema: BindingFieldSchema[],
  flag: 'isRecommended' | 'isStructural',
): string[] {
  const explicit = Array.isArray(preferredFields)
    ? preferredFields.filter((field) => typeof field === 'string' && field.trim().length > 0)
    : [];
  const fallback = schema
    .filter((field) => Boolean(field[flag]))
    .map((field) => field.name);
  return [...new Set(explicit.length > 0 ? explicit : fallback)];
}

function isNumericLike(value: unknown): boolean {
  if (typeof value === 'number') {
    return Number.isFinite(value);
  }

  if (typeof value !== 'string') {
    return false;
  }

  const trimmed = value.replace(/,/g, '').trim();
  return trimmed.length > 0 && Number.isFinite(Number(trimmed));
}

function isTimeLike(field: string, value: unknown): boolean {
  if (/date|time|month|year|季度|月份|年月|日期|时间/i.test(field)) {
    return true;
  }

  if (typeof value === 'number') {
    return value >= 1900 && value <= 2100;
  }

  if (typeof value !== 'string') {
    return false;
  }

  const trimmed = value.trim();
  return /^(\d{4}[-/]\d{1,2}([-/]\d{1,2})?|\d{1,2}月|\d{4}年|\d{4}年\d{1,2}月)$/i.test(trimmed);
}

function pickCreativeMarkup(page: PageDefinition): string {
  if (typeof page.html === 'string' && page.html.trim()) {
    return page.html;
  }

  if (typeof page.template === 'string' && page.template.trim()) {
    return page.template;
  }

  return DEFAULT_HTML;
}

function renderCreativeTemplate(template: string, tokens: Record<string, string>): string {
  return template.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, token: string) => escapeHtml(tokens[token] ?? ''));
}

function buildCreativeBaseStyles(
  theme: ThemeDefinition,
  viewport: PageDefinition['viewport'],
  viewportMode: 'contained' | 'document',
): string {
  const width = viewport?.width || 1920;
  const height = viewport?.height || 1080;
  const text = theme.colors.text || '#F8FAFC';
  const muted = theme.colors.textSecondary || '#94A3B8';
  const primary = theme.colors.primary || '#6366F1';
  const secondary = theme.colors.secondary || '#14B8A6';
  const background = theme.colors.background || '#0B1020';
  const surface = theme.colors.surface || '#121A2B';
  const chartPalette = theme.colors.chart?.length
    ? theme.colors.chart
    : [primary, secondary, '#22C55E', '#F59E0B', '#EF4444', '#8B5CF6'];
  const border = withAlpha(text, 0.14, 'rgba(15, 23, 42, 0.14)');
  const success = chartPalette[2] || '#22C55E';
  const warning = chartPalette[3] || '#F59E0B';
  const danger = chartPalette[4] || '#EF4444';
  const cardShadow = theme.components.card?.shadow || '0 24px 48px rgba(15, 23, 42, 0.16)';
  const cardRadius = theme.components.card?.borderRadius ?? 20;
  const cardPadding = theme.components.card?.padding ?? 24;

  return `
    :host {
      display: block;
      width: 100%;
      height: 100%;
      color: ${text};
      font-family: ${theme.typography.fontFamily};
      --vcr-font-family: ${theme.typography.fontFamily};
      --vcr-text: ${text};
      --vcr-muted: ${muted};
      --vcr-textSecondary: ${muted};
      --vcr-primary: ${primary};
      --vcr-secondary: ${secondary};
      --vcr-background: ${background};
      --vcr-surface: ${surface};
      --vcr-border: ${border};
      --vcr-outline: ${withAlpha(text, 0.08, 'rgba(15, 23, 42, 0.08)')};
      --vcr-success: ${success};
      --vcr-warning: ${warning};
      --vcr-danger: ${danger};
      --vcr-card-shadow: ${cardShadow};
      --vcr-card-radius: ${cardRadius}px;
      --vcr-card-padding: ${cardPadding}px;
      --vcr-chart-0: ${chartPalette[0] || primary};
      --vcr-chart-1: ${chartPalette[1] || secondary};
      --vcr-chart-2: ${chartPalette[2] || success};
      --vcr-chart-3: ${chartPalette[3] || warning};
      --vcr-chart-4: ${chartPalette[4] || danger};
      --vcr-chart-5: ${chartPalette[5] || '#8B5CF6'};
      --vcr-canvas-width: ${width}px;
      --vcr-canvas-height: ${height}px;
    }

    * { box-sizing: border-box; }
    button, input, select, textarea { font: inherit; }
    img, svg, canvas { display: block; max-width: 100%; }
    a { color: inherit; }

    .vcr-stage {
      width: 100%;
      min-height: ${viewportMode === 'document' ? `${height}px` : '100%'};
      color: var(--vcr-text);
      font-family: inherit;
    }

    .vcr-fallback {
      width: min(100%, var(--vcr-canvas-width));
      min-height: var(--vcr-canvas-height);
      margin: 0 auto;
      padding: 32px;
      display: grid;
      align-content: start;
      gap: 12px;
      background:
        radial-gradient(circle at top left, ${withAlpha(primary, 0.16)}, transparent 24%),
        linear-gradient(180deg, ${background} 0%, ${mixColors(background, surface, 0.88, background)} 100%);
    }

    .vcr-fallback .vcr-kicker {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.22em;
      text-transform: uppercase;
      color: ${withAlpha(secondary, 0.9)};
    }

    .vcr-fallback h1 {
      margin: 0;
      font-size: clamp(34px, 4vw, 68px);
      line-height: 0.94;
    }

    .vcr-fallback p {
      margin: 0;
      max-width: 720px;
      color: ${muted};
      line-height: 1.7;
    }
  `;
}

function executeCreativePageScript(
  root: ShadowRoot,
  script: string,
  context: CreativeScriptContext,
): { cleanup: (() => void) | null; error: string | null } {
  const persistentUiState = getOrCreatePersistentUiState(context.artifactKey);
  const helpers = {
    formatValue,
    formatNumber: (value: unknown, decimals = 0) => {
      const numericValue = typeof value === 'number' ? value : Number(value);
      if (!Number.isFinite(numericValue)) {
        return '-';
      }
      return numericValue.toLocaleString('zh-CN', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });
    },
    formatCompactNumber: (value: unknown) => {
      const numericValue = typeof value === 'number' ? value : Number(value);
      if (!Number.isFinite(numericValue)) {
        return '-';
      }
      if (Math.abs(numericValue) >= 100000000) {
        return `${(numericValue / 100000000).toFixed(2)}亿`;
      }
      if (Math.abs(numericValue) >= 10000) {
        return `${(numericValue / 10000).toFixed(1)}万`;
      }
      return numericValue.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
    },
    escapeHtml,
    cleanFieldLabel,
    querySelector: (selector: string) => root.querySelector(selector),
    querySelectorAll: (selector: string) => Array.from(root.querySelectorAll(selector)),
    dataSet: (sourceOrAlias: unknown, aliasOrQueryRef?: string) => {
      const lookupKey = typeof aliasOrQueryRef === 'string'
        ? aliasOrQueryRef
        : typeof sourceOrAlias === 'string'
          ? sourceOrAlias
          : undefined;
      if (!lookupKey) {
        return undefined;
      }
      return context.data[lookupKey] || Object.values(context.data).find((entry) => entry.queryRef === lookupKey);
    },
    createElement: (tagName: string, className?: string, textContent?: string) => {
      const element = root.ownerDocument.createElement(tagName);
      if (className) {
        element.className = className;
      }
      if (textContent !== undefined) {
        element.textContent = textContent;
      }
      return element;
    },
    createSvgElement: (tagName: string) => root.ownerDocument.createElementNS('http://www.w3.org/2000/svg', tagName),
    clearNode: (target: Element | null | undefined) => {
      if (!target) {
        return;
      }
      target.replaceChildren();
    },
    setText: (target: Element | null | undefined, value: unknown) => {
      if (!target) {
        return;
      }
      target.textContent = value === null || value === undefined ? '' : String(value);
    },
    setHtml: (target: Element | null | undefined, value: string) => {
      if (!target) {
        return;
      }
      target.innerHTML = sanitizeHtml(value);
    },
    getPersistentState: <T = unknown>(key: string, fallbackValue?: T): T | undefined => {
      if (!key) {
        return fallbackValue;
      }
      const value = persistentUiState[key];
      return (value === undefined ? fallbackValue : value) as T | undefined;
    },
    setPersistentState: (key: string, value: unknown) => {
      if (!key) {
        return;
      }
      persistentUiState[key] = clonePersistentValue(value);
    },
    updatePersistentState: (
      key: string,
      updater: ((currentValue: unknown) => unknown) | Record<string, unknown>,
    ) => {
      if (!key) {
        return undefined;
      }
      const currentValue = persistentUiState[key];
      const nextValue = typeof updater === 'function'
        ? updater(currentValue)
        : {
          ...(isPlainObject(currentValue) ? currentValue : {}),
          ...updater,
        };
      persistentUiState[key] = clonePersistentValue(nextValue);
      return persistentUiState[key];
    },
    clearPersistentState: (key?: string) => {
      if (!key) {
        Object.keys(persistentUiState).forEach((entryKey) => {
          delete persistentUiState[entryKey];
        });
        return;
      }
      delete persistentUiState[key];
    },
    getCanonicalFilterValue: (filterId: string) => context.filters.values[filterId],
    syncCanonicalFilter: (filterId: string, value: unknown) => {
      context.filters.set(filterId, value);
    },
    groupRows: (rows: DataRow[], field: string) => rows.reduce<Record<string, DataRow[]>>((acc, row) => {
      const key = String(row[field] ?? '');
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(row);
      return acc;
    }, {}),
    sumField: (rows: DataRow[], field: string) => rows.reduce((sum, row) => sum + Number(row[field] || 0), 0),
    averageField: (rows: DataRow[], field: string) => rows.length > 0
      ? rows.reduce((sum, row) => sum + Number(row[field] || 0), 0) / rows.length
      : 0,
    fieldName: (
      source: CreativeDataBindingContext | DataRow[] | DataRow | null | undefined,
      ...candidates: unknown[]
    ) => {
      const candidateList = flattenCandidateFields(candidates);
      if (isCreativeBindingContext(source)) {
        return resolveFieldNameFromBinding(source, candidateList);
      }

      if (Array.isArray(source)) {
        return resolveFieldNameFromRows(source, candidateList);
      }

      if (source && typeof source === 'object') {
        return resolveFieldNameFromRow(source, candidateList);
      }

      return undefined;
    },
    value: (
      source: CreativeDataBindingContext | DataRow | null | undefined,
      rowOrCandidate?: DataRow | unknown,
      ...candidates: unknown[]
    ) => {
      if (isCreativeBindingContext(source)) {
        const row = isDataRow(rowOrCandidate) ? rowOrCandidate : source.rows[0];
        const candidateList = flattenCandidateFields(
          isDataRow(rowOrCandidate) ? candidates : [rowOrCandidate, ...candidates]
        );
        if (!row) {
          return undefined;
        }
        const key = resolveFieldNameFromBinding(source, candidateList);
        return key ? row[key] : undefined;
      }

      const row = source;
      if (!row || typeof row !== 'object') {
        return undefined;
      }

      const key = resolveFieldNameFromRow(row, flattenCandidateFields([rowOrCandidate, ...candidates]));
      return key ? row[key] : undefined;
    },
    topN<T>(items: T[], count: number, selector: (item: T) => number) {
      return [...items]
        .sort((left, right) => selector(right) - selector(left))
        .slice(0, count);
    },
    unique<T>(items: T[]) {
      return [...new Set(items)];
    },
    sortBy<T>(items: T[], selector: (item: T) => number, direction: 'asc' | 'desc' = 'desc') {
      return [...items].sort((left, right) => direction === 'asc'
        ? selector(left) - selector(right)
        : selector(right) - selector(left));
    },
  };

  try {
    const normalizedScript = normalizeCreativeScript(script);
    const documentProxy = createShadowDocumentProxy(root);
    const windowProxy = createShadowWindowProxy(root, documentProxy, context, helpers);
    const runner = new Function(
      'root',
      'shadowRoot',
      'document',
      'window',
      'context',
      'helpers',
      `"use strict";
let __vcrCleanup = null;
const module = { exports: {} };
const exports = module.exports;
${normalizedScript}
const __vcrEntry = typeof render === 'function'
  ? render
  : typeof mount === 'function'
    ? mount
    : typeof init === 'function'
      ? init
      : typeof module.exports === 'function'
        ? module.exports
        : (module.exports && typeof module.exports.render === 'function'
          ? module.exports.render
          : null);
if (typeof __vcrEntry === 'function') {
  const __vcrResult = __vcrEntry(context, root, helpers);
  if (typeof __vcrResult === 'function') {
    __vcrCleanup = __vcrResult;
  }
}
return __vcrCleanup;`
    ) as (
      rootArg: ShadowRoot,
      shadowRootArg: ShadowRoot,
      documentArg: ReturnType<typeof createShadowDocumentProxy>,
      windowArg: ReturnType<typeof createShadowWindowProxy>,
      contextArg: CreativeScriptContext,
      helpersArg: typeof helpers,
    ) => void | (() => void);
    const cleanup = runner(root, root, documentProxy, windowProxy, context, helpers);
    return {
      cleanup: typeof cleanup === 'function' ? cleanup : null,
      error: null,
    };
  } catch (err) {
    console.error('[CreativeHtmlPageRenderer] page.js execution failed:', err);
    return {
      cleanup: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function normalizeCreativeScript(script: string): string {
  return script
    .replace(/^\s*export\s+default\s+/gim, '')
    .replace(/^\s*export\s+(?=(async\s+)?function|const|let|var|class)/gim, '');
}

function createShadowDocumentProxy(root: ShadowRoot) {
  const host = root.host as HTMLElement;
  const ownerDocument = host.ownerDocument;

  return {
    body: host,
    documentElement: host,
    ownerDocument,
    querySelector: (selector: string) => root.querySelector(selector),
    querySelectorAll: (selector: string) => Array.from(root.querySelectorAll(selector)),
    getElementById: (id: string) => root.getElementById(id) || root.querySelector(`#${escapeSelector(id)}`),
    createElement: ownerDocument.createElement.bind(ownerDocument),
    createElementNS: ownerDocument.createElementNS.bind(ownerDocument),
    addEventListener: ownerDocument.addEventListener.bind(ownerDocument),
    removeEventListener: ownerDocument.removeEventListener.bind(ownerDocument),
  };
}

function createShadowWindowProxy(
  root: ShadowRoot,
  documentProxy: ReturnType<typeof createShadowDocumentProxy>,
  context: CreativeScriptContext,
  helpers: {
    formatValue: typeof formatValue;
    formatNumber: (value: unknown, decimals?: number) => string;
    formatCompactNumber: (value: unknown) => string;
    escapeHtml: typeof escapeHtml;
    cleanFieldLabel: typeof cleanFieldLabel;
    querySelector: (selector: string) => Element | null;
    querySelectorAll: (selector: string) => Element[];
    dataSet: (sourceOrAlias: unknown, aliasOrQueryRef?: string) => CreativeDataBindingContext | undefined;
    createElement: (tagName: string, className?: string, textContent?: string) => HTMLElement;
    createSvgElement: (tagName: string) => SVGElement;
    clearNode: (target: Element | null | undefined) => void;
    setText: (target: Element | null | undefined, value: unknown) => void;
    setHtml: (target: Element | null | undefined, value: string) => void;
    getPersistentState: <T = unknown>(key: string, fallbackValue?: T) => T | undefined;
    setPersistentState: (key: string, value: unknown) => void;
    updatePersistentState: (key: string, updater: ((currentValue: unknown) => unknown) | Record<string, unknown>) => unknown;
    clearPersistentState: (key?: string) => void;
    getCanonicalFilterValue: (filterId: string) => unknown;
    syncCanonicalFilter: (filterId: string, value: unknown) => void;
    groupRows: (rows: DataRow[], field: string) => Record<string, DataRow[]>;
    sumField: (rows: DataRow[], field: string) => number;
    averageField: (rows: DataRow[], field: string) => number;
    fieldName: (
      source: CreativeDataBindingContext | DataRow[] | DataRow | null | undefined,
      ...candidates: unknown[]
    ) => string | undefined;
    value: (
      source: CreativeDataBindingContext | DataRow | null | undefined,
      rowOrCandidate?: DataRow | unknown,
      ...candidates: unknown[]
    ) => unknown;
    topN<T>(items: T[], count: number, selector: (item: T) => number): T[];
    unique<T>(items: T[]): T[];
    sortBy<T>(items: T[], selector: (item: T) => number, direction?: 'asc' | 'desc'): T[];
  },
) {
  const host = root.host as HTMLElement;
  const proxy: Record<string, unknown> = {
    document: documentProxy,
    root,
    shadowRoot: root,
    context,
    helpers,
    theme: context.theme,
    artifactKey: context.artifactKey,
    reportData: context.reportData,
    filters: context.filters,
    queries: context.queries,
    rowsByQuery: context.rowsByQuery,
    data: context.data,
    console,
    requestAnimationFrame: window.requestAnimationFrame.bind(window),
    cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
    setTimeout: window.setTimeout.bind(window),
    clearTimeout: window.clearTimeout.bind(window),
    setInterval: window.setInterval.bind(window),
    clearInterval: window.clearInterval.bind(window),
    getComputedStyle: (node?: Element | null) => window.getComputedStyle((node ?? host) as Element),
    querySelector: (selector: string) => root.querySelector(selector),
    querySelectorAll: (selector: string) => Array.from(root.querySelectorAll(selector)),
    getElementById: (id: string) => root.getElementById(id) || root.querySelector(`#${escapeSelector(id)}`),
  };

  proxy.window = proxy;
  proxy.self = proxy;
  proxy.globalThis = proxy;
  proxy.global = proxy;

  return proxy;
}

function escapeSelector(value: string): string {
  return value.replace(/([ !"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, '\\$1');
}

function sanitizeHtml(input: string): string {
  return input
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi, '')
    .replace(/<object[\s\S]*?>[\s\S]*?<\/object>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(['"]).*?\1/gi, '')
    .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/data:text\/html/gi, '');
}

function sanitizeStylesheet(input: string): string {
  return input
    .replace(/@import[^;]+;/gi, '')
    .replace(/expression\s*\(/gi, '')
    .replace(/behavior\s*:/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/<\/style>/gi, '');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatValue(value: unknown, format?: ValueFormat): string {
  if (value === null || value === undefined || value === '') {
    return '-';
  }

  const numericValue = typeof value === 'number' ? value : Number(value);
  if (format && Number.isFinite(numericValue)) {
    const decimals = typeof format.decimals === 'number' ? format.decimals : 0;
    const suffix = format.suffix || '';
    const prefix = format.prefix || '';
    if (format.type === 'currency') {
      return `${prefix}${numericValue.toLocaleString('zh-CN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${suffix || (format.currency ? ` ${format.currency}` : '')}`;
    }

    if (format.type === 'percentage') {
      return `${prefix}${numericValue.toFixed(decimals)}${suffix || '%'}`;
    }

    return `${prefix}${numericValue.toLocaleString('zh-CN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${suffix}`;
  }

  if (typeof value === 'number') {
    if (Math.abs(value) >= 100000000) {
      return `${(value / 100000000).toFixed(2)}亿`;
    }

    if (Math.abs(value) >= 10000) {
      return `${(value / 10000).toFixed(1)}万`;
    }

    return value.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
  }

  return String(value);
}

function cleanFieldLabel(value: string): string {
  return value.replace(/^Dim_\d+_/, '').replace(/[_-]+/g, ' ').trim();
}

function flattenCandidateFields(candidates: unknown[]): string[] {
  return candidates
    .flatMap((candidate) => Array.isArray(candidate) ? candidate : [candidate])
    .filter((candidate): candidate is string => typeof candidate === 'string' && candidate.trim().length > 0)
    .map((candidate) => candidate.trim());
}

function isCreativeBindingContext(value: unknown): value is CreativeDataBindingContext {
  return Boolean(
    value
    && typeof value === 'object'
    && Array.isArray((value as CreativeDataBindingContext).schema)
    && Array.isArray((value as CreativeDataBindingContext).rows)
  );
}

function isDataRow(value: unknown): value is DataRow {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function resolveFieldNameFromRows(rows: DataRow[], candidates: string[]): string | undefined {
  for (const row of rows) {
    const key = resolveFieldNameFromRow(row, candidates);
    if (key) {
      return key;
    }
  }

  return undefined;
}

function resolveFieldNameFromRow(row: DataRow, candidates: string[]): string | undefined {
  const keys = Object.keys(row);
  if (!keys.length || !candidates.length) {
    return undefined;
  }

  for (const candidate of candidates) {
    const direct = keys.find((key) => key === candidate);
    if (direct) {
      return direct;
    }

    const caseInsensitive = keys.find((key) => key.toLowerCase() === candidate.toLowerCase());
    if (caseInsensitive) {
      return caseInsensitive;
    }

    const normalizedCandidate = normalizeFieldToken(candidate);
    const normalizedMatch = keys.find((key) => normalizeFieldToken(key) === normalizedCandidate);
    if (normalizedMatch) {
      return normalizedMatch;
    }

    const fuzzyMatch = keys.find((key) => normalizeFieldToken(key).includes(normalizedCandidate) || normalizedCandidate.includes(normalizeFieldToken(key)));
    if (fuzzyMatch) {
      return fuzzyMatch;
    }
  }

  return undefined;
}

function resolveFieldNameFromBinding(binding: CreativeDataBindingContext, candidates: string[]): string | undefined {
  if (binding.schema.length === 0) {
    return resolveFieldNameFromRows(binding.rows, candidates);
  }

  for (const candidate of candidates) {
    const exactByName = binding.schema.find((field) => field.name === candidate);
    if (exactByName) {
      return exactByName.name;
    }

    const exactByLabel = binding.schema.find((field) => field.label === candidate);
    if (exactByLabel) {
      return exactByLabel.name;
    }

    const normalizedCandidate = normalizeFieldToken(candidate);
    const normalizedField = binding.schema.find((field) => normalizeFieldToken(field.name) === normalizedCandidate);
    if (normalizedField) {
      return normalizedField.name;
    }

    const normalizedLabel = binding.schema.find((field) => normalizeFieldToken(field.label || field.name) === normalizedCandidate);
    if (normalizedLabel) {
      return normalizedLabel.name;
    }

    const byFieldName = resolveFieldReference(candidate, binding.schema.map((field) => field.name));
    if (byFieldName) {
      return byFieldName;
    }

    const byRecommended = resolveFieldReference(candidate, binding.recommendedFields);
    if (byRecommended) {
      return byRecommended;
    }

    const byRows = resolveFieldNameFromRows(binding.rows, [candidate]);
    if (byRows) {
      return byRows;
    }
  }

  return undefined;
}

function normalizeFieldToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/['"`]/g, '')
    .replace(/[[\]()（）{}]/g, '')
    .replace(/[_\-\s./\\:：|]+/g, '');
}

function createCreativeArtifactKey(
  reportId: string,
  pageId: string,
): string {
  // Keep UI state stable for the same generated artifact across filter-driven rerenders.
  return `${reportId}::${pageId}`;
}

function getOrCreatePersistentUiState(artifactKey: string): Record<string, unknown> {
  const existing = creativeUiStateStore.get(artifactKey);
  if (existing) {
    return existing;
  }
  const next: Record<string, unknown> = {};
  creativeUiStateStore.set(artifactKey, next);
  return next;
}

function clonePersistentValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => clonePersistentValue(entry));
  }
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entryValue]) => [key, clonePersistentValue(entryValue)])
    );
  }
  return value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
