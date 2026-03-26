import { Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ComponentDefinition, QueryDefinition, DataSourceConfig, FilterDefinition } from '@vibe-bi/core';
import { GridItem } from './GridLayout';
import { registry } from '../components/registry';
import { useQueryData } from '../data/useQueryData';

export interface ComponentBridgeProps {
  component: ComponentDefinition;
  queries: QueryDefinition[];
  dataSource: DataSourceConfig;
  pageFilters?: FilterDefinition[];
  apiBaseUrl?: string;
  isActive?: boolean;
  showInspectorActions?: boolean;
}

export function ComponentBridge({
  component,
  queries,
  dataSource,
  pageFilters,
  apiBaseUrl,
  isActive = false,
  showInspectorActions = false,
}: ComponentBridgeProps) {
  const renderer = registry.get(component.type);

  console.log('[ComponentBridge] Rendering component:', {
    id: component.id,
    type: component.type,
    queryRef: component.queryRef,
    hasRenderer: !!renderer,
  });

  if (!renderer) {
    return (
      <GridItem position={component.position}>
        <div style={{ padding: 16, color: '#ff6b6b' }}>
          Unknown component type: {component.type}
        </div>
      </GridItem>
    );
  }

  return (
    <GridItem position={component.position}>
      <Suspense fallback={<ComponentSkeleton />}>
        <ComponentWrapper
          component={component}
          queries={queries}
          dataSource={dataSource}
          renderer={renderer}
          pageFilters={pageFilters}
          apiBaseUrl={apiBaseUrl}
          isActive={isActive}
          showInspectorActions={showInspectorActions}
        />
      </Suspense>
    </GridItem>
  );
}

interface ComponentWrapperProps {
  component: ComponentDefinition;
  queries: QueryDefinition[];
  dataSource: DataSourceConfig;
  renderer: ReturnType<typeof registry.get>;
  pageFilters?: FilterDefinition[];
  apiBaseUrl?: string;
  isActive?: boolean;
  showInspectorActions?: boolean;
}

type InspectorView = 'dax' | 'data' | null;

function ComponentWrapper({
  component,
  queries,
  dataSource,
  renderer,
  pageFilters,
  apiBaseUrl,
  isActive = false,
  showInspectorActions = false,
}: ComponentWrapperProps) {
  const [inspectorView, setInspectorView] = useState<InspectorView>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const query = component.queryRef
    ? queries.find((q) => q.id === component.queryRef)
    : undefined;

  const { data, loading, error } = useQueryData({
    query,
    dataSource,
    apiBaseUrl,
  });

  console.log('[ComponentWrapper] State:', {
    componentId: component.id,
    queryId: component.queryRef,
    hasQuery: !!query,
    loading,
    hasError: !!error,
    dataLength: data?.length,
  });

  useEffect(() => {
    if (!inspectorView) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setInspectorView(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [inspectorView]);

  useEffect(() => {
    if (!isActive || !containerRef.current) {
      return;
    }

    containerRef.current.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
      inline: 'nearest',
    });
  }, [isActive]);

  if (loading) {
    return <ComponentSkeleton />;
  }

  if (error) {
    return (
      <div
        style={{
          padding: 16,
          color: '#ff6b6b',
          backgroundColor: 'rgba(255, 107, 107, 0.1)',
          borderRadius: 8,
          height: '100%',
        }}
      >
        Error: {error.message}
      </div>
    );
  }

  const Comp = renderer!.component;
  const rawConfig = { ...renderer!.defaultConfig, ...(component.config || {}) } as Record<string, unknown>;
  const titleFallback = query?.name || component.id;
  const normalizedConfig = component.type === 'echarts'
    ? {
      ...rawConfig,
      title: typeof rawConfig.title === 'string' && rawConfig.title.trim()
        ? rawConfig.title
        : titleFallback,
    }
    : rawConfig;
  const config = component.type === 'filter'
    ? {
      ...normalizedConfig,
      definition: pageFilters?.find((filter) => filter.id === normalizedConfig.filterId),
    }
    : normalizedConfig;
  const rows = Array.isArray(data) ? data : [];

  return (
    <div
      ref={containerRef}
      id={`vibe-component-${component.id}`}
      className="vibe-component"
      style={{
        height: '100%',
        position: 'relative',
        overflow: 'hidden',
        outline: isActive ? '2px solid rgba(99, 102, 241, 0.9)' : 'none',
        outlineOffset: isActive ? -2 : 0,
        backgroundColor: component.style?.backgroundColor,
        borderRadius: component.style?.borderRadius,
        boxShadow: component.style?.boxShadow,
        padding: component.style?.padding,
        ...component.style,
      }}
    >
      {query && showInspectorActions && (
        <div
          style={{
            position: 'absolute',
            top: 10,
            right: 10,
            display: 'flex',
            gap: 8,
            zIndex: 5,
          }}
        >
          <InspectorButton label="DAX" onClick={() => setInspectorView('dax')} />
          <InspectorButton label="数据" onClick={() => setInspectorView('data')} />
        </div>
      )}
      <Comp config={config} data={data || []} style={component.style} />
      {query && inspectorView && (
        <ComponentInspectorModal
          title={inspectorView === 'dax' ? `${query.name || component.id} - DAX` : `${query.name || component.id} - 查询结果`}
          actions={inspectorView === 'dax' ? <CopyDaxButton dax={query.dax} /> : undefined}
          onClose={() => setInspectorView(null)}
        >
          {inspectorView === 'dax' ? (
            <pre
              style={{
                margin: 0,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                fontSize: 13,
                lineHeight: 1.6,
                color: '#201F1E',
              }}
            >
              {query.dax}
            </pre>
          ) : (
            <QueryResultsInspector
              query={query}
              fallbackData={rows}
              dataSource={dataSource}
              apiBaseUrl={apiBaseUrl}
            />
          )}
        </ComponentInspectorModal>
      )}
    </div>
  );
}

interface InspectorButtonProps {
  label: string;
  onClick: () => void;
}

function InspectorButton({ label, onClick }: InspectorButtonProps) {
  return (
    <button
      onClick={onClick}
      style={{
        border: '1px solid rgba(32, 31, 30, 0.16)',
        backgroundColor: 'rgba(255, 255, 255, 0.94)',
        color: '#201F1E',
        borderRadius: 8,
        padding: '6px 10px',
        fontSize: 12,
        cursor: 'pointer',
        boxShadow: '0 1px 2px rgba(0, 0, 0, 0.08)',
      }}
    >
      {label}
    </button>
  );
}

interface ComponentInspectorModalProps {
  title: string;
  children: ReactNode;
  onClose: () => void;
  actions?: ReactNode;
}

function ComponentInspectorModal({ title, children, onClose, actions }: ComponentInspectorModalProps) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(32, 31, 30, 0.22)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: 24,
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          width: 'min(1100px, 100%)',
          maxHeight: '80vh',
          backgroundColor: '#FFFFFF',
          border: '1px solid rgba(32, 31, 30, 0.12)',
          borderRadius: 16,
          boxShadow: '0 24px 64px rgba(0, 0, 0, 0.18)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid rgba(32, 31, 30, 0.12)',
          }}
        >
          <div style={{ color: '#201F1E', fontWeight: 600 }}>{title}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {actions}
            <button
              onClick={onClose}
              style={{
                border: 'none',
                background: 'transparent',
                color: '#605E5C',
                cursor: 'pointer',
                fontSize: 20,
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>
        </div>
        <div
          style={{
            padding: 20,
            overflow: 'auto',
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

interface QueryResultsInspectorProps {
  query: QueryDefinition;
  fallbackData: unknown[];
  dataSource: DataSourceConfig;
  apiBaseUrl?: string;
}

function QueryResultsInspector({ query, fallbackData, dataSource, apiBaseUrl }: QueryResultsInspectorProps) {
  const evaluateQueries = useMemo(
    () => (query.evaluateQueries && query.evaluateQueries.length > 0
      ? query.evaluateQueries
      : [query.executionDax || query.dax]),
    [query.dax, query.evaluateQueries, query.executionDax]
  );
  const defaultTab = Math.min(Math.max(query.selectedEvaluateIndex || 0, 0), evaluateQueries.length - 1);
  const [activeTab, setActiveTab] = useState(defaultTab);

  useEffect(() => {
    setActiveTab(defaultTab);
  }, [defaultTab, query.id]);

  const activeQuery = useMemo<QueryDefinition>(() => ({
    ...query,
    id: `${query.id}__inspect_${activeTab}`,
    dax: evaluateQueries[activeTab] || query.dax,
    executionDax: evaluateQueries[activeTab] || query.executionDax || query.dax,
    evaluateQueries: undefined,
    selectedEvaluateIndex: undefined,
  }), [query, evaluateQueries, activeTab]);

  const { data, loading, error } = useQueryData({
    query: activeQuery,
    dataSource,
    apiBaseUrl,
  });

  const rows = useMemo(
    () => (activeTab === defaultTab && fallbackData.length > 0
      ? fallbackData
      : (data || [])),
    [activeTab, data, defaultTab, fallbackData]
  );
  const previewColumns = useMemo(() => {
    if (!rows || rows.length === 0) {
      return [] as string[];
    }

    const firstRow = rows.find((row) => row && typeof row === 'object' && !Array.isArray(row)) as Record<string, unknown> | undefined;
    return firstRow
      ? Object.keys(firstRow).filter((key) => key !== '__rowIndex')
      : [];
  }, [rows]);
  const previewRows = (rows as Record<string, unknown>[]).slice(0, 200);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {evaluateQueries.length > 1 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {evaluateQueries.map((_, index) => (
            <button
              key={index}
              onClick={() => setActiveTab(index)}
              style={{
                padding: '6px 12px',
                borderRadius: 999,
                border: '1px solid rgba(32, 31, 30, 0.14)',
                backgroundColor: activeTab === index ? '#0F6CBD' : '#F3F2F1',
                color: activeTab === index ? '#FFFFFF' : '#201F1E',
                cursor: 'pointer',
                fontSize: 12,
              }}
            >
              结果 {index + 1}
            </button>
          ))}
        </div>
      )}

      {loading && activeTab !== defaultTab ? (
        <div style={{ color: '#605E5C' }}>正在加载查询结果...</div>
      ) : error ? (
        <div style={{ color: '#A4262C' }}>查询结果加载失败: {error.message}</div>
      ) : (
        <>
          <div style={{ color: '#605E5C', fontSize: 13 }}>
            共 {rows.length} 行，当前预览前 {previewRows.length} 行
          </div>
          {previewColumns.length > 0 ? (
            <div
              style={{
                overflow: 'auto',
                border: '1px solid rgba(32, 31, 30, 0.12)',
                borderRadius: 10,
              }}
            >
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ backgroundColor: '#F3F2F1' }}>
                    {previewColumns.map((column) => (
                      <th
                        key={column}
                        style={{
                          padding: '10px 12px',
                          textAlign: 'left',
                          color: '#201F1E',
                          borderBottom: '1px solid rgba(32, 31, 30, 0.12)',
                          position: 'sticky',
                          top: 0,
                        }}
                      >
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, index) => (
                    <tr key={(row.__rowIndex as string | number | undefined) ?? index}>
                      {previewColumns.map((column) => (
                        <td
                          key={`${index}-${column}`}
                        style={{
                          padding: '10px 12px',
                          color: '#201F1E',
                          borderBottom: '1px solid #E1DFDD',
                          verticalAlign: 'top',
                        }}
                      >
                          {formatPreviewValue(row[column])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ color: '#605E5C' }}>当前没有可展示的数据。</div>
          )}
        </>
      )}
    </div>
  );
}

function CopyDaxButton({ dax }: { dax: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(dax);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch (error) {
      console.error('Failed to copy DAX:', error);
    }
  };

  return (
    <button
      onClick={handleCopy}
      style={{
        border: '1px solid rgba(32, 31, 30, 0.14)',
        backgroundColor: '#F3F2F1',
        color: '#201F1E',
        borderRadius: 8,
        padding: '6px 10px',
        fontSize: 12,
        cursor: 'pointer',
      }}
    >
      {copied ? '已复制' : '复制'}
    </button>
  );
}

function formatPreviewValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value);
}

function ComponentSkeleton() {
  return (
    <div
      style={{
        height: '100%',
        backgroundColor: 'rgba(15, 108, 189, 0.06)',
        borderRadius: 8,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        animation: 'pulse 2s infinite',
        color: '#605E5C',
      }}
    >
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.8; }
        }
      `}</style>
      Loading...
    </div>
  );
}
