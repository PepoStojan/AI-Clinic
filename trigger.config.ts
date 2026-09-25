import { defineConfig } from "@trigger.dev/sdk";
import { playwright } from "@trigger.dev/build/extensions/playwright";

export default defineConfig({
  project: "proj_pazyklzkrxxmecphnoco", // SmartClick org, AI-Clinic project
  dirs: ["./src/trigger"],
  // Default only; long-running audit/orchestration tasks can override this
  // per-task once they exist (CORE-001+).
  maxDuration: 60,
  build: {
    // PDF-001's run-audit-pipeline calls Playwright (via runPdfGeneration)
    // for the PDF step. playwright-core's own bundle pulls in chromium-bidi
    // in a way esbuild cannot resolve when bundled directly -- both the
    // dedicated build extension (deploy/build) and an explicit `external`
    // entry (covers `dev` too, since `external` is a plain esbuild
    // passthrough) are needed; see UI-001 completion report for the local
    // dev bundling failure this fixes.
    external: ["playwright", "playwright-core"],
    extensions: [playwright()],
  },
  retries: {
    enabledInDev: false,
    // maxAttempts: 3 = 1 initial attempt + 2 retries, matching the Build
    // Spec section 8 retry policy (max 2 automatic retries, exponential
    // backoff) for recoverable provider/task failures.
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 10000,
      factor: 2,
      randomize: true,
    },
  },
});
