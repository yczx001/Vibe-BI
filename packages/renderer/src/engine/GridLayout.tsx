import React from 'react';
import type { LayoutConfig, ComponentDefinition, PositionConfig } from '@vibe-bi/core';

export const defaultGridLayout: LayoutConfig = {
  type: 'grid',
  columns: 12,
  rowHeight: 60,
  gap: 16,
  padding: 24,
};

const defaultGridPosition: PositionConfig = {
  x: 0,
  y: 0,
  w: 12,
  h: 4,
};

function resolveNumber(value: unknown, fallback: number, minimum = 0): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum
    ? value
    : fallback;
}

export function resolveGridLayout(layout?: Partial<LayoutConfig> | null): LayoutConfig {
  if (!layout || typeof layout !== 'object') {
    return defaultGridLayout;
  }

  return {
    type: 'grid',
    columns: resolveNumber(layout.columns, defaultGridLayout.columns, 1),
    rowHeight: resolveNumber(layout.rowHeight, defaultGridLayout.rowHeight, 1),
    gap: resolveNumber(layout.gap, defaultGridLayout.gap),
    padding: resolveNumber(layout.padding, defaultGridLayout.padding),
  };
}

function resolveGridPosition(position?: Partial<PositionConfig> | null): PositionConfig {
  if (!position || typeof position !== 'object') {
    return defaultGridPosition;
  }

  return {
    x: resolveNumber(position.x, defaultGridPosition.x),
    y: resolveNumber(position.y, defaultGridPosition.y),
    w: resolveNumber(position.w, defaultGridPosition.w, 1),
    h: resolveNumber(position.h, defaultGridPosition.h, 1),
  };
}

export interface GridLayoutProps {
  layout?: Partial<LayoutConfig> | null;
  children: React.ReactNode;
}

export function GridLayout({ layout, children }: GridLayoutProps) {
  const resolvedLayout = resolveGridLayout(layout);

  return (
    <div
      className="vibe-grid"
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${resolvedLayout.columns}, 1fr)`,
        gap: resolvedLayout.gap,
        width: '100%',
        minHeight: '100%',
      }}
    >
      {children}
    </div>
  );
}

export interface GridItemProps {
  position?: Partial<ComponentDefinition['position']> | null;
  children: React.ReactNode;
  rowHeight?: number;
}

export function GridItem({ position, children, rowHeight = defaultGridLayout.rowHeight }: GridItemProps) {
  const resolvedPosition = resolveGridPosition(position);

  return (
    <div
      className="vibe-grid-item"
      style={{
        gridColumn: `${resolvedPosition.x + 1} / span ${resolvedPosition.w}`,
        gridRow: `${resolvedPosition.y + 1} / span ${resolvedPosition.h}`,
        minHeight: resolvedPosition.h * rowHeight,
      }}
    >
      {children}
    </div>
  );
}
