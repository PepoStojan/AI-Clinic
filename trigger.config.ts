import { defineConfig } from "@trigger.dev/sdk";

export default defineConfig({
  project: "proj_pazyklzkrxxmecphnoco", // SmartClick org, AI-Clinic project
  dirs: ["./src/trigger"],
  // Default only; long-running audit/orchestration tasks can override this
  // per-task once they exist (CORE-001+).
  maxDuration: 60,
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
