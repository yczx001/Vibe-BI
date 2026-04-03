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
    x: Math.max(0, Math.round(resolveNumber(position.x, defaultGridPosition.x))),
    y: Math.max(0, Math.round(resolveNumber(position.y, defaultGridPosition.y))),
    w: Math.max(1, Math.round(resolveNumber(position.w, defaultGridPosition.w, 1))),
    h: Math.max(1, Math.round(resolveNumber(position.h, defaultGridPosition.h, 1))),
  };
}

export interface GridLayoutProps {
  layout?: Partial<LayoutConfig> | null;
  children: React.ReactNode;
  fillHeight?: boolean;
}

export function GridLayout({ layout, children, fillHeight = true }: GridLayoutProps) {
  const resolvedLayout = resolveGridLayout(layout);

  return (
    <div
      className="vibe-grid"
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${resolvedLayout.columns}, 1fr)`,
        gridAutoRows: `${resolvedLayout.rowHeight}px`,
        gap: resolvedLayout.gap,
        width: '100%',
        height: fillHeight ? '100%' : 'auto',
        minHeight: fillHeight ? '100%' : undefined,
        alignContent: 'start',
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
        minWidth: 0,
        height: '100%',
      }}
    >
      {children}
    </div>
  );
}
