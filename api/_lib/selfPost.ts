import { cleanSubmission, submissionUriOf, type SelfPostBody, type SelfPostVersion } from '../../src/lib/paperwing.js'
import { parseStoryKey } from '../../src/lib/storyKey.js'
import { getRecord } from './frontpage.js'
import { kv, kvConfigured } from './kv.js'
import { blocked } from './paperwing.js'

// A self post's body. Its Bluesky post holds the title and a snippet; the words themselves, in
// Markdown, are in the submission record beside it (same key, same repo), where its author can
// edit them. Each version the server sees is kept here, with when it was first seen, so an edit
// shows as one and what it changed can be read: the original and the newest few.

/** How many versions are kept: the original, and the newest after it. */
export const VERSIONS_KEPT = 10
/** How long a read of the author's repo stands before it's asked again. */
const FRESH_FOR = 60_000
/** Versions are kept a year past the last time anyone opened the post. */
const KEEP_FOR = 365 * 86_400

interface Kept {
  checkedAt: number
  cid: string
  versions: SelfPostVersion[]
}

export class NotSelfPost extends Error {
  constructor(message = 'That isn’t a self post') {
    super(message)
  }
}

/** A self post's body and its versions, by its story key (bs-…). */
export async function selfPostBody(key: string, now = Date.now()): Promise<SelfPostBody> {
  const p = parseStoryKey(key)
  const uri = p?.kind === 'bs' ? p.uri : ''
  const at = submissionUriOf(uri)
  if (!at) throw new NotSelfPost()
  const off = blocked()
  if (off.has(uri) || off.has(uri.split('/')[2])) throw new NotSelfPost('It was removed from PaperWing')

  const store = `pw:self:${uri}`
  const kept = kvConfigured()
    ? await kv()
        .get(store)
        .then((v) => (v ? (JSON.parse(v) as Kept) : undefined))
        .catch(() => undefined)
    : undefined
  if (kept && now - kept.checkedAt < FRESH_FOR) return { body: kept.versions.at(-1)!.body, versions: kept.versions }

  const record = await getRecord<unknown>(at)
  const sub = cleanSubmission(record.value)
  // Only the post's own record speaks for it.
  if (!sub?.body || sub.post.uri !== uri) throw new NotSelfPost()

  let versions = kept?.versions ?? []
  if (!kept || kept.cid !== record.cid) {
    if (versions.at(-1)?.body !== sub.body) versions = [...versions, { body: sub.body, seenAt: now }]
    if (versions.length > VERSIONS_KEPT) versions = [versions[0], ...versions.slice(-(VERSIONS_KEPT - 1))]
  }
  if (kvConfigured())
    await kv()
      .set(store, JSON.stringify({ checkedAt: now, cid: record.cid, versions } satisfies Kept), KEEP_FOR)
      .catch(() => {})
  return { body: sub.body, versions }
}
