import '@fontsource-variable/atkinson-hyperlegible-next'
import '@fontsource-variable/atkinson-hyperlegible-next/wght-italic.css'
import '@fontsource-variable/jetbrains-mono'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { startAlerts } from './lib/push'
import { setupPWA } from './lib/pwa'
import { startSync } from './lib/sync'
import { preloadPretext } from './lib/pretext/engine'
import { playSplash } from './lib/splash'
import { dehydrateOptions, PERSIST_BUSTER, PERSIST_MAX_AGE, persister, queryClient } from './lib/query'
import './styles.css'

// The splash goes up before anything else; the app starts when it says so (straight away when
// there's no splash), so the first render doesn't stall the animation.
void playSplash().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <PersistQueryClientProvider client={queryClient} persistOptions={{ persister, maxAge: PERSIST_MAX_AGE, buster: PERSIST_BUSTER, dehydrateOptions }}>
        <App />
      </PersistQueryClientProvider>
    </StrictMode>,
  )
  setupPWA()
  startSync()
  startAlerts()
  preloadPretext()
})
