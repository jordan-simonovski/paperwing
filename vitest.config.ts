import { storybookTest } from '@storybook/addon-vitest/vitest-plugin'
import { playwright } from '@vitest/browser-playwright'
import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'

// Two suites. `unit`: the logic, in Node (npm test). `stories`: every Storybook story rendered in
// a real browser, each one a smoke test plus whatever its play function checks (npm run
// test:stories; needs Playwright's Chromium).
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      projects: [
        {
          extends: true,
          test: { name: 'unit', include: ['src/**/*.test.{ts,tsx}', 'api/**/*.test.ts'], environment: 'node' },
        },
        {
          extends: true,
          plugins: [storybookTest({ configDir: '.storybook' })],
          test: {
            name: 'stories',
            browser: { enabled: true, headless: true, provider: playwright(), instances: [{ browser: 'chromium' }] },
          },
        },
      ],
    },
  }),
)
