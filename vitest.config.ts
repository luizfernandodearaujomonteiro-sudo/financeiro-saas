import { defineConfig } from "vitest/config";
import path from "node:path";

const root = import.meta.dirname;

export default defineConfig({
  resolve: { alias: { "@": path.resolve(root, "src"), "server-only": path.resolve(root, "tests/support/empty.ts") } },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    env: { TZ: "UTC" },
  },
});
