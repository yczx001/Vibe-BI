import { useState, useEffect, useCallback } from 'react';
import type { QueryDefinition, DataSourceConfig, QueryResult } from '@vibe-bi/core';

interface UseQueryDataOptions {
  query?: QueryDefinition;
  dataSource: DataSourceConfig;
  filters?: Record<string, unknown>;
  apiBaseUrl?: string;
}

interface UseQueryDataResult {
  data: unknown[] | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

// Simple cache
const cache = new Map<string, { data: unknown[]; timestamp: number }>();

function createCacheKey(queryId: string, filters?: Record<string, unknown>): string {
  return `${queryId}-${JSON.stringify(filters)}`;
}

function enrichRows(rows: unknown[]): unknown[] {
  return rows.map((row, index) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      return row;
    }

    const record = row as Record<string, unknown>;
    if (record.__rowIndex !== undefined) {
      return record;
    }

    return {
      __rowIndex: index + 1,
      ...record,
    };
  });
}

// Mock data for testing - supports both q_0 (Performance Analyzer) and q0 (legacy) formats
const mockData: Record<string, unknown[]> = {
  // Performance Analyzer import format (q_0, q_1, q_2...)
  q_0: [{ revenue: 1250000 }],
  q_1: [
    { month: '1月', value: 98000 },
    { month: '2月', value: 112000 },
    { month: '3月', value: 105000 },
    { month: '4月', value: 128000 },
    { month: '5月', value: 135000 },
    { month: '6月', value: 142000 },
  ],
  q_2: [
    { category: '电子产品', value: 450000 },
    { category: '服装', value: 320000 },
    { category: '食品', value: 280000 },
    { category: '家居', value: 200000 },
  ],
  // Legacy format for backward compatibility
  q1: [{ revenue: 1250000 }],
  q2: [
    { month: '1月', value: 98000 },
    { month: '2月', value: 112000 },
    { month: '3月', value: 105000 },
    { month: '4月', value: 128000 },
    { month: '5月', value: 135000 },
    { month: '6月', value: 142000 },
  ],
  q3: [
    { category: '电子产品', value: 450000 },
    { category: '服装', value: 320000 },
    { category: '食品', value: 280000 },
    { category: '家居', value: 200000 },
  ],
};

export function useQueryData({ query, dataSource, filters, apiBaseUrl }: UseQueryDataOptions): UseQueryDataResult {
  const [data, setData] = useState<unknown[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const cacheKey = query ? createCacheKey(query.id, filters) : '';

  const fetchData = useCallback(async () => {
    if (!query) {
      setData([]);
      return;
    }

    console.log('[useQueryData] Fetching data for query:', query.id);

    // Check cache
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < (query.cache?.ttl || 300) * 1000) {
      console.log('[useQueryData] Using cached data for query:', query.id);
      setData(cached.data);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Build connection string for Analysis Services
      // For Power BI Desktop, only Data Source is needed (no Initial Catalog)
      const connectionString = dataSource.connection.server === 'mock'
        ? 'mock'
        : `Data Source=${dataSource.connection.server};`;

      console.log('[useQueryData] Connection string:', connectionString);

      // Mock mode - return mock data
      if (connectionString === 'mock') {
        let mockResult = mockData[query.id];

        // Fallback: generate mock data based on query ID pattern
        if (!mockResult) {
          if (query.id.startsWith('q_')) {
            // Generate sample data for imported queries (q_0, q_1, etc.)
            const index = parseInt(query.id.replace('q_', ''), 10) || 0;
            mockResult = generateMockDataForQuery(query.name || '', query.executionDax || query.dax || '', index);
          } else {
            mockResult = [];
          }
        }

        const enrichedMockResult = enrichRows(mockResult);
        console.log('[useQueryData] Using mock data for query:', query.id, 'rows:', enrichedMockResult.length);
        setData(enrichedMockResult);
        cache.set(cacheKey, { data: enrichedMockResult, timestamp: Date.now() });
        setLoading(false);
        return;
      }

      // Build DAX with filters
      const dax = query.executionDax || query.dax;
      if (filters && query.parameters) {
        for (const param of query.parameters) {
          if (param.filterRef && filters[param.filterRef]) {
            // Apply filter to DAX (simplified)
            // In real implementation, you'd need proper DAX manipulation
          }
        }
      }

      // Execute query via API
      const baseUrl = apiBaseUrl || 'http://localhost:5000';
      const response = await fetch(`${baseUrl}/api/query/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connectionString,
          dax,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let detailedMessage = `Query failed: ${response.statusText}`;

        if (errorText) {
          try {
            const parsed = JSON.parse(errorText) as { message?: string; dax?: string };
            if (parsed.message) {
              detailedMessage = parsed.message;
            }
          } catch {
            detailedMessage = errorText;
          }
        }

        throw new Error(detailedMessage);
      }

      const result: QueryResult = await response.json();
      const enrichedRows = enrichRows(result.rows);
      console.log('[useQueryData] Data fetched for query:', query.id, 'rows:', enrichedRows.length);
      setData(enrichedRows);

      // Cache result
      cache.set(cacheKey, { data: enrichedRows, timestamp: Date.now() });
    } catch (err) {
      console.error('[useQueryData] Error fetching data for query:', query?.id, err);
      if (cached?.data) {
        console.warn('[useQueryData] Falling back to stale cached data for query:', query?.id);
        setData(cached.data);
        setError(null);
      } else {
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    } finally {
      setLoading(false);
    }
  }, [query, dataSource, cacheKey, filters, apiBaseUrl]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    data,
    loading,
    error,
    refetch: fetchData,
  };
}

export function primeQueryCache(queryId: string, data: unknown[], filters?: Record<string, unknown>): void {
  cache.set(createCacheKey(queryId, filters), {
    data: enrichRows(data),
    timestamp: Date.now(),
  });
}

// Clear cache utility
export function clearQueryCache(): void {
  cache.clear();
}

// Generate mock data for imported queries based on query name and DAX
function generateMockDataForQuery(name: string, dax: string, index: number): unknown[] {
  const daxLower = dax.toLowerCase();
  const nameLower = name.toLowerCase();

  // Check if it's a time-series query (contains date/time related keywords)
  const isTimeSeries = daxLower.includes('date') ||
    daxLower.includes('ytd') ||
    daxLower.includes('month') ||
    daxLower.includes('year') ||
    daxLower.includes('time') ||
    nameLower.includes('趋势') ||
    nameLower.includes('月度') ||
    nameLower.includes('时间');

  // Check if it's a category query
  const isCategory = daxLower.includes('category') ||
    daxLower.includes('product') ||
    daxLower.includes('region') ||
    nameLower.includes('分类') ||
    nameLower.includes('占比');

  // Check if it's a single value (KPI)
  const isKpi = !daxLower.includes('summarize') ||
    nameLower.includes('总计') ||
    nameLower.includes('total') ||
    nameLower.includes('占比') ||
    nameLower.includes('card');

  if (isTimeSeries) {
    // Generate monthly trend data
    const months = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
    const baseValue = 50000 + (index * 10000);
    return months.map((month, i) => ({
      month,
      value: Math.round(baseValue + Math.sin(i / 2) * 20000 + Math.random() * 10000),
    }));
  }

  if (isCategory) {
    // Generate category data
    const categories = ['类别A', '类别B', '类别C', '类别D', '类别E'];
    return categories.map((category) => ({
      category,
      value: Math.round(100000 + Math.random() * 200000),
    }));
  }

  if (isKpi) {
    // Generate single KPI value
    return [{ value: Math.round(500000 + Math.random() * 500000) }];
  }

  // Default: generic data
  return [
    { label: '项目1', value: Math.round(100 + Math.random() * 100) },
    { label: '项目2', value: Math.round(100 + Math.random() * 100) },
    { label: '项目3', value: Math.round(100 + Math.random() * 100) },
  ];
}
