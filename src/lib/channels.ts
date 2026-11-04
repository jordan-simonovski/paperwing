import type { FollowedPerson } from './people'
import { publisherRef } from './publishers'
import { channelId, parseChannelId } from './channelId'
import { BSKY_FEED_BY_RKEY } from './bskyFeeds'
import { boardParts } from './paperwing'
import { isTechTopic, literalTerm, TOPIC_BY_ID, TOPICS, searchTopics, type FeedRef, type Topic } from './topics'
import { mixFeedRefs } from './mixes'
import { cleanSource, isPublicSource, sourceLabel, type MixSource } from './mixSources'
import type { BlueskyFeed, CustomFeed, FollowedMix, Interest, LemmyCommunity, Mix } from './store'

export interface Channel {
  id: string
  label: string
  eyebrow: string
  blurb?: string
  hue?: number
  topic?: Topic
  feeds: FeedRef[]
  /** Keep the source's own order for "hot". */
  native?: boolean
  variants?: { id: string; label: string }[]
  variant?: string
  boost?: string[]
  related?: string[]
  /** What an empty list means here, when that's good news rather than a filter gone wrong. */
  quiet?: string
  /** A person's profile (u:<handle or DID>): the header shows who they are. */
  person?: string
  /** A community board (cb:<owner>:<rkey>): the header shows its rules and moderators. */
  board?: { did: string; rkey: string; uri: string }
  /** What to show instead of stories when the channel can't have any yet. */
  empty?: { title: string; body: string; action?: { label: string; to: string } }
  /** A link in the channel's header: editing your mix, the page of one you follow. */
  action?: { label: string; to: string }
}

/** For you for someone who follows nothing yet: a bit of everything. */
export const STARTER_TOPICS = ['world-news', 'science', 'web', 'ai']

/** Following any tech topic, or nothing yet: tech-only sources (HN, Lobsters, releases…) are shown. */
export const followsTech = (followed: string[]) => !followed.length || followed.some(isTechTopic)

/** "a, b and c": lists read as a sentence, never as a middle-dot string. */
export function listOf(items: string[]): string {
  if (items.length < 2) return items.join('')
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

function hueFor(s: string): number {
  let h = 0
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360
  return h
}

/** A user-defined interest behaves like a topic built from a search query. */
export function interestTopic(i: Interest): Topic {
  const words = i.query.split(/\s+/).filter(Boolean)
  // Headlines from any publisher, so an interest works for any subject; HN's take as well.
  const feeds: FeedRef[] = [
    { kind: 'news', q: i.query },
    { kind: 'hnSearch', query: i.query, topic: i.id },
  ]
  if (words.length === 1 && /^[a-z0-9]+$/i.test(words[0])) feeds.push({ kind: 'devto', tag: words[0].toLowerCase() })
  return {
    id: i.id,
    label: i.label,
    hue: hueFor(i.id),
    cluster: 'code',
    blurb: `Your interest, built from a search for “${i.query}”`,
    // What you typed, as written: "*NSYNC" or "C++" is text to find, not a pattern.
    terms: [literalTerm(words.length > 1 ? i.query : words[0])],
    related: searchTopics(i.query)
      .slice(0, 3)
      .map((h) => h.topic.id),
    feeds,
  }
}

export function allTopics(interests: Interest[]): Topic[] {
  return [...TOPICS, ...interests.map(interestTopic)]
}

export function findTopic(id: string, interests: Interest[]): Topic | undefined {
  const known = TOPIC_BY_ID.get(id) ?? interests.map(interestTopic).find((t) => t.id === id)
  if (known) return known
  const address = parseChannelId(id)
  const query = address?.kind === 'interest' ? address.id.slice(2).trim() : ''
  return query && query.length <= 200 ? interestTopic({ id, label: query, query }) : undefined
}

export function topicFeeds(t: Topic, limit?: number, statusHosts: string[] = []): FeedRef[] {
  // For you takes each topic's first few feeds plus its first two blogs, so writing isn't drowned out by aggregators.
  // Topics beyond tech are mostly publishers, so For you takes three of theirs.
  const blogs = t.hnQuery ? 2 : 3
  const feeds = limit ? [...t.feeds.filter((f) => f.kind !== 'rss').slice(0, limit), ...t.feeds.filter((f) => f.kind === 'rss').slice(0, blogs)] : t.feeds
  const bluesky: FeedRef[] = BSKY_FEED_BY_RKEY.has(t.id) ? [{ kind: 'bluesky', feed: t.id }] : []
  // For you gets a topic's busiest Lemmy community (listed first), today's top posts only, so a
  // slow community's week-old "hot" list stays out. Its own page gets all of them and its hashtags.
  const lemmy: FeedRef[] = (limit ? (t.lemmy ?? []).slice(0, 1) : (t.lemmy ?? [])).map((l) => ({
    kind: 'lemmy',
    community: l.community,
    sort: limit ? 'TopDay' : undefined,
    topic: l.check ? t.id : undefined,
    via: l.via,
  }))
  // Community feeds on Bluesky are conversation more than news: the topic's own page only, unless
  // the topic marks one for For you.
  const bsky: FeedRef[] = (t.bsky ?? []).filter((f) => !limit || f.forYou).map((f) => ({ kind: 'bskyFeed', uri: f.uri, name: f.name }))
  // The topic's PaperWing board: what people submitted to it.
  const board: FeedRef[] = !limit && TOPIC_BY_ID.has(t.id) ? [{ kind: 'paperwing', sort: 'hot', board: t.id }] : []
  const mastodon: FeedRef[] = !limit && t.mastodon?.length ? [{ kind: 'mastodon', feed: 'tags', tags: t.mastodon }] : []
  // Incidents belong on the topic's own page; For you stays news.
  // A topic that takes every provider (SRE) takes the pages you follow too.
  const status: FeedRef[] = !limit && t.status ? [t.status === 'all' ? { kind: 'status', hosts: statusHosts.length ? statusHosts : undefined } : { kind: 'status', providers: t.status }] : []
  // Releases belong on the topic's own page; For you (which passes a limit) stays news.
  const releases: FeedRef[] = !limit && t.repos?.length ? [{ kind: 'releases', repos: t.repos }] : []
  return [...(t.hnQuery ? [{ kind: 'hnSearch', query: t.hnQuery, topic: t.id, anyWord: true } as FeedRef] : []), ...board, ...bluesky, ...feeds, ...lemmy, ...bsky, ...mastodon, ...status, ...releases]
}

function uniqueFeeds(feeds: FeedRef[]): FeedRef[] {
  const seen = new Set<string>()
  return feeds.filter((f) => {
    const id = JSON.stringify(f)
    if (seen.has(id)) return false
    seen.add(id)
    return true
  })
}

interface Ctx {
  /** Format carried by a shared publisher link, before it is followed on this device. */
  publisherFormat?: 'standard'
  followed: string[]
  interests: Interest[]
  customFeeds: CustomFeed[]
  /** Bluesky feeds and lists followed as channels (bf-<uri>). */
  bskyFeeds?: BlueskyFeed[]
  /** Lemmy communities joined as channels (c:<name>). */
  communities?: LemmyCommunity[]
  /** Your mixes and the ones you follow (mix:<id>, mix:<did>:<rkey>). */
  mixes?: Mix[]
  followedMixes?: FollowedMix[]
  /** People followed on PaperWing: their listings join For you. */
  people?: FollowedPerson[]
  /** Community boards you've joined. */
  boards?: { uri: string; name: string }[]
  /** Suggest posts from boards you haven't joined (For you); on unless turned off. */
  boardPicks?: boolean
  releaseRepos?: string[]
  /** Signed in to Mastodon, so Following can work. */
  mastodon?: boolean
  /** Signed in with Bluesky, so its Following can work. */
  bluesky?: boolean
  /** The Bluesky sign-in can read the timeline: false for sign-ins from before Following, undefined until known. */
  blueskyTimeline?: boolean
  /** Hosts of the status pages you follow beyond the built-in ones. */
  statusHosts?: string[]
}

/** A Bluesky feed's or list's channel id. */
export const bskyFeedChannel = (uri: string) => channelId({ kind: 'bskyFeed', uri })

/** The Lemmy channel: the communities with the most going on, across the instances programming.dev follows. */
const LEMMY_TECH = ['technology@lemmy.world', 'programming@programming.dev', 'selfhosted@lemmy.world', 'opensource@lemmy.ml', 'localllama@sh.itjust.works', 'linux@lemmy.ml']

/** How a source channel is drawn: a network's own logo, or one of PaperWing's marks. */
export type SourceMark = 'paperwing' | 'hn' | 'lobsters' | 'bluesky' | 'mastodon' | 'lemmy' | 'frontpage' | 'status' | 'papers' | 'projects' | 'releases' | 'blogs'

export interface SourceChannel {
  id: string
  label: string
  mark: SourceMark
  /** Tech's own: shown to people who follow tech. */
  tech?: boolean
}

/** Every source with a channel of its own, in the order the sidebar, Explore and the command bar list them. */
export const SOURCE_CHANNELS: SourceChannel[] = [
  { id: 'paperwing', label: 'PaperWing', mark: 'paperwing' },
  { id: 'hn', label: 'Hacker News', mark: 'hn', tech: true },
  { id: 'lobsters', label: 'Lobsters', mark: 'lobsters', tech: true },
  { id: 'bluesky', label: 'Bluesky', mark: 'bluesky' },
  { id: 'mastodon', label: 'Mastodon', mark: 'mastodon' },
  { id: 'lemmy', label: 'Lemmy', mark: 'lemmy' },
  { id: 'frontpage', label: 'Frontpage', mark: 'frontpage' },
  { id: 'status', label: 'Status', mark: 'status', tech: true },
  { id: 'ml-research', label: 'ML papers', mark: 'papers', tech: true },
  { id: 'open-source', label: 'Projects', mark: 'projects', tech: true },
  { id: 'releases', label: 'Releases', mark: 'releases', tech: true },
  { id: 'blogs', label: 'Blogs', mark: 'blogs' },
]

/** The source channels a reader sees: tech's own only if they follow tech, and Blogs are Publishers to everyone else. */
export function sourceChannels(followed: string[]): SourceChannel[] {
  const tech = followsTech(followed)
  return SOURCE_CHANNELS.filter((c) => tech || !c.tech).map((c) => (c.id === 'blogs' && !tech ? { ...c, label: 'Publishers' } : c))
}

export function resolveChannel(id: string, variant: string | undefined, ctx: Ctx): Channel | undefined {
  // Ids come from URLs and prefs: a malformed one is no channel at all (channelId.ts).
  const a = parseChannelId(id)
  if (!a) return undefined
  if (id === 'for-you') {
    // Following nothing yet (a newcomer who skipped the tour): a starter mix, so there's news to read
    // straight away. It gives way to your own topics as soon as you follow one.
    const starter = !ctx.followed.length
    const topics = (starter ? STARTER_TOPICS : ctx.followed).map((f) => findTopic(f, ctx.interests)).filter((t): t is Topic => !!t)
    return {
      id,
      label: 'For you',
      eyebrow: starter ? 'A starter mix' : `${topics.length} interests`,
      blurb: starter ? `A starter mix of ${listOf(topics.map((t) => t.label))}. Follow topics to make it yours.` : `Ranked across ${listOf(topics.map((t) => t.label))}`,
      // The people you follow on Mastodon, kept to your topics: they're the one source you curated yourself.
      // HN's front page is tech: it's in For you only for someone following tech (or nothing yet).
      feeds: uniqueFeeds([
        ...(followsTech(ctx.followed) ? [{ kind: 'hn', list: 'top' } as FeedRef] : []),
        // PaperWing's own front page, for everyone.
        { kind: 'paperwing', sort: 'hot' } as FeedRef,
        ...topics.flatMap((t) => topicFeeds(t, 3)),
        ...(ctx.mastodon && topics.length ? [{ kind: 'mastodon', feed: 'home', topics: topics.map((t) => t.id) } as FeedRef] : []),
        // What the people you follow list on PaperWing (the most recently followed, to keep requests few).
        ...(ctx.people ?? []).slice(-20).map((p): FeedRef => ({ kind: 'person', actor: p.did, label: `@${p.handle}` })),
        // The boards you've joined (the ten joined last), and suggestions from ones you haven't.
        ...(ctx.boards ?? []).slice(-10).flatMap((b): FeedRef[] => {
          const p = boardParts(b.uri)
          return p ? [{ kind: 'board', ...p, sort: 'hot', name: b.name }] : []
        }),
        ...(ctx.boardPicks === false ? [] : [{ kind: 'boardpicks' } as FeedRef]),
      ]),
      boost: topics.map((t) => t.id),
      related: [...new Set(topics.flatMap((t) => t.related))].filter((r) => !ctx.followed.includes(r)),
    }
  }
  if (id === 'front') {
    return {
      id,
      // Not "Front page": PaperWing has a front page of its own.
      label: 'Tech front pages',
      eyebrow: 'Hacker News and Lobsters',
      blurb: 'Hacker News and Lobsters front pages merged and deduplicated',
      feeds: [
        { kind: 'hn', list: 'top' },
        { kind: 'lobsters', path: 'hottest' },
      ],
    }
  }
  if (id === 'hn') {
    const v = (['top', 'new', 'best', 'ask', 'show'] as const).find((x) => x === variant) ?? 'top'
    return {
      id,
      label: 'Hacker News',
      eyebrow: 'Source',
      feeds: [{ kind: 'hn', list: v }],
      native: true,
      variant: v,
      variants: [
        { id: 'top', label: 'Top' },
        { id: 'new', label: 'New' },
        { id: 'best', label: 'Best' },
        { id: 'ask', label: 'Ask' },
        { id: 'show', label: 'Show' },
      ],
    }
  }
  if (id === 'releases') {
    // Every followed topic's projects, plus the ones you've added yourself.
    const topics = ctx.followed.map((f) => findTopic(f, ctx.interests)).filter((t): t is Topic => !!t)
    const repos = [...new Set([...(ctx.releaseRepos ?? []), ...topics.flatMap((t) => t.repos ?? [])])]
    return {
      id,
      label: 'Releases',
      eyebrow: `${repos.length} projects`,
      blurb: repos.length ? 'New versions of the projects in your topics' : 'Follow a topic with projects, or add repositories in Settings',
      feeds: repos.length ? [{ kind: 'releases', repos }] : [],
    }
  }
  if (id === 'lobsters') {
    const v = variant === 'newest' ? 'newest' : 'hottest'
    return {
      id,
      label: 'Lobsters',
      eyebrow: 'Source',
      feeds: [{ kind: 'lobsters', path: v }],
      native: true,
      variant: v,
      variants: [
        { id: 'hottest', label: 'Hottest' },
        { id: 'newest', label: 'Newest' },
      ],
    }
  }
  if (a.kind === 'bskyFeed') {
    const uri = a.uri
    const list = uri.includes('/app.bsky.graph.list/')
    const feed = ctx.bskyFeeds?.find((f) => f.uri === uri) ?? { uri, name: list ? 'Bluesky list' : 'Bluesky feed' }
    if (!cleanSource({ kind: 'bskyFeed', ...feed })) return undefined
    return { id, label: feed.name, eyebrow: list ? 'Bluesky list' : 'Bluesky feed', feeds: [{ kind: 'bskyFeed', uri, name: feed.name }], native: !list }
  }
  if (a.kind === 'paperwing') {
    const board = a.board ? TOPIC_BY_ID.get(a.board) : undefined
    if (a.board && !board) return undefined
    const v = variant === 'new' || variant === 'top' ? variant : 'hot'
    return {
      id,
      label: board ? `${board.label} on PaperWing` : 'PaperWing',
      eyebrow: board ? 'PaperWing board' : 'Source',
      blurb: 'Links people posted to PaperWing. Each is a Bluesky post: likes are its votes, replies its comments. Post any link, or share a story you’re reading.',
      hue: board?.hue,
      feeds: [{ kind: 'paperwing', sort: v, board: board?.id }],
      native: true,
      quiet: 'Nothing here yet. Post a link, or share a story you’re reading, to be the first.',
      variant: v,
      variants: [
        { id: 'hot', label: 'Hot' },
        { id: 'new', label: 'New' },
        { id: 'top', label: 'Top this week' },
      ],
    }
  }
  if (id === 'frontpage') {
    const v = variant === 'new' || variant === 'top' ? variant : 'hot'
    return {
      id,
      label: 'Frontpage',
      eyebrow: 'Source',
      blurb: 'A Hacker News-style link aggregator on the open atproto network. Sign in with Bluesky (Settings, Sources) to vote and comment.',
      feeds: [{ kind: 'frontpage', feed: v }],
      native: true,
      variant: v,
      variants: [
        { id: 'hot', label: 'Hot' },
        { id: 'new', label: 'New' },
        { id: 'top', label: 'Top' },
      ],
    }
  }
  if (id === 'bluesky') {
    const following = variant === 'following'
    const signedOut = following && !ctx.bluesky
    const needsPermission = following && !!ctx.bluesky && ctx.blueskyTimeline === false
    return {
      id,
      label: 'Bluesky',
      eyebrow: 'Source',
      blurb: following
        ? 'Links shared by the people you follow, one story per link, with who shared it'
        : 'Tech posts from Bluesky, filtered and ranked by PaperWing. The same feed you can follow in the Bluesky app.',
      feeds: signedOut || needsPermission ? [] : [{ kind: 'bluesky', feed: following ? 'following' : 'tech' }],
      native: !following,
      empty: needsPermission
        ? {
            title: 'One more permission',
            body: 'Following reads your Bluesky timeline, and your sign-in is from before PaperWing asked for that. Allow it in Settings: Bluesky shows exactly what’s asked before you approve.',
            action: { label: 'Allow in Settings', to: '/settings/sources' },
          }
        : signedOut
          ? {
              title: 'Sign in to see links from people you follow',
              body: 'Sign in with Bluesky in Settings. Your sign-in stays on this device, and PaperWing only reads your timeline to find the links in it.',
              action: { label: 'Open Settings', to: '/settings/sources' },
            }
          : undefined,
      variant: following ? 'following' : 'tech',
      variants: [
        { id: 'tech', label: 'Tech' },
        { id: 'following', label: 'Following' },
      ],
    }
  }
  if (a.kind === 'board') {
    const uri = `at://${a.did}/io.paperwing.board/${a.rkey}`
    const joined = ctx.boards?.find((b) => b.uri === uri)
    const v = variant === 'new' || variant === 'top' ? variant : 'hot'
    return {
      id,
      label: joined?.name ?? 'Community board',
      eyebrow: 'Community board',
      feeds: [{ kind: 'board', did: a.did, rkey: a.rkey, sort: v, name: joined?.name }],
      native: true,
      board: { did: a.did, rkey: a.rkey, uri },
      quiet: 'Nothing here yet. Open a story, tap Share, list it on PaperWing and pick this board.',
      variant: v,
      variants: [
        { id: 'hot', label: 'Hot' },
        { id: 'new', label: 'New' },
        { id: 'top', label: 'Top this week' },
      ],
    }
  }
  if (a.kind === 'person') {
    const actor = a.actor
    const known = ctx.people?.find((p) => p.did === actor || p.handle === actor)
    return {
      id,
      label: known?.name ?? `@${known?.handle ?? actor}`,
      eyebrow: 'On PaperWing',
      feeds: [{ kind: 'person', actor: known?.did ?? actor, label: `@${known?.handle ?? actor}` }],
      native: true,
      person: actor,
      quiet: 'Nothing listed on PaperWing yet.',
    }
  }
  if (a.kind === 'mix' || a.kind === 'followedMix') {
    const own = a.kind === 'mix' ? ctx.mixes?.find((m) => m.id === a.id) : undefined
    const followed = a.kind === 'followedMix' ? ctx.followedMixes?.find((m) => m.uri.split('/')[2] === a.did && m.uri.split('/')[4] === a.rkey) : undefined
    // Someone else's mix never fetches a private feed, even from a copy kept before they were left out.
    const mix = own ?? (followed && { ...followed, sources: followed.sources.filter(isPublicSource) })
    if (!mix) return undefined
    const topicIds = mix.sources.flatMap((s) => (s.kind === 'topic' ? [s.id] : []))
    return {
      id,
      label: mix.name,
      eyebrow: followed ? `Mix by @${followed.by}` : own?.published ? 'Your mix, published' : 'Your mix',
      blurb: mix.description || listOf(mix.sources.slice(0, 5).map(sourceLabel)) + (mix.sources.length > 5 ? ` and ${mix.sources.length - 5} more` : ''),
      feeds: uniqueFeeds(
        mixFeedRefs(mix.sources, (tid) => {
          const t = TOPIC_BY_ID.get(tid)
          return t ? topicFeeds(t, 3) : []
        }),
      ),
      boost: topicIds,
      action: own ? { label: 'Edit', to: `/mixes/${own.id}` } : followed ? { label: 'About', to: `/mix/${followed.uri.split('/')[2]}/${followed.uri.split('/')[4]}` } : undefined,
      empty: mix.sources.length
        ? undefined
        : { title: 'Nothing in this mix yet', body: 'Add topics, publishers, communities or feeds to it.', action: { label: 'Edit the mix', to: `/mixes/${own?.id ?? ''}` } },
    }
  }
  if (a.kind === 'community') {
    // One Lemmy community, as its own channel: like a subreddit.
    const name = a.name
    const joined = ctx.communities?.find((c) => c.name === name)
    const v = (['Hot', 'New', 'TopDay', 'TopWeek'] as const).find((x) => x.toLowerCase() === variant) ?? 'Hot'
    return {
      id,
      label: joined?.title || `c/${name.split('@')[0]}`,
      eyebrow: `c/${name}`,
      feeds: [{ kind: 'lemmy', community: name, sort: v, via: 'lemmy.world' }],
      native: true,
      variant: v.toLowerCase(),
      variants: [
        { id: 'hot', label: 'Hot' },
        { id: 'new', label: 'New' },
        { id: 'topday', label: 'Top today' },
        { id: 'topweek', label: 'Top this week' },
      ],
    }
  }
  if (id === 'lemmy') {
    const v = (['Hot', 'New', 'TopDay'] as const).find((x) => x.toLowerCase() === variant) ?? 'Hot'
    // The tech communities for someone following tech, the communities behind every other topic
    // they follow, and the ones they've joined.
    const topics = ctx.followed.map((f) => TOPIC_BY_ID.get(f)).filter((t): t is Topic => !!t && !isTechTopic(t.id))
    const refs: FeedRef[] = uniqueFeeds([
      ...(followsTech(ctx.followed) ? LEMMY_TECH.map((community): FeedRef => ({ kind: 'lemmy', community, sort: v })) : []),
      ...topics.flatMap((t) => (t.lemmy ?? []).map((l): FeedRef => ({ kind: 'lemmy', community: l.community, sort: v, via: l.via, topic: l.check ? t.id : undefined }))),
      ...(ctx.communities ?? []).map((c): FeedRef => ({ kind: 'lemmy', community: c.name, sort: v, via: 'lemmy.world' })),
    ])
    return {
      id,
      label: 'Lemmy',
      eyebrow: `${refs.length} communities`,
      blurb: refs.length
        ? `The communities behind your topics and the ones you've joined: ${listOf(refs.slice(0, 6).map((r) => (r.kind === 'lemmy' ? `c/${r.community.split('@')[0]}` : '')))}${refs.length > 6 ? ' and more' : ''}`
        : undefined,
      empty: refs.length
        ? undefined
        : { title: 'No communities yet', body: 'Follow a topic or join a community, and its posts show up here.', action: { label: 'Explore communities', to: '/explore/communities' } },
      feeds: refs,
      native: v === 'New',
      variant: v.toLowerCase(),
      variants: [
        { id: 'hot', label: 'Hot' },
        { id: 'new', label: 'New' },
        { id: 'topday', label: 'Top today' },
      ],
    }
  }
  if (id === 'mastodon') {
    const v = variant === 'following' || variant === 'tags' ? variant : 'trending'
    const feed: FeedRef =
      v === 'following'
        ? { kind: 'mastodon', feed: 'home' }
        : v === 'tags'
          ? { kind: 'mastodon', feed: 'tags', tags: [...new Set(TOPICS.flatMap((t) => t.mastodon?.slice(0, 2) ?? []))] }
          : { kind: 'mastodon', feed: 'trends' }
    const signedOut = v === 'following' && !ctx.mastodon
    return {
      id,
      label: 'Mastodon',
      eyebrow: 'Source',
      blurb: v === 'following' ? 'Posts from the people you follow' : v === 'tags' ? 'Posts on the hashtags behind your topics' : 'Tech links and posts trending on your server',
      feeds: signedOut ? [] : [feed],
      empty: signedOut
        ? {
            title: 'Sign in to see who you follow',
            body: 'Connect your Mastodon account in Settings. PaperWing reads your timeline and only posts when you share, and the sign-in stays on this device.',
            action: { label: 'Open Settings', to: '/settings/sources' },
          }
        : undefined,
      native: v === 'following',
      variant: v,
      variants: [
        { id: 'trending', label: 'Trending' },
        { id: 'tags', label: 'Hashtags' },
        { id: 'following', label: 'Following' },
      ],
    }
  }
  if (id === 'status') {
    const v = variant === 'week' ? 'week' : 'active'
    return {
      id,
      label: 'Status',
      eyebrow: 'Source',
      blurb: v === 'active' ? 'Incidents providers are working on right now, from their status pages' : 'Every incident from the last week, newest first',
      feeds: [{ kind: 'status', active: v === 'active', hosts: ctx.statusHosts?.length ? ctx.statusHosts : undefined }],
      native: true,
      quiet: v === 'active' ? 'All clear: no provider is reporting an incident.' : undefined,
      variant: v,
      variants: [
        { id: 'active', label: 'Ongoing' },
        { id: 'week', label: 'Last 7 days' },
      ],
    }
  }
  if (id === 'blogs') {
    // Every tech blog for someone following tech (as it always was), plus the publishers of the
    // other topics they follow and their own feeds: never all of every pack at once.
    const tech = followsTech(ctx.followed)
    const own = ctx.followed.map((f) => TOPIC_BY_ID.get(f)).filter((t): t is Topic => !!t && !isTechTopic(t.id))
    const rssOf = (ts: Topic[]) => ts.flatMap((t) => t.feeds.filter((f) => f.kind === 'rss'))
    const feeds = uniqueFeeds([...(tech ? rssOf(TOPICS.filter((t) => isTechTopic(t.id))) : []), ...rssOf(own), ...ctx.customFeeds.map(publisherRef)])
    return {
      id,
      label: tech ? 'Blogs' : 'Publishers',
      eyebrow: `${feeds.length} feeds`,
      blurb: tech
        ? own.length
          ? 'Engineering blogs, labs and newsletters, and the publishers of your other topics'
          : 'Engineering blogs, labs and newsletters'
        : 'The publishers behind your topics, and feeds you added',
      feeds,
    }
  }
  if (a.kind === 'feed') {
    const url = a.url
    const custom = ctx.customFeeds.find((f) => f.url === url)
    return { id, label: custom?.label ?? new URL(url).hostname, eyebrow: 'Feed', feeds: [publisherRef(custom ?? { url, label: new URL(url).hostname, format: ctx.publisherFormat })], native: true }
  }
  const topic = findTopic(id, ctx.interests)
  if (topic) {
    return {
      id,
      label: topic.label,
      eyebrow: topic.id.startsWith('q:') ? 'Interest' : 'Topic',
      blurb: topic.blurb,
      hue: topic.hue,
      topic,
      feeds: topicFeeds(topic, undefined, ctx.statusHosts),
      related: topic.related,
    }
  }
  return undefined
}

/**
 * The public RSS feed mirroring a channel, where there is one (api/rss.ts): PaperWing's front page
 * and boards, topics, published mixes and people. Personal channels (For you, your own sources) have
 * none: they're built from your choices on your device.
 */
export function rssPath(id: string): string | undefined {
  const a = parseChannelId(id)
  switch (a?.kind) {
    case 'paperwing':
      return a.board ? `/rss/board/${a.board}` : '/rss/front'
    case 'named':
      return TOPIC_BY_ID.has(a.name) ? `/rss/topic/${a.name}` : undefined
    case 'person':
      return `/rss/u/${encodeURIComponent(a.actor)}`
    case 'board':
      return `/rss/c/${a.did}/${a.rkey}`
    case 'followedMix':
      return `/rss/mix/${a.did}/${a.rkey}`
    default:
      return undefined
  }
}

/** What a channel would be as a mix source, for Add to mix: a topic, interest, community, Bluesky feed or blog. */
export function mixSourceFor(channel: Channel, interests: Interest[] = []): { source: MixSource; label: string } | undefined {
  const a = parseChannelId(channel.id)
  const label = channel.label
  switch (a?.kind) {
    case 'named':
      return TOPIC_BY_ID.has(a.name) ? { source: { kind: 'topic', id: a.name }, label } : undefined
    case 'interest': {
      const interest = interests.find((i) => i.id === a.id)
      return interest ? { source: { kind: 'news', q: interest.label }, label: interest.label } : undefined
    }
    case 'community':
      return { source: { kind: 'lemmy', community: a.name }, label }
    case 'bskyFeed':
      return { source: { kind: 'bskyFeed', uri: a.uri, name: label }, label }
    case 'feed':
      return { source: { kind: channel.feeds[0]?.kind === 'standard' ? 'standard' : 'rss', url: a.url, label }, label }
    default:
      return undefined
  }
}
