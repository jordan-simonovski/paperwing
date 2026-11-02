import { ArrowRight, Bookmark, CornerDownLeft, Hash, Link2, Moon, Newspaper, Plus, Search, Settings, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { allTopics, findTopic, sourceChannels } from '../lib/channels'
import { SourceChannelIcon } from './SourceIcon'
import { linkFrom, postLink } from '../lib/compose'
import { usePrefs } from '../lib/store'
import { relatedTopics, searchTopics } from '../lib/topics'
import { useUI } from '../lib/ui'

interface Item {
  id: string
  group: string
  label: React.ReactNode
  hint?: string
  icon: React.ReactNode
  run: () => void
}

const RECENT_KEY = 'readout:recent-searches'
export function rememberSearch(q: string) {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as string[]
    localStorage.setItem(RECENT_KEY, JSON.stringify([q, ...list.filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, 6)))
  } catch {
    /* storage unavailable */
  }
}
export function clearRecentSearches() {
  try {
    localStorage.removeItem(RECENT_KEY)
  } catch {
    /* storage unavailable */
  }
}
export function recentSearches(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as string[]
  } catch {
    return []
  }
}

const dot = (hue: number) => <span className="topic swatch" style={{ '--h': hue } as React.CSSProperties} />

export function Palette() {
  const open = useUI((s) => s.palette)
  const setOpen = useUI((s) => s.setPalette)
  if (!open) return null
  return <PaletteBody onClose={() => setOpen(false)} />
}

function PaletteBody({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const { interests, followed, theme, set, addInterest } = usePrefs()
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  const dark = theme === 'dark' || (theme === 'system' && document.documentElement.dataset.theme === 'dark')
  const items = useMemo<Item[]>(() => {
    const go = (path: string) => () => navigate(path)
    const topics = allTopics(interests)
    const query = q.trim()
    const out: Item[] = []
    const nav: Item[] = [
      { id: 'for-you', group: 'Go to', label: 'For you', icon: <Sparkles size={15} />, run: go('/t/for-you') },
      { id: 'front', group: 'Go to', label: 'Front page', icon: <Newspaper size={15} />, run: go('/t/front') },
      ...sourceChannels(followed).map((c) => ({ id: c.id, group: 'Go to', label: c.label, icon: <SourceChannelIcon mark={c.mark} size={15} />, run: go(`/t/${c.id}`) })),
      { id: 'topics', group: 'Go to', label: 'Explore topics', icon: <Hash size={15} />, run: go('/explore') },
      { id: 'communities', group: 'Go to', label: 'Explore communities', icon: <Hash size={15} />, run: go('/explore/communities') },
      { id: 'saved', group: 'Go to', label: 'Saved', icon: <Bookmark size={15} />, run: go('/saved') },
      { id: 'settings', group: 'Go to', label: 'Settings', icon: <Settings size={15} />, run: go('/settings') },
      { id: 'post', group: 'Actions', label: 'Post a link to PaperWing', icon: <Link2 size={15} />, run: () => postLink() },
      { id: 'theme', group: 'Actions', label: `Switch to ${dark ? 'light' : 'dark'} mode`, icon: <Moon size={15} />, run: () => set({ theme: dark ? 'light' : 'dark' }) },
    ]

    if (!query) {
      for (const r of recentSearches()) out.push({ id: `recent:${r}`, group: 'Recent searches', label: r, icon: <Search size={15} />, run: go(`/search?q=${encodeURIComponent(r)}`) })
      for (const id of followed) {
        const t = findTopic(id, interests)
        if (t) out.push({ id: `topic:${t.id}`, group: 'Your interests', label: t.label, hint: t.blurb, icon: dot(t.hue), run: go(`/t/${t.id}`) })
      }
      return [...out, ...nav]
    }

    // A pasted link: post it.
    const pasted = linkFrom(query)
    if (pasted) out.push({ id: 'post-pasted', group: 'Actions', label: <>Post this link to PaperWing</>, hint: pasted, icon: <Link2 size={15} />, run: () => postLink({ url: pasted }) })
    const hits = searchTopics(query, topics).slice(0, 6)
    for (const h of hits)
      out.push({ id: `topic:${h.topic.id}`, group: 'Topics', label: h.topic.label, hint: h.via ? `matches “${h.via}”` : h.topic.blurb, icon: dot(h.topic.hue), run: go(`/t/${h.topic.id}`) })
    out.push({ id: 'search', group: 'Search', label: <>Search stories for “{query}”</>, icon: <Search size={15} />, run: go(`/search?q=${encodeURIComponent(query)}`) })
    if (!hits.some((h) => h.score >= 7) && !interests.some((i) => i.query.toLowerCase() === query.toLowerCase())) {
      out.push({
        id: 'follow',
        group: 'Search',
        label: <>Follow “{query}” as an interest</>,
        hint: 'Builds a feed from HN and dev.to',
        icon: <Plus size={15} />,
        run: () => navigate(`/t/${addInterest(query).id}`),
      })
    }
    if (hits.length) {
      for (const t of relatedTopics(
        hits.slice(0, 2).map((h) => h.topic.id),
        hits.map((h) => h.topic.id),
      ).slice(0, 4)) {
        out.push({ id: `near:${t.id}`, group: `Related to ${hits[0].topic.label}`, label: t.label, hint: t.blurb, icon: dot(t.hue), run: go(`/t/${t.id}`) })
      }
    }
    const lower = query.toLowerCase()
    return [...out, ...nav.filter((n) => typeof n.label === 'string' && n.label.toLowerCase().includes(lower))]
  }, [q, interests, followed, navigate, set, addInterest, dark])

  useEffect(() => setActive(0), [q])
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const run = (item?: Item) => {
    if (!item) return
    onClose()
    item.run()
  }

  let lastGroup = ''
  return (
    <>
      <div className="overlay" onClick={onClose} />
      <div className="palette" role="dialog" aria-label="Command palette">
        <div className="flex items-center gap-3 px-5">
          <Search size={17} className="text-ink-3" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setActive((a) => Math.min(items.length - 1, a + 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setActive((a) => Math.max(0, a - 1))
              } else if (e.key === 'Enter') {
                e.preventDefault()
                run(items[active])
              } else if (e.key === 'Escape') onClose()
            }}
            placeholder="A topic, a tool, anything"
            className="h-16 flex-1 bg-transparent text-[1.125rem] font-semibold placeholder:font-normal placeholder:text-ink-3 focus:outline-none focus-visible:outline-none"
            role="combobox"
            aria-expanded
            aria-controls="palette-list"
            aria-activedescendant={`pal-${active}`}
          />
          <kbd>esc</kbd>
        </div>
        <div ref={listRef} id="palette-list" role="listbox" className="overflow-y-auto pb-2">
          {items.map((item, i) => {
            const header = item.group !== lastGroup ? item.group : null
            lastGroup = item.group
            return (
              <div key={item.id}>
                {header && <div className="label px-5 pb-1.5 pt-3">{header}</div>}
                <button id={`pal-${i}`} data-index={i} role="option" aria-selected={i === active} className="pal-item" onMouseMove={() => setActive(i)} onClick={() => run(item)}>
                  <span className="grid w-4 place-items-center text-ink-3">{item.icon}</span>
                  <span className="max-w-[70%] flex-none truncate font-medium">{item.label}</span>
                  {item.hint && <span className="min-w-0 truncate text-[0.8125rem] text-ink-3 max-sm:hidden">{item.hint}</span>}
                  <span className="pal-enter text-ink-3">{item.group.startsWith('Related to') ? <ArrowRight size={14} /> : <CornerDownLeft size={14} />}</span>
                </button>
              </div>
            )
          })}
        </div>
        <div className="flex items-center gap-4 bg-sunk px-5 py-2.5 text-[0.8125rem] text-ink-3">
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd> move
          </span>
          <span>
            <kbd>↵</kbd> open
          </span>
          <span className="ml-auto max-sm:hidden">Try tracing, mcp or postgres</span>
        </div>
      </div>
    </>
  )
}
