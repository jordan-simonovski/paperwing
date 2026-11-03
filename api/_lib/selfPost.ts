import { cleanSubmission, submissionUriOf, type SelfPostBody, type SelfPostVersion } from '../../src/lib/paperwing.js'
import { parseStoryKey } from '../../src/lib/storyKey.js'
import { getRecord } from './frontpage.js'
import { kv, kvConfigured } from './kv.js'
import { blocked } from './paperwing.js'

// A self post's body. Its Bluesky post holds the title and a snippet; the words themselves, in
// Markdown, are in the submission record beside it (same key, same repo), where its author can
// edit them. The words live there, not here. What's kept here is short-lived: each version the
// server sees, for a day after it's replaced, so a fresh edit shows what it changed; and when the
// post was last edited, so it says so after that. Delete the words and all of it goes.

/** How many versions are kept at most: the oldest still within its day, and the newest after it. */
export const VERSIONS_KEPT = 10
/** How long a read of the author's repo stands before it's asked again. */
const FRESH_FOR = 60_000
/** How long an earlier version stays readable after it's replaced. */
export const HISTORY_FOR = 86_400_000
/** What's kept goes a day after anyone last opened the post. */
const KEEP_FOR = 86_400

interface Kept {
  checkedAt: number
  cid: string
  versions: SelfPostVersion[]
  editedAt?: number
}

/** Versions replaced more than a day ago are gone; the current one always stays. */
const recent = (versions: SelfPostVersion[], now: number) => versions.filter((v, i) => i === versions.length - 1 || now - versions[i + 1].seenAt < HISTORY_FOR)

/** The author's server said the record isn't there (not that it's down): RecordNotFound is a 400. */
const deleted = (err: unknown) => err instanceof Error && /\bUpstream 400\b/.test(err.message)

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
  // A store that fails to answer (or answers garbage) is not one with nothing kept: writing then
  // would replace the post's history with one version, for a year. Answer, but keep nothing.
  let unread = false
  const kept = kvConfigured()
    ? await kv()
        .get(store)
        .then((v) => (v ? (JSON.parse(v) as Kept) : undefined))
        .catch(() => {
          unread = true
          return undefined
        })
    : undefined
  if (kept && now - kept.checkedAt < FRESH_FOR) {
    const versions = recent(kept.versions, now)
    return { body: versions.at(-1)!.body, versions, ...(kept.editedAt ? { editedAt: kept.editedAt } : {}) }
  }

  // Words that are gone take what's kept here with them.
  const forget = async (message: string): Promise<never> => {
    if (kvConfigured())
      await kv()
        .del([store])
        .catch(() => {})
    throw new NotSelfPost(message)
  }
  const record = await getRecord<unknown>(at).catch((err: unknown) => (deleted(err) ? forget('It was deleted') : Promise.reject(err)))
  const sub = cleanSubmission(record.value)
  // Only the post's own record speaks for it.
  if (!sub?.body || sub.post.uri !== uri) return forget('That isn’t a self post')

  let versions = kept?.versions ?? []
  let editedAt = kept?.editedAt
  if (!kept || kept.cid !== record.cid) {
    if (versions.at(-1)?.body !== sub.body) {
      if (versions.length) editedAt = now
      versions = [...versions, { body: sub.body, seenAt: now }]
    }
  }
  versions = recent(versions, now)
  if (versions.length > VERSIONS_KEPT) versions = versions.slice(-VERSIONS_KEPT)
  if (kvConfigured() && !unread)
    await kv()
      .set(store, JSON.stringify({ checkedAt: now, cid: record.cid, versions, ...(editedAt ? { editedAt } : {}) } satisfies Kept), KEEP_FOR)
      .catch(() => {})
  return { body: sub.body, versions, ...(editedAt ? { editedAt } : {}) }
}
