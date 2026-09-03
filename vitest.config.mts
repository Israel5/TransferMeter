import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/* The tests import the app's own modules, so they need the same "@/" the app
   uses. Nothing else is configured: these cover pure logic, not the browser. */
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    include: ["lib/**/*.test.ts"],
    environment: "node",
  },
});
