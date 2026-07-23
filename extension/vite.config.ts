import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        // NOTE: content script is built separately as a self-contained IIFE
        // (vite.content.config.ts) — it can't be an ES module. See that file.
        background: resolve(__dirname, 'src/background.ts'),
        options: resolve(__dirname, 'src/options/options.html'),
        popup: resolve(__dirname, 'src/popup/popup.html'),
      },
      output: {
        entryFileNames: '[name].js',
        format: 'es',
        inlineDynamicImports: false,
        manualChunks: undefined,
      },
    },
    target: 'chrome120',
  },
  test: { environment: 'jsdom', include: ['tests/**/*.test.ts'], setupFiles: ['tests/setup.ts'] },
});
