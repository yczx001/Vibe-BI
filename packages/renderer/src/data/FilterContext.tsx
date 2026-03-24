import React, { createContext, useContext, useState, useCallback } from 'react';
import type { FilterDefinition } from '@vibe-bi/core';

interface FilterContextValue {
  filters: Record<string, unknown>;
  setFilter: (filterId: string, value: unknown) => void;
  clearFilter: (filterId: string) => void;
  clearAllFilters: () => void;
}

const FilterContext = createContext<FilterContextValue | null>(null);

export interface FilterProviderProps {
  children: React.ReactNode;
  initialFilters: FilterDefinition[];
}

export function FilterProvider({ children, initialFilters }: FilterProviderProps) {
  const [filters, setFilters] = useState<Record<string, unknown>>(() => {
    // Initialize with default values
    const defaults: Record<string, unknown> = {};
    for (const filter of initialFilters) {
      if (filter.default?.value !== undefined) {
        defaults[filter.id] = filter.default.value;
      } else if (filter.default?.relative) {
        // Calculate relative date
        defaults[filter.id] = calculateRelativeDate(filter.default.relative);
      }
    }
    return defaults;
  });

  const setFilter = useCallback((filterId: string, value: unknown) => {
    setFilters((prev) => ({ ...prev, [filterId]: value }));
  }, []);

  const clearFilter = useCallback((filterId: string) => {
    setFilters((prev) => {
      const next = { ...prev };
      delete next[filterId];
      return next;
    });
  }, []);

  const clearAllFilters = useCallback(() => {
    setFilters({});
  }, []);

  return (
    <FilterContext.Provider
      value={{ filters, setFilter, clearFilter, clearAllFilters }}
    >
      {children}
    </FilterContext.Provider>
  );
}

export function useFilters(): FilterContextValue {
  const context = useContext(FilterContext);
  if (!context) {
    throw new Error('useFilters must be used within a FilterProvider');
  }
  return context;
}

function calculateRelativeDate(relative: string): string | { start: string; end: string } {
  const now = new Date();
  const format = (d: Date) => d.toISOString().split('T')[0];

  switch (relative) {
    case 'last-7-days':
      return {
        start: format(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)),
        end: format(now),
      };
    case 'last-30-days':
      return {
        start: format(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)),
        end: format(now),
      };
    case 'last-90-days':
      return {
        start: format(new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)),
        end: format(now),
      };
    case 'last-12-months':
      return {
        start: format(new Date(now.getFullYear() - 1, now.getMonth(), now.getDate())),
        end: format(now),
      };
    case 'this-year':
      return {
        start: format(new Date(now.getFullYear(), 0, 1)),
        end: format(now),
      };
    case 'last-year':
      return {
        start: format(new Date(now.getFullYear() - 1, 0, 1)),
        end: format(new Date(now.getFullYear() - 1, 11, 31)),
      };
    default:
      return format(now);
  }
}
