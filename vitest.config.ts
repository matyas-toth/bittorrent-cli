import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: { reporter: ['text', 'html'] },
    include: ['test/**/*.test.{ts,tsx}'],
    testTimeout: 10_000,
  },
});
