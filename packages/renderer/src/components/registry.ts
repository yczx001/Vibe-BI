import type { ComponentType } from '@vibe-bi/core';
import type React from 'react';

export interface ComponentRenderer<T = unknown> {
  type: ComponentType;
  component: React.ComponentType<ComponentProps<T>>;
  defaultConfig: Partial<T>;
  icon: string;
  name: string;
}

export interface ComponentProps<T = unknown> {
  config: T;
  data: unknown[];
  style?: React.CSSProperties;
}

// Component Registry
class Registry {
  private components = new Map<ComponentType, ComponentRenderer<unknown>>();

  register<T>(renderer: ComponentRenderer<T>): void {
    this.components.set(renderer.type, renderer as ComponentRenderer<unknown>);
  }

  get(type: ComponentType): ComponentRenderer<unknown> | undefined {
    return this.components.get(type);
  }

  getAll(): ComponentRenderer<unknown>[] {
    return Array.from(this.components.values());
  }

  has(type: ComponentType): boolean {
    return this.components.has(type);
  }
}

export const registry = new Registry();

// Register default components (will be populated by chart components)
export function registerComponent<T>(renderer: ComponentRenderer<T>): void {
  registry.register(renderer);
}
