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
      lines: 100,
      branches: 100,
      functions: 100,
      statements: 100,
      exclude: [
        'node_modules/',
        'dist/',
        'tests/',
        'vitest.config.ts',
        'vitest.setup.ts',
      ],
    },
  },
})