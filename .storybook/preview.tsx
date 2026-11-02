import '@fontsource-variable/atkinson-hyperlegible-next'
import '@fontsource-variable/atkinson-hyperlegible-next/wght-italic.css'
import '@fontsource-variable/jetbrains-mono'
import '@fontsource-variable/fraunces/full.css'
import '../src/styles.css'
import type { Preview } from '@storybook/react-vite'
import { withApp } from './harness'

const preview: Preview = {
  decorators: [withApp],
  globalTypes: {
    theme: {
      description: 'PaperWing theme',
      toolbar: { title: 'Theme', icon: 'mirror', items: ['light', 'dark'], dynamicTitle: true },
    },
  },
  initialGlobals: { theme: 'light' },
  parameters: {
    layout: 'fullscreen',
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
    // Accessibility checks run with every story and fail its test. A story with a known finding
    // sets parameters.a11y.test = 'todo' itself, with a comment saying what's left to fix.
    a11y: { test: 'error' },
  },
  tags: ['autodocs'],
}

export default preview
