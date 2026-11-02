import type { StorybookConfig } from '@storybook/react-vite'
import type { PluginOption } from 'vite'

// Stories live next to what they show (Foo.stories.tsx beside Foo.tsx). The app's Vite config is
// reused, minus the plugins that only make sense for the app itself: the local /api functions (a
// story never talks to a server: see harness.tsx) and the service worker.
const APP_ONLY = new Set(['vercel-api-dev', 'readout-sw'])

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-docs', '@storybook/addon-a11y', '@storybook/addon-vitest'],
  framework: '@storybook/react-vite',
  staticDirs: ['../public'],
  core: { disableTelemetry: true },
  viteFinal: async (vite) => {
    const keep = (plugins: PluginOption[] | undefined): PluginOption[] =>
      (plugins ?? []).flatMap((p) => (Array.isArray(p) ? [keep(p)] : p && typeof p === 'object' && 'name' in p && APP_ONLY.has(p.name) ? [] : [p]))
    return { ...vite, plugins: keep(vite.plugins) }
  },
}

export default config
