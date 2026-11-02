import type { Decorator } from '@storybook/react-vite'
import { QueryClientProvider, type QueryKey } from '@tanstack/react-query'
import { createContext, useContext, useState, type ReactNode } from 'react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import type { StoreApi, UseBoundStore } from 'zustand'
import { useAtproto } from '../src/lib/atproto'
import { useReactions, useComposer } from '../src/lib/compose'
import { useHn } from '../src/lib/hnAccount'
import { useInboxSeen } from '../src/lib/inbox'
import { useLemmyAccount } from '../src/lib/lemmyAccount'
import { useLibrary } from '../src/lib/library'
import { useMastodon } from '../src/lib/mastodon'
import { queryClient } from '../src/lib/query'
import { useSpiceStore } from '../src/lib/spice'
import { useActivity, usePrefs } from '../src/lib/store'
import { useSummaries } from '../src/lib/summaryCache'
import { useUI } from '../src/lib/ui'
import { useWatch } from '../src/lib/watch'

/**
 * Every story renders the way the app does, but from nothing but its own parameters: the stores
 * start from their defaults, the query cache holds only what the story seeds, the network answers
 * only what the story mocks, and a router is there for links. Nothing leaks from one story into
 * the next, so a story is also a test.
 *
 *   parameters: {
 *     app: {
 *       prefs: { showExcerpts: false },          // any store, by name, merged over its defaults
 *       atproto: { did: 'did:plc:…', handle: 'reader.example' },
 *       queries: [[['friends'], { … }]],          // seeded into the query cache
 *       fetch: { '/api/feed?src=og': { image: '…' } },  // URL substring → JSON body
 *       route: { path: '/t/:channel/:itemKey?', url: '/t/for-you' },
 *     },
 *   }
 */
export interface AppParameters {
  prefs?: Partial<ReturnType<typeof usePrefs.getState>>
  activity?: Partial<ReturnType<typeof useActivity.getState>>
  library?: Partial<ReturnType<typeof useLibrary.getState>>
  atproto?: Partial<ReturnType<typeof useAtproto.getState>>
  mastodon?: Partial<ReturnType<typeof useMastodon.getState>>
  hn?: Partial<ReturnType<typeof useHn.getState>>
  lemmy?: Partial<ReturnType<typeof useLemmyAccount.getState>>
  watch?: Partial<ReturnType<typeof useWatch.getState>>
  spice?: Partial<ReturnType<typeof useSpiceStore.getState>>
  queries?: [QueryKey, unknown][]
  fetch?: Record<string, unknown>
  route?: { path: string; url: string }
}

// Stores of every shape, reset generically.
type AnyStore = UseBoundStore<StoreApi<any>>
const STORES: Record<string, AnyStore> = {
  prefs: usePrefs,
  activity: useActivity,
  library: useLibrary,
  atproto: useAtproto,
  mastodon: useMastodon,
  hn: useHn,
  lemmy: useLemmyAccount,
  watch: useWatch,
  spice: useSpiceStore,
  composer: useComposer,
  reactions: useReactions,
  summaries: useSummaries,
  inbox: useInboxSeen,
  ui: useUI,
}
// Defaults as the app starts with no saved state (before anything persisted was read back).
const DEFAULTS = Object.fromEntries(Object.entries(STORES).map(([k, s]) => [k, s.getInitialState()]))
try {
  localStorage.clear()
} catch {
  /* no storage: nothing to clear */
}

queryClient.setDefaultOptions({ queries: { retry: false, staleTime: Infinity, gcTime: Infinity, refetchOnMount: false, networkMode: 'always' } })

let mocks: Record<string, unknown> = {}
const realFetch = globalThis.fetch.bind(globalThis)
globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  // Storybook's own files (and anything it serves) load as usual.
  if (url.startsWith('/') && !url.startsWith('/api/') && !url.startsWith('/rss')) return realFetch(input, init)
  const hit = Object.keys(mocks).find((k) => url.includes(k))
  if (hit) return new Response(JSON.stringify(mocks[hit]), { status: 200, headers: { 'content-type': 'application/json' } })
  return new Response(JSON.stringify({ error: `Not mocked in this story: ${url}` }), { status: 404, headers: { 'content-type': 'application/json' } })
}

function prepare(app: AppParameters) {
  for (const [name, store] of Object.entries(STORES)) {
    store.setState({ ...DEFAULTS[name], ...((app as Record<string, object | undefined>)[name] ?? {}) }, true)
  }
  queryClient.clear()
  for (const [key, data] of app.queries ?? []) queryClient.setQueryData(key, data)
  mocks = app.fetch ?? {}
}

// The story renders inside the router through this, so changing its args re-renders it.
const Current = createContext<ReactNode>(null)
const StorySlot = () => useContext(Current)

function Harness({ app, theme, children }: { app: AppParameters; theme: string; children: ReactNode }) {
  // Set up once per story, before its first render.
  const [router] = useState(() => {
    prepare(app)
    const route = app.route ?? { path: '*', url: '/' }
    return createMemoryRouter([{ path: route.path, element: <StorySlot /> }], { initialEntries: [route.url] })
  })
  document.documentElement.dataset.theme = theme
  document.documentElement.dataset.text ??= 'md'
  document.documentElement.dataset.density ??= 'comfortable'
  return (
    <QueryClientProvider client={queryClient}>
      <Current.Provider value={children}>
        <RouterProvider router={router} />
      </Current.Provider>
    </QueryClientProvider>
  )
}

export const withApp: Decorator = (Story, ctx) => (
  <Harness app={(ctx.parameters.app ?? {}) as AppParameters} theme={String(ctx.globals.theme ?? 'light')} key={ctx.id}>
    <div className="bg-ground text-ink" style={{ minHeight: '100%' }}>
      <Story />
    </div>
  </Harness>
)
