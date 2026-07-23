import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// The content script must be a single self-contained CLASSIC script: MV3 injects
// manifest content_scripts as non-module scripts, so any `import ... from` at the
// top (which Vite emits when it code-splits the shared config chunk) throws
// "Cannot use import statement outside a module" and the whole script dies.
// Build it alone as an IIFE with everything inlined — zero imports in the output.
export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: false, // main build (vite.config.ts) already populated dist
    rollupOptions: {
      input: { content: resolve(__dirname, 'src/content/index.ts') },
      output: {
        entryFileNames: 'content.js',
        format: 'iife',
        inlineDynamicImports: true,
      },
    },
    target: 'chrome120',
  },
});
