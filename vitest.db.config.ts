import { defineConfig } from "vitest/config";
import path from "node:path";

/** Testes que usam o Postgres LOCAL de teste (RLS e ponta a ponta). */
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src"), "server-only": path.resolve(__dirname, "tests/support/empty.ts") } },
  test: {
    environment: "node",
    include: ["tests/rls/**/*.test.ts", "tests/e2e/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 120_000,
    globalSetup: ["tests/support/global-setup.ts"],
    env: { TZ: "UTC" },
  },
});
