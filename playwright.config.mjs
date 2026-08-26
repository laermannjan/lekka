import { defineConfig } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = 8188;

export default defineConfig({
  testDir: "e2e",
  use: { baseURL: `http://localhost:${PORT}` },
  webServer: {
    command: "node server/index.mjs",
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    env: { PORT: String(PORT), DATA_DIR: mkdtempSync(join(tmpdir(), "lekka-e2e-")) }
  }
});
