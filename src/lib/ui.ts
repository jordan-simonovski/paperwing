import { create } from 'zustand'
import { HOME, HOSTS } from './oauthClient'

export interface Toast {
  id: number
  message: string
  tone?: 'default' | 'error'
  action?: { label: string; run: () => void }
}
type ToastOptions = Pick<Toast, 'tone' | 'action'>

interface UI {
  palette: boolean
  help: boolean
  /** The phone's navigation drawer. */
  drawer: boolean
  toasts: Toast[]
  setPalette: (open: boolean) => void
  setHelp: (open: boolean) => void
  setDrawer: (open: boolean) => void
  toast: (message: string, opts?: ToastOptions) => void
  dismiss: (id: number) => void
}

let nextId = 1

export const useUI = create<UI>()((set) => ({
  palette: false,
  help: false,
  drawer: false,
  toasts: [],
  setPalette: (palette) => set({ palette }),
  setHelp: (help) => set({ help }),
  setDrawer: (drawer) => set({ drawer }),
  toast: (message, opts = {}) => {
    const id = nextId++
    // The same message twice in a row replaces the first rather than stacking.
    set((s) => ({ toasts: [...s.toasts.filter((t) => t.message !== message).slice(-2), { id, message, ...opts }] }))
    // Long enough to read: a bit over a second per ten words, more with a button to reach for.
    const ms = Math.min(9000, Math.max(opts.action ? 5000 : 3200, 1200 + message.split(/\s+/).length * 260))
    setTimeout(() => useUI.getState().dismiss(id), ms)
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))

export const toast = (message: string, opts?: ToastOptions) => useUI.getState().toast(message, opts)

/** True when a keyboard shortcut should be ignored because the user is typing. */
export function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null
  return !!t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))
}

/**
 * A story's PaperWing address: it opens the story with every network's discussion, and link
 * previews (Bluesky, iMessage, Slack) show the story's own card (api/preview.ts). Always the home
 * address, wherever PaperWing is running, so shared links don't point at an old domain.
 */
export const homeOrigin = () => (HOSTS.includes(location.hostname) ? `https://${HOME}` : location.origin)

export function storyLink(key: string): string {
  return `${homeOrigin()}/t/for-you/${key}`
}

export async function share(title: string, url: string) {
  if (navigator.share) {
    try {
      await navigator.share({ title, url })
      return
    } catch (err) {
      // Closing the share screen is an answer, not a failure: nothing more to do.
      if (err instanceof DOMException && err.name === 'AbortError') return
      /* share unavailable here (say, no user gesture): copy instead */
    }
  }
  await navigator.clipboard.writeText(url)
  toast('Link copied')
}
