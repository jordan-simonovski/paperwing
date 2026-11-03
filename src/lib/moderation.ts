import type { Comment, Story } from './types'

// Moderation for the open network. Bluesky posts carry labels from labelers: Bluesky's own
// moderation service, any third-party labelers you subscribe to, and authors' own ("this is
// graphic"). Mastodon posts carry the author's content warning. Here a label becomes one of
// three outcomes: hidden, behind a warning, or ignored. Muted words apply everywhere, comments
// included.

export const BSKY_MODERATION = 'did:plc:ar7c4by46qjdydhdevvrndac'

export type LabelSetting = 'hide' | 'warn' | 'ignore'
export interface LabelDef {
  name: string
  setting: LabelSetting
  /** Only the pictures need covering, not the words. */
  media?: boolean
}

/** A labeler you subscribe to: its own label values, as it defines them. */
export interface Labeler {
  did: string
  name: string
  handle?: string
  defs: Record<string, LabelDef>
}

/** How warnings show: covered until tapped, shown with a note, or left out of feeds altogether. */
export type WarningMode = 'blur' | 'show' | 'hide'

// Values any labeler (or the author) can apply, with Bluesky's defaults.
const GLOBAL: Record<string, LabelDef> = {
  '!hide': { name: 'Hidden by moderators', setting: 'hide' },
  '!warn': { name: 'Content warning', setting: 'warn' },
  porn: { name: 'Adult content', setting: 'hide', media: true },
  sexual: { name: 'Sexual content', setting: 'warn', media: true },
  nudity: { name: 'Nudity', setting: 'warn', media: true },
  'graphic-media': { name: 'Graphic media', setting: 'warn', media: true },
  gore: { name: 'Graphic media', setting: 'warn', media: true },
}
/** What authors may say about their own posts. */
const SELF = new Set(['porn', 'sexual', 'nudity', 'graphic-media', 'gore', '!warn'])

// Bluesky's own moderation service's values beyond the global ones, with its default settings.
const BLUESKY: Record<string, LabelDef> = {
  spam: { name: 'Spam', setting: 'hide' },
  scam: { name: 'Scam', setting: 'hide' },
  impersonation: { name: 'Impersonation', setting: 'hide' },
  threat: { name: 'Threats', setting: 'hide' },
  security: { name: 'Security concerns', setting: 'hide' },
  'engagement-farming': { name: 'Engagement farming', setting: 'hide' },
  intolerant: { name: 'Intolerance', setting: 'warn' },
  'self-harm': { name: 'Self-harm', setting: 'warn' },
  misleading: { name: 'Misleading', setting: 'warn' },
  'unsafe-link': { name: 'Unsafe link', setting: 'warn' },
  rude: { name: 'Rude', setting: 'warn' },
  extremist: { name: 'Extremist', setting: 'warn' },
}

export interface Verdict {
  hide?: boolean
  /** Why it's covered, e.g. "Graphic media". */
  warning?: string
  /** Only its pictures are covered. */
  mediaOnly?: boolean
}

/** What a set of labels comes to, given the labelers you subscribe to. */
export function judge(labels: { src: string; val: string }[] | undefined, author: string | undefined, labelers: Labeler[]): Verdict {
  if (!labels?.length) return {}
  const warnings: LabelDef[] = []
  for (const { src, val } of labels) {
    const sub = labelers.find((l) => l.did === src)
    const def = (src === BSKY_MODERATION || sub ? (GLOBAL[val] ?? (src === BSKY_MODERATION ? BLUESKY[val] : sub?.defs[val])) : undefined) ?? (src === author && SELF.has(val) ? GLOBAL[val] : undefined)
    if (!def || def.setting === 'ignore') continue
    if (def.setting === 'hide') return { hide: true, warning: def.name }
    warnings.push(def)
  }
  if (!warnings.length) return {}
  return { warning: [...new Set(warnings.map((w) => w.name))].join(', '), mediaOnly: warnings.every((w) => w.media) }
}

/** The header that asks Bluesky's AppView for your labelers' labels as well as its own. */
export const acceptLabelers = (labelers: Labeler[]) => [`${BSKY_MODERATION};redact`, ...labelers.map((l) => l.did)].join(', ')

const lower = (words: string[]) => words.map((w) => w.trim().toLowerCase()).filter(Boolean)
const plain = (html: string) => html.replace(/<[^>]+>/g, ' ').toLowerCase()

/** A story with its verdict applied: undefined when it shouldn't show at all. */
export function moderateStory<T extends Story>(s: T, labelers: Labeler[], mode: WarningMode): T | undefined {
  const v = judge(s.labels, s.authorDid, labelers)
  const warning = v.warning ?? s.warning
  if (v.hide || (warning && mode === 'hide')) return undefined
  return warning ? { ...s, warning, warnMediaOnly: v.warning ? v.mediaOnly : s.warnMediaOnly } : s
}

/**
 * Comments with muted words and hidden labels folded away (their replies stay reachable), warnings
 * marked, and likely spoilers (by comment id) folded too.
 */
export function moderateComments(comments: Comment[], mutedWords: string[], labelers: Labeler[], spoilers?: ReadonlySet<string>): Comment[] {
  const muted = lower(mutedWords)
  const walk = (cs: Comment[]): Comment[] =>
    cs.map((c) => {
      const v = judge(c.labels, c.authorDid, labelers)
      const text = plain(c.html)
      const word = muted.find((w) => text.includes(w))
      const fold =
        (v.hide ? `Hidden: ${v.warning}` : word ? 'Contains a word you muted' : v.warning ? `Content warning: ${v.warning}` : c.warning) ?? (spoilers?.has(c.id) ? 'Possible spoiler' : undefined)
      return { ...c, folded: fold, children: walk(c.children) }
    })
  return walk(comments)
}

interface LabelerView {
  creator: { did: string; handle: string; displayName?: string }
  policies: {
    labelValues: string[]
    labelValueDefinitions?: { identifier: string; defaultSetting?: string; blurs?: string; locales: { lang: string; name: string }[] }[]
  }
}

/** A labeler's own definitions, as it publishes them, in a form judge() reads. */
export function labelerFrom(view: LabelerView): Labeler {
  const defs: Record<string, LabelDef> = {}
  for (const d of view.policies.labelValueDefinitions ?? []) {
    const locale = d.locales.find((l) => navigator.language?.startsWith(l.lang)) ?? d.locales.find((l) => l.lang.startsWith('en')) ?? d.locales[0]
    const setting: LabelSetting = d.defaultSetting === 'hide' ? 'hide' : d.defaultSetting === 'ignore' ? 'ignore' : 'warn'
    defs[d.identifier] = { name: locale?.name ?? d.identifier, setting, media: d.blurs === 'media' }
  }
  return { did: view.creator.did, name: view.creator.displayName || view.creator.handle, handle: view.creator.handle, defs }
}

/** Finds a labeler by handle, profile link or DID, and reads its definitions. */
export async function findLabeler(input: string): Promise<Labeler> {
  let who = input.trim().replace(/^@/, '')
  const link = /bsky\.app\/profile\/([^/?#]+)/.exec(who)
  if (link) who = decodeURIComponent(link[1])
  if (!who.startsWith('did:')) {
    const res = await fetch(`/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(who.toLowerCase())}`)
    if (!res.ok) throw new Error(`Couldn't find ${who}`)
    who = ((await res.json()) as { did: string }).did
  }
  if (who === BSKY_MODERATION) throw new Error('Bluesky’s own moderation is always on')
  const res = await fetch(`https://public.api.bsky.app/xrpc/app.bsky.labeler.getServices?dids=${encodeURIComponent(who)}&detailed=true`)
  if (!res.ok) throw new Error('Couldn’t reach Bluesky')
  const { views } = (await res.json()) as { views: LabelerView[] }
  if (!views[0]) throw new Error('That account isn’t a labeler')
  return labelerFrom(views[0])
}

/** Changes what one of a labeler's labels does. */
export const withSetting = (l: Labeler, val: string, setting: LabelSetting): Labeler => ({ ...l, defs: { ...l.defs, [val]: { ...l.defs[val], setting } } })
