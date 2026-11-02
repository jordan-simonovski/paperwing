import { storybookTest } from '@storybook/addon-vitest/vitest-plugin'
import { playwright } from '@vitest/browser-playwright'
import { defineConfig, mergeConfig } from 'vitest/config'
import { noServer } from './.storybook/noServer'
import viteConfig from './vite.config'

// Two suites. `unit`: the logic, in Node (npm test). `stories`: every Storybook story rendered in
// a real browser, each one a smoke test plus whatever its play function checks (npm run
// test:stories; needs Playwright's Chromium).
// The app's local /api middleware stays out of tests: nothing under test reaches a server.
const app = { ...viteConfig, plugins: (viteConfig.plugins ?? []).filter((p) => !(p && typeof p === 'object' && 'name' in p && p.name === 'vercel-api-dev')) }

export default mergeConfig(
  app,
  defineConfig({
    test: {
      projects: [
        {
          extends: true,
          test: { name: 'unit', include: ['src/**/*.test.{ts,tsx}', 'api/**/*.test.ts'], environment: 'node' },
        },
        {
          extends: true,
          // The app's local /api functions stay out: a story never reaches a server.
          plugins: [noServer(), storybookTest({ configDir: '.storybook' })],
          // Every library the app's browser code imports, bundled before the first story runs: one
          // found mid-run makes Vite reload, and whichever stories were loading then fail.
          optimizeDeps: {
            include: [
              '@atproto/oauth-client-browser',
              '@chenglou/pretext',
              '@tanstack/query-async-storage-persister',
              '@tanstack/react-query',
              '@tanstack/react-query-persist-client',
              'dompurify',
              'idb-keyval',
              'lucide-react',
              'marked',
              'react',
              'react-dom',
              'react-dom/client',
              'react-router',
              'uqr',
              'zustand',
              'zustand/middleware',
              'zustand/react/shallow',
            ],
          },
          test: {
            name: 'stories',
            browser: { enabled: true, headless: true, provider: playwright(), instances: [{ browser: 'chromium' }] },
          },
        },
      ],
    },
  }),
)
