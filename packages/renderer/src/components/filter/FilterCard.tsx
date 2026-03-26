import React from 'react';
import type { FilterComponentConfig, FilterDefinition } from '@vibe-bi/core';
import { useFilters } from '../../data/FilterContext';
import { useTheme } from '../../theme/ThemeProvider';
import { mixColors, withAlpha } from '../../theme/colorUtils';

type FilterConfigWithDefinition = FilterComponentConfig & {
  definition?: FilterDefinition;
};

export interface FilterCardProps {
  config: FilterConfigWithDefinition;
  data: unknown[];
  style?: React.CSSProperties;
}

export function FilterCard({ config, style }: FilterCardProps) {
  const theme = useTheme();
  const { filters, setFilter, clearFilter } = useFilters();
  const definition = config.definition;
  const filterId = config.filterId;
  const value = filters[filterId];
  const label = config.label || definition?.target.column || '筛选';
  const helper = definition
    ? `${definition.target.table}.${definition.target.column}`
    : filterId;
  const inputType = definition?.type === 'number'
    ? 'number'
    : definition?.type === 'date-range'
      ? 'date'
      : 'text';

  return (
    <div
      style={{
        height: '100%',
        display: 'grid',
        gridTemplateRows: 'auto auto minmax(0, 1fr)',
        gap: 10,
        padding: 16,
        borderRadius: 18,
        border: `1px solid ${withAlpha(theme.colors.text, 0.08)}`,
        background: `linear-gradient(180deg, ${withAlpha(mixColors(theme.colors.surface, '#FFFFFF', 0.88, theme.colors.surface), 0.96)} 0%, ${withAlpha(mixColors(theme.colors.surface, theme.colors.background, 0.8, theme.colors.surface), 0.96)} 100%)`,
        boxShadow: `0 16px 34px ${withAlpha(theme.colors.text, 0.08)}, inset 0 1px 0 ${withAlpha('#FFFFFF', 0.75, 'rgba(255,255,255,0.75)')}`,
        ...style,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: theme.colors.textSecondary, fontSize: 11, fontWeight: 700, letterSpacing: 0.8 }}>
            FILTER
          </div>
          <div style={{ color: theme.colors.text, fontSize: 16, fontWeight: 700, lineHeight: 1.25 }}>
            {label}
          </div>
          <div style={{ marginTop: 4, color: theme.colors.textSecondary, fontSize: 11 }}>
            {helper}
          </div>
        </div>
        <button
          type="button"
          onClick={() => clearFilter(filterId)}
          style={{
            border: `1px solid ${withAlpha(theme.colors.text, 0.1)}`,
            borderRadius: 999,
            background: withAlpha(theme.colors.surface, 0.82),
            color: theme.colors.textSecondary,
            padding: '6px 10px',
            fontSize: 11,
            cursor: 'pointer',
          }}
        >
          清空
        </button>
      </div>
      <div
        style={{
          borderRadius: 14,
          border: `1px solid ${withAlpha(theme.colors.text, 0.08)}`,
          background: withAlpha(mixColors(theme.colors.surface, theme.colors.background, 0.86, theme.colors.surface), 0.95),
          padding: '10px 12px',
        }}
      >
        <input
          type={inputType}
          value={typeof value === 'string' || typeof value === 'number' ? String(value) : ''}
          placeholder={config.placeholder || `输入${label}`}
          onChange={(event) => setFilter(filterId, event.target.value)}
          style={{
            width: '100%',
            border: 'none',
            outline: 'none',
            background: 'transparent',
            color: theme.colors.text,
            fontSize: 13,
            fontWeight: 600,
          }}
        />
      </div>
      <div
        style={{
          alignSelf: 'end',
          color: theme.colors.textSecondary,
          fontSize: 11,
          lineHeight: 1.6,
        }}
      >
        {definition
          ? `当前控件会把输入值写入筛选上下文，供引用 ${filterId} 的查询参数使用。`
          : '当前控件用于承载报表筛选输入。'}
      </div>
    </div>
  );
}
