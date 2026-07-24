import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Same constraint as vite.content.config.ts: MV3 injects content scripts as
// classic (non-module) scripts, so this must be a single self-contained IIFE
// with zero top-level imports in the output. One input per config, because
// `inlineDynamicImports` only supports a single entry.
export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: false, // vite.config.ts already populated dist
    rollupOptions: {
      input: { web: resolve(__dirname, 'src/web/index.ts') },
      output: {
        entryFileNames: 'web.js',
        format: 'iife',
        inlineDynamicImports: true,
      },
    },
    target: 'chrome120',
  },
});
