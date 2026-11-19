import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
  resolve: {
    // The plugin imports "emdash" for definePlugin and friends. The real
    // package pulls in the whole CMS graph, so unit tests run against a
    // small stub that mimics definePlugin's passthrough shape instead.
    // The real definePlugin is exercised separately by scripts/smoke.mjs
    // against the installed emdash 1.5.0 package.
    alias: {
      emdash: new URL("./tests/stubs/emdash.ts", import.meta.url).pathname,
    },
  },
});
