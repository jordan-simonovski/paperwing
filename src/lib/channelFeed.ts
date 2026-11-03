import { allTopics, findTopic, resolveChannel, type Channel } from './channels'
import { moderateStory, type Labeler, type WarningMode } from './moderation'
import type { FollowedPerson } from './people'
import { merge, type Ranked, type SortMode } from './rank'
import { feedId, feedLabel, newestOf } from './sources'
import type { BlueskyFeed, CustomFeed, FollowedMix, Interest, LemmyCommunity, Mix } from './store'
import { matchesTopic, storyText, type FeedRef, type Topic } from './topics'
import type { Story } from './types'

// The channel feed: from a reader and a channel to the stories it shows, in order. Every page that
// lists stories (a channel, Today, Search) and everything that fetches ahead for one (the launch
// warm-up, a topic card's preview) goes through here, so what For you contains and how a list is
// ranked are decided in one place.
//
// Pure: no stores, no network. The reader is passed in (reader.ts builds it from the stores), and
// the stories each planned feed brought back are passed to rankChannel; how they're fetched is the
// caller's business (hooks.ts fetches through the query cache).

/** Everything about the reader that what a channel contains, and how it's ranked, depends on. */
export interface Reader {
  // What they follow.
  followed: string[]
  interests: Interest[]
  customFeeds: CustomFeed[]
  bskyFeeds: BlueskyFeed[]
  communities: LemmyCommunity[]
  mixes: Mix[]
  followedMixes: FollowedMix[]
  people: FollowedPerson[]
  boards: { uri: string; name: string }[]
  /** Suggestions from boards they haven't joined, in For you. */
  boardPicks: boolean
  /** PaperWing's announcements: in For you and pinned, or neither. */
  announcements: boolean
  releaseRepos: string[]
  /** Hosts of the status pages they follow beyond the built-in ones. */
  statusHosts: string[]
  // Where they're signed in.
  /** Signed in with Bluesky; `timeline` is whether that sign-in may read the timeline (undefined until known). */
  bluesky?: { did: string; timeline?: boolean }
  /** Their Mastodon server, signed in or not (trends come from it either way). */
  mastodon?: { instance: string; signedIn?: boolean }
  // What they keep out.
  mutedWords: string[]
  mutedDomains: string[]
  hidden: Record<string, number>
  labelers: Labeler[]
  warnings: WarningMode
  /**
   * Their taste: read when a list is ranked, not when the reader is built, so a vote or a scroll
   * never reorders the list on screen but the next ranking (a refresh, a feed arriving) uses it.
   */
  taste: () => Taste
}

export interface Taste {
  /** Sessions each story has been on screen unopened. */
  seen: Record<string, number>
  affinity: Record<string, number>
  votes: Record<string, 1 | -1>
}

export interface PlannedFeed {
  ref: FeedRef
  /** Stable and unique per reader: the feed's cache id. */
  id: string
  label: string
}

export interface ChannelPlan {
  channel: Channel
  feeds: PlannedFeed[]
  sort: SortMode
}

export interface PlanOptions {
  variant?: string
  sort: SortMode
  /** Whether this deployment can serve Bluesky's feeds (it says so at /api/atproto?route=status). */
  blueskyEnabled: boolean
}

/** What a channel shows for this reader, and the feeds to fetch for it. Undefined for a channel that doesn't exist. */
export function planChannel(reader: Reader, channelId: string, opts: PlanOptions): ChannelPlan | undefined {
  const channel = resolveChannel(channelId, opts.variant, {
    followed: reader.followed,
    interests: reader.interests,
    customFeeds: reader.customFeeds,
    bskyFeeds: reader.bskyFeeds,
    communities: reader.communities,
    mixes: reader.mixes,
    followedMixes: reader.followedMixes,
    people: reader.people,
    boards: reader.boards,
    boardPicks: reader.boardPicks,
    releaseRepos: reader.releaseRepos,
    mastodon: !!reader.mastodon?.signedIn,
    bluesky: !!reader.bluesky,
    blueskyTimeline: reader.bluesky?.timeline,
    statusHosts: reader.statusHosts,
  })
  if (!channel) return undefined
  // Latest reads other feeds (each source's newest); Hot, Top and Spicy rank the same ones.
  const latest = opts.sort === 'new' && !channel.native
  const feeds = channel.feeds
    .filter((f) => opts.blueskyEnabled || f.kind !== 'bluesky')
    .map((f) => (latest ? newestOf(f) : f))
    .map((ref) => ({ ref, id: feedId(ref, reader), label: feedLabel(ref) }))
  return { channel, feeds, sort: opts.sort }
}

/**
 * The channel's stories in order: what each feed brought back (undefined while it hasn't
 * answered), re-checked against the topic a keyword search was run for, moderated, and merged
 * and ranked for the reader.
 */
export function rankChannel(plan: ChannelPlan, reader: Reader, batches: (Story[] | undefined)[]): Ranked[] {
  const topicsOf = (ref: FeedRef) =>
    ('topic' in ref && ref.topic ? [ref.topic] : 'topics' in ref && ref.topics ? ref.topics : []).map((id) => findTopic(id, reader.interests)).filter((t): t is Topic => !!t)
  const joined = new Set(reader.boards.map((b) => b.uri))
  const forYou = plan.channel.id === 'for-you'
  const ownBoard = plan.channel.board?.uri
  const checked = plan.feeds.map((f, i) => {
    const topics = topicsOf(f.ref)
    let data = batches[i] ?? []
    // Keyword searches are noisy: keep only results that really are about the topic they were run for.
    if (topics.length) data = data.filter((s) => topics.some((t) => matchesTopic(t, storyText(s))))
    if (f.ref.kind === 'boardpicks') data = unsuggestJoined(data, joined)
    if (!reader.announcements) data = withoutAnnouncements(data, forYou)
    // On a board's own page, every post is from it: no need to say so.
    if (ownBoard) data = data.map((s) => (s.board?.uri === ownBoard ? { ...s, board: undefined } : s))
    return data
  })
  return rankStories(reader, checked, { sort: plan.sort, native: plan.channel.native, boost: plan.channel.boost })
}

/** Suggestions are the same for everyone: from a board you've joined, a post is just a post (it stays on screen when you join). */
const unsuggestJoined = (data: Story[], joined: Set<string>): Story[] => data.map((s) => (s.board && joined.has(s.board.uri) ? { ...s, recommended: undefined } : s))

/** Announcements turned off: out of For you altogether, and never pinned anywhere else. */
function withoutAnnouncements(data: Story[], forYou: boolean): Story[] {
  if (forYou) return data.filter((s) => !s.pinned && !s.board?.official)
  return data.map((s) => (s.pinned ? { ...s, pinned: undefined } : s))
}

/** Any batches of stories (search results, say), moderated and ranked for the reader the way a channel is. */
export function rankStories(reader: Reader, batches: Story[][], opts: { sort: SortMode; native?: boolean; boost?: string[] }): Ranked[] {
  const moderated = batches.map((b) => b.flatMap((s) => moderateStory(s, reader.labelers, reader.warnings) ?? []))
  const { seen, affinity, votes } = reader.taste()
  return merge(moderated, {
    sort: opts.sort,
    native: opts.native,
    boost: opts.boost,
    extraTopics: allTopics(reader.interests).filter((t) => t.id.startsWith('q:')),
    filters: { mutedWords: reader.mutedWords, mutedDomains: reader.mutedDomains, hidden: reader.hidden },
    seen,
    affinity,
    votes,
  })
}
