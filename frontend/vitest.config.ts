import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/config/env.test.ts", "src/lib/http/http-client.test.ts"],
    exclude: [".tailadmin-src/**", "node_modules/**", "dist/**"],
  },
});
