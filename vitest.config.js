import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.js'],
    globalSetup: ['tests/global-setup.js'],
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 120000,
    env: {
      TZ: 'Asia/Kolkata',
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5434/lrfleet_test',
      DIRECT_URL: 'postgresql://postgres:postgres@localhost:5434/lrfleet_test',
      SESSION_SECRET: 'test-secret-test-secret-test-secret-1234',
    },
  },
});
