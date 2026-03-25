import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';
import renderer from 'vite-plugin-electron-renderer';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@vibe-bi/core': path.resolve(__dirname, '../core/src'),
      '@vibe-bi/renderer': path.resolve(__dirname, '../renderer/src'),
      '@vibe-bi/editor': path.resolve(__dirname, '../editor/src'),
    },
  },
  plugins: [
    react(),
    electron([
      {
        entry: 'src/main/index.ts',
        onstart: (options) => {
          options.startup();
        },
        vite: {
          build: {
            sourcemap: true,
            minify: false,
            outDir: 'dist/main',
            rollupOptions: {
              external: ['electron'],
            },
          },
        },
      },
      {
        entry: 'src/preload/index.ts',
        onstart: (options) => {
          options.reload();
        },
      },
    ]),
    renderer(),
  ],
  build: {
    outDir: 'dist/renderer',
  },
});
