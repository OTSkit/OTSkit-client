import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'], // ← LÍNEA NUEVA
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: ['src/**'],
      // Regression floor set just below the current measured coverage. Vitest 4 only reads these
      // under `thresholds`; placed directly on `coverage` they are silently ignored.
      thresholds: {
        lines: 96,
        branches: 90,
        functions: 98,
        statements: 95,
      },
      exclude: ['node_modules/', 'dist/', 'tests/', 'vitest.config.ts', 'vitest.setup.ts'],
    },
  },
})
