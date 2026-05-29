import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 60_000,
    hookTimeout: 30_000,
    // Rendering uses a process-global audio context (renderer.js sets it per
    // chunk), so two renders running at once stomp each other's context and
    // superdough's node pool — surfacing intermittently in CI as
    // "InvalidAccessError: connecting nodes from different contexts". Run every
    // test file serially in a single process so only one context is ever live.
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    fileParallelism: false,
  },
});
