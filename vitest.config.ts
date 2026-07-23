import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, ".") } },
  test: {
    testTimeout: 20000,
    projects: [
      {
        extends: true,
        test: {
          name: "node",
          environment: "node",
          include: ["**/*.test.ts"],
          exclude: ["**/*.test.tsx", "**/node_modules/**", "**/.claude/**", "**/extension/**"],
        },
      },
      {
        extends: true,
        test: {
          name: "dom",
          environment: "jsdom",
          include: ["**/*.test.tsx"],
          exclude: ["**/node_modules/**", "**/.claude/**", "**/extension/**"],
          setupFiles: ["./vitest.setup.ts"],
        },
      },
    ],
  },
});
