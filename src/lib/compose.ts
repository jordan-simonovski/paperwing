import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { canWrite, createRecord, deleteRecord, uploadBlob, useAtproto, type StrongRef } from './atproto'
import { postToMastodon } from './mastodon'
import { SUBMISSION_NSID, submissionRecord } from './paperwing'
import { feed, feedUrl } from './sources/http'
import { postHtml } from './bskyPost'
import { facetsFor, graphemes } from './facets'
import { hnComment, hnSubmit, useHn } from './hnAccount'
import { lemmyComment, lemmyPost, useLemmyAccount } from './lemmyAccount'
import type { QueryClient } from '@tanstack/react-query'
import { keys } from './query'
import { keyId } from './storyKey'
import type { Comment, Story, Thread } from './types'

// Writing from PaperWing to the open network, as the signed-in account (atproto.ts): replies and
// likes on Bluesky, a new Bluesky post about any story, and comments and votes on Frontpage. The
// records land in the reader's own repo; the thread on screen gets the new one straight away.

export type ComposeTarget =
  | { kind: 'bsky-reply'; threadKey: string; root: StrongRef; parent: StrongRef; to: string }
  /** A comment on a Lemmy post or a reply to a comment, by their addresses, through your Lemmy account. */
  | { kind: 'lemmy-reply'; threadKey: string; postApId: string; parentApId?: string; parentId?: string; to?: string }
  /** One story out to any of your networks at once (ShareSheet.tsx); `board` picks the PaperWing board to list it on. */
  | { kind: 'share'; story: Story; board?: string }
  /** Any link at all, not only stories PaperWing found: the link and its title first, then on to sharing it (PostLink.tsx). */
  | { kind: 'post-link'; url?: string; title?: string; board?: string }
  /** A self post: a title and words in Markdown, on a board or the front page (WritePost.tsx). Given one of yours, edits its words. */
  | { kind: 'self-post'; board?: string; edit?: Story }
  /** Which link to share (PaperWing's, the original, the discussion), or on to posting it. */
  | { kind: 'links'; story: Story }
  | { kind: 'fp-comment'; threadKey: string; post: StrongRef; parent?: StrongRef; to?: string }
  /** `parent` is the HN item replied to: the story itself, or a comment. */
  | { kind: 'hn-reply'; threadKey: string; parent: string; story: boolean; to?: string }

export const LIMITS: Record<ComposeTarget['kind'], number> = {
  'bsky-reply': 300,
  share: 300,
  'post-link': 0,
  'self-post': 0,
  links: 0,
  'fp-comment': 10_000,
  'hn-reply': 10_000,
  'lemmy-reply': 10_000,
}

interface ComposerState {
  target?: ComposeTarget
  open: (t: ComposeTarget) => void
  close: () => void
}

export const useComposer = create<ComposerState>()((set) => ({
  open: (target) => set({ target }),
  close: () => set({ target: undefined }),
}))

/** Opens "Post a link": for anything worth reading that PaperWing hasn't found. */
export const postLink = (from: { url?: string; title?: string; board?: string } = {}) => useComposer.getState().open({ kind: 'post-link', ...from })

/**
 * The link in what someone pasted or typed, as a full https URL: "example.com/post" works, and so
 * does a shared snippet with a title before the link. Undefined when there's no web link in it.
 */
export function linkFrom(input: string): string | undefined {
  const text = input.trim()
  const found = text.match(/https?:\/\/\S+/i)?.[0] ?? (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(text) ? `https://${text}` : undefined)
  if (!found) return undefined
  try {
    const url = new URL(found)
    return (url.protocol === 'https:' || url.protocol === 'http:') && url.hostname.includes('.') ? url.toString() : undefined
  } catch {
    return undefined
  }
}

/** Puts a new comment into the thread on screen, under its parent (or at the top). */
function addToThread(qc: QueryClient, threadKey: string, parentUri: string | undefined, comment: Comment) {
  qc.setQueryData<Thread | null>(keys.thread(threadKey), (t) => {
    if (!t) return t
    // On the story itself: the top. (Comments without an atproto ref would otherwise all "match" undefined.)
    if (parentUri === undefined) return { ...t, comments: [comment, ...t.comments] }
    const place = (cs: Comment[]): [Comment[], boolean] => {
      let found = false
      const next = cs.map((c) => {
        if (found) return c
        if (c.ref?.uri === parentUri || c.id === parentUri) {
          found = true
          return { ...c, children: [comment, ...c.children] }
        }
        const [children, inside] = place(c.children)
        if (inside) found = true
        return inside ? { ...c, children } : c
      })
      return [next, found]
    }
    const [comments, placed] = place(t.comments)
    return { ...t, comments: placed ? comments : [comment, ...t.comments] }
  })
}

/** Frontpage comments are rich-text blocks: one plain-text paragraph per block (as Frontpage's own indexer reads them). */
export const toBlocks = (text: string) =>
  text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => ({ content: { $type: 'fyi.frontpage.richtext.block#plaintextParagraph', text: p } }))

/** Sends what's in the composer. Returns where it can be seen. */
export async function send(qc: QueryClient, target: ComposeTarget, text: string): Promise<string | undefined> {
  const body = text.trim()
  if (!body) throw new Error('Write something first')
  if (graphemes(body) > LIMITS[target.kind]) throw new Error(`That's over ${LIMITS[target.kind]} characters`)
  if (target.kind === 'lemmy-reply') {
    const url = await lemmyComment(target.postApId, body, target.parentApId)
    addToThread(qc, target.threadKey, target.parentId, {
      id: `local-${Date.now()}`,
      author: useLemmyAccount.getState().user ?? 'you',
      html: postHtml(body),
      createdAt: Date.now(),
      score: 1,
      url,
      children: [],
    })
    return url
  }

  if (target.kind === 'hn-reply') {
    await hnComment(target.parent, body)
    // HN shows a new comment straight away; so does the thread here. It's your own words, as plain paragraphs.
    addToThread(qc, target.threadKey, target.story ? undefined : target.parent, {
      id: `local-${Date.now()}`,
      author: useHn.getState().user ?? 'you',
      html: postHtml(body),
      createdAt: Date.now(),
      score: 1,
      url: `https://news.ycombinator.com/item?id=${target.parent}`,
      children: [],
    })
    return `https://news.ycombinator.com/item?id=${keyId(target.threadKey, 'hn')}`
  }

  const handle = useAtproto.getState().handle ?? 'you'
  const now = new Date().toISOString()

  if (target.kind === 'fp-comment') {
    const ref = await createRecord('fyi.frontpage.feed.comment', { post: target.post, ...(target.parent ? { parent: target.parent } : {}), blocks: toBlocks(body), createdAt: now })
    addToThread(qc, target.threadKey, target.parent?.uri, { id: ref.uri, author: handle, html: postHtml(body), createdAt: Date.now(), score: 0, ref, children: [] })
    return undefined
  }

  const facets = await facetsFor(body)
  const record: Record<string, unknown> = { text: body, createdAt: now, langs: [navigator.language?.split('-')[0] || 'en'], ...(facets.length ? { facets } : {}) }
  if (target.kind === 'share' || target.kind === 'links' || target.kind === 'post-link' || target.kind === 'self-post') throw new Error('Share from the share sheet')
  record.reply = { root: target.root, parent: target.parent }
  const ref = await createRecord('app.bsky.feed.post', record)
  const web = `https://bsky.app/profile/${handle}/post/${ref.uri.split('/').pop()}`
  if (target.kind === 'bsky-reply') {
    addToThread(qc, target.threadKey, target.parent.uri === target.root.uri ? undefined : target.parent.uri, {
      id: ref.uri,
      author: handle,
      html: postHtml(body),
      createdAt: Date.now(),
      score: 0,
      url: web,
      ref,
      children: [],
    })
  }
  return web
}

/** Likes and votes made from here, by what they're on: so they can be shown, and taken back. */
interface Reactions {
  /** Subject at:// URI -> the like or vote record's URI. */
  made: Record<string, string>
  set: (subject: string, record?: string) => void
}

export const useReactions = create<Reactions>()(
  persist(
    (set) => ({
      made: {},
      set: (subject, record) =>
        set((s) => {
          const made = { ...s.made }
          if (record) made[subject] = record
          else delete made[subject]
          return { made }
        }),
    }),
    { name: 'readout:reactions', version: 1, partialize: ({ made }) => ({ made }) },
  ),
)

/**
 * Likes being written or taken back, by subject. A press meanwhile shares that result: a like's
 * address is only known once it's written, so a second write would leave one taking back could
 * never remove.
 */
const liking = new Map<string, Promise<boolean>>()

/** Likes a Bluesky post, or votes on a Frontpage post or comment; again takes it back. */
export async function react(kind: 'like' | 'vote', subject: StrongRef): Promise<boolean> {
  const pending = liking.get(subject.uri)
  if (pending) return pending
  const { made, set } = useReactions.getState()
  const existing = made[subject.uri]
  // Taking back is in flight too: a press meanwhile shares its result rather than writing a like.
  const write = existing
    ? (set(subject.uri),
      deleteRecord(existing).then(
        () => false,
        (err: unknown) => {
          set(subject.uri, existing)
          throw err
        },
      ))
    : createRecord(kind === 'like' ? 'app.bsky.feed.like' : 'fyi.frontpage.feed.vote', { subject, createdAt: new Date().toISOString() }).then((ref) => {
        set(subject.uri, ref.uri)
        return true
      })
  const shared = write.finally(() => liking.delete(subject.uri))
  liking.set(subject.uri, shared)
  return shared
}

/* ---------------------------------------------------------------- sharing */

export type ShareNetwork = 'bluesky' | 'hn' | 'mastodon' | 'lemmy'
export interface ShareInput {
  story: Story
  title: string
  /** What you make of it: the post's words on Bluesky and Mastodon. */
  take: string
  /** Also list it on PaperWing, on this board (a topic id) or the front page only. */
  paperwing: boolean
  /** On a community board, also on PaperWing's front page (it stays on its board otherwise). */
  front?: boolean
  board?: string
  /** The Lemmy community to post it in ("world@lemmy.world"). */
  community?: string
  to: ShareNetwork[]
}
export interface ShareResult {
  network: ShareNetwork
  ok: boolean
  url?: string
  note?: string
  error?: string
}

export const shareLink = (s: Story) => s.url ?? s.discussionUrl ?? undefined
export const SHARE_LIMITS = { bluesky: 300, mastodon: 500, hn: 80, lemmy: 200 } as const
export const blueskyText = (i: Pick<ShareInput, 'take' | 'title'>) => i.take.trim() || i.title.trim()
export const mastodonText = (i: Pick<ShareInput, 'take' | 'title'>, link: string) => `${i.take.trim() || i.title.trim()}\n\n${link}`

/** The link card: the page's own words where we can get them, and its picture uploaded to your repo. */
async function linkCard(url: string, title: string): Promise<Record<string, unknown>> {
  const card = (await feed('card', { url }).catch(() => ({}))) as { title?: string; description?: string }
  const external: Record<string, unknown> = { uri: url, title: title.slice(0, 300), description: (card.description ?? '').slice(0, 1000) }
  if ((useAtproto.getState().scope ?? 'blob:').includes('blob:')) {
    try {
      const res = await fetch(feedUrl('cardimage', { url }))
      if (res.status === 200) external.thumb = await uploadBlob(await res.blob())
    } catch {
      /* a card without a picture is still a card */
    }
  }
  return { $type: 'app.bsky.embed.external', external }
}

async function shareToBluesky(i: ShareInput, link: string): Promise<ShareResult> {
  const text = blueskyText(i)
  if (graphemes(text) > SHARE_LIMITS.bluesky) throw new Error(`Bluesky posts are ${SHARE_LIMITS.bluesky} characters at most`)
  if (i.paperwing && canWrite(useAtproto.getState().scope, SUBMISSION_NSID) === false) throw new Error('Listing on PaperWing needs one more permission: allow it under Settings, Sources.')
  const facets = await facetsFor(text)
  const ref = await createRecord('app.bsky.feed.post', {
    text,
    createdAt: new Date().toISOString(),
    langs: [navigator.language?.split('-')[0] || 'en'],
    ...(facets.length ? { facets } : {}),
    embed: await linkCard(link, i.title),
  })
  const handle = useAtproto.getState().handle ?? useAtproto.getState().did
  const url = `https://bsky.app/profile/${handle}/post/${ref.uri.split('/').pop()}`
  if (!i.paperwing) return { network: 'bluesky', ok: true, url }
  // The post is up either way; the listing is what makes it a PaperWing submission.
  try {
    await createRecord(SUBMISSION_NSID, submissionRecord(ref, link, i.title.trim(), i.board, { front: i.front }) as unknown as Record<string, unknown>)
    return { network: 'bluesky', ok: true, url, note: 'Posted, and listed on PaperWing' }
  } catch (err) {
    return { network: 'bluesky', ok: true, url, note: `Posted, but not listed on PaperWing: ${(err as Error).message}` }
  }
}

async function shareToHn(i: ShareInput, link: string): Promise<ShareResult> {
  const data = await hnSubmit(i.title.trim(), link)
  return { network: 'hn', ok: true, url: data.url, note: data.existing ? 'Already on Hacker News: here’s that thread' : undefined }
}

/** Shares a story to every network asked for, side by side. One failing doesn't stop the others. */
export async function shareStory(i: ShareInput): Promise<ShareResult[]> {
  const link = shareLink(i.story)
  if (!link) throw new Error('This story has no link to share')
  if (!i.title.trim()) throw new Error('Add a title')
  const runs: Record<ShareNetwork, () => Promise<ShareResult>> = {
    bluesky: () => shareToBluesky(i, link),
    hn: () => shareToHn(i, link),
    mastodon: async () => ({ network: 'mastodon', ok: true, url: await postToMastodon(mastodonText(i, link)) }),
    lemmy: async () => {
      if (!i.community) throw new Error('Pick a community to post it in')
      return { network: 'lemmy', ok: true, url: await lemmyPost(i.community, i.title.trim(), link, i.take.trim() || undefined), note: `Posted to c/${i.community.split('@')[0]}` }
    },
  }
  const settled = await Promise.allSettled(i.to.map((n) => runs[n]()))
  return settled.map((r, k) => (r.status === 'fulfilled' ? r.value : { network: i.to[k], ok: false, error: (r.reason as Error).message }))
}
