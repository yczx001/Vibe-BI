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
import { mixColors, withAlpha } from '../theme/colorUtils';

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
      pageIds: Array.isArray(pages) ? pages.filter(Boolean).map((page) => page.id) : [],
      defaultPage: report?.defaultPage,
      dataSourceType: dataSource?.type,
    });
  }, [report, pages, queries, dataSource]);

  const safePages = useMemo(
    () => (Array.isArray(pages)
      ? pages
        .filter((page): page is PageDefinition => Boolean(page) && typeof page === 'object' && typeof page.id === 'string')
        .map((page) => ({
          ...page,
          filters: Array.isArray(page.filters) ? page.filters : [],
          components: Array.isArray(page.components) ? page.components : [],
        }))
      : []),
    [pages]
  );

  const preferredPageId = initialPage || report.defaultPage || safePages[0]?.id || '';
  const [currentPageId, setCurrentPageId] = React.useState(preferredPageId);

  React.useEffect(() => {
    if (!currentPageId || !safePages.some((page) => page.id === currentPageId)) {
      setCurrentPageId(preferredPageId);
    }
  }, [currentPageId, preferredPageId, safePages]);

  const currentPage = useMemo(
    () => safePages.find((p) => p.id === currentPageId) || safePages[0],
    [safePages, currentPageId]
  );
  const dividerColor = withAlpha(theme.colors.text, 0.12);
  const mutedSurface = withAlpha(mixColors(theme.colors.surface, theme.colors.background, 0.82, theme.colors.surface), 0.94);
  const tabBarBackground = withAlpha(theme.colors.surface, 0.84);
  const tabShadow = `0 14px 28px ${withAlpha(theme.colors.text, 0.16)}`;

  const pageIndex = useMemo(
    () => safePages.findIndex((p) => p.id === currentPageId),
    [safePages, currentPageId]
  );

  React.useEffect(() => {
    if (!activeComponentId) {
      return;
    }

    const owningPage = safePages.find((page) => page.components.some((component) => component.id === activeComponentId));
    if (owningPage && owningPage.id !== currentPageId) {
      setCurrentPageId(owningPage.id);
    }
  }, [activeComponentId, safePages, currentPageId]);

  if (!currentPage) {
    return (
      <ThemeProvider theme={theme}>
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.colors.background,
            color: theme.colors.textSecondary,
            fontFamily: theme.typography.fontFamily,
          }}
        >
          当前报表没有可渲染的页面。
        </div>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider theme={theme}>
      <FilterProvider initialFilters={currentPage.filters}>
        <div
          className="vibe-report"
          style={{
            width: '100%',
            height: '100%',
            background: `
              radial-gradient(circle at top right, ${withAlpha(theme.colors.secondary, 0.14)}, transparent 28%),
              radial-gradient(circle at top left, ${withAlpha(theme.colors.primary, 0.16)}, transparent 24%),
              ${theme.colors.background}
            `,
            color: theme.colors.text,
            fontFamily: theme.typography.fontFamily,
          }}
        >
          {/* Page Tabs */}
          {safePages.length > 1 && (
            <div
              className="vibe-page-tabs"
              style={{
                display: 'flex',
                gap: 8,
                padding: '14px 24px',
                borderBottom: `1px solid ${dividerColor}`,
                background: tabBarBackground,
                backdropFilter: 'blur(10px)',
              }}
            >
              {safePages.map((page) => (
                <button
                  key={page.id}
                  onClick={() => setCurrentPageId(page.id)}
                  style={{
                    padding: '9px 16px',
                    borderRadius: 999,
                    border: `1px solid ${page.id === currentPageId ? theme.colors.primary : dividerColor}`,
                    cursor: 'pointer',
                    background: page.id === currentPageId
                      ? `linear-gradient(90deg, ${theme.colors.primary} 0%, ${theme.colors.secondary} 100%)`
                      : mutedSurface,
                    color: page.id === currentPageId ? '#fff' : theme.colors.text,
                    fontWeight: page.id === currentPageId ? 700 : 600,
                    boxShadow: page.id === currentPageId
                      ? tabShadow
                      : 'none',
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
