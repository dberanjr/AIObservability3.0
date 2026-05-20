import { defineConfig } from "vitest/config";

/**
 * Pure-function test runner. Components / DOM tests are out of scope for the
 * acceptance-coverage targets — we focus on the deterministic modules in
 * detection/, data/, components/SLAConfig/, and pages/FinOps/scoring.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["ui/app/**/*.test.ts"],
    reporters: ["default"],
    coverage: {
      provider: "v8",
      include: [
        "ui/app/detection/**",
        "ui/app/data/**",
        "ui/app/components/SLAConfig/agentHealthScore.ts",
        "ui/app/pages/FinOps/scoring.ts",
      ],
      reporter: ["text", "json-summary"],
    },
  },
});
