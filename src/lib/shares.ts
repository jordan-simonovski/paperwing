import type { QueryClient } from '@tanstack/react-query'
import { keys } from './query'
import { canWrite, createRecord, deleteRecord, useAtproto } from './atproto'
import { SHARE_NSID } from './social'
import type { Story } from './types'

// Shared items, as Google Reader had them: a link and a line about why it's worth reading, kept in
// your own Bluesky account (social.ts). They show on your profile, in your profile's RSS feed, and in
// For you for anyone who follows you on PaperWing. Not a Bluesky post: nothing lands in timelines.

export async function shareOnPaperWing(qc: QueryClient, story: Pick<Story, 'url' | 'title'>, note: string): Promise<string> {
  if (!story.url) throw new Error('Only stories with a link can be shared')
  if (!useAtproto.getState().did) throw new Error('Sign in with Bluesky to share (Settings, Sources)')
  if (canWrite(useAtproto.getState().scope, SHARE_NSID) === false) throw new Error('Sharing needs one more permission: allow it under Settings, Sources (Bluesky account).')
  const ref = await createRecord(SHARE_NSID, { url: story.url, title: story.title.slice(0, 300), ...(note.trim() ? { note: note.trim().slice(0, 1000) } : {}), createdAt: new Date().toISOString() })
  void qc.invalidateQueries({ queryKey: keys.people })
  return ref.uri
}

export async function unshare(qc: QueryClient, uri: string) {
  await deleteRecord(uri)
  void qc.invalidateQueries({ queryKey: keys.people })
}
