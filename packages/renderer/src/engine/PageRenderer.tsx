import type { PageDefinition, QueryDefinition, DataSourceConfig } from '@vibe-bi/core';
import { GridLayout, resolveGridLayout } from './GridLayout';
import { ComponentBridge } from './ComponentBridge';

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
  const layout = resolveGridLayout(page.layout);
  const filters = Array.isArray(page.filters) ? page.filters : [];
  const components = Array.isArray(page.components)
    ? page.components.filter((component): component is PageDefinition['components'][number] => (
      Boolean(component) && typeof component === 'object'
    ))
    : [];

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
      {filters.length > 0 && (
        <div
          className="vibe-filters"
          style={{
            display: 'flex',
            gap: 16,
            marginBottom: 16,
            flexWrap: 'wrap',
          }}
        >
          {filters.map((filter) => (
            <div key={filter.id} className="vibe-filter-item">
              {/* Filter component will be rendered here */}
              <span style={{ opacity: 0.6 }}>{filter.type}: {filter.target.table}.{filter.target.column}</span>
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
            apiBaseUrl={apiBaseUrl}
            isActive={activeComponentId === component.id}
            showInspectorActions={showInspectorActions}
          />
        ))}
      </GridLayout>
    </div>
  );
}
