import React, { createContext, useContext } from 'react';
import type { ThemeDefinition } from '@vibe-bi/core';

const defaultTheme: ThemeDefinition = {
  name: 'Vibe Editorial Light',
  colors: {
    primary: '#0E7490',
    secondary: '#C97A32',
    background: '#F4F1EA',
    surface: '#FCFBF8',
    text: '#152132',
    textSecondary: '#617082',
    chart: ['#0E7490', '#2563EB', '#C97A32', '#7C9A4D', '#8B5E3C', '#C2410C'],
  },
  typography: {
    fontFamily: '"Source Han Sans SC", "Microsoft YaHei UI", "Microsoft YaHei", "Noto Sans SC", "PingFang SC", "Segoe UI Variable", "Segoe UI", system-ui, sans-serif',
  },
  components: {
    card: {
      borderRadius: 22,
      shadow: '0 18px 40px rgba(15, 23, 42, 0.08), inset 0 1px 0 rgba(255,255,255,0.76)',
      padding: 22,
    },
  },
};

const ThemeContext = createContext<ThemeDefinition>(defaultTheme);

export interface ThemeProviderProps {
  children: React.ReactNode;
  theme?: ThemeDefinition;
}

export function ThemeProvider({ children, theme = defaultTheme }: ThemeProviderProps) {
  return (
    <ThemeContext.Provider value={theme}>
      <div
        style={{
          '--vibe-primary': theme.colors.primary,
          '--vibe-secondary': theme.colors.secondary,
          '--vibe-background': theme.colors.background,
          '--vibe-surface': theme.colors.surface,
          '--vibe-text': theme.colors.text,
          '--vibe-text-secondary': theme.colors.textSecondary,
        } as React.CSSProperties}
      >
        {children}
      </div>
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeDefinition {
  return useContext(ThemeContext);
}
