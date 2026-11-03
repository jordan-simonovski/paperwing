import { canUpdate, canUpload, canWrite, createRecord, getOwnRecord, putRecord, uploadBlob, useAtproto, type StrongRef } from './atproto'
import { facetsFor, graphemes, type Facet } from './facets'
import { MAX_ALT, MAX_IMAGES } from './images'
import { markdownHtml, markdownText } from './markdown'
import { BODY_LIMIT, newTid, SELF_LINK_TEXT, selfPostUrl, SUBMISSION_NSID, submissionRecord, type SelfPostBody } from './paperwing'
import { api } from './sources/http'
import { storyKey } from './storyKey'
import type { Media, Story } from './types'

// Self posts: a title and words in Markdown, listed on PaperWing like a link. The Bluesky post holds
// the title, a snippet and a link to the post's own page here; the words are in the submission
// record beside it, at the same key, where they can be edited (the title can't: it's the post's).
// A post can carry up to four pictures instead of (or as well as) words: they're uploaded to the
// poster's own account and the Bluesky post is an image post, whose link back is in its words.

/** A picture made ready to post (images.ts), with its description. */
export interface PostImage {
  blob: Blob
  width: number
  height: number
  alt: string
}

/** Bluesky's self-labels a poster can put on their own pictures. */
export type ContentLabel = 'nudity' | 'sexual' | 'porn' | 'graphic-media'

const POST_LIMIT = 300

/** The Bluesky post's words: the title, then as much of the body as fits, cut at a word. */
export function postText(title: string, body: string, reserve = 0): string {
  const head = [...title.trim()].slice(0, POST_LIMIT - reserve).join('')
  const snippet = markdownText(body)
  const room = POST_LIMIT - reserve - graphemes(head) - 2
  if (!snippet || room < 20) return head
  if (graphemes(snippet) <= room) return `${head}\n\n${snippet}`
  const cut = [...snippet].slice(0, room - 1).join('')
  return `${head}\n\n${cut.replace(/\s+\S*$/, '')}…`
}

const handleOrDid = () => useAtproto.getState().handle ?? useAtproto.getState().did

/** A self post as a story, for the thread on screen before Bluesky has it. */
function asStory(ref: { uri: string; cid: string }, title: string, body: string, now: number, media?: Media[]): Story {
  return {
    key: storyKey({ kind: 'bs', uri: ref.uri }),
    source: 'bluesky',
    sourceLabel: 'PaperWing',
    title,
    url: null,
    discussionUrl: `https://bsky.app/profile/${handleOrDid()}/post/${ref.uri.split('/').pop()}`,
    author: useAtproto.getState().handle,
    authorDid: useAtproto.getState().did,
    score: 0,
    comments: 0,
    createdAt: now,
    ...(body ? { text: markdownHtml(body), selfPost: { body, versions: [{ body, seenAt: now }] } } : {}),
    ...(media?.length ? { media } : {}),
    hasThread: true,
    ref,
  }
}

export interface SelfPostInput {
  title: string
  /** Markdown. */
  body: string
  /** A topic id or a community board's at:// URI. */
  board?: string
  /** On a community board, also on PaperWing's front page. */
  front?: boolean
  /** Up to four pictures: then the words are optional. */
  images?: PostImage[]
  /** Every picture needs a description (the reader's setting; on unless they turned it off). */
  requireAlt?: boolean
  /** A content warning on the pictures, as Bluesky's self-label. */
  label?: ContentLabel
}

/** Posts a self post: the Bluesky post, then its words beside it. Returns its key and the story to show. */
export async function writeSelfPost(i: SelfPostInput): Promise<{ key: string; story: Story }> {
  const title = i.title.trim()
  const body = i.body.trim()
  const images = i.images ?? []
  if (!title) throw new Error('Add a title')
  if (!body && !images.length) throw new Error('Write something first, or add a picture')
  if (images.length > MAX_IMAGES) throw new Error('Bluesky takes four pictures to a post')
  if (i.requireAlt && images.some((im) => !im.alt.trim())) throw new Error('Describe every picture first')
  if (body.length > BODY_LIMIT) throw new Error(`That’s over ${BODY_LIMIT.toLocaleString()} characters`)
  const { did, scope } = useAtproto.getState()
  if (!did) throw new Error('Sign in with Bluesky to post')
  if (canWrite(scope, SUBMISSION_NSID) === false) throw new Error('Posting to PaperWing needs one more permission: allow it under Settings, Sources.')
  if (images.length && canUpload(scope) === false) throw new Error('Posting pictures needs one more permission: allow it under Settings, Sources.')

  // One key for both records, chosen now: the post links to its own page, which is named by it.
  const rkey = newTid()
  const uri = `at://${did}/app.bsky.feed.post/${rkey}`
  const url = selfPostUrl(uri)
  // A picture post has no room for a link card (a post carries pictures or a card): it links back in its words.
  const words = postText(title, body, images.length ? SELF_LINK_TEXT.length + 2 : 0)
  const facets: Facet[] = await facetsFor(words)
  let text = words
  if (images.length) {
    text = `${words}\n\n${SELF_LINK_TEXT}`
    const start = new TextEncoder().encode(`${words}\n\n`).length
    facets.push({ index: { byteStart: start, byteEnd: start + SELF_LINK_TEXT.length }, features: [{ $type: 'app.bsky.richtext.facet#link', uri: url }] })
  }
  const uploaded = await Promise.all(images.map((im) => uploadBlob(im.blob)))
  const now = Date.now()
  const ref = await createRecord(
    'app.bsky.feed.post',
    {
      text,
      createdAt: new Date(now).toISOString(),
      langs: [navigator.language?.split('-')[0] || 'en'],
      ...(facets.length ? { facets } : {}),
      embed: images.length
        ? {
            $type: 'app.bsky.embed.images',
            images: images.map((im, n) => ({ image: uploaded[n], alt: im.alt.trim().slice(0, MAX_ALT), aspectRatio: { width: im.width, height: im.height } })),
          }
        : { $type: 'app.bsky.embed.external', external: { uri: url, title: title.slice(0, 300), description: markdownText(body).slice(0, 1000) } },
      // A content warning is for the pictures: a post without any carries none.
      ...(i.label && images.length ? { labels: { $type: 'com.atproto.label.defs#selfLabels', values: [{ val: i.label }] } } : {}),
    },
    rkey,
  )
  // Shown straight away, before Bluesky has it: the pictures as they are on this device.
  const media: Media[] = images.map((im) => {
    const local = URL.createObjectURL(im.blob)
    return { kind: 'image', thumb: local, full: local, alt: im.alt.trim() || undefined, aspect: im.width / im.height }
  })
  return saveWords({ ref, rkey, url, title, board: i.board, front: i.front, createdAt: now, media }, body)
}

/** A self post whose Bluesky post is up, waiting on its words: saving them again never posts twice. */
export interface PendingSelfPost {
  ref: StrongRef
  rkey: string
  url: string
  title: string
  board?: string
  front?: boolean
  createdAt: number
  /** Its pictures, as shown before Bluesky has them: with pictures, words are optional. */
  media?: Media[]
}

/** The Bluesky post went out but its words didn't save. `pending` saves them again (saveWords) without a second post. */
export class WordsNotSaved extends Error {
  constructor(
    message: string,
    readonly pending: PendingSelfPost,
  ) {
    super(message)
  }
}

/**
 * Writes the words once, returning the words that are there now. An answer can be lost after the
 * record was written: if it's there, it saved, and different words in it are replaced where the
 * sign-in may (or reported as what's there, where it may not).
 */
async function writeWords(p: PendingSelfPost, body: string): Promise<string> {
  const record = submissionRecord(p.ref, p.url, p.title, p.board, { front: p.front, body }) as unknown as Record<string, unknown>
  try {
    await createRecord(SUBMISSION_NSID, record, p.rkey)
    return body
  } catch (err) {
    const there = await getOwnRecord<{ body?: unknown }>(SUBMISSION_NSID, p.rkey).catch(() => undefined)
    if (!there) throw err
    if ((there.value.body ?? '') === body) return body
    if (canUpdate(useAtproto.getState().scope, SUBMISSION_NSID) === false) return typeof there.value.body === 'string' ? there.value.body : body
    await putRecord(SUBMISSION_NSID, p.rkey, record)
    return body
  }
}

/** Saves a self post's words beside its Bluesky post, trying twice. Returns its key and the story to show. */
export async function saveWords(p: PendingSelfPost, words: string): Promise<{ key: string; story: Story }> {
  const body = words.trim()
  if (!body && !p.media?.length) throw new Error('Write something first')
  let saved: string
  try {
    saved = await writeWords(p, body).catch(() => writeWords(p, body))
  } catch (err) {
    throw new WordsNotSaved(`Posted to Bluesky, but its words didn’t save: ${(err as Error).message}`, p)
  }
  return { key: storyKey({ kind: 'bs', uri: p.ref.uri }), story: asStory(p.ref, p.title, saved, p.createdAt, p.media) }
}

/** Replaces a self post's words, keeping everything else in its record. Yours only. */
export async function editSelfPost(postUri: string, body: string): Promise<void> {
  const words = body.trim()
  if (!words) throw new Error('Write something first')
  if (words.length > BODY_LIMIT) throw new Error(`That’s over ${BODY_LIMIT.toLocaleString()} characters`)
  const { did, scope } = useAtproto.getState()
  const [, , repo, , rkey] = postUri.split('/')
  if (!did || repo !== did) throw new Error('You can only edit your own posts')
  if (canUpdate(scope, SUBMISSION_NSID) === false) throw new Error('Editing needs one more Bluesky permission: allow it under Settings, Sources.')
  const current = await getOwnRecord<Record<string, unknown>>(SUBMISSION_NSID, rkey)
  const { $type: _type, ...rest } = current.value
  // The edit is dated in the post's own record, so it says it was edited for as long as it exists.
  await putRecord(SUBMISSION_NSID, rkey, { ...rest, body: words, editedAt: new Date().toISOString() })
}

/** A self post's words and versions, from PaperWing (api/_lib/selfPost.ts). */
export const fetchSelfPost = (key: string) => api('thread', { src: 'paperwing', id: key }) as Promise<SelfPostBody>

/** A story with its self post's words in place of its Bluesky snippet. */
export const withSelfPost = (story: Story, found: SelfPostBody): Story => ({ ...story, url: null, text: markdownHtml(found.body), selfPost: found })
