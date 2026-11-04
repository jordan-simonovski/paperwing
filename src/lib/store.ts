import type { JoinedBoard } from './boards'
import type { FollowedPerson } from './people'
import type { ReaderKind } from './pretext/actors'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { fade, learn, storyFeatures } from './features'
import type { MixSource } from './mixSources'
import type { Labeler, WarningMode } from './moderation'
import type { Story } from './types'
import { capLooks, firstLookThisVisit, look, type Glimpse } from './visits'
import type { PublisherFeed } from './publishers'

export interface Interest {
  id: string
  label: string
  query: string
}

/** A Bluesky custom feed or list, followed as its own channel. */
export interface BlueskyFeed {
  uri: string
  name: string
}

/** A channel you built from any sources; `published` is its record in your atproto repo, `feed` its Bluesky feed. */
export interface Mix {
  id: string
  name: string
  description?: string
  sources: MixSource[]
  published?: string
  feed?: string
  updatedAt: number
}

/** Someone's published mix that you follow, with its sources as last read. */
export interface FollowedMix {
  uri: string
  name: string
  by: string
  description?: string
  sources: MixSource[]
  fetchedAt: number
}

/** A Lemmy community you've joined, read through lemmy.world: "world@lemmy.world". */
export interface LemmyCommunity {
  name: string
  title: string
  icon?: string
}

export type CustomFeed = PublisherFeed

/** A site you've opened stories from: the stories (newest last, a handful kept) and when. */
export interface SiteVisits {
  keys: string[]
  last: number
  /** One of its links, to find its feed from. */
  url: string
}

export interface Prefs {
  theme: 'system' | 'light' | 'dark'
  textSize: 'sm' | 'md' | 'lg'
  density: 'comfortable' | 'compact'
  showExcerpts: boolean
  thumbnails: boolean
  /** Chillies on heated discussions (spice.ts). */
  spice: boolean
  /** Comments likely to give away a film, show, book or game's plot folded until tapped (spice.ts). */
  hideSpoilers: boolean
  /** Each reply depth's rail in its own colour, so you can tell who's answering whom. */
  threadColours: boolean
  /** Pip dresses for the season (season.ts). */
  seasonal: boolean
  hideRead: boolean
  /** Pretext motion: headlines that fly into place, typesetting loaders, the reading orb. Off for plain transitions. */
  pretext: boolean
  /** Within pretext motion: feed headlines settling in on every feed change (moves.ts). */
  feedMotion: boolean
  /** What moves through the summary card while Claude reads. */
  summaryLoader: ReaderKind | 'plain'
  followed: string[]
  /** Has picked what to read: a new install starts on the welcome page until then. */
  welcomed: boolean
  /** Moments this device has had explained once already (firsts.ts). */
  firsts: string[]
  /** How feeds open: ranked (hot), or latest first, straight from each source's newest posts. */
  feedOrder: 'ranked' | 'latest'
  customFeeds: CustomFeed[]
  /** Bluesky feeds and lists you follow as channels. */
  bskyFeeds: BlueskyFeed[]
  /** Lemmy communities joined as channels. */
  communities: LemmyCommunity[]
  /** Channels you built, and other people's that you follow. */
  mixes: Mix[]
  followedMixes: FollowedMix[]
  /** People you follow on PaperWing: their listings come into For you. */
  people: FollowedPerson[]
  /** Community boards you've joined. */
  boards: JoinedBoard[]
  /** Suggest posts from boards you haven't joined in For you. */
  boardPicks: boolean
  /** PaperWing's announcements: off, they're left out of For you and never pinned. */
  announcements: boolean
  /** Every picture you post needs a description before it can go. */
  requireAlt: boolean
  /** Your feeds shown on your PaperWing profile as a blogroll (io.paperwing.blogroll). */
  blogrollPublic: boolean
  interests: Interest[]
  mutedWords: string[]
  mutedDomains: string[]
  /** Bluesky labelers you subscribe to, beyond Bluesky's own moderation. */
  labelers: Labeler[]
  /** How posts behind a content warning show. */
  warnings: WarningMode
  /** GitHub repositories (owner/name) whose releases you follow, beyond your topics' own. */
  releaseRepos: string[]
  /** Status pages you follow beyond the built-in ones (api/_lib/statuspages.ts), by host and the name they gave. */
  statusPages: { host: string; name: string }[]
  /** Your taste profile: feature (see features.ts: `t:<topic>`, `d:<site>`, `k:<keyword>`…) to weight, from -3 (fewer) to 3 (more). */
  affinity: Record<string, number>
  /** When the profile last learned something: it fades from then (features.ts, fade) as the next lesson comes in. */
  affinityAt: number
  /** When a synced preference last changed here, so sync can tell whose is newer. */
  syncedPrefsAt: number
  set: (patch: Partial<Omit<Prefs, 'set' | 'toggleFollow' | 'addInterest' | 'nudge' | 'learn'>>) => void
  /** Moves these exact features by delta ("more" or "fewer" on one topic or site). */
  nudge: (keys: string[], delta: number) => void
  /**
   * Moves the profile towards a story's features, or away with a negative delta: scaled by LESSON.
   * A passive lesson (staying with a story, passing one on) doesn't make this device's settings
   * newer for sync: it rides along with the next thing you choose, never over another device's.
   * `spareLiked` leaves what you already like alone (a pass is volume, not a verdict).
   */
  learn: (story: Story & { topics?: string[] }, delta: number, how?: { passive?: boolean; spareLiked?: boolean }) => void
  toggleFollow: (id: string) => void
  addInterest: (query: string) => Interest
}

/** Preferences that follow you between devices. Display settings stay per device. */
export const SYNCED_PREFS = [
  'followed',
  'interests',
  'customFeeds',
  'bskyFeeds',
  'communities',
  'mixes',
  'followedMixes',
  'people',
  'blogrollPublic',
  'boards',
  'boardPicks',
  'announcements',
  'requireAlt',
  'mutedWords',
  'mutedDomains',
  'labelers',
  'releaseRepos',
  'statusPages',
  'affinity',
  'affinityAt',
] as const
export type SyncedPrefs = Pick<Prefs, (typeof SYNCED_PREFS)[number]>

export const usePrefs = create<Prefs>()(
  persist(
    (set, get) => ({
      theme: 'system',
      textSize: 'md',
      density: 'comfortable',
      showExcerpts: true,
      thumbnails: true,
      spice: true,
      hideSpoilers: true,
      threadColours: false,
      seasonal: true,
      hideRead: false,
      pretext: true,
      feedMotion: false,
      summaryLoader: 'mascot',
      // A new install picks its own on the welcome page.
      followed: [],
      welcomed: false,
      firsts: [],
      feedOrder: 'ranked',
      customFeeds: [],
      bskyFeeds: [],
      communities: [],
      mixes: [],
      followedMixes: [],
      people: [],
      blogrollPublic: false,
      boards: [],
      boardPicks: true,
      announcements: true,
      requireAlt: true,
      interests: [],
      mutedWords: [],
      mutedDomains: [],
      labelers: [],
      warnings: 'blur',
      releaseRepos: [],
      statusPages: [],
      affinity: {},
      affinityAt: 0,
      syncedPrefsAt: 0,
      set: (patch) => set(SYNCED_PREFS.some((k) => k in patch) ? { ...patch, syncedPrefsAt: Date.now() } : patch),
      nudge: (keys, delta) =>
        set((s) => {
          const now = Date.now()
          const affinity = { ...faded(s.affinity, s.affinityAt, now) }
          for (const k of keys) {
            const v = Math.max(-3, Math.min(3, Math.round(((affinity[k] ?? 0) + delta) * 10) / 10))
            if (v === 0) delete affinity[k]
            else affinity[k] = v
          }
          return { affinity, affinityAt: now, syncedPrefsAt: now }
        }),
      learn: (story, delta, how = {}) =>
        set((s) => {
          const now = Date.now()
          const profile = faded(s.affinity, s.affinityAt, now)
          const features = storyFeatures(story)
          const liked = (k: string) => (profile[k] ?? 0) > 0
          if (how.spareLiked && [...features.keys()].every(liked)) return {}
          return { affinity: learn(profile, features, delta, how.spareLiked ? liked : undefined), affinityAt: now, ...(how.passive ? {} : { syncedPrefsAt: now }) }
        }),
      toggleFollow: (id) => set((s) => ({ followed: s.followed.includes(id) ? s.followed.filter((f) => f !== id) : [...s.followed, id], syncedPrefsAt: Date.now() })),
      addInterest: (query) => {
        const q = query.trim()
        const id = `q:${q.toLowerCase()}`
        const existing = get().interests.find((i) => i.id === id)
        if (existing) return existing
        const interest = { id, label: q, query: q }
        set((s) => ({ interests: [...s.interests, interest], followed: [...s.followed, id], syncedPrefsAt: Date.now() }))
        return interest
      },
    }),
    {
      name: 'readout:prefs',
      version: 6,
      // v2 dropped Reddit, and with it the subreddit list. v3 turned Pretext motion off while it was
      // experimental; v4 turns it back on, now that the feed animation is a gentle settle. v5 added
      // the welcome page, which anyone already reading has no need for. v6 made the feed headline
      // animation opt-in.
      migrate: (state, version) => {
        const s = state as Partial<Prefs> & { subreddits?: string[] }
        if (version < 2) delete s.subreddits
        if (version < 4) s.pretext = true
        if (version < 5) s.welcomed = true
        // v6: feed headlines no longer fade in on every topic change unless you turn it on (it read as a flicker).
        if (version < 6) s.feedMotion = false
        return s as Prefs
      },
    },
  ),
)

const CAP = 5000
function capped(map: Record<string, number>): Record<string, number> {
  const entries = Object.entries(map)
  if (entries.length <= CAP) return map
  return Object.fromEntries(entries.sort((a, b) => b[1] - a[1]).slice(0, CAP * 0.8))
}

/**
 * How much each signal teaches the taste profile: a vote the most, a save half that, a hide less;
 * staying with a story a little, and opening one, or passing one on three visits without opening
 * it, less still. A tap is interest, but a headline can earn one the story doesn't. Lessons this
 * faint mostly move a story's topics and site: a new keyword's share falls under the profile's
 * floor (features.ts learn), so keywords are left to the stronger signals.
 */
export const LESSON = { vote: 1.5, save: 0.75, hide: 0.6, linger: 0.3, open: 0.15, pass: 0.15 }
/** Visits a story is passed on, unopened, before that teaches the profile anything. */
const PASSED_ON = 3

/** The profile as it stands now: faded since it last learned (from 0, never touched, it doesn't fade). */
const faded = (affinity: Record<string, number>, at: number, now: number) => (at ? fade(affinity, (now - at) / 86_400_000) : affinity)

/** Votes keep their newest 2,000: insertion order is vote order. */
function capVotes(votes: Record<string, 1 | -1>): Record<string, 1 | -1> {
  const keys = Object.keys(votes)
  return keys.length <= 2000 ? votes : Object.fromEntries(keys.slice(-1600).map((k) => [k, votes[k]]))
}

interface Activity {
  /** key -> when it was opened. Read rows are dimmed. */
  read: Record<string, number>
  hidden: Record<string, number>
  /** key -> previous visit to its thread, so new comments can be highlighted. */
  visits: Record<string, number>
  /** key -> how many visits the row was on screen (visits.ts). Hot sinks what you saw on earlier ones. */
  impressions: Record<string, number>
  /** key -> its latest look and the one before this visit: when, and its comments then (visits.ts). */
  glimpses: Record<string, Glimpse>
  /** Your votes: 1 up, -1 down. They stay on this device; what they taught the ranking syncs. */
  votes: Record<string, 1 | -1>
  /** Sites you've opened stories from, by host: what "blogs you keep reading" is worked out from. */
  sites: Record<string, SiteVisits>
  /** Counts a story you opened towards its site. Once per story. */
  noteSite: (key: string, url: string) => void
  /** Votes a story up or down, or takes the vote back when it's the same direction again. */
  vote: (story: Story & { topics?: string[] }, dir: 1 | -1) => void
  /** A row was on screen: counted once a visit, with its comments then. Passed on three visits unopened teaches the profile a little. */
  noteImpression: (story: Story & { topics?: string[] }) => void
  /** key -> when you stayed with it long enough for that to teach the profile (once a story). */
  lingered: Record<string, number>
  /** You stayed with a story: teaches the profile a little, once. */
  linger: (story: Story & { topics?: string[] }) => void
  /** key -> when opening it taught the profile (once a story). */
  opened: Record<string, number>
  /** You opened a story: teaches the profile a little, once. */
  noteOpen: (story: Story & { topics?: string[] }) => void
  markRead: (key: string) => void
  toggleHidden: (key: string) => void
  /** Records a thread visit and returns the time of the previous one. */
  visit: (key: string) => number | undefined
}

export const useActivity = create<Activity>()(
  persist(
    (set, get) => ({
      read: {},
      hidden: {},
      visits: {},
      impressions: {},
      glimpses: {},
      lingered: {},
      opened: {},
      votes: {},
      sites: {},
      noteSite: (key, url) => {
        let host: string
        try {
          host = new URL(url).hostname.replace(/^www\./, '')
        } catch {
          return
        }
        const was = get().sites[host]
        if (was?.keys.includes(key)) return
        set((s) => {
          const sites = { ...s.sites, [host]: { keys: [...(was?.keys ?? []), key].slice(-12), last: Date.now(), url } }
          // The 300 most recent sites are plenty to suggest from.
          const hosts = Object.keys(sites)
          return {
            sites:
              hosts.length <= 300
                ? sites
                : Object.fromEntries(
                    hosts
                      .sort((a, b) => sites[b].last - sites[a].last)
                      .slice(0, 240)
                      .map((h) => [h, sites[h]]),
                  ),
          }
        })
      },
      vote: (story, dir) => {
        const before = get().votes[story.key] ?? 0
        const after = before === dir ? 0 : dir
        set((s) => {
          const votes = { ...s.votes }
          if (after) votes[story.key] = after
          else delete votes[story.key]
          return { votes: capVotes(votes) }
        })
        // Switching from down to up undoes the downvote's lesson and teaches the upvote's.
        usePrefs.getState().learn(story, (after - before) * LESSON.vote)
      },
      noteImpression: (story) => {
        const { key, comments } = story
        // Once a visit: scrolling past the same row twice in one sitting isn't a second look.
        if (!firstLookThisVisit(key)) return
        const looks = (get().impressions[key] ?? 0) + 1
        set((s) => capLooks({ ...s.impressions, [key]: looks }, { ...s.glimpses, [key]: look(s.glimpses[key], comments) }, CAP, CAP * 0.8))
        // Passed on, unopened, visit after visit: a faint lesson, once. Never against what you already
        // like: passing on stories about it is volume, not a verdict.
        if (looks === PASSED_ON && !get().read[key]) usePrefs.getState().learn(story, -LESSON.pass, { passive: true, spareLiked: true })
      },
      linger: (story) => {
        if (get().lingered[story.key]) return
        set((s) => ({ lingered: capped({ ...s.lingered, [story.key]: Date.now() }) }))
        usePrefs.getState().learn(story, LESSON.linger, { passive: true })
      },
      noteOpen: (story) => {
        if (get().opened[story.key]) return
        set((s) => ({ opened: capped({ ...s.opened, [story.key]: Date.now() }) }))
        usePrefs.getState().learn(story, LESSON.open, { passive: true })
      },
      markRead: (key) => {
        if (!get().read[key]) set((s) => ({ read: capped({ ...s.read, [key]: Date.now() }) }))
      },
      toggleHidden: (key) =>
        set((s) => {
          const hidden = { ...s.hidden }
          if (hidden[key]) delete hidden[key]
          else hidden[key] = Date.now()
          return { hidden: capped(hidden) }
        }),
      visit: (key) => {
        const previous = get().visits[key]
        set((s) => ({ visits: capped({ ...s.visits, [key]: Date.now() }) }))
        return previous
      },
    }),
    { name: 'readout:activity', version: 1 },
  ),
)
