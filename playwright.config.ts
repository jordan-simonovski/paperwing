import { defineConfig, devices } from '@playwright/test'

// End-to-end journeys (npm run test:e2e): the built app, served by `vite preview`, driven in
// Chromium at desktop and phone sizes. The preview has no /api, and the journeys never reach the
// internet: e2e/support/network.ts answers every request the app makes, or blocks it.
const PORT = 4317
const CI = !!process.env.CI

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: CI,
  // No retries: a journey that passes on its second go is a flake to fix, not to hide.
  retries: 0,
  reporter: CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    // The service worker would answer some requests itself, out of page.route's sight.
    serviceWorkers: 'block',
    // No launch splash or headline motion: journeys wait on what's on screen, not on animations.
    contextOptions: { reducedMotion: 'reduce' },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    // Chromium with a phone's screen, touch and user agent: most people read PaperWing on a phone.
    { name: 'phone', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !CI,
    timeout: 180_000,
  },
})
