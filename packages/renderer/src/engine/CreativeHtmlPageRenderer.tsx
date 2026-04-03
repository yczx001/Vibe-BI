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

interface CreativeScriptContext {
  report: Pick<ReportDefinition, 'id' | 'name' | 'description' | 'runtimeHints'>;
  page: Pick<PageDefinition, 'id' | 'name' | 'filters' | 'viewport'>;
  theme: ThemeDefinition;
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

  const bindings = useMemo(
    () => resolveCreativeBindings(page, queries),
    [page, queries]
  );

  useEffect(() => {
    let cancelled = false;
    const activeQueryIds = bindings
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
  }, [apiBaseUrl, bindings, dataSource, queries]);

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
  }), [bindings, clearAllFilters, clearFilter, filters, page.filters, page.id, page.name, page.viewport, queries, report.description, report.id, report.name, report.runtimeHints, rowsByQuery, setFilter, theme]);

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
    if (scriptCleanupRef.current) {
      scriptCleanupRef.current();
      scriptCleanupRef.current = null;
    }

    shadowRoot.innerHTML = renderedDocument;
    setScriptError(null);
    const script = page.js || page.script || '';
    if (script.trim()) {
      const result = executeCreativePageScript(shadowRoot, script, scriptContext);
      scriptCleanupRef.current = result.cleanup;
      setScriptError(result.error);
    }

    return () => {
      if (scriptCleanupRef.current) {
        scriptCleanupRef.current();
        scriptCleanupRef.current = null;
      }
    };
  }, [page.js, page.script, renderedDocument, scriptContext]);

  const background = theme.colors.background || '#0b1020';
  const surface = theme.colors.surface || '#101826';
  const shellHeight = viewportMode === 'document' ? 'auto' : '100%';

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
  const helpers = {
    formatValue,
    escapeHtml,
    cleanFieldLabel,
    querySelector: (selector: string) => root.querySelector(selector),
    querySelectorAll: (selector: string) => Array.from(root.querySelectorAll(selector)),
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
    escapeHtml: typeof escapeHtml;
    cleanFieldLabel: typeof cleanFieldLabel;
    querySelector: (selector: string) => Element | null;
    querySelectorAll: (selector: string) => Element[];
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
