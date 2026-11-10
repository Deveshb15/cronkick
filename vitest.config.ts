import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // DB tests share one database, so files run one at a time.
    fileParallelism: false,
    env: { DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgres://localhost/cronkick_test' },
  },
});
