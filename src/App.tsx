import { createBrowserRouter, Navigate, RouterProvider } from 'react-router'
import { FeedPage } from './routes/FeedPage'
import { Root } from './routes/Root'
import { RouteError } from './routes/RouteError'

// Feeds load with the app; every other page is fetched on first visit (the service worker
// precaches all of them, so this costs nothing offline).
const router = createBrowserRouter([
  {
    element: <Root />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <Navigate to="/t/for-you" replace /> },
      { path: 't/:channel/:itemKey?', element: <FeedPage /> },
      { path: 'u/:actor/:itemKey?', element: <FeedPage /> },
      { path: 'c/:did/:rkey/:itemKey?', element: <FeedPage /> },
      { path: 'boards/:rkey?', lazy: () => import('./routes/BoardEditorPage').then((m) => ({ Component: m.BoardEditorPage })) },
      { path: 'search/:itemKey?', lazy: () => import('./routes/SearchPage').then((m) => ({ Component: m.SearchPage })) },
      { path: 'activity/:itemKey?', lazy: () => import('./routes/ActivityPage').then((m) => ({ Component: m.ActivityPage })) },
      { path: 'saved/:itemKey?', lazy: () => import('./routes/SavedPage').then((m) => ({ Component: m.SavedPage })) },
      { path: 'today/:itemKey?', lazy: () => import('./routes/TodayPage').then((m) => ({ Component: m.TodayPage })) },
      { path: 'welcome', lazy: () => import('./routes/WelcomePage').then((m) => ({ Component: m.WelcomePage })) },
      { path: 'explore/:tab?', lazy: () => import('./routes/ExplorePage').then((m) => ({ Component: m.ExplorePage })) },
      { path: 'mixes/:id?', lazy: () => import('./routes/MixEditorPage').then((m) => ({ Component: m.MixEditorPage })) },
      { path: 'mix/:did/:rkey', lazy: () => import('./routes/MixPage').then((m) => ({ Component: m.MixPage })) },
      { path: 'topics', element: <Navigate to="/explore" replace /> },
      { path: 'settings/:section?', lazy: () => import('./routes/SettingsPage').then((m) => ({ Component: m.SettingsPage })) },
      { path: 'share', lazy: () => import('./routes/SharePage').then((m) => ({ Component: m.SharePage })) },
      { path: 'atproto-callback', lazy: () => import('./routes/AtprotoCallback').then((m) => ({ Component: m.AtprotoCallback })) },
      { path: 'mastodon/callback', lazy: () => import('./routes/MastodonCallback').then((m) => ({ Component: m.MastodonCallback })) },
      { path: 'principles', lazy: () => import('./routes/PrinciplesPage').then((m) => ({ Component: m.PrinciplesPage })) },
      { path: 'terms', lazy: () => import('./routes/TermsPage').then((m) => ({ Component: m.TermsPage })) },
      { path: 'privacy', lazy: () => import('./routes/PrivacyPage').then((m) => ({ Component: m.PrivacyPage })) },
      { path: 'pair', lazy: () => import('./routes/PairPage').then((m) => ({ Component: m.PairPage })) },
      // Brand artwork for scripts/brand.mjs: development builds only.
      ...(import.meta.env.DEV ? [{ path: 'brand', lazy: () => import('./routes/BrandPage').then((m) => ({ Component: m.BrandPage })) }] : []),
      { path: '*', element: <Navigate to="/t/for-you" replace /> },
    ],
  },
])

export function App() {
  return <RouterProvider router={router} />
}
