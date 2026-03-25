import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@vibe-bi/core': path.resolve(__dirname, '../core/src'),
      '@vibe-bi/renderer': path.resolve(__dirname, '../renderer/src'),
    },
  },
});
