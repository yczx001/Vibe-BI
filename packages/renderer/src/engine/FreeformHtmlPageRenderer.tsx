import React, { useEffect, useMemo, useRef, useState } from 'react';
import type {
  ChartType,
  DataSourceConfig,
  FreeformBindingDefinition,
  PageDefinition,
  QueryDefinition,
  ReportDefinition,
  ThemeDefinition,
  ValueFormat,
} from '@vibe-bi/core';
import { fetchQueryRows } from '../data/useQueryData';
import { mixColors, withAlpha } from '../theme/colorUtils';
import { resolveFieldReference, toDisplayFieldLabel } from '../utils/fieldResolution';

type DataRow = Record<string, unknown>;

interface FreeformHtmlPageRendererProps {
  report: ReportDefinition;
  page: PageDefinition;
  queries: QueryDefinition[];
  dataSource: DataSourceConfig;
  theme: ThemeDefinition;
  apiBaseUrl?: string;
  viewportMode?: 'contained' | 'document';
}

interface RenderedBinding {
  text: string;
  html: string;
  tokens?: Record<string, string>;
}

interface FreeformScriptBindingContext {
  name: string;
  kind: FreeformBindingDefinition['kind'];
  queryRef?: string;
  label?: string;
  className?: string;
  chartType?: ChartType;
  rows: DataRow[];
  fields: string[];
  rendered: RenderedBinding;
}

interface FreeformScriptContext {
  report: Pick<ReportDefinition, 'id' | 'name' | 'description' | 'runtimeHints'>;
  page: Pick<PageDefinition, 'id' | 'name' | 'filters'>;
  theme: ThemeDefinition;
  bindings: Record<string, FreeformScriptBindingContext>;
  queries: Array<Pick<QueryDefinition, 'id' | 'name'>>;
  rowsByQuery: Record<string, DataRow[]>;
}

interface TemplateBindingContext {
  target: string;
  className?: string;
  suggestedKind?: FreeformBindingDefinition['kind'];
  suggestedChartType?: ChartType;
  label?: string;
  emphasis?: 'hero' | 'compact' | 'table' | 'chart';
}

type FreeformStyleVariant =
  | 'harbor'
  | 'atlas'
  | 'magazine'
  | 'studio'
  | 'brutalist'
  | 'noir'
  | 'shipping-ops';

interface FreeformStyleTokens {
  variant: FreeformStyleVariant;
  displayFont: string;
  bodyFont: string;
  monoFont: string;
  pageWidth: string;
  shellRadius: number;
  panelRadius: number;
  panelShadow: string;
  panelBackground: string;
  panelBorder: string;
  chromeOverlay: string;
  topAccent: string;
  heroBackground: string;
  heroTone: string;
}

type QueryLike = Pick<QueryDefinition, 'id' | 'name' | 'dax'>;

const DEFAULT_TEMPLATE = `
<section class="vf-page-shell">
  <header class="vf-masthead">
    <div class="vf-kicker">{{page.name}}</div>
    <h1 class="vf-title">{{report.name}}</h1>
    <p class="vf-subtitle">{{report.description}}</p>
  </header>
  <section class="vf-grid">
    {{{bindings}}}
  </section>
</section>
`;

function normalizeStyleFamily(value?: string | null): FreeformStyleVariant | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized.includes('shipping') || normalized.includes('terminal') || normalized.includes('航运')) {
    return 'shipping-ops';
  }

  if (normalized.includes('brutal') || normalized.includes('粗野')) {
    return 'brutalist';
  }

  if (normalized.includes('magazine') || normalized.includes('杂志') || normalized.includes('海报')) {
    return 'magazine';
  }

  if (normalized.includes('studio') || normalized.includes('minimal') || normalized.includes('极简')) {
    return 'studio';
  }

  if (normalized.includes('noir') || normalized.includes('midnight') || normalized.includes('dracula') || normalized.includes('电影')) {
    return 'noir';
  }

  if (normalized.includes('atlas') || normalized.includes('serif') || normalized.includes('书卷')) {
    return 'atlas';
  }

  if (normalized.includes('harbor') || normalized.includes('editorial') || normalized.includes('ledger') || normalized.includes('经营')) {
    return 'harbor';
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

function resolveFreeformVariant(report: ReportDefinition, theme: ThemeDefinition): FreeformStyleVariant {
  const explicit = normalizeStyleFamily(report.runtimeHints?.styleFamily || theme.name);
  if (explicit) {
    return explicit;
  }

  if (isDarkTheme(theme)) {
    return 'noir';
  }

  const seed = `${report.id}|${report.name}|${theme.name || ''}`;
  const score = seed.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return score % 3 === 0 ? 'atlas' : score % 3 === 1 ? 'studio' : 'harbor';
}

function resolveFreeformStyleTokens(
  variant: FreeformStyleVariant,
  theme: ThemeDefinition,
): FreeformStyleTokens {
  const text = theme.colors.text || '#111827';
  const surface = theme.colors.surface || '#ffffff';
  const background = theme.colors.background || '#f5f7fb';
  const primary = theme.colors.primary || '#2563eb';
  const secondary = theme.colors.secondary || '#14b8a6';

  switch (variant) {
    case 'shipping-ops':
      return {
        variant,
        displayFont: '"Agency FB", "Bahnschrift Condensed", "Microsoft YaHei UI", sans-serif',
        bodyFont: '"Segoe UI Variable Text", "Microsoft YaHei UI", "PingFang SC", sans-serif',
        monoFont: '"Cascadia Code", "Consolas", monospace',
        pageWidth: '1660px',
        shellRadius: 32,
        panelRadius: 24,
        panelShadow: `0 24px 56px ${withAlpha(text, 0.14)}`,
        panelBackground: `linear-gradient(180deg, ${withAlpha(surface, 0.96)} 0%, ${withAlpha(mixColors(surface, background, 0.88, surface), 0.92)} 100%)`,
        panelBorder: `1px solid ${withAlpha('#ffffff', 0.72)}`,
        chromeOverlay: `
          radial-gradient(circle at 0% 0%, ${withAlpha(primary, 0.14)}, transparent 22%),
          radial-gradient(circle at 100% 0%, ${withAlpha(secondary, 0.18)}, transparent 26%),
          linear-gradient(180deg, ${mixColors(background, '#f6f0e6', 0.72, background)} 0%, ${mixColors(background, '#ddd3c5', 0.84, background)} 100%)
        `,
        topAccent: `linear-gradient(90deg, ${primary}, ${secondary}, ${mixColors(secondary, '#ff8a00', 0.5, secondary)})`,
        heroBackground: `linear-gradient(135deg, ${withAlpha('#faf7f1', 0.98)}, ${withAlpha('#f0e8dc', 0.9)}), radial-gradient(circle at 100% 0, ${withAlpha(secondary, 0.14)}, transparent 34%)`,
        heroTone: withAlpha(text, 0.92),
      };
    case 'brutalist':
      return {
        variant,
        displayFont: '"Arial Black", "Source Han Sans SC", "Microsoft YaHei UI", sans-serif',
        bodyFont: '"Source Han Sans SC", "Microsoft YaHei UI", "Segoe UI", sans-serif',
        monoFont: '"Cascadia Code", "Consolas", monospace',
        pageWidth: '1580px',
        shellRadius: 18,
        panelRadius: 10,
        panelShadow: `10px 10px 0 ${withAlpha(text, 0.18)}`,
        panelBackground: `linear-gradient(180deg, ${withAlpha(surface, 0.98)} 0%, ${withAlpha(mixColors(surface, background, 0.84, surface), 0.96)} 100%)`,
        panelBorder: `1px solid ${withAlpha(text, 0.2)}`,
        chromeOverlay: `
          radial-gradient(circle at 0% 0%, ${withAlpha(primary, 0.12)}, transparent 18%),
          radial-gradient(circle at 100% 0%, ${withAlpha(secondary, 0.16)}, transparent 20%),
          linear-gradient(180deg, ${background} 0%, ${mixColors(background, '#faf4eb', 0.76, background)} 100%)
        `,
        topAccent: `linear-gradient(90deg, ${primary}, ${secondary})`,
        heroBackground: `linear-gradient(135deg, ${withAlpha(surface, 0.96)} 0%, ${withAlpha(mixColors(surface, background, 0.86, surface), 0.94)} 100%)`,
        heroTone: text,
      };
    case 'magazine':
      return {
        variant,
        displayFont: '"Cormorant Garamond", "Songti SC", "Noto Serif SC", serif',
        bodyFont: '"Source Han Serif SC", "Noto Serif SC", "Songti SC", serif',
        monoFont: '"Cascadia Code", "Consolas", monospace',
        pageWidth: '1540px',
        shellRadius: 36,
        panelRadius: 28,
        panelShadow: `0 24px 62px ${withAlpha(text, 0.08)}`,
        panelBackground: `linear-gradient(180deg, ${withAlpha(surface, 0.94)} 0%, ${withAlpha('#fffdf8', 0.98)} 100%)`,
        panelBorder: `1px solid ${withAlpha(text, 0.08)}`,
        chromeOverlay: `
          radial-gradient(circle at 10% 0%, ${withAlpha(primary, 0.08)}, transparent 18%),
          radial-gradient(circle at 100% 0%, ${withAlpha(secondary, 0.12)}, transparent 24%),
          linear-gradient(180deg, ${mixColors(background, '#fff9f2', 0.78, background)} 0%, ${mixColors(background, '#f2ede5', 0.82, background)} 100%)
        `,
        topAccent: `linear-gradient(90deg, ${withAlpha(primary, 0.18)}, ${secondary}, ${withAlpha(text, 0.16)})`,
        heroBackground: `linear-gradient(135deg, ${withAlpha(surface, 0.88)} 0%, ${withAlpha('#f7efe3', 0.9)} 100%)`,
        heroTone: text,
      };
    case 'studio':
      return {
        variant,
        displayFont: '"IBM Plex Sans", "Segoe UI Variable Display", "Microsoft YaHei UI", sans-serif',
        bodyFont: '"IBM Plex Sans", "Segoe UI Variable Text", "Microsoft YaHei UI", sans-serif',
        monoFont: '"IBM Plex Mono", "Cascadia Code", monospace',
        pageWidth: '1600px',
        shellRadius: 28,
        panelRadius: 20,
        panelShadow: `0 20px 42px ${withAlpha(text, 0.08)}`,
        panelBackground: `linear-gradient(180deg, ${withAlpha(surface, 0.97)} 0%, ${withAlpha(mixColors(surface, background, 0.92, surface), 0.95)} 100%)`,
        panelBorder: `1px solid ${withAlpha(text, 0.08)}`,
        chromeOverlay: `
          radial-gradient(circle at top left, ${withAlpha(primary, 0.14)}, transparent 20%),
          radial-gradient(circle at top right, ${withAlpha(secondary, 0.14)}, transparent 20%),
          linear-gradient(180deg, ${background} 0%, ${mixColors(background, '#ffffff', 0.88, background)} 100%)
        `,
        topAccent: `linear-gradient(90deg, ${primary}, ${secondary})`,
        heroBackground: `linear-gradient(135deg, ${withAlpha(surface, 0.94)} 0%, ${withAlpha(mixColors(surface, background, 0.9, surface), 0.9)} 100%)`,
        heroTone: text,
      };
    case 'noir':
      return {
        variant,
        displayFont: '"Baskerville Old Face", "Times New Roman", "Noto Serif SC", serif',
        bodyFont: '"Segoe UI Variable Text", "Microsoft YaHei UI", "PingFang SC", sans-serif',
        monoFont: '"Cascadia Code", "Consolas", monospace',
        pageWidth: '1580px',
        shellRadius: 28,
        panelRadius: 20,
        panelShadow: `0 28px 72px ${withAlpha('#020617', 0.48)}`,
        panelBackground: `linear-gradient(180deg, ${withAlpha(surface, 0.96)} 0%, ${withAlpha(mixColors(surface, background, 0.86, surface), 0.94)} 100%)`,
        panelBorder: `1px solid ${withAlpha('#ffffff', 0.08)}`,
        chromeOverlay: `
          radial-gradient(circle at 0% 0%, ${withAlpha(primary, 0.16)}, transparent 20%),
          radial-gradient(circle at 100% 0%, ${withAlpha(secondary, 0.18)}, transparent 24%),
          linear-gradient(180deg, ${background} 0%, ${mixColors(background, '#0d1727', 0.82, background)} 100%)
        `,
        topAccent: `linear-gradient(90deg, ${primary}, ${secondary})`,
        heroBackground: `linear-gradient(135deg, ${withAlpha(surface, 0.98)} 0%, ${withAlpha(mixColors(surface, background, 0.9, surface), 0.94)} 100%)`,
        heroTone: theme.colors.text || '#f8fafc',
      };
    case 'atlas':
      return {
        variant,
        displayFont: '"Bahnschrift", "Segoe UI Variable Display", "Microsoft YaHei UI", sans-serif',
        bodyFont: '"Segoe UI Variable Text", "Microsoft YaHei UI", "PingFang SC", sans-serif',
        monoFont: '"Cascadia Code", "Consolas", monospace',
        pageWidth: '1600px',
        shellRadius: 32,
        panelRadius: 22,
        panelShadow: `0 24px 56px ${withAlpha(text, 0.12)}`,
        panelBackground: `linear-gradient(180deg, ${withAlpha(surface, 0.92)} 0%, ${withAlpha('#ffffff', 0.82)} 100%)`,
        panelBorder: `1px solid ${withAlpha('#ffffff', 0.92)}`,
        chromeOverlay: `
          radial-gradient(circle at 0% 0%, ${withAlpha(secondary, 0.12)}, transparent 22%),
          radial-gradient(circle at 100% 0%, ${withAlpha(primary, 0.14)}, transparent 24%),
          linear-gradient(180deg, #f9fbfc 0%, ${mixColors(background, '#edf4f8', 0.86, background)} 100%)
        `,
        topAccent: `linear-gradient(90deg, ${primary}, ${secondary})`,
        heroBackground: `linear-gradient(135deg, ${withAlpha('#ffffff', 0.94)}, ${withAlpha('#f2f7fb', 0.86)}), radial-gradient(circle at top right, ${withAlpha(secondary, 0.18)}, transparent 42%)`,
        heroTone: text,
      };
    case 'harbor':
    default:
      return {
        variant: 'harbor',
        displayFont: '"Iowan Old Style", "Palatino Linotype", "Noto Serif SC", serif',
        bodyFont: '"Source Han Sans SC", "Microsoft YaHei UI", "PingFang SC", sans-serif',
        monoFont: '"Cascadia Code", "Consolas", monospace',
        pageWidth: '1560px',
        shellRadius: 30,
        panelRadius: 24,
        panelShadow: `0 20px 48px ${withAlpha(text, 0.08)}`,
        panelBackground: `linear-gradient(180deg, ${withAlpha(surface, 0.95)} 0%, ${withAlpha(mixColors(surface, background, 0.9, surface), 0.92)} 100%)`,
        panelBorder: `1px solid ${withAlpha(text, 0.08)}`,
        chromeOverlay: `
          radial-gradient(circle at top left, ${withAlpha(primary, 0.12)}, transparent 22%),
          radial-gradient(circle at top right, ${withAlpha(secondary, 0.12)}, transparent 24%),
          linear-gradient(180deg, ${background} 0%, ${mixColors(background, '#ffffff', 0.84, background)} 100%)
        `,
        topAccent: `linear-gradient(90deg, ${primary}, ${secondary})`,
        heroBackground: `linear-gradient(135deg, ${withAlpha(surface, 0.96)} 0%, ${withAlpha(mixColors(surface, background, 0.9, surface), 0.92)} 100%)`,
        heroTone: text,
      };
  }
}

export function FreeformHtmlPageRenderer({
  report,
  page,
  queries,
  dataSource,
  theme,
  apiBaseUrl,
  viewportMode = 'contained',
}: FreeformHtmlPageRendererProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const scriptCleanupRef = useRef<(() => void) | null>(null);
  const [rowsByQuery, setRowsByQuery] = useState<Record<string, DataRow[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bindings = useMemo(
    () => resolveEffectiveBindings(page, queries),
    [page, queries]
  );
  const templateTargetNames = useMemo(
    () => extractTemplateBindingTargets(page.template),
    [page.template]
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

  useEffect(() => {
    console.log('[FreeformHtmlPageRenderer] Binding resolution:', {
      pageId: page.id,
      pageName: page.name,
      templateTargets: templateTargetNames,
      bindingCount: bindings.length,
      bindings: bindings.map((binding) => ({
        name: binding.name,
        kind: binding.kind,
        queryRef: binding.queryRef || '',
      })),
    });
  }, [bindings, page.id, page.name, templateTargetNames]);

  useEffect(() => {
    if (loading) {
      return;
    }

    const queryRowCounts = Object.fromEntries(
      Object.entries(rowsByQuery).map(([queryId, rows]) => [queryId, rows.length])
    );
    console.log('[FreeformHtmlPageRenderer] Query rows ready:', {
      pageId: page.id,
      queryRowCounts,
      error,
    });
  }, [error, loading, page.id, rowsByQuery]);

  const bindingOutputs = useMemo(
    () => buildBindingOutputs({
      report,
      page,
      bindings,
      rowsByQuery,
    }),
    [bindings, page, report, rowsByQuery]
  );

  const scriptContext = useMemo<FreeformScriptContext>(() => ({
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
    },
    theme,
    bindings: Object.fromEntries(bindings.map((binding) => {
      const rows = binding.queryRef ? (rowsByQuery[binding.queryRef] || []) : [];
      return [binding.name, {
        name: binding.name,
        kind: resolveRuntimeBindingKind(binding, rows),
        queryRef: binding.queryRef,
        label: binding.label,
        className: binding.className,
        chartType: binding.chartType,
        rows,
        fields: getAvailableFields(rows),
        rendered: bindingOutputs[binding.name] || { text: '', html: '' },
      } satisfies FreeformScriptBindingContext];
    })),
    queries: queries.map((query) => ({ id: query.id, name: query.name })),
    rowsByQuery,
  }), [bindingOutputs, bindings, page.filters, page.id, page.name, queries, report.description, report.id, report.name, report.runtimeHints, rowsByQuery, theme]);

  const renderedDocument = useMemo(() => {
    const tokens: Record<string, string> = {
      'report.id': report.id,
      'report.name': report.name,
      'report.description': report.description || '',
      'report.theme': report.theme?.name || '',
      'page.id': page.id,
      'page.name': page.name,
      'page.filters': page.filters.map((filter) => `${filter.target.column} · ${filter.type}`).join(' / '),
      'bindings': bindings.map((binding) => bindingOutputs[binding.name]?.html || '').join('\n'),
    };

    const htmlTokens: Record<string, string> = {
      ...tokens,
      'page.filters': renderFilterChips(page),
    };

    Object.entries(bindingOutputs).forEach(([name, output]) => {
      tokens[name] = output.text;
      htmlTokens[name] = output.html;
      Object.entries(output.tokens || {}).forEach(([tokenName, tokenValue]) => {
        tokens[`${name}.${tokenName}`] = tokenValue;
        htmlTokens[`${name}.${tokenName}`] = tokenValue;
      });
    });

    const baseTemplate = typeof page.template === 'string' && page.template.trim()
      ? page.template
      : DEFAULT_TEMPLATE;
    const templateWithFallbackBindings = templateReferencesBinding(baseTemplate, bindings)
      ? baseTemplate
      : `${baseTemplate}\n<section class="vf-grid">{{{bindings}}}</section>`;
    const renderedTemplate = renderTemplate(templateWithFallbackBindings, tokens, htmlTokens);
    const renderedWithDataBindTargets = injectDataBindTargets(renderedTemplate, htmlTokens);
    const renderedHtml = sanitizeHtml(renderedWithDataBindTargets);
    const stylesheet = buildScopedStyles(page.stylesheet, theme, report);

    return `
      <style>${stylesheet}</style>
      ${renderedHtml}
    `;
  }, [bindingOutputs, bindings, page, report, theme]);

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
    if (page.script?.trim()) {
      scriptCleanupRef.current = executeFreeformPageScript(shadowRoot, page.script, scriptContext);
    }

    return () => {
      if (scriptCleanupRef.current) {
        scriptCleanupRef.current();
        scriptCleanupRef.current = null;
      }
    };
  }, [page.script, renderedDocument, scriptContext]);

  const background = theme.colors.background || '#f5f7fb';
  const surface = theme.colors.surface || '#ffffff';
  const border = withAlpha(theme.colors.text || '#111827', 0.1);
  const shellHeight = viewportMode === 'document' ? 'auto' : '100%';

  return (
    <div
      style={{
        width: '100%',
        height: shellHeight,
        minHeight: viewportMode === 'document' ? 1080 : '100%',
        overflow: viewportMode === 'document' ? 'visible' : 'auto',
        padding: 16,
        boxSizing: 'border-box',
        background: `
          radial-gradient(circle at top left, ${withAlpha(theme.colors.primary, 0.12)}, transparent 26%),
          radial-gradient(circle at top right, ${withAlpha(theme.colors.secondary, 0.12)}, transparent 22%),
          ${background}
        `,
      }}
    >
      {loading ? (
        <div style={buildStatusStyle(surface, border, theme.colors.textSecondary || '#667085')}>
          正在加载自由布局页面的数据绑定...
        </div>
      ) : null}
      {error ? (
        <div style={buildStatusStyle(surface, border, '#c2410c')}>
          数据绑定加载失败: {error}
        </div>
      ) : null}
      <div
        ref={hostRef}
        style={{
          width: '100%',
          minHeight: viewportMode === 'document' ? 1080 : '100%',
          display: 'block',
        }}
      />
    </div>
  );
}

function buildStatusStyle(surface: string, border: string, color: string): React.CSSProperties {
  return {
    marginBottom: 12,
    padding: '10px 12px',
    borderRadius: 12,
    border: `1px solid ${border}`,
    background: surface,
    color,
    fontSize: 12,
    fontWeight: 600,
  };
}

function renderFilterChips(page: PageDefinition): string {
  const filters = Array.isArray(page.filters) ? page.filters : [];
  if (filters.length === 0) {
    return '';
  }

  return `
    <div class="vf-filter-row">
      ${filters.map((filter) => `
        <span class="vf-filter-chip">
          <strong>${escapeHtml(filter.target.column)}</strong>
          <span>${escapeHtml(filter.type)}</span>
        </span>
      `).join('')}
    </div>
  `;
}

function buildBindingOutputs({
  report,
  page,
  bindings,
  rowsByQuery,
}: {
  report: ReportDefinition;
  page: PageDefinition;
  bindings: FreeformBindingDefinition[];
  rowsByQuery: Record<string, DataRow[]>;
}): Record<string, RenderedBinding> {
  const outputs: Record<string, RenderedBinding> = {};
  const fallbackColumns = page.components.flatMap((component) => {
    if (!component.config || typeof component.config !== 'object') {
      return [];
    }

    return Object.values(component.config as unknown as Record<string, unknown>)
      .filter((value): value is string => typeof value === 'string')
      .slice(0, 4);
  });

  bindings.forEach((binding) => {
    const rows = binding.queryRef ? (rowsByQuery[binding.queryRef] || []) : [];
    outputs[binding.name] = renderBinding(binding, rows, report, fallbackColumns);
  });

  return outputs;
}

function resolveEffectiveBindings(
  page: PageDefinition,
  queries: QueryDefinition[],
): FreeformBindingDefinition[] {
  const templateBindingContexts = extractTemplateBindingContexts(page.template);
  const templateBindingTargets = templateBindingContexts.map((context) => context.target);
  const explicitBindings = Array.isArray(page.bindings)
    ? page.bindings.filter((binding): binding is FreeformBindingDefinition => Boolean(binding?.name) && Boolean(binding?.kind))
    : [];
  const fallbackBindings = deriveFallbackBindings(page, queries, templateBindingTargets.length);

  if (explicitBindings.length === 0) {
    return enrichBindingsWithTemplateContext(
      alignBindingsToTemplateTargets(fallbackBindings, templateBindingTargets),
      templateBindingContexts,
    );
  }

  const fallbackByName = new Map(fallbackBindings.map((binding) => [binding.name.toLowerCase(), binding] as const));
  const fallbackByQueryRef = new Map(
    fallbackBindings
      .filter((binding): binding is FreeformBindingDefinition & { queryRef: string } => Boolean(binding.queryRef))
      .map((binding) => [binding.queryRef.toLowerCase(), binding] as const)
  );

  const mergedBindings = explicitBindings.map((binding, index) => {
    const fallbackBinding = fallbackByName.get(binding.name.toLowerCase())
      || (binding.queryRef ? fallbackByQueryRef.get(binding.queryRef.toLowerCase()) : undefined)
      || fallbackBindings[index];

    if (!fallbackBinding) {
      return binding;
    }

    return {
      ...fallbackBinding,
      ...binding,
      kind: binding.kind || fallbackBinding.kind,
      queryRef: binding.queryRef || fallbackBinding.queryRef,
      field: binding.field || fallbackBinding.field,
      categoryField: binding.categoryField || fallbackBinding.categoryField,
      valueField: binding.valueField || fallbackBinding.valueField,
      secondaryField: binding.secondaryField || fallbackBinding.secondaryField,
      label: binding.label || fallbackBinding.label,
      description: binding.description || fallbackBinding.description,
      columns: binding.columns && binding.columns.length > 0 ? binding.columns : fallbackBinding.columns,
      chartType: binding.chartType || fallbackBinding.chartType,
      orientation: binding.orientation || fallbackBinding.orientation,
      limit: binding.limit || fallbackBinding.limit,
      format: binding.format || fallbackBinding.format,
      emptyText: binding.emptyText || fallbackBinding.emptyText,
      itemTemplate: binding.itemTemplate || fallbackBinding.itemTemplate,
      className: binding.className || fallbackBinding.className,
    } satisfies FreeformBindingDefinition;
  });

  const effectiveBindings = mergedBindings.some((binding) => Boolean(binding.queryRef))
    ? mergedBindings
    : fallbackBindings;

  return enrichBindingsWithTemplateContext(
    alignBindingsToTemplateTargets(effectiveBindings, templateBindingTargets, fallbackBindings),
    templateBindingContexts,
  );
}

function deriveFallbackBindings(
  page: PageDefinition,
  queries: QueryDefinition[],
  preferredBindingCount: number,
): FreeformBindingDefinition[] {
  const derivedFromComponents = deriveBindingsFromComponents(page);
  if (derivedFromComponents.length > 0) {
    return derivedFromComponents;
  }

  return deriveBindingsFromQueries(queries, preferredBindingCount);
}

function deriveBindingsFromComponents(page: PageDefinition): FreeformBindingDefinition[] {
  const components = Array.isArray(page.components) ? page.components : [];
  return components.flatMap<FreeformBindingDefinition>((component, index): FreeformBindingDefinition[] => {
    if (!component?.queryRef) {
      return [];
    }

    const config = (component.config || {}) as Record<string, unknown>;
    const title = typeof config.title === 'string' && config.title.trim()
      ? config.title
      : component.id;

    switch (component.type) {
      case 'kpi-card':
        return [{
          name: component.id || `metric_${index + 1}`,
          kind: 'metric',
          queryRef: component.queryRef,
          field: typeof config.valueField === 'string' ? config.valueField : undefined,
          valueField: typeof config.valueField === 'string' ? config.valueField : undefined,
          secondaryField: typeof config.comparisonField === 'string'
            ? config.comparisonField
            : typeof config.compareField === 'string'
              ? config.compareField
              : undefined,
          label: title,
          format: (config.format as ValueFormat | undefined),
        }];
      case 'echarts':
        return [{
          name: component.id || `chart_${index + 1}`,
          kind: 'chart',
          queryRef: component.queryRef,
          chartType: normalizeChartType(config.chartType),
          categoryField: readNestedString(config, 'xAxis', 'field'),
          valueField: readSeriesField(config) || readNestedString(config, 'yAxis', '0', 'field'),
          orientation: typeof config.orientation === 'string' ? config.orientation as 'vertical' | 'horizontal' : undefined,
          label: title,
        }];
      case 'data-table':
        return [{
          name: component.id || `table_${index + 1}`,
          kind: 'table',
          queryRef: component.queryRef,
          columns: readColumnFields(config),
          label: title,
          limit: 12,
        }];
      case 'text':
        return [{
          name: component.id || `text_${index + 1}`,
          kind: 'text',
          queryRef: component.queryRef,
          field: typeof config.field === 'string' ? config.field : undefined,
          label: title,
        }];
      default:
        return [];
    }
  });
}

function deriveBindingsFromQueries(queries: QueryLike[], preferredBindingCount: number): FreeformBindingDefinition[] {
  const normalizedPreferredCount = preferredBindingCount > 0
    ? preferredBindingCount
    : Math.min(queries.length, 6);

  return queries.slice(0, normalizedPreferredCount).map((query, index, list) => ({
    name: `query_${index + 1}`,
    kind: inferBindingKindFromQuery(query, index, list.length),
    queryRef: query.id,
    label: query.name,
    chartType: inferChartTypeFromQuery(query, index),
    limit: inferBindingKindFromQuery(query, index, list.length) === 'table' ? 12 : 8,
  }));
}

function inferBindingKindFromQuery(
  query: QueryLike,
  index: number,
  total: number,
): FreeformBindingDefinition['kind'] {
  const haystack = `${query.name || ''}\n${query.dax || ''}`.toLowerCase();

  if (/evaluate\s+row\s*\(/.test(haystack)) {
    return 'metric';
  }

  if (/(明细|table|列表|list|矩阵|透视|pivot)/i.test(haystack)) {
    return 'table';
  }

  if (/(topn\s*\(\s*10\d{2}|order\s+by|substitutewithindex|rollupaddissubtotal|columnindex)/i.test(haystack)) {
    return 'table';
  }

  if (/(卡片|kpi|指标|总量|总计|累计|count|total)/i.test(haystack)) {
    return 'metric';
  }

  if (index === 0) {
    return 'metric';
  }

  if (index === total - 1 && total > 3) {
    return 'table';
  }

  return 'chart';
}

function inferChartTypeFromQuery(query: QueryLike, index: number): ChartType {
  const haystack = `${query.name || ''}\n${query.dax || ''}`.toLowerCase();

  if (/(占比|构成|结构|share|ratio|百分比|饼)/i.test(haystack)) {
    return 'pie';
  }

  if (/(趋势|同比|环比|月|年|日期|time|date|trend|line)/i.test(haystack)) {
    return 'line';
  }

  return index === 1 ? 'line' : 'bar';
}

function templateReferencesBinding(template: string, bindings: FreeformBindingDefinition[]): boolean {
  if (/\{\{\{\s*bindings\s*\}\}\}/.test(template)) {
    return true;
  }

  const templateTargets = extractTemplateBindingTargets(template);
  if (templateTargets.some((target) => bindings.some((binding) => binding.name === target))) {
    return true;
  }

  return bindings.some((binding) => new RegExp(`\\{\\{\\{?\\s*${escapeRegExp(binding.name)}(?:\\.[\\w-]+)?\\s*\\}?\\}\\}`).test(template));
}

function extractTemplateBindingTargets(template?: string): string[] {
  if (!template) {
    return [];
  }

  const targets: string[] = [];
  const seen = new Set<string>();
  const regex = /data-bind\s*=\s*(['"])([^'"<>]+)\1/gi;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(template)) !== null) {
    const target = match[2]?.trim();
    if (!target || seen.has(target)) {
      continue;
    }

    seen.add(target);
    targets.push(target);
  }

  return targets;
}

function extractTemplateBindingContexts(template?: string): TemplateBindingContext[] {
  if (!template) {
    return [];
  }

  const contexts: TemplateBindingContext[] = [];
  const seen = new Set<string>();
  const regex = /<([a-z][\w:-]*)([^>]*\sdata-bind=(['"])([^'"<>]+)\3[^>]*)>([\s\S]*?)<\/\1>/gi;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(template)) !== null) {
    const attrs = match[2] || '';
    const target = match[4]?.trim();
    if (!target || seen.has(target)) {
      continue;
    }

    seen.add(target);
    const className = extractAttributeValue(attrs, 'class');
    const lookbehind = template.slice(Math.max(0, match.index - 480), match.index);
    const heading = extractNearestHeadingText(lookbehind);
    const normalizedClassName = className?.toLowerCase() || '';
    const normalizedHeading = heading.toLowerCase();
    const suggestedKind = inferBindingKindFromTemplateContext(normalizedClassName, normalizedHeading);

    contexts.push({
      target,
      className,
      suggestedKind,
      suggestedChartType: suggestedKind === 'chart'
        ? inferChartTypeFromTemplateContext(normalizedClassName, normalizedHeading)
        : undefined,
      label: heading || undefined,
      emphasis: inferBindingEmphasis(normalizedClassName, normalizedHeading),
    });
  }

  return contexts;
}

function extractAttributeValue(attributes: string, attributeName: string): string | undefined {
  const regex = new RegExp(`${attributeName}\\s*=\\s*(['"])(.*?)\\1`, 'i');
  const match = attributes.match(regex);
  return match?.[2]?.trim() || undefined;
}

function extractNearestHeadingText(source: string): string {
  const regex = /<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi;
  let match: RegExpExecArray | null;
  let latestText = '';

  while ((match = regex.exec(source)) !== null) {
    latestText = stripTags(match[1] || '').trim();
  }

  return latestText;
}

function inferBindingKindFromTemplateContext(
  className: string,
  heading: string,
): FreeformBindingDefinition['kind'] | undefined {
  if (/table|matrix|detail|明细|透视/.test(className) || /明细|透视|表|矩阵/.test(heading)) {
    return 'table';
  }

  if (/kpi|metric|stat/.test(className)) {
    return 'metric';
  }

  if (/chart|trend|series|comparison/.test(className) || /趋势|同比|环比|分布|构成|变化|图/.test(heading)) {
    return 'chart';
  }

  if (/list/.test(className)) {
    return 'list';
  }

  if (/card/.test(className)) {
    return 'metric';
  }

  return undefined;
}

function inferChartTypeFromTemplateContext(className: string, heading: string): ChartType {
  const haystack = `${className} ${heading}`;
  if (/占比|构成|结构|分布|share|composition|pie|donut/.test(haystack)) {
    return 'pie';
  }

  if (/趋势|同比|环比|月|年|time|trend|line|series/.test(haystack)) {
    return 'line';
  }

  return 'bar';
}

function inferBindingEmphasis(
  className: string,
  heading: string,
): TemplateBindingContext['emphasis'] | undefined {
  if (/main|hero|lead/.test(className)) {
    return 'hero';
  }

  if (/table|matrix|detail|明细/.test(className) || /明细|透视|表/.test(heading)) {
    return 'table';
  }

  if (/chart|trend|comparison/.test(className) || /趋势|同比|环比|分布|构成|变化/.test(heading)) {
    return 'chart';
  }

  if (/kpi|metric|stat|card/.test(className)) {
    return 'compact';
  }

  return undefined;
}

function enrichBindingsWithTemplateContext(
  bindings: FreeformBindingDefinition[],
  templateContexts: TemplateBindingContext[],
): FreeformBindingDefinition[] {
  if (templateContexts.length === 0) {
    return bindings;
  }

  const contextByTarget = new Map(templateContexts.map((context) => [context.target.toLowerCase(), context] as const));

  return bindings.map((binding) => {
    const context = contextByTarget.get(binding.name.toLowerCase());
    if (!context) {
      return binding;
    }

    const nextKind = shouldOverrideBindingKind(binding.kind, context.suggestedKind)
      ? context.suggestedKind
      : binding.kind;
    const className = [binding.className, context.emphasis ? `vf-tone-${context.emphasis}` : '']
      .filter(Boolean)
      .join(' ')
      .trim();

    return {
      ...binding,
      kind: nextKind || binding.kind,
      chartType: (nextKind || binding.kind) === 'chart'
        ? binding.chartType || context.suggestedChartType
        : binding.chartType,
      label: binding.label || context.label,
      className: className || undefined,
    };
  });
}

function shouldOverrideBindingKind(
  currentKind: FreeformBindingDefinition['kind'],
  suggestedKind?: FreeformBindingDefinition['kind'],
): boolean {
  if (!suggestedKind) {
    return false;
  }

  if (currentKind === 'html') {
    return false;
  }

  return currentKind !== suggestedKind;
}

function alignBindingsToTemplateTargets(
  bindings: FreeformBindingDefinition[],
  templateTargets: string[],
  fallbackBindings: FreeformBindingDefinition[] = bindings,
): FreeformBindingDefinition[] {
  if (templateTargets.length === 0) {
    return bindings;
  }

  const bindingByName = new Map(bindings.map((binding) => [binding.name.toLowerCase(), binding] as const));
  const fallbackByName = new Map(fallbackBindings.map((binding) => [binding.name.toLowerCase(), binding] as const));
  const alignedBindings: FreeformBindingDefinition[] = [];
  const usedNames = new Set<string>();

  templateTargets.forEach((target, index) => {
    const existing = bindingByName.get(target.toLowerCase());
    const fallback = fallbackByName.get(target.toLowerCase()) || fallbackBindings[index] || bindings[index];

    const candidate = existing && existing.queryRef
      ? existing
      : existing && fallback
        ? { ...fallback, ...existing, name: target }
        : fallback
          ? { ...fallback, name: target }
          : existing
            ? { ...existing, name: target }
            : null;

    if (!candidate) {
      return;
    }

    alignedBindings.push(candidate);
    usedNames.add(candidate.name.toLowerCase());
  });

  bindings.forEach((binding) => {
    if (usedNames.has(binding.name.toLowerCase())) {
      return;
    }

    alignedBindings.push(binding);
  });

  return alignedBindings;
}

function renderBinding(
  binding: FreeformBindingDefinition,
  rows: DataRow[],
  report: ReportDefinition,
  fallbackColumns: string[],
): RenderedBinding {
  switch (resolveRuntimeBindingKind(binding, rows)) {
    case 'value':
      return renderValueBinding(binding, rows);
    case 'metric':
      return renderMetricBinding(binding, rows);
    case 'table':
      return renderTableBinding(binding, rows);
    case 'list':
      return renderListBinding(binding, rows);
    case 'chart':
      return renderChartBinding(binding, rows, report);
    case 'html':
      return renderHtmlBinding(binding, rows);
    case 'text':
    default:
      return renderTextBinding(binding, rows, fallbackColumns);
  }
}

function resolveRuntimeBindingKind(
  binding: FreeformBindingDefinition,
  rows: DataRow[],
): FreeformBindingDefinition['kind'] {
  if (binding.kind !== 'text' && binding.kind !== 'value') {
    return binding.kind;
  }

  if (rows.length === 0) {
    return binding.kind;
  }

  const availableFields = getAvailableFields(rows);
  const numericFields = availableFields.filter((field) => hasNumericValues(rows, field));
  const textFields = availableFields.filter((field) => hasTextValues(rows, field));

  if (binding.kind === 'text' && rows.length === 1 && numericFields.length === 1 && textFields.length === 0) {
    return 'metric';
  }

  if (binding.kind === 'text' && rows.length > 1 && numericFields.length >= 1 && textFields.length >= 1) {
    return 'chart';
  }

  if (binding.kind === 'text' && rows.length > 1 && availableFields.length > 1) {
    return 'table';
  }

  return binding.kind;
}

function hasNumericValues(rows: DataRow[], field: string): boolean {
  return rows.some((row) => typeof row[field] === 'number');
}

function hasTextValues(rows: DataRow[], field: string): boolean {
  return rows.some((row) => typeof row[field] === 'string' && String(row[field]).trim().length > 0);
}

function resolveMetricTone(className?: string): string {
  const source = className?.toLowerCase() || '';
  if (/hero|main|lead/.test(source)) {
    return 'vf-metric--hero';
  }

  return 'vf-metric--compact';
}

function buildMetricChipText(label: string, note: string): string {
  if (note) {
    return 'Live';
  }

  if (/占比|share|ratio|同比|环比/i.test(label)) {
    return 'Ratio';
  }

  if (/数量|count|船舶|条数/i.test(label)) {
    return 'Count';
  }

  return 'Metric';
}

function resolveChartKicker(label: string, chartType: ChartType): string {
  if (/趋势|trend/i.test(label)) {
    return 'Trend';
  }

  if (/分布|构成|占比|share|composition/i.test(label) || chartType === 'pie') {
    return 'Composition';
  }

  return 'Analysis';
}

function resolveChartCaption(points: Array<{ label: string; value: number }>, chartType: ChartType): string {
  if (points.length === 0) {
    return '';
  }

  const values = points.map((point) => point.value);
  const peak = points.reduce((best, current) => (current.value > best.value ? current : best), points[0]);
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;

  if (chartType === 'pie') {
    return `最大项 ${peak.label} · ${formatValue(peak.value)}`;
  }

  return `峰值 ${peak.label} · 均值 ${formatValue(average)}`;
}

function renderValueBinding(binding: FreeformBindingDefinition, rows: DataRow[]): RenderedBinding {
  const row = rows[0] || {};
  const availableFields = getAvailableFields(rows);
  const field = resolveFieldReference(binding.field || findPrimaryNumericField(rows[0]) || Object.keys(row)[0], availableFields)
    || binding.field
    || findPrimaryNumericField(rows[0])
    || Object.keys(row)[0];
  const rawValue = field ? row[field] : '';
  const formatted = formatValue(rawValue, binding.format);
  return {
    text: formatted,
    html: escapeHtml(formatted),
    tokens: {
      value: formatted,
      label: binding.label || field || '',
    },
  };
}

function renderMetricBinding(binding: FreeformBindingDefinition, rows: DataRow[]): RenderedBinding {
  const row = rows[0] || {};
  const availableFields = getAvailableFields(rows);
  const field = resolveFieldReference(binding.valueField || binding.field || findPrimaryNumericField(rows[0]) || Object.keys(row)[0], availableFields)
    || binding.valueField
    || binding.field
    || findPrimaryNumericField(rows[0])
    || Object.keys(row)[0];
  const secondaryField = resolveFieldReference(binding.secondaryField || findSecondaryField(rows[0], field), availableFields)
    || binding.secondaryField
    || findSecondaryField(rows[0], field);
  const value = field ? formatValue(row[field], binding.format) : '-';
  const note = secondaryField ? formatValue(row[secondaryField]) : (binding.description || '');
  const label = binding.label || cleanFieldLabel(field || binding.name);
  const metricTone = resolveMetricTone(binding.className);
  return {
    text: `${label} ${value}`.trim(),
    html: `
      <article class="vf-metric ${metricTone} ${binding.className || ''}">
        <div class="vf-metric-label-row">
          <div class="vf-metric-label">${escapeHtml(label)}</div>
          <div class="vf-metric-chip">${escapeHtml(buildMetricChipText(label, note))}</div>
        </div>
        <div class="vf-metric-value">${escapeHtml(value)}</div>
        ${note ? `<div class="vf-metric-note">${escapeHtml(note)}</div>` : '<div class="vf-metric-note vf-metric-note--empty"></div>'}
      </article>
    `,
    tokens: {
      label,
      value,
      note,
    },
  };
}

function renderTableBinding(binding: FreeformBindingDefinition, rows: DataRow[]): RenderedBinding {
  const availableFields = getAvailableFields(rows);
  const columns = ((binding.columns && binding.columns.length > 0
    ? binding.columns.map((column) => resolveFieldReference(column, availableFields) || column)
    : availableFields)).filter((column, index, list) => column !== '__rowIndex' && list.indexOf(column) === index)
    .slice(0, binding.limit || 8);
  const limitedRows = rows.slice(0, Math.max(1, binding.limit || 12));
  if (columns.length === 0 || limitedRows.length === 0) {
    const emptyText = binding.emptyText || '暂无表格数据';
    return { text: emptyText, html: `<div class="vf-empty">${escapeHtml(emptyText)}</div>` };
  }

  const header = columns.map((column) => `<th>${escapeHtml(cleanFieldLabel(column))}</th>`).join('');
  const body = limitedRows.map((row) => (
    `<tr>${columns.map((column) => `<td>${escapeHtml(formatValue(row[column]))}</td>`).join('')}</tr>`
  )).join('');

  return {
    text: `${binding.label || '表格'} ${limitedRows.length} 行`,
    html: `
      <div class="vf-table-wrap ${binding.className || ''}">
        <table class="vf-table">
          <thead><tr>${header}</tr></thead>
          <tbody>${body}</tbody>
        </table>
      </div>
    `,
  };
}

function renderListBinding(binding: FreeformBindingDefinition, rows: DataRow[]): RenderedBinding {
  const availableFields = getAvailableFields(rows);
  const categoryField = resolveFieldReference(binding.categoryField || findPrimaryTextField(rows[0]) || Object.keys(rows[0] || {})[0], availableFields)
    || binding.categoryField
    || findPrimaryTextField(rows[0])
    || Object.keys(rows[0] || {})[0];
  const valueField = resolveFieldReference(binding.valueField || findPrimaryNumericField(rows[0]) || Object.keys(rows[0] || {})[1], availableFields)
    || binding.valueField
    || findPrimaryNumericField(rows[0])
    || Object.keys(rows[0] || {})[1];
  const limitedRows = rows.slice(0, Math.max(1, binding.limit || 8));

  if (!categoryField || !valueField || limitedRows.length === 0) {
    const emptyText = binding.emptyText || '暂无列表数据';
    return { text: emptyText, html: `<div class="vf-empty">${escapeHtml(emptyText)}</div>` };
  }

  const items = limitedRows.map((row) => {
    const tokens = Object.fromEntries(Object.entries(row).map(([key, value]) => [key, formatValue(value)]));
    const itemHtml = binding.itemTemplate
      ? renderRowTemplate(binding.itemTemplate, tokens)
      : `
        <div class="vf-list-name">${escapeHtml(formatValue(row[categoryField]))}</div>
        <div class="vf-list-value">${escapeHtml(formatValue(row[valueField], binding.format))}</div>
      `;
    return `<li class="vf-list-item">${itemHtml}</li>`;
  }).join('');

  return {
    text: `${binding.label || binding.name} ${limitedRows.length} 项`,
    html: `<ul class="vf-list ${binding.className || ''}">${items}</ul>`,
  };
}

function renderChartBinding(binding: FreeformBindingDefinition, rows: DataRow[], report: ReportDefinition): RenderedBinding {
  const chartType = binding.chartType || 'bar';
  const availableFields = getAvailableFields(rows);
  const categoryField = resolveFieldReference(binding.categoryField || findPrimaryTextField(rows[0]) || Object.keys(rows[0] || {})[0], availableFields)
    || binding.categoryField
    || findPrimaryTextField(rows[0])
    || Object.keys(rows[0] || {})[0];
  const valueField = resolveFieldReference(binding.valueField || findPrimaryNumericField(rows[0]) || Object.keys(rows[0] || {})[1], availableFields)
    || binding.valueField
    || findPrimaryNumericField(rows[0])
    || Object.keys(rows[0] || {})[1];
  const limitedRows = rows.slice(0, Math.max(1, binding.limit || 8));

  if (!categoryField || !valueField || limitedRows.length === 0) {
    const emptyText = binding.emptyText || '暂无图表数据';
    return { text: emptyText, html: `<div class="vf-empty">${escapeHtml(emptyText)}</div>` };
  }

  const colorA = report.theme?.colors.primary || '#2563eb';
  const colorB = report.theme?.colors.secondary || '#14b8a6';
  const points = limitedRows.map((row) => ({
    label: formatValue(row[categoryField]),
    value: Number(row[valueField] || 0),
  }));

  const html = chartType === 'line' || chartType === 'area'
    ? renderLineChart(points, colorA, colorB, chartType === 'area')
    : chartType === 'pie'
      ? renderPieChart(points, report.theme?.colors.chart || [colorA, colorB, '#f97316'])
      : renderBarChart(points, colorA, colorB, binding.orientation === 'horizontal');

  return {
    text: `${binding.label || binding.name} 图表`,
    html: `
      <div class="vf-chart-panel ${binding.className || ''}">
        <div class="vf-chart-meta">
          <div class="vf-chart-meta-primary">
            <div class="vf-chart-kicker">${escapeHtml(resolveChartKicker(binding.label || binding.name, chartType))}</div>
            <div class="vf-chart-name">${escapeHtml(binding.label || cleanFieldLabel(valueField || binding.name))}</div>
          </div>
          <div class="chart-badge">${escapeHtml(`${points.length} 项`)}</div>
        </div>
        <div class="vf-chart-caption">${escapeHtml(resolveChartCaption(points, chartType))}</div>
        ${html}
      </div>
    `,
  };
}

function renderHtmlBinding(binding: FreeformBindingDefinition, rows: DataRow[]): RenderedBinding {
  if (binding.itemTemplate && rows.length > 0) {
    const html = rows.slice(0, Math.max(1, binding.limit || 6)).map((row) => {
      const tokens = Object.fromEntries(Object.entries(row).map(([key, value]) => [key, formatValue(value)]));
      return renderRowTemplate(binding.itemTemplate!, tokens);
    }).join('');
    return { text: `${binding.label || binding.name}`, html };
  }

  const availableFields = getAvailableFields(rows);
  const field = resolveFieldReference(binding.field || findPrimaryTextField(rows[0]) || Object.keys(rows[0] || {})[0], availableFields)
    || binding.field
    || findPrimaryTextField(rows[0])
    || Object.keys(rows[0] || {})[0];
  const rawHtml = field ? String(rows[0]?.[field] ?? '') : '';
  const html = sanitizeHtml(rawHtml || `<div class="vf-empty">${escapeHtml(binding.emptyText || '暂无 HTML 内容')}</div>`);
  return { text: stripTags(html), html };
}

function renderTextBinding(binding: FreeformBindingDefinition, rows: DataRow[], fallbackColumns: string[]): RenderedBinding {
  const availableFields = getAvailableFields(rows);
  const field = resolveFieldReference(binding.field || findPrimaryTextField(rows[0]) || fallbackColumns[0], availableFields)
    || binding.field
    || findPrimaryTextField(rows[0])
    || resolveFieldReference(fallbackColumns[0], availableFields)
    || fallbackColumns[0];
  const text = field && rows[0] ? formatValue(rows[0][field], binding.format) : (binding.emptyText || binding.label || binding.name);
  return { text, html: escapeHtml(text) };
}

function getAvailableFields(rows: DataRow[]): string[] {
  const fields = new Set<string>();
  rows.slice(0, 5).forEach((row) => {
    Object.keys(row || {})
      .filter((field) => field !== '__rowIndex')
      .forEach((field) => fields.add(field));
  });

  return Array.from(fields);
}

function readNestedString(source: Record<string, unknown>, ...keys: string[]): string | undefined {
  let current: unknown = source;
  for (const key of keys) {
    if (Array.isArray(current)) {
      current = current[Number(key)];
      continue;
    }

    if (!current || typeof current !== 'object') {
      return undefined;
    }

    current = (current as Record<string, unknown>)[key];
  }

  return typeof current === 'string' ? current : undefined;
}

function readSeriesField(source: Record<string, unknown>): string | undefined {
  const series = source.series;
  if (!Array.isArray(series)) {
    return undefined;
  }

  const first = series.find((item) => item && typeof item === 'object') as Record<string, unknown> | undefined;
  return first && typeof first.field === 'string' ? first.field : undefined;
}

function readColumnFields(source: Record<string, unknown>): string[] {
  const columns = source.columns;
  if (!Array.isArray(columns)) {
    return [];
  }

  return columns
    .map((column) => (column && typeof column === 'object' && typeof (column as Record<string, unknown>).field === 'string')
      ? String((column as Record<string, unknown>).field)
      : null)
    .filter((column): column is string => Boolean(column));
}

function normalizeChartType(value: unknown): ChartType {
  switch (value) {
    case 'line':
    case 'bar':
    case 'pie':
    case 'area':
    case 'scatter':
    case 'radar':
    case 'gauge':
      return value;
    default:
      return 'bar';
  }
}

function renderBarChart(points: Array<{ label: string; value: number }>, colorA: string, colorB: string, horizontal: boolean): string {
  const max = Math.max(...points.map((point) => point.value), 1);
  if (horizontal) {
    return `
      <div class="vf-bars vf-bars--horizontal">
        ${points.map((point) => `
          <div class="vf-bar-row">
            <div class="vf-bar-label">${escapeHtml(point.label)}</div>
            <div class="vf-bar-track">
              <div class="vf-bar-fill" style="width:${Math.max(8, (point.value / max) * 100).toFixed(2)}%;background:linear-gradient(90deg, ${colorA}, ${colorB});"></div>
            </div>
            <div class="vf-bar-value">${escapeHtml(formatValue(point.value))}</div>
          </div>
        `).join('')}
      </div>
    `;
  }

  return `
    <div class="vf-bars vf-bars--vertical">
      ${points.map((point) => `
        <div class="vf-bar-col">
          <div class="vf-bar-col-track">
            <div class="vf-bar-col-fill" style="height:${Math.max(8, (point.value / max) * 100).toFixed(2)}%;background:linear-gradient(180deg, ${colorA}, ${colorB});"></div>
          </div>
          <div class="vf-bar-col-label">${escapeHtml(point.label)}</div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderLineChart(points: Array<{ label: string; value: number }>, colorA: string, colorB: string, area: boolean): string {
  const width = 720;
  const height = 240;
  const max = Math.max(...points.map((point) => point.value), 1);
  const min = Math.min(...points.map((point) => point.value), 0);
  const span = Math.max(max - min, 1);
  const gap = points.length > 1 ? width / (points.length - 1) : width;
  const plotted = points.map((point, index) => {
    const x = index * gap;
    const y = height - ((point.value - min) / span) * (height - 40) - 20;
    return { ...point, x, y };
  });
  const linePath = plotted.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
  const areaPath = `${linePath} L ${plotted[plotted.length - 1]?.x ?? width} ${height} L 0 ${height} Z`;

  return `
    <svg class="vf-line" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-label="line chart">
      <defs>
        <linearGradient id="vf-line-gradient" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="${colorA}" stop-opacity="${area ? 0.34 : 1}" />
          <stop offset="100%" stop-color="${colorB}" stop-opacity="${area ? 0.04 : 1}" />
        </linearGradient>
      </defs>
      ${area ? `<path d="${areaPath}" fill="url(#vf-line-gradient)"></path>` : ''}
      <path d="${linePath}" fill="none" stroke="${colorA}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></path>
      ${plotted.map((point) => `<circle cx="${point.x}" cy="${point.y}" r="4" fill="${colorB}"></circle>`).join('')}
    </svg>
  `;
}

function renderPieChart(points: Array<{ label: string; value: number }>, palette: string[]): string {
  const total = Math.max(points.reduce((sum, point) => sum + point.value, 0), 1);
  let cursor = 0;
  const gradient = points.map((point, index) => {
    const start = cursor;
    const end = start + ((point.value / total) * 100);
    cursor = end;
    return `${palette[index % palette.length]} ${start.toFixed(2)}% ${end.toFixed(2)}%`;
  }).join(', ');

  return `
    <div class="vf-pie-wrap">
      <div class="vf-pie-ring" style="background:conic-gradient(${gradient})"></div>
      <div class="vf-pie-legend">
        ${points.map((point, index) => `
          <div class="vf-pie-item">
            <span class="vf-pie-swatch" style="background:${palette[index % palette.length]}"></span>
            <span class="vf-pie-label">${escapeHtml(point.label)}</span>
            <span class="vf-pie-value">${escapeHtml(formatValue((point.value / total) * 100))}%</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function executeFreeformPageScript(
  root: ShadowRoot,
  script: string,
  context: FreeformScriptContext,
): (() => void) | null {
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
    topN<T>(items: T[], count: number, selector: (item: T) => number) {
      return [...items]
        .sort((left, right) => selector(right) - selector(left))
        .slice(0, count);
    },
  };

  try {
    const runner = new Function(
      'root',
      'context',
      'helpers',
      `"use strict";\n${script}`
    ) as (
      rootArg: ShadowRoot,
      contextArg: FreeformScriptContext,
      helpersArg: typeof helpers,
    ) => void | (() => void);
    const cleanup = runner(root, context, helpers);
    return typeof cleanup === 'function' ? cleanup : null;
  } catch (err) {
    console.error('[FreeformHtmlPageRenderer] page.script execution failed:', err);
    return null;
  }
}

function buildScopedStyles(
  stylesheet: string | undefined,
  theme: ThemeDefinition,
  report: ReportDefinition,
): string {
  const background = theme.colors.background || '#f5f7fb';
  const surface = theme.colors.surface || '#ffffff';
  const text = theme.colors.text || '#111827';
  const muted = theme.colors.textSecondary || '#667085';
  const primary = theme.colors.primary || '#2563eb';
  const secondary = theme.colors.secondary || '#14b8a6';
  const variant = resolveFreeformVariant(report, theme);
  const tokens = resolveFreeformStyleTokens(variant, theme);
  const defaultCardRadius = theme.components?.card?.borderRadius || tokens.panelRadius;
  const defaultCardShadow = theme.components?.card?.shadow || tokens.panelShadow;

  const base = `
    :host {
      display: block;
      color: ${text};
      font-family: ${tokens.bodyFont};
      --vf-display-font: ${tokens.displayFont};
      --vf-body-font: ${tokens.bodyFont};
      --vf-mono-font: ${tokens.monoFont};
      --vf-shell-radius: ${tokens.shellRadius}px;
      --vf-panel-radius: ${defaultCardRadius}px;
      --vf-panel-shadow: ${defaultCardShadow};
      --vf-panel-background: ${tokens.panelBackground};
      --vf-panel-border: ${tokens.panelBorder};
      --vf-top-accent: ${tokens.topAccent};
      --vf-hero-background: ${tokens.heroBackground};
    }
    *, *::before, *::after { box-sizing: border-box; }
    .vf-page-shell {
      width: min(${tokens.pageWidth}, 100%);
      min-height: 1080px;
      margin: 0 auto;
      border-radius: var(--vf-shell-radius);
      padding: 28px;
      background: ${tokens.chromeOverlay};
      color: ${text};
      overflow: clip;
    }
    .vf-masthead { display:grid; gap:12px; margin-bottom:24px; }
    .vf-kicker { font-size:11px; text-transform:uppercase; letter-spacing:0.16em; color:${muted}; font-weight:700; font-family:var(--vf-mono-font); }
    .vf-title { margin:0; font-family:var(--vf-display-font); font-size:44px; line-height:0.94; letter-spacing:-0.05em; }
    .vf-subtitle { margin:0; max-width:72ch; color:${muted}; line-height:1.7; font-size:14px; }
    .vf-grid { display:grid; gap:20px; }
    .vf-filter-row { display:flex; flex-wrap:wrap; gap:10px; margin-bottom:18px; }
    .vf-filter-chip { display:inline-flex; align-items:center; gap:8px; padding:10px 14px; border-radius:999px; border:1px solid ${withAlpha(text, 0.12)}; background:${withAlpha(surface, 0.86)}; font-size:12px; }
    .vf-filter-chip strong { font-size:12px; }
    .vf-card, .vf-metric, .vf-table-wrap, .vf-list, .vf-chart-panel {
      border: var(--vf-panel-border);
      background: var(--vf-panel-background);
      border-radius: var(--vf-panel-radius);
      box-shadow: var(--vf-panel-shadow);
    }
    .vf-metric { padding:18px 20px; display:grid; gap:8px; }
    .vf-metric--hero {
      padding: 28px 28px 24px;
      border-radius: calc(var(--vf-panel-radius) + 6px);
      background:
        linear-gradient(135deg, ${withAlpha(primary, 0.16)} 0%, ${withAlpha(surface, 0.94)} 42%, ${withAlpha(secondary, 0.12)} 100%);
      box-shadow: 0 22px 56px ${withAlpha(text, 0.12)};
    }
    .vf-metric--compact {
      background:
        linear-gradient(180deg, ${withAlpha(surface, 0.97)} 0%, ${withAlpha(mixColors(surface, background, 0.88, surface), 0.94)} 100%);
    }
    .vf-metric-label-row {
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:12px;
    }
    .vf-metric-label { font-size:12px; text-transform:uppercase; letter-spacing:0.10em; color:${muted}; font-weight:700; }
    .vf-metric-chip {
      display:inline-flex;
      align-items:center;
      justify-content:center;
      min-height:26px;
      padding:0 10px;
      border-radius:999px;
      border:1px solid ${withAlpha(text, 0.12)};
      background:${withAlpha(surface, 0.76)};
      color:${muted};
      font-size:10px;
      font-weight:800;
      letter-spacing:0.12em;
      text-transform:uppercase;
      font-family: var(--vf-mono-font);
    }
    .vf-metric-value { font-family:var(--vf-display-font); font-size:34px; line-height:1; font-weight:800; letter-spacing:-0.05em; }
    .vf-metric--hero .vf-metric-value {
      font-size:56px;
      letter-spacing:-0.07em;
      text-shadow:0 8px 24px ${withAlpha(primary, 0.18)};
    }
    .vf-metric-note { color:${muted}; font-size:12px; line-height:1.6; }
    .vf-metric-note--empty { min-height:18px; }
    .vf-table-wrap { padding:14px; overflow:auto; }
    .vf-table { width:100%; border-collapse:collapse; font-size:12px; }
    .vf-table th, .vf-table td { padding:10px 12px; border-bottom:1px solid ${withAlpha(text, 0.08)}; text-align:left; white-space:nowrap; }
    .vf-table th { position:sticky; top:0; background:${surface}; z-index:1; }
    .vf-list { list-style:none; margin:0; padding:10px; display:grid; gap:10px; }
    .vf-list-item { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:12px; padding:12px 14px; border-radius:16px; background:${withAlpha(surface, 0.82)}; }
    .vf-list-name { font-weight:600; }
    .vf-list-value { font-weight:700; color:${primary}; }
    .vf-bars { display:grid; gap:12px; }
    .vf-bars--horizontal .vf-bar-row { display:grid; grid-template-columns:140px minmax(0,1fr) auto; gap:10px; align-items:center; }
    .vf-bar-label, .vf-bar-value { font-size:12px; }
    .vf-bar-track { height:10px; border-radius:999px; background:${withAlpha(text, 0.08)}; overflow:hidden; }
    .vf-bar-fill { height:100%; border-radius:inherit; }
    .vf-bars--vertical { display:grid; grid-template-columns:repeat(auto-fit, minmax(56px, 1fr)); gap:14px; min-height:240px; align-items:end; }
    .vf-bar-col { display:grid; gap:10px; }
    .vf-bar-col-track { height:220px; display:flex; align-items:flex-end; border-radius:14px; background:${withAlpha(text, 0.06)}; padding:6px; }
    .vf-bar-col-fill { width:100%; border-radius:10px; }
    .vf-bar-col-label { font-size:11px; color:${muted}; text-align:center; }
    .vf-line { width:100%; height:260px; display:block; }
    .vf-chart-panel { display:grid; gap:14px; min-height:100%; padding:12px; }
    .vf-chart-meta { display:flex; align-items:flex-start; justify-content:space-between; gap:14px; flex-wrap:wrap; }
    .vf-chart-meta-primary { display:grid; gap:6px; }
    .vf-chart-kicker { font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:0.14em; color:${muted}; font-family:var(--vf-mono-font); }
    .vf-chart-name { font-family:var(--vf-display-font); font-size:20px; line-height:1.05; letter-spacing:-0.03em; color:${text}; }
    .vf-chart-caption { font-size:12px; color:${muted}; line-height:1.5; }
    .vf-pie-wrap { display:grid; grid-template-columns:220px minmax(0,1fr); gap:20px; align-items:center; }
    .vf-pie-ring { width:220px; aspect-ratio:1; border-radius:50%; position:relative; }
    .vf-pie-ring::after { content:""; position:absolute; inset:34px; border-radius:50%; background:${surface}; }
    .vf-pie-legend { display:grid; gap:10px; }
    .vf-pie-item { display:grid; grid-template-columns:auto minmax(0,1fr) auto; gap:10px; align-items:center; }
    .vf-pie-swatch { width:12px; height:12px; border-radius:999px; }
    .vf-pie-label, .vf-pie-value { font-size:12px; }
    .vf-empty { padding:18px; color:${muted}; border:1px dashed ${withAlpha(text, 0.18)}; border-radius:16px; }
  `;

  const enhancement = `
    .report-container,
    .app {
      width: min(${tokens.pageWidth}, calc(100vw - 24px));
      margin: 0 auto;
      position: relative;
      z-index: 1;
    }
    .report-container {
      padding: 28px 36px 40px;
      background: ${tokens.chromeOverlay};
      border-radius: var(--vf-shell-radius);
      overflow: clip;
    }
    .content {
      display: grid;
      gap: 18px;
    }
    .report-header {
      position: relative;
      border-bottom: none;
      padding-bottom: 18px;
      margin-bottom: 36px;
    }
    .report-header::after {
      content: '';
      display: block;
      width: 96px;
      height: 4px;
      margin-top: 16px;
      border-radius: 999px;
      background: var(--vf-top-accent);
      box-shadow: 0 10px 24px ${withAlpha(primary, 0.22)};
    }
    .report-header h1,
    .sidebar-title h1,
    .hero .title,
    .card-title,
    .chart-title {
      font-family: var(--vf-display-font);
    }
    .hero,
    .chart-grid,
    .bottom-grid,
    .comparison-chart-section {
      display: grid;
      grid-template-columns: minmax(0, 1.24fr) minmax(320px, 0.96fr);
      gap: 20px;
    }
    .hero {
      position: relative;
      padding: 22px 24px;
      border-radius: calc(var(--vf-panel-radius) + 6px);
      background: var(--vf-hero-background);
      border: var(--vf-panel-border);
      box-shadow: var(--vf-panel-shadow);
      color: ${tokens.heroTone};
      overflow: clip;
    }
    .hero-main,
    .sidebar-title,
    .hero-insight,
    .structure-grid {
      display: grid;
      gap: 14px;
    }
    .hero .kicker,
    .sidebar-title .kicker,
    .filter-head .label,
    .tiny-label {
      font-family: var(--vf-mono-font);
      font-size: 11px;
      letter-spacing: 0.16em;
      text-transform: uppercase;
    }
    .hero .title {
      margin: 0;
      font-size: clamp(38px, 4vw, 68px);
      line-height: 0.92;
      letter-spacing: -0.04em;
    }
    .hero .sub,
    .sidebar-title p,
    .card-note {
      color: ${muted};
      line-height: 1.65;
    }
    .selection-summary {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .summary-chip {
      display: inline-flex;
      align-items: center;
      min-height: 34px;
      padding: 8px 12px;
      border-radius: 999px;
      background: ${withAlpha(surface, 0.72)};
      border: 1px solid ${withAlpha(text, 0.08)};
      color: ${text};
      font-size: 12px;
      font-weight: 700;
    }
    .hero-insight {
      align-content: start;
      padding: 18px;
      border-radius: calc(var(--vf-panel-radius) + 4px);
      background: linear-gradient(180deg, ${withAlpha(mixColors(text, primary, 0.7, text), 0.98)}, ${withAlpha(primary, 0.92)});
      color: #fff;
      box-shadow: 0 18px 36px ${withAlpha(text, 0.18)};
    }
    .hero-insight .headline,
    .hero-insight .value,
    .kpi-card .value {
      font-family: var(--vf-display-font);
      letter-spacing: -0.05em;
    }
    .sidebar {
      align-self: start;
      display: grid;
      gap: 16px;
      padding: 20px;
      border-radius: calc(var(--vf-panel-radius) + 6px);
      background: ${variant === 'shipping-ops' || variant === 'noir'
        ? `linear-gradient(180deg, ${withAlpha(surface, 0.98)} 0%, ${withAlpha(mixColors(surface, background, 0.78, surface), 0.94)} 100%)`
        : `linear-gradient(180deg, ${withAlpha(surface, 0.88)} 0%, ${withAlpha(mixColors(surface, background, 0.84, surface), 0.9)} 100%)`};
      border: var(--vf-panel-border);
      box-shadow: var(--vf-panel-shadow);
    }
    .filter-block {
      display: grid;
      gap: 10px;
      padding: 14px;
      border-radius: calc(var(--vf-panel-radius) - 6px);
      background: ${withAlpha(surface, 0.74)};
      border: 1px solid ${withAlpha(text, 0.08)};
    }
    .filter-head,
    .card-head {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 14px;
      flex-wrap: wrap;
    }
    .value-badge,
    .chart-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 28px;
      padding: 6px 10px;
      border-radius: 999px;
      background: ${withAlpha(primary, 0.10)};
      color: ${mixColors(primary, text, 0.65, primary)};
      font-size: 12px;
      font-weight: 700;
    }
    .kpi-main-section,
    .main-chart-section,
    .pie-chart-section,
    .table-section {
      display: grid;
      gap: 20px;
    }
    .kpi-grid-section {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 18px;
    }
    .kpi-main-card,
    .kpi-card,
    .chart-block,
    .card-body,
    .panel {
      position: relative;
      overflow: hidden;
      border-radius: calc(var(--vf-panel-radius) + 4px);
      border: var(--vf-panel-border);
      box-shadow: var(--vf-panel-shadow);
      background: var(--vf-panel-background);
    }
    .card-body {
      padding: 20px 22px 22px;
      display: grid;
      gap: 14px;
    }
    .kpi-main-card::before,
    .kpi-card::before,
    .chart-block::before,
    .panel::before {
      content: '';
      position: absolute;
      inset: 0 auto auto 0;
      width: 100%;
      height: 4px;
      background: var(--vf-top-accent);
      opacity: 0.82;
    }
    .chart-title,
    .card-title {
      margin: 0 0 16px;
      font-size: clamp(24px, 2vw, 34px);
      line-height: 0.98;
      letter-spacing: -0.03em;
    }
    .chart-shell,
    .matrix-wrap {
      padding: 12px;
      border-radius: calc(var(--vf-panel-radius) + 2px);
      background: linear-gradient(180deg, ${withAlpha(mixColors(surface, background, 0.92, surface), 0.98)}, ${withAlpha(surface, 0.86)});
      border: 1px solid ${withAlpha(text, 0.08)};
    }
    .matrix-wrap {
      overflow: auto;
      max-height: 660px;
      padding: 0;
    }
    .matrix-table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0;
      font-size: 13px;
    }
    .matrix-table thead th {
      position: sticky;
      top: 0;
      z-index: 2;
      padding: 12px 10px;
      background: ${withAlpha(mixColors(surface, background, 0.78, surface), 0.98)};
      border-bottom: 1px solid ${withAlpha(text, 0.08)};
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: ${muted};
      text-align: left;
    }
    .matrix-table tbody td {
      padding: 9px 10px;
      border-bottom: 1px solid ${withAlpha(text, 0.06)};
    }
    .matrix-ship {
      position: sticky;
      left: 0;
      z-index: 1;
      background: ${withAlpha(surface, 0.98)};
      font-weight: 700;
    }
    .heat-cell {
      text-align: center;
      border-radius: 10px;
      padding: 8px 6px;
      font-variant-numeric: tabular-nums;
    }
    .kpi-main-card [data-bind],
    .kpi-card [data-bind],
    .chart-block [data-bind],
    .card-body [data-bind],
    .panel [data-bind] {
      position: relative;
      z-index: 1;
      display: block;
      min-height: 100%;
    }
    .kpi-main-card > [data-bind] > .vf-metric,
    .kpi-card > [data-bind] > .vf-metric,
    .chart-block > [data-bind] > .vf-metric,
    .kpi-main-card > [data-bind] > .vf-chart-panel,
    .kpi-card > [data-bind] > .vf-chart-panel,
    .chart-block > [data-bind] > .vf-chart-panel,
    .card-body > [data-bind] > .vf-chart-panel,
    .card-body > [data-bind] > .vf-table-wrap,
    .chart-block > [data-bind] > .vf-table-wrap,
    .chart-block > [data-bind] > .vf-list,
    .kpi-main-card > [data-bind] > .vf-table-wrap,
    .kpi-card > [data-bind] > .vf-table-wrap {
      border: none;
      box-shadow: none;
      background: transparent;
      border-radius: 0;
      padding: 0;
    }
    .kpi-main-card > [data-bind] > .vf-metric .vf-metric-value,
    .kpi-card > [data-bind] > .vf-metric .vf-metric-value {
      font-size: clamp(30px, 2.4vw, 42px);
    }
    .kpi-main-card > [data-bind] > .vf-metric--hero .vf-metric-value {
      font-size: clamp(42px, 3.8vw, 72px);
    }
    @media (max-width: 1400px) {
      .hero,
      .chart-grid,
      .bottom-grid,
      .comparison-chart-section {
        grid-template-columns: 1fr;
      }
      .kpi-grid-section {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
    @media (max-width: 1200px) {
      .vf-page-shell,
      .report-container { padding: 20px; }
      .vf-title { font-size: 34px; }
      .vf-pie-wrap { grid-template-columns: 1fr; }
      .kpi-grid-section { grid-template-columns: 1fr; }
    }
  `;

  return sanitizeStylesheet(`${base}\n${stylesheet || ''}\n${enhancement}`);
}

function renderTemplate(template: string, tokens: Record<string, string>, htmlTokens: Record<string, string>): string {
  return template
    .replace(/\{\{\{\s*([\w.-]+)\s*\}\}\}/g, (_, token: string) => htmlTokens[token] ?? '')
    .replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, token: string) => escapeHtml(tokens[token] ?? ''));
}

function injectDataBindTargets(template: string, htmlTokens: Record<string, string>): string {
  return template.replace(
    /<([a-z][\w:-]*)([^>]*\sdata-bind=(['"])([^'"<>]+)\3[^>]*)>([\s\S]*?)<\/\1>/gi,
    (match, tagName: string, attrs: string, _quote: string, target: string) => {
      const injected = htmlTokens[target];
      if (!injected) {
        return match;
      }

      return `<${tagName}${attrs}>${injected}</${tagName}>`;
    }
  );
}

function renderRowTemplate(template: string, tokens: Record<string, string>): string {
  return template.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, token: string) => escapeHtml(tokens[token] ?? ''));
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripTags(value: string): string {
  return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
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

function findPrimaryNumericField(row?: DataRow): string | undefined {
  return Object.keys(row || {}).find((key) => key !== '__rowIndex' && typeof row?.[key] === 'number');
}

function findSecondaryField(row: DataRow | undefined, primaryField?: string): string | undefined {
  return Object.keys(row || {}).find((key) => key !== '__rowIndex' && key !== primaryField);
}

function findPrimaryTextField(row?: DataRow): string | undefined {
  return Object.keys(row || {}).find((key) => key !== '__rowIndex' && typeof row?.[key] === 'string');
}

function cleanFieldLabel(value: string): string {
  const rawLabel = toDisplayFieldLabel(value) || value;
  return rawLabel.replace(/^Dim_\d+_/, '').trim();
}
