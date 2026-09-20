import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['src/integration/**/*.test.ts'],
    testTimeout: 30000,
    reporter: 'verbose',
  },
});
