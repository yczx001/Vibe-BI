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

type CacheableQuery = Pick<QueryDefinition, 'id' | 'dax' | 'executionDax'>;

interface PrimeQueryCacheOptions {
  filters?: Record<string, unknown>;
  dataSource?: DataSourceConfig;
  dax?: string;
  executionDax?: string;
}

interface CacheKeySet {
  strict: string;
  relaxed: string;
}

export interface FetchQueryRowsOptions {
  query: CacheableQuery;
  dataSource: DataSourceConfig;
  filters?: Record<string, unknown>;
  apiBaseUrl?: string;
}

// Simple cache
const cache = new Map<string, { data: unknown[]; timestamp: number }>();

function stableSerialize(value: unknown): string {
  if (value === null || value === undefined) {
    return 'null';
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(',')}]`;
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey));

    return `{${entries.map(([key, entryValue]) => `${JSON.stringify(key)}:${stableSerialize(entryValue)}`).join(',')}}`;
  }

  return JSON.stringify(value);
}

function createCacheKeys(query: CacheableQuery, dataSource?: DataSourceConfig, filters?: Record<string, unknown>): CacheKeySet {
  const relaxed = stableSerialize({
    queryId: query.id,
    dax: query.executionDax || query.dax || '',
    filters: filters || {},
  });

  return {
    strict: stableSerialize({
      queryId: query.id,
      dax: query.executionDax || query.dax || '',
      server: dataSource?.connection?.server || '',
      database: dataSource?.connection?.database || '',
      filters: filters || {},
    }),
    relaxed,
  };
}

function readCachedData(cacheKeys: CacheKeySet): { entry: { data: unknown[]; timestamp: number }; source: keyof CacheKeySet } | null {
  const strictEntry = cache.get(cacheKeys.strict);
  if (strictEntry) {
    return { entry: strictEntry, source: 'strict' };
  }

  const relaxedEntry = cache.get(cacheKeys.relaxed);
  if (relaxedEntry) {
    return { entry: relaxedEntry, source: 'relaxed' };
  }

  return null;
}

function writeCachedData(cacheKeys: CacheKeySet, rows: unknown[]): void {
  const entry = {
    data: enrichRows(rows),
    timestamp: Date.now(),
  };

  cache.set(cacheKeys.strict, entry);
  cache.set(cacheKeys.relaxed, entry);
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

  const fetchData = useCallback(async () => {
    if (!query) {
      setData([]);
      return;
    }

    const activeCacheKeys = createCacheKeys(query, dataSource, filters);

    console.log('[useQueryData] Fetching data for query:', query.id);

    // Check cache
    const cachedResult = readCachedData(activeCacheKeys);
    const cached = cachedResult?.entry;
    if (cached && Date.now() - cached.timestamp < (query.cache?.ttl || 300) * 1000) {
      console.log('[useQueryData] Using cached data for query:', query.id, 'source:', cachedResult?.source, 'rows:', cached.data.length);
      setData(cached.data);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const enrichedRows = await fetchQueryRows({
        query,
        dataSource,
        filters,
        apiBaseUrl,
      });
      console.log('[useQueryData] Data fetched for query:', query.id, 'rows:', enrichedRows.length);
      setData(enrichedRows);
    } catch (err) {
      console.error('[useQueryData] Error fetching data for query:', query?.id, err);
      if (cached?.data) {
        console.warn('[useQueryData] Falling back to stale cached data for query:', query?.id, 'source:', cachedResult?.source);
        setData(cached.data);
        setError(null);
      } else {
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    } finally {
      setLoading(false);
    }
  }, [apiBaseUrl, dataSource, filters, query]);

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

export function primeQueryCache(queryOrId: CacheableQuery | string, data: unknown[], options?: PrimeQueryCacheOptions): void {
  const query = typeof queryOrId === 'string'
    ? {
      id: queryOrId,
      dax: options?.executionDax || options?.dax || '',
      executionDax: options?.executionDax,
    }
    : queryOrId;

  writeCachedData(createCacheKeys(query, options?.dataSource, options?.filters), data);
}

export async function fetchQueryRows({
  query,
  dataSource,
  filters,
  apiBaseUrl,
}: FetchQueryRowsOptions): Promise<Record<string, unknown>[]> {
  const activeCacheKeys = createCacheKeys(query, dataSource, filters);
  const cachedResult = readCachedData(activeCacheKeys);
  const cached = cachedResult?.entry;

  if (cached && Date.now() - cached.timestamp < 300 * 1000) {
    return cached.data as Record<string, unknown>[];
  }

  const connectionString = buildRuntimeConnectionString(dataSource);

  console.log('[fetchQueryRows] Connection string:', connectionString);

  if (connectionString === 'mock') {
    let mockResult = mockData[query.id];

    if (!mockResult) {
      if (query.id.startsWith('q_')) {
        const index = parseInt(query.id.replace('q_', ''), 10) || 0;
        mockResult = generateMockDataForQuery(query.id, query.executionDax || query.dax || '', index);
      } else {
        mockResult = [];
      }
    }

    const enrichedMockResult = enrichRows(mockResult);
    writeCachedData(activeCacheKeys, enrichedMockResult);
    return enrichedMockResult as Record<string, unknown>[];
  }

  const dax = query.executionDax || query.dax;
  const baseUrl = apiBaseUrl || 'http://127.0.0.1:5000';
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
        const parsed = JSON.parse(errorText) as { message?: string };
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
  const enrichedRows = enrichRows(result.rows) as Record<string, unknown>[];
  writeCachedData(activeCacheKeys, enrichedRows);
  return enrichedRows;
}

function buildRuntimeConnectionString(dataSource: DataSourceConfig): string {
  const server = dataSource.connection.server?.trim() || '';
  const database = dataSource.connection.database?.trim() || '';

  if (!server) {
    return '';
  }

  if (server === 'mock') {
    return 'mock';
  }

  // Some callers pass a full connection string; preserve it and only backfill catalog when absent.
  if (/[=;]/.test(server) && /data source|provider|initial catalog/i.test(server)) {
    if (database && !/initial catalog\s*=/i.test(server)) {
      return `${server.replace(/;*\s*$/, '')};Initial Catalog=${database};`;
    }
    return server;
  }

  return database
    ? `Data Source=${server};Initial Catalog=${database};`
    : `Data Source=${server};`;
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
