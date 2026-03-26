import React from 'react';
import type { TextConfig } from '@vibe-bi/core';
import { useTheme } from '../../theme/ThemeProvider';

export interface TextBlockProps {
  config: TextConfig;
  data: unknown[];
  style?: React.CSSProperties;
}

export function TextBlock({ config, style }: TextBlockProps) {
  const theme = useTheme();
  const content = config.content || '';
  const shouldRenderHtml = config.html === true || /<\/?[a-z][\s\S]*>/i.test(content);

  const baseStyle: React.CSSProperties = {
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: config.align === 'center'
      ? 'center'
      : config.align === 'right'
        ? 'flex-end'
        : 'flex-start',
    padding: 4,
    color: config.color || theme.colors.text,
    fontSize: config.fontSize || 18,
    fontWeight: config.fontWeight || 'bold',
    lineHeight: 1.25,
    textAlign: config.align || 'left',
    overflow: 'hidden',
    ...style,
  };

  if (shouldRenderHtml) {
    return (
      <div style={baseStyle}>
        <div
          style={{ width: '100%' }}
          dangerouslySetInnerHTML={{ __html: content }}
        />
      </div>
    );
  }

  return (
    <div style={baseStyle}>
      <div
        style={{
          width: '100%',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {content}
      </div>
    </div>
  );
}
