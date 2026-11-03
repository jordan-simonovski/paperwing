import { useEffect } from 'react'
import { canWrite, deleteRecord, putRecord, useAtproto } from './atproto'
import { BLOGROLL_NSID, MAX_BLOGROLL } from './social'
import { usePrefs } from './store'
import { toast } from './ui'

// Your blogroll: the feeds you follow, published (only if you choose) as one record in your Bluesky
// account, so your profile can say "blogs I read" and others can find blogs through people, the way
// the web used to work. Kept in step as you follow and unfollow feeds.

export async function publishBlogroll() {
  const { customFeeds } = usePrefs.getState()
  await putRecord(BLOGROLL_NSID, 'self', {
    feeds: customFeeds.slice(0, MAX_BLOGROLL).map((f) => ({ url: f.url, label: f.label, ...(f.site ? { site: f.site } : {}), ...(f.format ? { format: f.format } : {}) })),
    updatedAt: new Date().toISOString(),
  })
}

export async function unpublishBlogroll() {
  const did = useAtproto.getState().did
  if (did) await deleteRecord(`at://${did}/${BLOGROLL_NSID}/self`)
}

/** Keeps a public blogroll current: republished a few seconds after your feeds change. */
export function useBlogrollPublisher() {
  const on = usePrefs((p) => p.blogrollPublic)
  const feeds = usePrefs((p) => p.customFeeds.map((f) => f.url).join('\n'))
  const did = useAtproto((a) => a.did)
  const allowed = useAtproto((a) => canWrite(a.scope, BLOGROLL_NSID) !== false)
  useEffect(() => {
    if (!on || !did || !allowed) return
    const t = window.setTimeout(() => void publishBlogroll().catch((err: Error) => toast(`Couldn’t update your blogroll: ${err.message}`, { tone: 'error' })), 4000)
    return () => window.clearTimeout(t)
  }, [on, feeds, did, allowed])
}
