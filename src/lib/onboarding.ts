import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { usePrefs } from './store'

// Where a new reader is in the welcome tour. Kept on the device so signing in to Bluesky or
// Mastodon (which leaves the app and comes back) lands on the same step.

export const STEPS = ['hello', 'topics', 'feeds', 'ranking', 'accounts', 'sharing', 'social', 'saving', 'ai', 'passkey'] as const
export type Step = (typeof STEPS)[number]

export const useOnboarding = create<{ step: Step; go: (step: Step) => void }>()(
  persist((set) => ({ step: 'hello', go: (step) => set({ step }) }), { name: 'readout:onboarding', version: 1, partialize: ({ step }) => ({ step }) }),
)

/** Where a sign-in returns to: the tour while it's unfinished, else the accounts settings. */
export const afterSignIn = () => (usePrefs.getState().welcomed ? '/settings/sources' : '/welcome')
