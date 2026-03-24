import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
  build: {
    lib: {
      entry: './src/index.ts',
      name: '@vibe-bi/core',
      fileName: 'index',
      formats: ['es'],
    },
    rollupOptions: {
      output: {
        dir: './dist',
      },
    },
  },
  plugins: [dts()],
});
