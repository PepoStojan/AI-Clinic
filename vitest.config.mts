import path from "node:path";
import { defineConfig } from "vitest/config";

const rootDir = import.meta.dirname;

export default defineConfig({
  resolve: {
    alias: {
      "server-only": path.resolve(rootDir, "vitest.server-only-stub.ts"),
      "@": path.resolve(rootDir, "src"),
    },
  },
});
