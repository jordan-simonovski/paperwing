import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { usePrefs } from './store'

// Where a new reader is in the welcome tour. Kept on the device so signing in to Bluesky or
// Mastodon (which leaves the app and comes back) lands on the same step.

// Sharing, saving, the social web and AI keys used to be steps; each now explains itself where it happens (firsts.ts) or lives in Settings.
export const STEPS = ['hello', 'topics', 'feeds', 'ranking', 'accounts', 'passkey'] as const
export type Step = (typeof STEPS)[number]

/** Where a saved tour resumes: v2 dropped four steps, and someone paused on one carries on from the last step. */
export const resumeStep = (step: string | undefined): Step => (STEPS.includes(step as Step) ? (step as Step) : 'passkey')

export const useOnboarding = create<{ step: Step; go: (step: Step) => void }>()(
  persist((set) => ({ step: 'hello', go: (step) => set({ step }) }), {
    name: 'readout:onboarding',
    version: 2,
    partialize: ({ step }) => ({ step }),
    migrate: (state) => ({ step: resumeStep((state as { step?: string }).step) }),
  }),
)

/** Where a sign-in returns to: the tour while it's unfinished, else the accounts settings. */
export const afterSignIn = () => (usePrefs.getState().welcomed ? '/settings/sources' : '/welcome')
