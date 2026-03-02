import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "node",
    setupFiles: ["src/__tests__/setup.ts"],
    include: ["src/**/__tests__/**/*.test.ts", "src/__tests__/**/*.test.ts"],
    exclude: ["src/__tests__/tenant-isolation.test.ts", "node_modules"],
    coverage: {
      provider: "v8",
      include: ["src/lib/**/*.ts"],
      exclude: ["src/lib/**/types.ts", "src/lib/**/models/**"],
    },
  },
});
