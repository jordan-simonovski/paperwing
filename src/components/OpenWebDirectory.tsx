import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { keys } from '../lib/query'
import { feed } from '../lib/sources/http'
import type { FoundFeed } from '../lib/publishers'
import { CouldntReach } from './FeedState'
import { FeedRow } from './FollowBlogs'

const FIRST = 12

/** Blogs on the open atproto network that publish with Standard.site, found by the server's crawl, newest post first. */
export function OpenWebDirectory() {
  const list = useQuery({ queryKey: keys.directory, queryFn: () => feed('directory') as Promise<FoundFeed[]>, staleTime: 30 * 60_000 })
  const [all, setAll] = useState(false)
  // Still loading, or nothing found yet: the section waits rather than saying so.
  if (!list.isError && !list.data?.length) return null
  const feeds = list.data ?? []
  return (
    <section className="mt-8" aria-labelledby="open-web">
      <h2 id="open-web" className="text-[1.125rem] font-bold">
        New on the open web
      </h2>
      <p className="mt-1 max-w-xl text-[0.875rem] text-ink-2">
        Blogs that publish on Bluesky’s open network with Standard.site, newest post first. Nobody picks them: a blog shows up here when it posts and its own website confirms it.
      </p>
      {list.isError ? (
        <CouldntReach what="the open web’s blogs" onRetry={() => void list.refetch()} />
      ) : (
        <>
          <div className="mt-2 grid grid-cols-1 gap-x-8 lg:grid-cols-2">
            {(all ? feeds : feeds.slice(0, FIRST)).map((f) => (
              <FeedRow key={f.url} feed={f} />
            ))}
          </div>
          {!all && feeds.length > FIRST && (
            <button type="button" className="btn mt-2 h-9 px-3" onClick={() => setAll(true)}>
              Show all {feeds.length}
            </button>
          )}
        </>
      )}
    </section>
  )
}
