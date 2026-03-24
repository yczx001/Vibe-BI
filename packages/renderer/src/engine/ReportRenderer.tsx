import React, { useMemo } from 'react';
import type {
  ReportDefinition,
  PageDefinition,
  ThemeDefinition,
  QueryDefinition,
  DataSourceConfig,
} from '@vibe-bi/core';
import { ThemeProvider } from '../theme/ThemeProvider';
import { PageRenderer } from './PageRenderer';
import { FilterProvider } from '../data/FilterContext';

export interface ReportRendererProps {
  report: ReportDefinition;
  pages: PageDefinition[];
  queries: QueryDefinition[];
  theme: ThemeDefinition;
  dataSource: DataSourceConfig;
  initialPage?: string;
  apiBaseUrl?: string;
  activeComponentId?: string;
  showInspectorActions?: boolean;
}

export function ReportRenderer({
  report,
  pages,
  queries,
  theme,
  dataSource,
  initialPage,
  apiBaseUrl,
  activeComponentId,
  showInspectorActions = false,
}: ReportRendererProps) {
  // Debug logging
  React.useEffect(() => {
    console.log('[ReportRenderer] Props received:', {
      reportId: report?.id,
      reportName: report?.name,
      pagesCount: pages?.length,
      queriesCount: queries?.length,
      pageIds: pages?.map(p => p.id),
      defaultPage: report?.defaultPage,
      dataSourceType: dataSource?.type,
    });
  }, [report, pages, queries, dataSource]);

  const [currentPageId, setCurrentPageId] = React.useState(initialPage || report.defaultPage || report.pages[0]);

  const currentPage = useMemo(
    () => pages.find((p) => p.id === currentPageId) || pages[0],
    [pages, currentPageId]
  );
  const dividerColor = 'rgba(32, 31, 30, 0.12)';
  const mutedSurface = 'rgba(243, 242, 241, 0.9)';

  const pageIndex = useMemo(
    () => pages.findIndex((p) => p.id === currentPageId),
    [pages, currentPageId]
  );

  React.useEffect(() => {
    if (!activeComponentId) {
      return;
    }

    const owningPage = pages.find((page) => page.components.some((component) => component.id === activeComponentId));
    if (owningPage && owningPage.id !== currentPageId) {
      setCurrentPageId(owningPage.id);
    }
  }, [activeComponentId, pages, currentPageId]);

  if (!currentPage) {
    return <div>No page found</div>;
  }

  return (
    <ThemeProvider theme={theme}>
      <FilterProvider initialFilters={currentPage.filters}>
        <div
          className="vibe-report"
          style={{
            width: '100%',
            height: '100%',
            backgroundColor: theme.colors.background,
            color: theme.colors.text,
            fontFamily: theme.typography.fontFamily,
          }}
        >
          {/* Page Tabs */}
          {pages.length > 1 && (
            <div
              className="vibe-page-tabs"
              style={{
                display: 'flex',
                gap: 8,
                padding: '12px 24px',
                borderBottom: `1px solid ${dividerColor}`,
                backgroundColor: theme.colors.surface,
              }}
            >
              {pages.map((page) => (
                <button
                  key={page.id}
                  onClick={() => setCurrentPageId(page.id)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 6,
                    border: `1px solid ${page.id === currentPageId ? theme.colors.primary : dividerColor}`,
                    cursor: 'pointer',
                    backgroundColor: page.id === currentPageId ? theme.colors.primary : mutedSurface,
                    color: page.id === currentPageId ? '#fff' : theme.colors.text,
                    fontWeight: page.id === currentPageId ? 600 : 500,
                  }}
                >
                  {page.name}
                </button>
              ))}
            </div>
          )}

          {/* Page Content */}
          <PageRenderer
            page={currentPage}
            queries={queries}
            dataSource={dataSource}
            pageIndex={pageIndex}
            apiBaseUrl={apiBaseUrl}
            activeComponentId={activeComponentId}
            showInspectorActions={showInspectorActions}
          />
        </div>
      </FilterProvider>
    </ThemeProvider>
  );
}
