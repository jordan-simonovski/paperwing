import { usePrefs } from '../store'
import { flowInto, pretextOn, wordBoxes, type FlowFrom } from './flow'

// The motion moves: a headline flying from its feed row into the reader (built on flowInto), and a
// list's visible headlines settling in when you arrive.

let pending: { key: string; from: FlowFrom; source: HTMLElement; at: number } | undefined

/** Called as a story opens: notes where its headline is in the list. */
export function armHeadline(key: string) {
  pending = undefined
  if (!pretextOn()) return
  const source = document.querySelector<HTMLElement>(`#row-${CSS.escape(key)} .row-title`)
  if (!source) return
  const r = source.getBoundingClientRect()
  if (r.bottom < 0 || r.top > innerHeight) return
  pending = { key, source, at: performance.now(), from: { x: r.left, y: r.top, w: r.width, size: parseFloat(getComputedStyle(source).fontSize), boxes: wordBoxes(source).boxes } }
}

/**
 * Called when the reader's headline is on screen: flies the row's words into it, re-wrapping as
 * they grow. On phones the reader fades in in place for this, so the headline has somewhere still
 * to land.
 */
export function landHeadline(key: string, headline: HTMLElement, pane: HTMLElement | null) {
  const p = pending
  pending = undefined
  if (!p || p.key !== key || performance.now() - p.at > 1500 || !p.source.isConnected) return
  if (pane && matchMedia('(max-width: 899px)').matches) {
    pane.style.transition = 'none'
    pane.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 280, easing: 'ease-out' })
    requestAnimationFrame(() => requestAnimationFrame(() => (pane.style.transition = '')))
  }
  p.source.style.visibility = 'hidden'
  const restore = () => (p.source.style.visibility = '')
  if (!flowInto({ to: headline, from: p.from, duration: 620, done: restore })) restore()
}

/**
 * A list's visible headlines (and its page title) settle in: each fades up a few pixels in place,
 * one after another. It animates the real elements, so a row that shifts as the list renders
 * carries its headline with it. (This used to re-wrap each headline in from a narrow column with
 * pretext, which spilled over neighbouring rows and could land words in the wrong place when a row
 * moved mid-flight: too much for something that runs on every feed change.)
 */
export function settleVisible(root: ParentNode = document) {
  if (!pretextOn() || !usePrefs.getState().feedMotion) return
  const els = [...root.querySelectorAll<HTMLElement>('.feed-title, .list-col .row-title')]
    .filter((el) => {
      const r = el.getBoundingClientRect()
      return r.height > 0 && r.bottom > 0 && r.top < innerHeight
    })
    .slice(0, 8)
  els.forEach((el, i) => {
    el.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 380, delay: i * 30, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' })
  })
}
