import { canUpdate, canWrite, createRecord, getOwnRecord, putRecord, useAtproto } from './atproto'
import { facetsFor, graphemes } from './facets'
import { markdownHtml, markdownText } from './markdown'
import { BODY_LIMIT, newTid, selfPostUrl, SUBMISSION_NSID, submissionRecord, type SelfPostBody } from './paperwing'
import { api } from './sources/http'
import { storyKey } from './storyKey'
import type { Story } from './types'

// Self posts: a title and words in Markdown, listed on PaperWing like a link. The Bluesky post holds
// the title, a snippet and a link to the post's own page here; the words are in the submission
// record beside it, at the same key, where they can be edited (the title can't: it's the post's).

const POST_LIMIT = 300

/** The Bluesky post's words: the title, then as much of the body as fits, cut at a word. */
export function postText(title: string, body: string): string {
  const head = [...title.trim()].slice(0, POST_LIMIT).join('')
  const snippet = markdownText(body)
  const room = POST_LIMIT - graphemes(head) - 2
  if (!snippet || room < 20) return head
  if (graphemes(snippet) <= room) return `${head}\n\n${snippet}`
  const cut = [...snippet].slice(0, room - 1).join('')
  return `${head}\n\n${cut.replace(/\s+\S*$/, '')}…`
}

const handleOrDid = () => useAtproto.getState().handle ?? useAtproto.getState().did

/** A self post as a story, for the thread on screen before Bluesky has it. */
function asStory(ref: { uri: string; cid: string }, title: string, body: string, now: number): Story {
  return {
    key: storyKey({ kind: 'bs', uri: ref.uri }),
    source: 'bluesky',
    sourceLabel: 'Bluesky',
    title,
    url: null,
    discussionUrl: `https://bsky.app/profile/${handleOrDid()}/post/${ref.uri.split('/').pop()}`,
    author: useAtproto.getState().handle,
    authorDid: useAtproto.getState().did,
    score: 0,
    comments: 0,
    createdAt: now,
    text: markdownHtml(body),
    hasThread: true,
    ref,
    selfPost: { body, versions: [{ body, seenAt: now }] },
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
}

/** Posts a self post: the Bluesky post, then its words beside it. Returns its key and the story to show. */
export async function writeSelfPost(i: SelfPostInput): Promise<{ key: string; story: Story }> {
  const title = i.title.trim()
  const body = i.body.trim()
  if (!title) throw new Error('Add a title')
  if (!body) throw new Error('Write something first')
  if (body.length > BODY_LIMIT) throw new Error(`That’s over ${BODY_LIMIT.toLocaleString()} characters`)
  const { did, scope } = useAtproto.getState()
  if (!did) throw new Error('Sign in with Bluesky to post')
  if (canWrite(scope, SUBMISSION_NSID) === false) throw new Error('Posting to PaperWing needs one more permission: allow it under Settings, Sources.')

  // One key for both records, chosen now: the post links to its own page, which is named by it.
  const rkey = newTid()
  const uri = `at://${did}/app.bsky.feed.post/${rkey}`
  const url = selfPostUrl(uri)
  const text = postText(title, body)
  const facets = await facetsFor(text)
  const now = Date.now()
  const ref = await createRecord(
    'app.bsky.feed.post',
    {
      text,
      createdAt: new Date(now).toISOString(),
      langs: [navigator.language?.split('-')[0] || 'en'],
      ...(facets.length ? { facets } : {}),
      embed: { $type: 'app.bsky.embed.external', external: { uri: url, title: title.slice(0, 300), description: markdownText(body).slice(0, 1000) } },
    },
    rkey,
  )
  const record = submissionRecord(ref, url, title, i.board, { front: i.front, body }) as unknown as Record<string, unknown>
  // The post is up either way. Without its words it's a title and a link to an empty page: try again once.
  try {
    await createRecord(SUBMISSION_NSID, record, rkey).catch(() => createRecord(SUBMISSION_NSID, record, rkey))
  } catch (err) {
    throw new Error(`Posted to Bluesky, but its words didn’t save: ${(err as Error).message}`)
  }
  return { key: storyKey({ kind: 'bs', uri: ref.uri }), story: asStory(ref, title, body, now) }
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
  await putRecord(SUBMISSION_NSID, rkey, { ...rest, body: words })
}

/** A self post's words and versions, from PaperWing (api/_lib/selfPost.ts). */
export const fetchSelfPost = (key: string) => api('thread', { src: 'paperwing', id: key }) as Promise<SelfPostBody>

/** A story with its self post's words in place of its Bluesky snippet. */
export const withSelfPost = (story: Story, found: SelfPostBody): Story => ({ ...story, url: null, text: markdownHtml(found.body), selfPost: found })
