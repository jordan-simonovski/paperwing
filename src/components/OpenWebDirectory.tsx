import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { keys } from '../lib/query'
import { feed } from '../lib/sources/http'
import type { DirectoryFeed } from '../lib/publishers'
import { useFollowing } from '../lib/following'
import { CouldntReach } from './FeedState'
import { FeedRow } from './FollowBlogs'

const FIRST = 12

/** Why a blog is near you: written by someone you follow on Bluesky, or in one of their blogrolls. */
const nearYou = (f: DirectoryFeed, following: Set<string>) =>
  following.has(f.author) ? 'By someone you follow' : f.listedBy?.some((d) => following.has(d)) ? 'In the blogroll of someone you follow' : undefined

/**
 * Blogs on the open atproto network that publish with Standard.site, found by the server's crawl:
 * recent ones first, with credit for being read, listed and discussed, and the ones near you (by
 * people you follow, or in their blogrolls) ahead of the rest.
 */
export function OpenWebDirectory() {
  const list = useQuery({ queryKey: keys.directory, queryFn: () => feed('directory') as Promise<DirectoryFeed[]>, staleTime: 30 * 60_000 })
  const { following, loading } = useFollowing()
  const [all, setAll] = useState(false)
  // Still loading, or nothing found yet: the section waits rather than saying so.
  // Signed in, it also waits for who you follow, so the rows don't jump once they're known.
  if ((!list.isError && !list.data?.length) || loading) return null
  // By people you follow, then in their blogrolls, then everything else, each in the server's order.
  const rank = (f: DirectoryFeed) => (following.has(f.author) ? 0 : nearYou(f, following) ? 1 : 2)
  const feeds = [...(list.data ?? [])].sort((a, b) => rank(a) - rank(b))
  return (
    <section className="mt-8" aria-labelledby="open-web">
      <h2 id="open-web" className="text-[1.125rem] font-bold">
        New on the open web
      </h2>
      <p className="mt-1 max-w-xl text-[0.875rem] text-ink-2">
        Blogs that publish on Bluesky’s open network with Standard.site, newest first, with the ones people read, list and discuss ahead. Nobody picks them: a blog shows up here when it posts and its
        own website confirms it.
      </p>
      {list.isError ? (
        <CouldntReach what="the open web’s blogs" onRetry={() => void list.refetch()} />
      ) : (
        <>
          <div className="mt-2 grid grid-cols-1 gap-x-8 lg:grid-cols-2">
            {(all ? feeds : feeds.slice(0, FIRST)).map((f) => (
              <FeedRow key={f.url} feed={f} detail={nearYou(f, following)} />
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
