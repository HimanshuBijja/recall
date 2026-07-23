import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Antigravity/Gemini IDE tooling dropped into the repo — not app code.
    ".gemini/**",
    // Agent worktrees (git worktrees nested in-repo) — not app code.
    ".claude/**",
    // The extension is a separate pnpm workspace with its own lint/tsconfig.
    "extension/**",
  ]),
]);

export default eslintConfig;
