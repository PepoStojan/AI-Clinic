// Vitest runs in plain Node, not Next's bundler, so the real `server-only`
// package's import-time guard throws unconditionally. vitest.config.ts
// aliases `server-only` to this no-op stub for tests only.
export {};
