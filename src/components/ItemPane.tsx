import { useComposer } from '../lib/compose'
import { FriendsLine } from './FriendsLine'
import { profilePath } from '../lib/people'
import { Archive, ArchiveRestore, ArrowDown, Bell, BellRing, ArrowLeft, ArrowUpRight, Bookmark, BookmarkCheck, Loader2, Newspaper, Share2, X } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams, Link } from 'react-router'
import { ago, compact, domainOf, fullDate } from '../lib/format'
import { indexStory, useArticle, useNow, useStory, useThread } from '../lib/hooks'
import { sanitize } from '../lib/html'
import { stateOf, useLibrary } from '../lib/library'
import type { Ranked } from '../lib/rank'
import { useActivity, usePrefs } from '../lib/store'
import { useAtproto } from '../lib/atproto'
import { judge, moderateComments } from '../lib/moderation'
import { useOutlets } from '../lib/coverage'
import { Covered } from './Covered'
import type { Story } from '../lib/types'
import { topicsForStory } from '../lib/topics'
import { toast } from '../lib/ui'
import { isWatching, useWatch } from '../lib/watch'
import { landHeadline } from '../lib/pretext'
import { ArticleView } from './ArticleView'
import { CommentTree, nextThread, Spine } from './CommentTree'
import { DiscussionBar, usePlaces } from './DiscussionBar'
import { WebMentions } from './WebMentions'
import { ModerateOnBoard } from './ModerateOnBoard'
import { SpiceDetail } from './Spice'
import { QuoteCard } from './QuoteCard'
import { SelfPostBody } from './SelfPostBody'
import { FollowSite } from './FollowBlogs'
import { StoryActions, useCommentActions } from './Social'
import { SummaryCard } from './SummaryCard'
import { MediaGallery } from './Media'
import { thumbFor } from './Thumb'
import { VideoEmbed } from './VideoEmbed'
import { videoEmbedOf } from '../lib/videoEmbed'
import { SourceIcon, StoryIcon } from './SourceIcon'
import { scoreUnit, SOURCE_NAMES, sourceLabel } from './Source'
import { WhyRanked } from './WhyRanked'
import { Elsewhere, RelatedView } from './RelatedView'
import { toggleArchived, toggleSaved, toggleWatch, Votes } from './StoryRow'
import { TopicTag } from './TopicTag'

// usePlaces runs before the story is known; this stands in so hooks keep their order.
const EMPTY_STORY: Story = { key: '', source: 'rss', sourceLabel: '', title: '', url: null, discussionUrl: null, createdAt: 0, hasThread: false }

export type PaneTab = 'discussion' | 'article' | 'related'

interface Props {
  itemKey: string
  onClose: () => void
  onOpen: (key: string, tab?: PaneTab) => void
}

export function ItemPane({ itemKey, onClose, onOpen }: Props) {
  const [params, setParams] = useSearchParams()
  const scrollRef = useRef<HTMLDivElement>(null)
  const now = useNow()
  const known = useStory(itemKey)
  const threadable = known?.hasThread ?? !itemKey.startsWith('ln-')
  const thread = useThread(itemKey, threadable)
  // Shared or deep-linked URLs arrive with no title; borrow the article's once it's extracted.
  const untitled = !!known && known.title === known.url
  const article = useArticle(known?.url, itemKey, untitled)
  const articleTitle = untitled ? article.data?.title : undefined
  // A PaperWing listing's thread is a Bluesky post: it keeps PaperWing's name when the thread loads.
  const story = useMemo(() => {
    const loaded = thread.data?.story
    if (loaded) return known?.sourceLabel === 'PaperWing' ? { ...loaded, sourceLabel: 'PaperWing' } : loaded
    return articleTitle && known ? { ...known, title: articleTitle } : known
  }, [thread.data, articleTitle, known])
  // Content warnings and folded comments: judged here too, since an opened thread arrives unjudged.
  const { labelers, warnings, mutedWords } = usePrefs()
  const verdict = useMemo(() => (story ? judge(story.labels, story.authorDid, labelers) : {}), [story, labelers])
  const cw = warnings === 'show' ? undefined : (verdict.warning ?? story?.warning)
  const cwMediaOnly = verdict.warning ? verdict.mediaOnly : story?.warnMediaOnly
  const comments = useMemo(() => moderateComments(thread.data?.comments ?? [], mutedWords, labelers), [thread.data, mutedWords, labelers])
  const alsoOn = (known as Ranked | undefined)?.alsoOn
  const coverage = (known as Ranked | undefined)?.coverage
  // How many outlets are covering it: starts the news search as the story opens, so the Related tab has it ready.
  const { outlets } = useOutlets(story, coverage)

  // Pretext motion: once the headline is on screen, the feed row's words fly into it.
  const headline = useRef<HTMLHeadingElement>(null)
  const title = story?.title
  useLayoutEffect(() => {
    if (headline.current && title) landHeadline(itemKey, headline.current, headline.current.closest<HTMLElement>('.pane-col'))
  }, [itemKey, title])

  const tab = (params.get('tab') as PaneTab | null) ?? (threadable ? 'discussion' : 'article')
  const setTab = (t: PaneTab) =>
    setParams(
      (p) => {
        p.set('tab', t)
        return p
      },
      { replace: true },
    )

  const savedMeta = useLibrary((l) => l.items[itemKey])
  const saved = !!savedMeta
  const archived = !!savedMeta && stateOf(savedMeta) === 'archive'
  const pending = useLibrary((l) => !!l.pending[itemKey])
  const watching = useWatch((w) => isWatching(w.items[itemKey]))
  useReadingProgress(itemKey, tab === 'article' && saved, scrollRef, story?.url)
  const places = usePlaces(story ?? EMPTY_STORY, alsoOn, coverage)
  const commentActions = useCommentActions(story ?? EMPTY_STORY, thread.data?.story.ref ?? story?.ref)

  // Remember the previous visit before recording this one, so new comments can be marked.
  const [since, setSince] = useState<number | undefined>()
  useEffect(() => {
    useActivity.getState().markRead(itemKey)
    setSince(useActivity.getState().visit(itemKey))
    if (useLibrary.getState().items[itemKey]) void useLibrary.getState().markSeen(itemKey)
    scrollRef.current?.scrollTo({ top: 0 })
  }, [itemKey])
  // Count the story towards its site, for "blogs you keep reading".
  useEffect(() => {
    if (story?.url) useActivity.getState().noteSite(itemKey, story.url)
  }, [itemKey, story?.url])

  useEffect(() => {
    if (thread.data?.story) indexStory(thread.data.story)
    // Having the thread open counts as having seen it.
    if (thread.data && isWatching(useWatch.getState().items[itemKey])) useWatch.getState().looked(itemKey, thread.data.comments)
  }, [thread.data, itemKey])

  const topics = useMemo(() => (story ? topicsForStory(story) : []), [story])
  const vote = useActivity((a) => (story ? a.votes[story.key] : undefined))
  const me = useAtproto((a) => a.did)

  if (!story) {
    return (
      <div className="grid h-full place-items-center p-10 text-center text-ink-3">
        {thread.isPending ? (
          <Loader2 className="spin" />
        ) : (
          <div className="max-w-sm">
            <p className="text-[1.0625rem] font-semibold text-ink">{/\b(404|removed|deleted)\b/i.test(thread.error?.message ?? '') ? 'This story isn’t there any more' : 'This story didn’t load'}</p>
            <p className="mt-1.5 text-[0.9375rem]">
              {/\b(404|removed|deleted)\b/i.test(thread.error?.message ?? '')
                ? `${thread.error?.message.replace(/^Upstream 404 for .*$/, 'It was removed or deleted where it was posted')}.`
                : thread.error
                  ? `${thread.error.message}. Try again in a moment.`
                  : 'Try again in a moment.'}
            </p>
            <button className="btn mt-4" onClick={onClose}>
              Back
            </button>
          </div>
        )}
      </div>
    )
  }

  const domain = domainOf(story.url)
  const sourceName = sourceLabel(story)
  // Where the thread itself lives, for links out: a PaperWing post's is Bluesky.
  const network = SOURCE_NAMES[story.source]

  return (
    <div className="relative flex h-full flex-col">
      <header className="flex h-14 flex-none items-center gap-1 px-3 md:px-6">
        <button className="icon-btn min-[900px]:hidden" onClick={onClose} aria-label="Back">
          <ArrowLeft size={19} />
        </button>
        <span className="flex min-w-0 items-center gap-2 text-[0.875rem] font-semibold text-ink-2">
          <StoryIcon story={story} size={18} />
          <span className="truncate">{sourceName}</span>
        </span>
        <div className="ml-auto flex items-center gap-0.5">
          {threadable && (
            <button
              className="icon-btn"
              onClick={() => toggleWatch(story)}
              aria-pressed={watching}
              aria-label="Watch replies"
              title={watching ? 'Watching: new replies show up in Saved. Click to stop (w)' : 'Watch this discussion for new replies (w)'}
            >
              {watching ? <BellRing size={17} /> : <Bell size={17} />}
            </button>
          )}
          {saved && (
            <button
              className="icon-btn"
              onClick={() => void toggleArchived(story)}
              aria-pressed={archived}
              aria-label="Archive"
              title={archived ? 'Archived. Click to move back to your queue (e)' : 'Archive (e)'}
            >
              {archived ? <ArchiveRestore size={17} /> : <Archive size={17} />}
            </button>
          )}
          <button className="icon-btn" onClick={() => void toggleSaved(story)} aria-pressed={saved} aria-label="Save" title={saved ? 'Saved. Click to remove (s)' : 'Save to your queue (s)'}>
            {pending ? <Loader2 size={17} className="spin" /> : saved ? <BookmarkCheck size={17} /> : <Bookmark size={17} />}
          </button>
          <button className="icon-btn" onClick={() => useComposer.getState().open({ kind: 'links', story: story })} title="Share" aria-label="Share">
            <Share2 size={17} />
          </button>
          {story.discussionUrl && (
            // The source's own logo: a speech bubble read as "reply" when it means "open the discussion there".
            <a className="icon-btn" href={story.discussionUrl} target="_blank" rel="noopener noreferrer" title={`Open on ${network}`} aria-label={`Open on ${network}`}>
              <SourceIcon source={story.source} size={16} />
            </a>
          )}
          {story.url && (
            <a className="icon-btn" href={story.url} target="_blank" rel="noopener noreferrer" title="Open the original (o)" aria-label="Open the original">
              <ArrowUpRight size={17} />
            </a>
          )}
          <button className="icon-btn max-[899px]:hidden" onClick={onClose} title="Close (Esc)" aria-label="Close">
            <X size={17} />
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <div ref={scrollRef} className="min-w-0 flex-1 overflow-y-auto px-5 md:px-10" id="pane-scroll">
          <div className="mx-auto max-w-[44rem] pt-4">
            <h1 ref={headline} className="text-[1.625rem] font-bold leading-[1.18] tracking-[-0.02em] text-pretty [overflow-wrap:break-word] md:text-[1.875rem]">
              {story.url ? (
                <a href={story.url} target="_blank" rel="noopener noreferrer" className="decoration-signal decoration-2 underline-offset-4 hover:underline">
                  {story.title}
                </a>
              ) : (
                story.title
              )}
            </h1>
            <div className="meta mt-3 text-[0.875rem]">
              {domain && (
                <a className="font-semibold text-ink-2 hover:text-ink" href={story.url!} target="_blank" rel="noopener noreferrer">
                  {domain}
                </a>
              )}
              {story.author &&
                (story.source === 'bluesky' ? (
                  <span>
                    by{' '}
                    <Link className="font-semibold text-ink-2 hover:text-ink" to={profilePath(story.author)}>
                      @{story.author}
                    </Link>
                  </span>
                ) : (
                  <span>by {story.author}</span>
                ))}
              {!!story.score && (
                <span className="num">
                  {compact(story.score)} {scoreUnit(story.source, story.score)}
                </span>
              )}
              <span title={fullDate(story.createdAt)}>{ago(story.createdAt, now)}</span>
              <FollowSite story={story} />
            </div>
            <FriendsLine story={{ ...story, alsoOn }} className="mt-2.5" />
            {topics.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {topics.map((t) => (
                  <TopicTag key={t} id={t} />
                ))}
              </div>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
              <Votes story={story} vote={vote} />
              {outlets > 1 && (
                <button className="pill" onClick={() => setTab('related')} title="See how other outlets are covering it">
                  <Newspaper size={15} /> {outlets} outlets
                </button>
              )}
              <SpiceDetail places={[story, ...(alsoOn ?? [])]} />
              <StoryActions story={story} root={thread.data?.story.ref ?? story.ref} />
              <ModerateOnBoard story={story} />
              <WhyRanked story={story} topics={topics} />
            </div>

            {/* A video the story links to, played here on a tap; a post's own video plays with its post. */}
            {!story.media?.some((m) => m.kind === 'video') && videoEmbedOf(story.url) && (
              // Behind the story's content warning, like its own pictures: no poster or player until you choose.
              <Covered warning={cw ? `Content warning: ${cw}` : undefined} className="mt-5">
                <VideoEmbed url={story.url} title={story.title} thumb={thumbFor(story)} />
              </Covered>
            )}

            <DiscussionBar story={story} alsoOn={alsoOn} coverage={coverage} onOpen={(k) => onOpen(k, 'discussion')} />
            <WebMentions url={story.url} now={now} />

            <div className="seg mt-6" role="tablist">
              {(
                [
                  ['discussion', threadable ? 'Discussion' : 'Discussions'],
                  ['article', story.url ? 'Article' : 'Post'],
                  ['related', 'Related'],
                ] as const
              ).map(([id, label]) => (
                <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
                  {label}
                  {id === 'discussion' && threadable && story.comments !== undefined && <span className="num ml-1.5 font-normal text-ink-3">{compact(story.comments)}</span>}
                </button>
              ))}
            </div>
          </div>

          <div className="mx-auto max-w-[44rem]">
            {tab === 'discussion' &&
              (threadable ? (
                <div className="pt-4">
                  {(story.text || story.media || story.quote) && (
                    <div className="mb-2 rounded-2xl bg-sunk p-5">
                      {story.text && (
                        <Covered warning={cw && !cwMediaOnly ? `Content warning: ${cw}` : undefined}>
                          {story.selfPost ? (
                            <SelfPostBody
                              body={story.selfPost.body}
                              versions={story.selfPost.versions}
                              editedAt={story.selfPost.editedAt}
                              now={now}
                              onEdit={me && story.authorDid === me ? () => useComposer.getState().open({ kind: 'self-post', edit: story }) : undefined}
                            />
                          ) : (
                            <div className="prose-c" dangerouslySetInnerHTML={{ __html: sanitize(story.text) }} />
                          )}
                        </Covered>
                      )}
                      {story.media && (
                        <div className={story.text ? 'mt-4' : undefined}>
                          <Covered warning={cw ? `Content warning: ${cw}` : undefined}>
                            <MediaGallery media={story.media} href={story.discussionUrl} />
                          </Covered>
                        </div>
                      )}
                      {story.quote && (
                        <div className={story.text || story.media ? 'mt-4' : undefined}>
                          <QuoteCard quote={story.quote} onOpen={(k) => onOpen(k, 'discussion')} />
                        </div>
                      )}
                    </div>
                  )}
                  {places.length > 0 && <SummaryCard story={story} places={places} onOpen={(k) => onOpen(k, 'discussion')} />}
                  {thread.isPending ? (
                    <CommentsSkeleton />
                  ) : thread.isError ? (
                    <div className="py-12 text-center">
                      <p className="font-semibold">The comments didn't load</p>
                      <p className="mt-1 text-[0.875rem] text-ink-3">{thread.error.message}</p>
                      {story.discussionUrl && (
                        <a className="btn mt-4" href={story.discussionUrl} target="_blank" rel="noopener noreferrer">
                          Read them on {network}
                        </a>
                      )}
                    </div>
                  ) : (
                    <CommentTree comments={comments} op={story.author} since={since} sourceName={SOURCE_NAMES[story.source]} scrollRef={scrollRef} now={now} actions={commentActions} />
                  )}
                </div>
              ) : (
                <div className="py-6">
                  <p className="mb-3 text-[0.9375rem] text-ink-2">{SOURCE_NAMES[story.source]} has no comments of its own. Here is where this link is being talked about.</p>
                  <Elsewhere story={story} onOpen={(k) => onOpen(k, 'discussion')} now={now} alsoOn={alsoOn} />
                </div>
              ))}
            {tab === 'article' && <ArticleView story={story} onDiscussion={threadable ? () => setTab('discussion') : undefined} />}
            {tab === 'related' && <RelatedView story={story} onOpen={(k) => onOpen(k)} now={now} alsoOn={alsoOn} coverage={coverage} />}
          </div>
        </div>
        {tab === 'discussion' && thread.data && (
          <div className="hidden w-6 flex-none justify-center lg:flex">
            <Spine comments={thread.data.comments} since={since} scrollRef={scrollRef} />
          </div>
        )}
      </div>
      {tab === 'discussion' && (thread.data?.comments.length ?? 0) > 3 && (
        <button className="btn btn-primary absolute bottom-[calc(1rem+env(safe-area-inset-bottom))] right-6 shadow-[var(--float)] md:right-10" onClick={nextThread} title="Next thread (n)">
          <ArrowDown size={15} /> Next thread
        </button>
      )}
    </div>
  )
}

/**
 * For saved stories on the Article tab: remembers how far you read, resumes there next time,
 * and archives the story once you reach the end.
 */
function useReadingProgress(key: string, active: boolean, scrollRef: React.RefObject<HTMLDivElement | null>, url: string | null | undefined) {
  const article = useArticle(url, key, active)
  const resumed = useRef(false)
  const finished = useRef(false)

  useEffect(() => {
    const el = scrollRef.current
    if (!active || !article.isSuccess || !el || resumed.current) return
    resumed.current = true
    const position = useLibrary.getState().items[key]?.position ?? 0
    if (position < 0.04 || position > 0.96) return
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        el.scrollTo({ top: position * (el.scrollHeight - el.clientHeight) })
        toast('Picked up where you left off', { action: { label: 'Start over', run: () => el.scrollTo({ top: 0, behavior: 'smooth' }) } })
      }),
    )
  }, [active, article.isSuccess, key, scrollRef])

  useEffect(() => {
    const el = scrollRef.current
    if (!active || !el) return
    let timer = 0
    const onScroll = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        const span = el.scrollHeight - el.clientHeight
        if (span < 200) return
        const position = Math.min(1, el.scrollTop / span)
        const lib = useLibrary.getState()
        void lib.update(key, (item) => ({ position, progress: Math.max(item.progress ?? 0, position) }))
        const m = lib.items[key]
        if (position > 0.97 && !finished.current && m && stateOf(m) === 'queue') {
          finished.current = true
          void lib.archive(key, true)
          toast('Finished. Archived', { action: { label: 'Undo', run: () => void lib.archive(key, false) } })
        }
      }, 800)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      el.removeEventListener('scroll', onScroll)
      window.clearTimeout(timer)
    }
  }, [active, key, scrollRef])
}

function CommentsSkeleton() {
  return (
    <div className="space-y-6 pt-6" aria-label="Loading comments">
      {[0, 1, 2, 1, 0].map((d, i) => (
        <div key={i} className="space-y-2.5" style={{ paddingLeft: d * 20 }}>
          <div className="skel h-3.5 w-32" />
          <div className="skel h-3.5 w-[90%]" />
          <div className="skel h-3.5 w-[70%]" />
        </div>
      ))}
    </div>
  )
}
