import { defineConfig } from "vitest/config";

// Nur die Unittests. e2e/ läuft unter Playwright, sonst würde vitest die
// Spezifikationen dort einsammeln und ohne Browser scheitern.
export default defineConfig({
  test: { include: ["test/**/*.test.js"] }
});
