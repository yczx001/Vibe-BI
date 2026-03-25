import React, { createContext, useContext } from 'react';
import type { ThemeDefinition } from '@vibe-bi/core';

const defaultTheme: ThemeDefinition = {
  name: 'Vibe Desktop Light',
  colors: {
    primary: '#0F6CBD',
    secondary: '#8764B8',
    background: '#F3F2F1',
    surface: '#FFFFFF',
    text: '#201F1E',
    textSecondary: '#605E5C',
    chart: ['#0F6CBD', '#8764B8', '#038387', '#CA5010', '#107C10', '#B146C2'],
  },
  typography: {
    fontFamily: '"Microsoft YaHei UI", "Microsoft YaHei", "Noto Sans SC", "Noto Sans CJK SC", "Source Han Sans SC", "PingFang SC", "Segoe UI Variable", "Segoe UI", system-ui, sans-serif',
  },
  components: {
    card: {
      borderRadius: 10,
      shadow: '0 1px 2px rgba(0,0,0,0.08)',
      padding: 18,
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
