import React from 'react';
import type { LayoutConfig, ComponentDefinition } from '@vibe-bi/core';

export interface GridLayoutProps {
  layout: LayoutConfig;
  children: React.ReactNode;
}

export function GridLayout({ layout, children }: GridLayoutProps) {
  return (
    <div
      className="vibe-grid"
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${layout.columns}, 1fr)`,
        gap: layout.gap,
        width: '100%',
        minHeight: '100%',
      }}
    >
      {children}
    </div>
  );
}

export interface GridItemProps {
  position: ComponentDefinition['position'];
  children: React.ReactNode;
}

export function GridItem({ position, children }: GridItemProps) {
  return (
    <div
      className="vibe-grid-item"
      style={{
        gridColumn: `${position.x + 1} / span ${position.w}`,
        gridRow: `${position.y + 1} / span ${position.h}`,
        minHeight: position.h * 60, // rowHeight
      }}
    >
      {children}
    </div>
  );
}
