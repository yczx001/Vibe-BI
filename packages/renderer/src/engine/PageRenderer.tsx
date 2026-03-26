import type { PageDefinition, QueryDefinition, DataSourceConfig } from '@vibe-bi/core';
import { GridLayout, resolveGridLayout } from './GridLayout';
import { ComponentBridge } from './ComponentBridge';
import { useTheme } from '../theme/ThemeProvider';
import { mixColors, withAlpha } from '../theme/colorUtils';

export interface PageRendererProps {
  page: PageDefinition;
  queries: QueryDefinition[];
  dataSource: DataSourceConfig;
  pageIndex: number;
  apiBaseUrl?: string;
  activeComponentId?: string;
  showInspectorActions?: boolean;
}

export function PageRenderer({
  page,
  queries,
  dataSource,
  pageIndex: _pageIndex,
  apiBaseUrl,
  activeComponentId,
  showInspectorActions = false,
}: PageRendererProps) {
  const theme = useTheme();
  const layout = resolveGridLayout(page.layout);
  const filters = Array.isArray(page.filters) ? page.filters : [];
  const components = Array.isArray(page.components)
    ? page.components.filter((component): component is PageDefinition['components'][number] => (
      Boolean(component) && typeof component === 'object'
    ))
    : [];
  const inlineFilterIds = new Set(
    components
      .filter((component) => component.type === 'filter')
      .map((component) => {
        const config = component.config as { filterId?: string } | undefined;
        return config?.filterId;
      })
      .filter((value): value is string => Boolean(value))
  );
  const bannerFilters = filters.filter((filter) => !inlineFilterIds.has(filter.id));

  return (
    <div
      className="vibe-page"
      style={{
        width: '100%',
        height: '100%',
        overflow: 'auto',
        padding: layout.padding,
      }}
    >
      {/* Filters Bar */}
      {bannerFilters.length > 0 && (
        <div
          className="vibe-filters"
          style={{
            display: 'flex',
            gap: 12,
            marginBottom: 18,
            flexWrap: 'wrap',
          }}
        >
          {bannerFilters.map((filter) => (
            <div
              key={filter.id}
              className="vibe-filter-item"
              style={{
                minWidth: 180,
                padding: '10px 14px',
                borderRadius: 14,
                border: `1px solid ${withAlpha(theme.colors.text, 0.1)}`,
                background: `linear-gradient(180deg, ${withAlpha(mixColors(theme.colors.surface, '#FFFFFF', 0.84, theme.colors.surface), 0.96)} 0%, ${withAlpha(mixColors(theme.colors.surface, theme.colors.background, 0.8, theme.colors.surface), 0.94)} 100%)`,
                boxShadow: `0 10px 24px ${withAlpha(theme.colors.text, 0.08)}`,
              }}
            >
              <div style={{ fontSize: 10, fontWeight: 700, color: theme.colors.textSecondary, letterSpacing: 0.8 }}>
                FILTER
              </div>
              <div style={{ marginTop: 4, fontSize: 13, fontWeight: 700, color: theme.colors.text }}>
                {filter.target.column}
              </div>
              <span style={{ display: 'block', marginTop: 4, opacity: 0.8, fontSize: 11, color: theme.colors.textSecondary }}>
                {filter.type} · {filter.target.table}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Grid Layout */}
      <GridLayout layout={layout}>
        {components.map((component) => (
          <ComponentBridge
            key={component.id}
            component={component}
            queries={queries}
            dataSource={dataSource}
            pageFilters={filters}
            apiBaseUrl={apiBaseUrl}
            isActive={activeComponentId === component.id}
            showInspectorActions={showInspectorActions}
          />
        ))}
      </GridLayout>
    </div>
  );
}
