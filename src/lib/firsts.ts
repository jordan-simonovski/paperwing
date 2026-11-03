import { usePrefs } from './store'

// Firsts: the first time this device does something that matters, its usual answer says once what
// just happened and why it's worth knowing. No list, no count, no progress: each is spent quietly
// and never comes back.

export type First = 'post' | 'save' | 'join' | 'share' | 'hide' | 'keys'

/** True the first time this device does it, false ever after. */
export function firstTime(id: First): boolean {
  const { firsts } = usePrefs.getState()
  if (firsts.includes(id)) return false
  usePrefs.getState().set({ firsts: [...firsts, id] })
  return true
}
