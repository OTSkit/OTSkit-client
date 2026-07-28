import { defineConfig } from 'tsup'

export default defineConfig([
  { entry: ['src/index.ts'], format: ['esm', 'cjs'], dts: true, clean: true, platform: 'node' },
  {
    entry: ['src/browser.ts'],
    format: ['esm'],
    dts: true,
    platform: 'browser',
    tsconfig: 'tsconfig.browser.json',
  },
])
