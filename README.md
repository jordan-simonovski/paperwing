# PaperWing

A reader for the open web, organised by topic rather than by source. It started as a tech reader (Hacker News, Lobsters, status pages, arXiv, GitHub and about 85 engineering blogs) and now covers news, politics, science, culture, sport and anything else you can search for, from publishers' feeds, Lemmy communities, Bluesky feeds and Mastodon hashtags. It installs as a PWA and works offline.

## What it stands for

Social media went wrong in ways that were profitable: attention sold to advertisers, feeds tuned for time spent, people locked in so leaving cost them everything. PaperWing is built the other way round, and says so in the app at [paperwing.io/principles](https://paperwing.io/principles):

1. **You're the reader, not the product.** No ads, no selling data, no engagement targets. Paid for by readers on [Ko-fi](https://ko-fi.com/jordo92), not by growth targets.
2. **A feed you can read, and switch off.** The ranking recipe is written down and runs on your device; a chronological timeline is one tap away; nothing is optimised for time spent.
3. **What it learns about you stays with you.** No accounts, no analytics, no tracking; sync is encrypted on your device.
4. **Open networks, not a walled garden.** What you post lives in your own Bluesky, Mastodon, Lemmy or HN account. If PaperWing disappeared tomorrow, you'd lose nothing you made.
5. **Send people to the source.** Credit and clicks go to the people who wrote things and the communities that discussed them.
6. **Moderation you can see and choose.** Each network's moderation, plus the mutes and labelers you pick; PaperWing's own rules are written down.
7. **Open source, so you can leave with the code too.** Apache 2.0: read it, run it, fork it.
8. **Small on purpose.** Most of the work happens on your device, so it stays cheap enough to keep its promises.



- **Topics, not sources.** Eighteen hand-built topics (AI, Agents, Observability, SRE, Eng Leadership, Databases, …) each pull from their own mix of Lobsters tags, dev.to tags, RSS feeds and HN keyword searches. Every story gets topic tags by keyword. Each topic links to its neighbours ("near →"), so you can move sideways.
- **Search by topic or interest.** ⌘K (or `/`) resolves free text to topics ("tracing" → Observability, with SRE and Kubernetes nearby). It also searches Hacker News, or turns any query into a followed interest with its own feed.
- **Merged and deduplicated.** The same link posted to HN, Lobsters and Bluesky shows once, with "also on", and its engagement adds up.
- **Ranking across sources.** Each source has a reference for a solid story (100 points and 50 comments on HN, 20 points on Lobsters, 50 likes and 10 replies on Bluesky, …), so engagement converts to a common scale. Hot applies HN-style time decay to that, with viral posts capped. Then it splits the sources up: each story already placed from a source discounts that source's next one, and blogs are also discounted per publisher, so no single source owns the top of the list.
- **Shared or discussions.** Filter a feed to things shared (articles, papers, repos, images, video) or to posts that are the conversation itself (Ask HN, Bluesky text posts and quotes). A link typed into a Bluesky post counts the same as a preview card, so it merges with the HN thread for that link.
- **Thumbnails.** Rows show a picture when there is one: a Bluesky post's own image or link card, a dev.to cover, an RSS item's image, or else the link's OG image (looked up by `/api/feed?src=og`, which reads only the page's `<head>`, filters out site logos, and redirects to the image so it loads straight from the publisher; CDN-cached for a week). Papers and repos are skipped, since their preview cards are just text. Turn them off in Settings; they're also off when the browser asks to save data.
- **Bluesky media.** Images and video show in the reader and in replies. Video plays inline where the browser handles HLS natively (Safari, so every iOS browser and the installed app) and links to the post elsewhere.
- **Taste.** Saving a story nudges its topics and site up; hiding nudges the site down; the Related tab has explicit More and Fewer buttons. Stories you've scrolled past unopened in two or more sessions sink. Everything learned is listed in Settings, resettable, and synced.
- **Signal meter.** Instead of a rank number, each row shows how much engagement it has on that common scale.
- **Source spectrum.** The bar under each feed's title shows where its stories come from. Click a segment to filter.
- **Split pane.** On desktop, stories open beside the list. `j`/`k` walk the list, and once the pane is open they walk the stories.
- **Threads.** Reddit-style nested comments. Click any rail to collapse, collapse or expand all, sort by top, new or old. Comments new since your last visit are marked, `n`/`p` jump between top-level threads, and a minimap on the right shows thread sizes.
- **Reader view.** Article text is extracted server-side with Readability. arXiv links load the full HTML paper, not just the abstract.
- **Offline.** Save a story (`s`, the bookmark, or swipe right on mobile) to keep its article, images and comments on the device. Feeds you've loaded are also cached for three days, and the app shell is served by a service worker.
- **PWA.** Installable, with app shortcuts, a share target (share a link into PaperWing and it opens in the reader), an update prompt, and safe-area support. Edge-swipe back covers iOS standalone, which has no back gesture.
- Dark mode, three text sizes, compact density, muted words and domains, hide-read, and custom RSS feeds.

## Beyond tech

- **Packs.** Topics come in two packs: tech, and everything else: News (world, US, UK and Australian politics, business, climate), Science (science, space, health), Culture (film and TV, music, books, gaming), Sport (sport, football, Formula 1) and Life (food), in `src/lib/packs.ts`. Each bundles publishers' RSS feeds, the busiest Lemmy communities, Mastodon hashtags and the most-followed community feed on Bluesky. Every source was checked live when it was added. Match terms are kept specific so tech stories don't get tagged by accident (a test pins examples like "game engine" and "Rocket" the Rust framework).
- **Welcome.** A new install starts on `/welcome`: pick topics from any pack, or type anything ("Liverpool FC", "sourdough") to make it an interest. Someone who already uses PaperWing restores instead (`src/components/RestoreSync.tsx`): with their sync passkey, which is kept with their passwords so a new device usually has it already, or a sync code. Their topics, saved stories and settings arrive and they go straight in. Pairing from a link skips the page too.
- **Interests for anything.** A free-text interest pulls headlines from any publisher through Bing News's RSS (`/api/feed?src=news`). Its links go through a click tracker, so the real address is taken from it and stories link straight to the publisher, under the publisher's name. Bing offers this feed for personal feed readers. HN search still runs alongside.
- **Tech's own corners stay with tech.** Hacker News, Lobsters, the Front page, Papers, Projects, Releases and Status show in the menu only for someone following a tech topic (or nothing yet). For you only includes HN's front page for them, and Blogs becomes Publishers: the feeds behind your topics, not every engineering blog.
- **Explore** (`/explore`) has four tabs: Topics, Communities, Feeds and Publishers.
  - **Communities**: search Lemmy communities through lemmy.world, which federates nearly all of them (PieFed and Mbin included), ranked by how many people were active this month. Joined communities get their own channel (`/t/c:name@host`, with Hot, New and Top) and a place in the menu, and they sync.
  - **Feeds**: Bluesky's most-liked community feeds, searchable. No account needed.
  - **Publishers**: every pack's outlets, to follow one on its own, and a box that finds the feed for any site.
    Discourse forums, categories and tags can be followed here too: paste their page address to find the corresponding RSS feeds. Standard.site publications (including Leaflet) are read natively from their authors' AT Protocol records; paste the publication's website address. Both can be added to mixes and shared in a blogroll. Native publications keep their format in encrypted sync and OPML exports; other feed readers need Standard.site support to read those exported subscriptions.
    Standard.site checks the publication's well-known verification endpoint and each article's record link before showing it. It reads up to the newest 300 document records per author and shows up to 20 verified articles per publication.
- **Two Lemmy instances.** Tech communities are read through programming.dev, as before (keys `lm-<id>`). Everything else goes through lemmy.world (`lm-<id>@lemmy.world`), since post IDs differ per instance. The server only ever fetches from those two (`src/lib/lemmyKey.ts`).
- **Mixes** are channels you build from anything: topics, publishers, Lemmy communities, Bluesky feeds and news searches (`/mixes/new`, listed under Explore, Mixes). They sync like the rest.
  - **Publishing** writes the mix to your own atproto repo as an `io.paperwing.mix` record (the lexicon sits under PaperWing's domain, paperwing.io). Its share link (`/mix/<did>/<rkey>`) lets anyone follow it, and followers pick up your edits: followed mixes are re-read every 12 hours. The server reads mixes through `/api/feed?src=mix`, and every mix is re-checked on read in both the app and the server (`src/lib/mixSources.ts`), since it's someone else's data.
  - **As a Bluesky feed**: publishing can also write an `app.bsky.feed.generator` record pointing at PaperWing's feed generator. Its feed (`api/_lib/mixfeed.ts`) is the posts from the mix's Bluesky feeds plus, for each recent story from its other sources, the most-liked Bluesky post that shared it, found through Constellation. Each mix feed is rebuilt at most every ten minutes (cached in KV). Anyone can point a feed record at the generator, so sources are capped and only fixed hosts or safeFetch-guarded publishers are fetched.
  - Publishing needs two more sign-in permissions (writing mix and feed-generator records). Older sign-ins get an Allow button under Settings, Sources.
- **Coverage.** A news story's Related tab shows how other outlets are covering it, side by side: the feed's own grouped coverage plus a news search for the headline's names, places and numbers (`src/lib/coverage.ts`). Results are kept only when their headlines share enough of those words and ran within four days, and only one headline per publisher. There are no bias ratings: who said what is shown, and you judge. An "N outlets" chip shows how widely a story is covered: in the reader as soon as it opens (which starts the search), and on rows once the outlets are known (grouped by the feed, or searched before). Either jumps straight to the comparison.
- **Moderation** (Settings, Tuning and moderation; `src/lib/moderation.ts`):
  - **Labels.** Bluesky posts carry labels from Bluesky's own moderation and from authors themselves. Spam and scams are hidden; graphic media, nudity and the like go behind a warning, as Bluesky's defaults have it.
  - **Labelers.** Subscribe to independent labelers by handle. Their labels are requested with the `atproto-accept-labelers` header on every Bluesky read, and each of their labels can hide, warn or do nothing. Your choices sync.
  - **Content warnings.** Mastodon content warnings and labelled posts show a note on the row. You choose whether flagged posts are covered until tapped (pictures blurred, text folded), shown, or left out of feeds.
  - **Comments.** Comments with a muted word, or a hiding label, are folded with a reason and a Show button, and their replies stay reachable.

## Design

PaperWing is designed as a reading instrument whose one object is *where a story is being discussed*. The rules came from the frontend-design brief, [Hallmark](https://github.com/Nutlope/hallmark) and the [taste skill](https://github.com/Leonxlnx/taste-skill)'s app-screen chapter.

- **Ground:** near-neutral, with a hair of warmth (not cream), so the words read first. Dark mode is a neutral near-black. Chrome stays neutral.
- **Colour:** colour sits on data. A single signal red marks selection, new comments, hot threads and the active discussion. Each topic has a hue, used as a whole colour field on its page and as tints for its tags.
- **Type:** Atkinson Hyperlegible Next for everything you read and touch, chosen because the brief is readability. The wordmark is the one exception: Fraunces at 600, soft and a little wonky (`SOFT` 100, `WONK` 1), in ink, beside Pip.
- **Brand:** Pip, a paper owl reading a book, is the mascot and the mark (`design/readout-mascot.svg` and `readout-mascot-icon.svg`, the source of truth). Pip's colours are `--pip-*` roles in `styles.css`: the designer's palette in light mode, a dimmer, warmer paper in dark mode so Pip doesn't glare. Pip's red is the app's signal red, so the mark and the accents are one red; the wordmark stays in ink and lets Pip carry it. The app was called Readout until the rename: storage keys, IndexedDB names, sync and passkey key-derivation labels and QStash schedule ids still say `readout`, since renaming them would strand existing libraries, sync spaces and passkeys. `src/lib/pip.ts` holds the shapes once, tagged by part and colour role, for the inline SVG logo (`components/Pip.tsx`) and the animated canvas Pip. JetBrains Mono appears only for code inside articles.
- **Signature:** the discussion bar in the reader. It splits one link's conversation by source, and tapping a segment switches threads.
- **Refused on purpose:** eyebrows and tracked caps, mono labels, middle-dot meta strings, hairline row rules, counting-mark meters, paper grain, glass blur, and the cream-plus-serif look.

Every text colour pairing clears 4.5:1 in both themes, including all topic hues. Motion is limited to state changes and respects reduced motion.

## Architecture

A Vite + React SPA with a handful of Vercel Functions. There's no database. Preferences and history live in `localStorage`, and saved articles and cached feeds in IndexedDB.

| Source | Fetched from | Why |
| --- | --- | --- |
| Hacker News (Algolia + Firebase), dev.to | Browser | CORS-open |
| Bluesky | `/api/atproto` (our feed generator) for feeds, public AppView for threads | Search needs a server; threads are CORS-open |
| Lemmy (through programming.dev), Mastodon (Hachyderm, or your own server) | Browser | Public, CORS-open APIs |
| Lobsters, RSS/Atom, arXiv, HF papers, GitHub, favicons, OG images | `/api/feed` | No CORS, or XML that's easier to parse server-side |
| Reader view | `/api/extract` | Readability + linkedom |

Functions send `s-maxage` headers, so Vercel's CDN absorbs repeat requests. `/api/feed` and `/api/extract` accept arbitrary URLs and reject private/internal hosts.

```
api/            Vercel Functions (Web-standard GET handlers)
  _lib/         server-side fetchers (not deployed as functions)
src/lib/        sources, topics taxonomy, ranking, stores, offline library
src/components/ UI
src/routes/     pages
design/         Pip, the mascot and app mark (source SVGs)
sw/             service worker template (filled in at build time)
```

## Today

A daily edition: about 15 stories picked from your topics since the last edition, then an end. Each followed topic gets its top couple of stories before the hottest topic fills the rest, and anything you've read, hidden or saved is skipped. The edition is a snapshot, so it doesn't reshuffle while you read; a new one arrives the next day. Above it, a line points at new replies in threads you watch and new comments on saved stories.

Optional notifications need only the Upstash integration: Redis for subscriptions, QStash for the schedules. PaperWing generates its push signing keys (VAPID) on first use and keeps them in the database; set `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` only if you want your own, and before anyone subscribes, since changing them breaks existing subscriptions. The edition goes out at 21:00 UTC (08:00 in Sydney in summer); change `SCHEDULES` in `api/_lib/qstash.ts` to suit your timezone. On iPhone, notifications need PaperWing installed to the home screen.

## Alerts and the app badge

Settings, Notifications chooses per device:

- the daily edition
- new replies in threads you watch
- major and critical incidents from the status pages you pick
- Outage watch spikes, with a cooldown of six hours per provider

The app icon badge counts notifications since you last opened PaperWing, plus new replies while it's open.

How it works:

- Each device registers its push subscription, preferences and watch list (thread keys and when you last looked) with `/api/push`.
- A run (`GET /api/push?task=alerts`, every few minutes) reads the world once: ongoing incidents from the requested pages, comment counts for watched threads, and the outage scan. It then plans each device's notifications in `api/_lib/alerts.ts`.
- A thread's count when you last looked is its baseline, so only replies after that count. Each incident is announced once.
- Payloads use Declarative Web Push (`web_push: 8030`), which Safari 18.4+ delivers without waking the service worker. Elsewhere the service worker shows the same JSON and sets the badge.

Vercel's Hobby plan only runs crons daily, so both alerts and the edition run on Upstash QStash. To set it up, add **QStash** to the project from the Vercel Marketplace, using the same Upstash integration as the sync database, and redeploy.

- **What the integration sets:** `QSTASH_TOKEN`, `QSTASH_URL` and the two signing keys.
- **The schedules:** the first device to subscribe creates them, alerts every five minutes and the edition daily (`api/_lib/qstash.ts`). Only production does this, never a preview. Devices re-check them daily, which brings back a deleted schedule, and they're well within QStash's free tier.
- **Who can trigger a run:** QStash's signed requests are verified against the signing keys. Anything else needs `Authorization: Bearer <CRON_SECRET>`, so any other scheduler works too.

Settings shows when alerts last ran.

## Watching

The bell in the reader (or `w`) follows a discussion. PaperWing checks watched threads while it's open, counts replies posted since you last looked, and puts a dot on Saved. Saved's Watching tab lists them, newest activity first.

## Releases

A release radar for the projects your topics care about: Observability tracks the OpenTelemetry Collector, Prometheus, Grafana, Loki, Tempo, Jaeger and Vector; AI Infra tracks vLLM, SGLang and TensorRT-LLM; and so on (`repos` in `src/lib/topics.ts`). New versions appear in each topic and together under Releases; add your own repositories in Settings (they sync). They come from each repository's public `releases.atom`, so there's no API key and no API rate limit; pre-releases are skipped and each repo shows at most its two newest releases from the last 45 days.

## Outage watch

`/api/outages` looks for people saying a provider is down before its status page does. It reads the latest Bluesky posts matching "is down", "outage", "down for anyone" and "not loading", plus HN titles, and counts distinct people per provider (AWS, Cloudflare, GitHub, OpenAI, Claude, Vercel and about 20 more) whose post names the provider and a complaint in the same sentence. Handles, links, market talk and status-relay bots don't count. A spike is at least five people in 30 minutes and three times the rate of the 90 minutes before. Each provider's Statuspage status is shown alongside, so "people say it's down, the status page says it isn't" is visible at a glance. Spikes show as a banner on Today, For you, SRE, Observability and Cloud; the SRE side panel lists all current chatter. Cached two minutes at the edge.

## Bluesky and Frontpage (atproto)

Sign in with any atproto account (Bluesky, or your own server) under Settings, Sources, and PaperWing can write to the open network: what you write lands in your own repo, not on PaperWing's server.

- **Bluesky:** reply to posts and comments in Bluesky threads, like them, and post any story to Bluesky with its link card ("Post to Bluesky"). Links, @mentions and #tags in what you write become proper rich text (`src/lib/facets.ts`).
- **Frontpage** ([frontpage.fyi](https://frontpage.fyi)), a Hacker News-style link aggregator built on atproto, is a source with Hot, New and Top. Signed in, you can upvote and comment, and submit any story's link to it. Its feeds come from Frontpage's published feed skeletons; each post and comment is read from its author's own server, and votes and comments are counted and listed through [Constellation](https://constellation.microcosm.blue), a public index of links between atproto records (`api/_lib/frontpage.ts`). Both of Frontpage's record namespaces are read (`fyi.frontpage.feed.*` and the older `fyi.unravel.frontpage.*`); new records use the current one. Votes count distinct accounts. Frontpage is small and quiet for now.

Reading the open network:
- **Open-network discussions.** A story's Discussion tab also finds Bluesky posts and Frontpage submissions that link the same URL, through Constellation (`api/_lib/atlinks.ts`, `/api/feed?src=atlinks&url=`). Only Bluesky posts with replies are shown, most discussed first, so it's conversations rather than a list of shares.
- **Following.** The Bluesky channel has a Following view: links shared or reposted by people you follow, grouped by link, with "Shared by" names on each. It reads your own timeline (three pages, newest 300 posts) in the browser, so it needs you signed in. Links several people shared rank higher.
- **Feeds and lists as channels.** Paste any `bsky.app/profile/…/feed/…` or `…/lists/…` link under Settings, Sources, "Bluesky feeds and lists", and it becomes a channel in the rail. These read Bluesky's public API and don't need sign-in. They sync with your other settings.

How sign-in works (`src/lib/atproto.ts`):
- **In the browser.** atproto OAuth with PKCE and DPoP, via `@atproto/oauth-client-browser`; keys and tokens stay in this browser's IndexedDB. The client metadata is served from `/oauth-client-metadata.json` (a test keeps it identical to the code).
- **Narrow permissions.** Only creating posts and likes (and deleting your likes), Frontpage posts, comments and votes, and reading your timeline (for Following). No access to the rest of the account. When a new permission is added, existing sign-ins keep working for everything else and are asked to sign in again for the new feature.
- **Private handle lookup.** Handles are resolved by PaperWing's own server (`/xrpc/com.atproto.identity.resolveHandle`: DNS, then the well-known file), not Bluesky's, so signing in doesn't tell a third party who's asking.
- **iPhone home-screen app.** An installed app can't be redirected back into, so the sign-in finishes in Safari, which shows a code to paste back under Settings. The code is useless without the keys the app holds.
- **Known advisory.** The atproto libraries depend on zod 3, which has a memory-exhaustion advisory (GHSA-mrhx-c7xc-m3w5) with no 3.x fix. It only runs in the browser, where the worst case is a hostile server stalling your own tab; PaperWing skips `@atproto/api` to keep that surface small.

## Lemmy account

Sign in under Settings, Sources with any Lemmy server (`src/lib/lemmyAccount.ts`). Lemmy's API is open to browsers, so the username and password go straight from the browser to your own server, never through PaperWing's. The sign-in token it returns stays on this device and isn't synced. Two-factor codes are asked for when the account uses them.
- **Acting on posts read elsewhere.** PaperWing reads Lemmy through programming.dev and lemmy.world, and each server numbers posts and comments its own way. So a vote or reply first looks the item up on your server by its address (`resolve_object`), then acts there.
- **What you get:**
  - A Lemmy story's up arrow is a real upvote, and comments get Upvote and Reply. Your reply shows in the thread straight away.
  - Lemmy stories get a Comment button.
  - Share can post the link to one of your communities, using your take as the post's text.
- **Communities stay in step.** Signing in brings in the communities you follow ("Import my communities" does it again later), and joining or leaving one in PaperWing does the same on your account.
- **Activity** gets your Lemmy replies and mentions, and your posts and comments. Their threads open through your own server.

## Hacker News account

Sign in under Settings, Sources to upvote and comment on Hacker News from PaperWing (`api/hn.ts`, `api/_lib/hn.ts`). HN has no write API or app sign-in, so this works the way every third-party HN app does:
- **Sign-in.** Your username and password go to HN once, through PaperWing's server, which keeps neither and logs nothing. HN's own session cookie comes back and is stored on this device only, never synced. The server allows a few sign-in attempts per address per 15 minutes, so it can't be used to guess passwords.
- **Votes and comments.** Each one sends that cookie along. The server reads the one-time token HN puts in the item's own page (the vote link, the reply form) and acts with it. It only ever fetches `news.ycombinator.com`, with validated item IDs, and never follows a link anywhere else.
- **In the app.** Signed in, an HN story's up arrow is a real upvote on HN as well as "more like this". Stories get a Comment button, and comments get Reply and Upvote (never on your own). A new comment shows in the thread straight away.
- **Limits.** If HN asks for a captcha (it does after failed sign-ins), sign in once at news.ycombinator.com first. An expired cookie signs you out here with a note to sign in again.

## Social, on the open web

PaperWing's social features are public atproto records in each person's own Bluesky account (`src/lib/social.ts`), found through Constellation, so they need no database and belong to the people who make them. Bluesky stays the place for reputation: likes are votes, replies are comments.

- **Shared items** (`io.paperwing.share`): Google Reader style. Share a link with a note; it shows on your profile, in its RSS feed, and in For you for people who follow you.
- **Blogrolls** (`io.paperwing.blogroll`): opt in under Settings, Your feeds, and your profile lists the blogs you read, with Follow all.
- **Margin notes** (`io.paperwing.note`): select a passage in the reader view and note it. Notes from anyone are highlighted in the article (CSS Highlight API) and listed under it.
- **Community boards** (`io.paperwing.board`): a space with a name, rules and moderators, at `/c/<owner>/<id>`. Listings are submissions linking to the board's page; moderators hide listings with `io.paperwing.boardhide` records; the owner can keep accounts out with a Bluesky moderation list.
- **Webmentions**: blogs replying to an article, through webmention.io, under its discussions.
- **RSS out and OPML**: every public page is a feed at `/rss/...` (front page, boards, topics, mixes, profiles, community boards), and Settings imports and exports OPML.
- **Mixes**: Add to mix sits next to Follow on blogs, topics, communities and feeds.

## Posting to PaperWing

PaperWing has its own front page of links people submit, with Bluesky as the backend (`src/lib/paperwing.ts`, `api/_lib/paperwing.ts`):
- **A submission is a normal Bluesky post** (your take, or the title, with the link card and its picture), plus an `io.paperwing.submission` record in your own repo that points at the post and names its board (a topic). Comments are the post's Bluesky replies and votes are its likes, so people join from the Bluesky app without knowing PaperWing exists.
- **Finding submissions** needs no database or firehose. Each record links to `https://paperwing.io` and to its board's page (`https://paperwing.io/b/<topic>`). Constellation lists records by the address they link to, so the server reads those records, keeps the ones whose author matches the post's, and hydrates the posts from Bluesky's public API.
- **Ranking** is Hacker News gravity: (likes + 2 × replies + reposts + 1) / (age in hours + 2)^1.6, plus New and Top this week. It's cached for a minute, so a new submission shows up within about two.
- **Where it shows:** the PaperWing channel (Hot, New, Top), each topic page's board, and For you. Two Bluesky feeds, "PaperWing" and "PaperWing New", serve the same ranking to the Bluesky app; publish them with `FEEDGEN_HOSTNAME=paperwing.io npm run publish-feeds -- paperwing paperwing-new`.

**Share** replaces "Post to Bluesky" and "Submit to Frontpage" with one sheet: one title, an optional take, and a tick per place you're signed in.
- **Bluesky**, optionally also listed on PaperWing with a board.
- **Hacker News** submits the link through your HN sign-in. HN caps titles at 80 characters, and an existing submission of the same link opens that thread.
- **Mastodon** posts your take and the link (this needs a posting permission; older sign-ins are asked to sign in again).
- Each place shows its own character count, and the result comes back per place.
- **Votes go to the network.** Signed in where a story lives, its up arrow is a real vote there too (`src/lib/platformVote.ts`): an HN upvote, a Bluesky like (including PaperWing posts), a Frontpage vote, or a Mastodon favourite for posts read through your own server. Never on your own posts.

Frontpage stays as a source to read, vote and comment in; submitting to it is gone, since PaperWing does that job with Bluesky's audience.

## Activity

`/activity` (the bell on phones, Activity in the sidebar) gathers what's happened to you on every network you're signed in to, and what you've written there (`src/lib/inbox.ts`). It has three views, Notifications, Posts and Comments, and a filter per network. Anything opens its thread in the reader.
- **Bluesky:** your notifications (replies, mentions, quotes, likes, reposts, follows), read with one more sign-in permission (older sign-ins get an Allow button), plus your posts and replies from the public API. Nothing is marked read on Bluesky.
- **Hacker News:** HN has no notifications, so replies are found the way HN reply services do: the replies under what you wrote in the last fortnight (Firebase), plus your stories and comments (Algolia).
- **Frontpage:** no notifications either. PaperWing's server reads your posts and comments from your own repo and finds replies to them through Constellation (`/api/feed?src=fpactivity`).
- **Mastodon:** your notifications and posts, from your server.

Likes and reposts on the same post within a day fold into one line. What's new is tracked on this device, and the count shows on the nav. It's checked every five minutes while the app is open.

## Spice

Rows and the reader show one to three chillies on heated discussions: lively, heated, flamewar. Calm ones show nothing. Spice measures disagreement, not negativity: a thread that agrees a company got it wrong is negative but calm, and two camps arguing is spicy. The **Spicy** sort (on mixed feeds and topics) ranks like Hot, then puts the most heated discussions first. Hot itself is untouched, so heat never pushes stories up the default feed. Settings, Appearance turns the chillies off.

Grading uses [Jev](https://docs.typesafe.ai/introduction), TypeSafe's classifier (`api/spice.ts`, `api/_lib/spice.ts`):
- **What's sent:** the server fetches the thread itself from a fixed host (Hacker News, Lobsters, Bluesky, Lemmy through programming.dev, and dev.to) and sends ~80 comments, trimmed, with who replies to whom. They're spread across the top sixteen conversations, each getting an equal share first, so one long argument under the top comment can't stand for the whole thread.
- **What's asked:** one Score question rates the heat on a four-level rubric. Four yes/no questions ask whether people split into sides, push back on each other, attack each other personally, or pile on together. The chillies and their reasons are worked out from those answers in code: Jev classifies but doesn't write text.
- **When:** rows ask for their stories' grades in one batched request. Threads big enough to judge (25+ comments on HN and Bluesky, 20 on dev.to, 15 on Lemmy, 12 on Lobsters, whose threads run smaller) that aren't graded yet are graded in the background after the response, and the client asks again shortly. A thread is regraded only once it has grown by half. Grades are shared by every reader and kept for two weeks.
- **Cost:** Jev bills input only, $0.042 per million tokens, and a grade is about 10k tokens, so roughly $0.0004 a thread. `SPICE_DAILY_LIMIT` (default 3000 a day, about $1.30 at most) caps it whatever anyone sends.

To turn it on, add `TYPESAFE_API_KEY` (from the [TypeSafe console](https://console.typesafe.ai/keys)) to the project and redeploy. It also needs the Upstash database. `TYPESAFE_MODEL` pins another Jev version; the default is `jev-1.14.0`, pinned so the thresholds don't drift with the `jev-latest` alias.

## Seasonal Pip

Pip dresses for the season everywhere it appears (the header logo, the launch splash, the summary mascot, the bouncing logo): a Santa hat from 1 to 26 December, a party hat from New Year's Eve to 2 January (with confetti in the splash), a heart on 13 and 14 February, bunny ears from Good Friday to Easter Monday, and a witch's hat through Halloween's last week (`src/lib/season.ts`, hats in `src/lib/pip.ts`). Settings, Appearance turns it off. `?season=halloween` on any page tries one out. The home-screen icon stays as it is: an installed app's icon can't change by itself.

## Comments

- **Formatting where the source has none.** Hacker News and Bluesky show text as typed, so the markdown people use there shows as written: a paragraph starting `>` is a quote, `- ` and `1. ` lines are a list, and `code`, **bold** and *italic* are styled (`src/lib/markup.ts`). Links and code blocks pass through untouched. Lobsters, Lemmy and dev.to already send formatted HTML.
- **Colour-coded threads.** Settings, Appearance can colour each reply depth's rail (blue, teal, green, amber, pink, violet, then round again), so you can follow who's answering whom. Off by default.

## Following blogs

Paste a blog's address, one of its posts, or its feed under Settings, Sources, and PaperWing finds the feed (`api/_lib/discover.ts`, `/api/feed?src=discover`): the page's own `<link rel="alternate">` tags, the known addresses on Substack, Medium, Blogger, dev.to and GitHub, and failing those the usual paths (`/feed`, `/atom.xml`, `/index.xml` and friends) at the root and under the post's folder. Every candidate is fetched and parsed, so only real feeds with posts come back.

- **From the reader:** a story from a blog with a feed you don't get shows **Follow** beside its site. One tap, and its new posts land in Blogs (with Undo).
- **Blogs you keep reading:** opening three or more stories from the same site in two months suggests it in Settings, Sources, with its feed already found. Aggregators, social networks and code hosts are left out, and so are the built-in blogs.

Followed blogs sync with your other feeds.

## Search

Search asks every source that can search, all at once, and shows each as it answers (`src/lib/search.ts`):
- **Hacker News** through Algolia.
- **Bluesky** through its own search, run by the deployment (`/api/atproto?route=search`), with the same spam, bot and language checks as the feeds.
- **Lemmy** across every community programming.dev knows about. Lemmy also matches post bodies, so every word has to be in the title.
- **Mastodon** hashtags, for one-word searches: without signing in, Mastodon only searches tags.
- **Your feeds:** every story already loaded on the device, which covers the sources with no search of their own (Lobsters, dev.to, the blogs, releases).

Results are merged and ranked together, so the same link from several places shows once with "Also on". Chips above the results show each source's count and narrow to one.

## Discussion summaries

Above a story's comments, **Summarize** has Claude read every thread about it (its own, the same link on other sites, and other coverage of the event, up to four places) and pull out the main themes, the real disagreements with each side, and the comments worth reading in full. Every point cites the comments behind it; tapping a name jumps to that comment. Long threads are trimmed to their top comments, and the card says how many were read.

It runs on `api/summarize.ts` with the Anthropic SDK and structured output, on Claude Opus 5.5 by default (`SUMMARY_MODEL` to change it), with server-side refusal fallback on. Set `ANTHROPIC_API_KEY` on the deployment, or add your own key in Settings: it stays in your browser and goes out only with each summary request. When the deployment's key pays, each visitor gets `SUMMARY_DAILY_LIMIT` summaries a day.

Summaries are paid for once:
- **On the device.** Every summary is kept per story for 60 days (`src/lib/summaryCache.ts`, IndexedDB). Reopening a story shows it straight away, and PaperWing never asks Claude again on its own. Once the discussion has grown (15 new comments, or a quarter more), the card offers **Update with N new comments**; **Redo** is always there.
- **Across your devices.** With sync on, summaries travel as sealed records like everything else, so one made on the desktop is already on the phone.
- **On the server.** An identical request (same comments, same scores) is answered from the sync database for three days without calling Claude.

## Read later

Saving a story (`s`, the bookmark, a right swipe, the share sheet, or the bookmarklet in Settings) puts it in your queue with its article, images and comments stored on the device. Each saved story shows its reading time and how far you've got; opening it again resumes where you stopped, and reaching the end archives it (`e` archives by hand).

What makes it different from Pocket-style apps: saved stories keep their discussions. The Saved page re-checks them and tells you when there are new comments, or when the link has started being discussed somewhere new, since you last looked. Search covers the full text of everything saved.

Settings imports Pocket, Instapaper and Omnivore exports (or any bookmarks file) and exports Markdown or JSON.

**Saving from other apps.** On Android and desktop Chrome, an installed PaperWing is in the share sheet. iOS doesn't put web apps there, so Settings shows a one-time Apple Shortcut recipe instead. The Shortcut posts the shared link and your sync code to `/api/sync?inbox`; the server looks up the page title and adds the link to your synced queue, and every device fetches the article on its next sync. Settings and the Saved page also have **Save link from clipboard**.

PaperWing asks the browser to keep its storage through cleanups (`navigator.storage.persist()`) at the first save. Settings, Data shows whether it agreed.

### Sync

Optional, and there are no accounts. Everything hangs off a 26-character sync code, which a device gets one of three ways:

- **A passkey.** "Create a sync passkey" on the first device, "Use my sync passkey" on the rest. Passkeys are kept by the system password manager (iCloud Keychain, Google Password Manager, 1Password), which already carries them between your devices. The WebAuthn PRF extension gets the same secret out of the passkey everywhere, and the code is derived from it (`src/lib/passkey.ts`). Nothing about the passkey reaches the server. It needs iOS 18 or a recent Chrome, and it's tied to the domain: moving to a new domain means setting sync up again.
- **A pairing link or QR code.** The code travels in the URL fragment, which browsers never send to a server.
- **Typing the code.**

Records are encrypted on the device with AES-GCM before upload, under keys derived from the code (`src/lib/syncCrypto.ts`). Each is stored under an HMAC of its real key, so the database holds neither what you saved nor its titles; only the timestamps are visible. The sync function sees the code in transit to find your space, and stores none of it. The iOS Shortcut inbox seals what it saves the same way. Records written before encryption stay readable, and older app versions ignore sealed records rather than misreading them.

The server stores records under a hash of the code. Each saved item, deletion and the synced preferences (topics, interests, feeds, mutes) is last-writer-wins; articles themselves aren't synced, each device downloads its own.

To turn it on, add **Upstash Redis** from the Vercel Marketplace to the project (the free tier is plenty) and redeploy. That sets `KV_REST_API_URL` and `KV_REST_API_TOKEN`.

## Bluesky feeds

PaperWing runs its own Bluesky feed generator, so the same filtered feeds work in the Bluesky app and inside PaperWing. There's one broad "PaperWing Tech" feed plus one per topic (`npm run publish-feeds -- --list` shows them).

How it works: `api/atproto.ts` answers Bluesky's `getFeedSkeleton`. It runs a few searches built from each feed's strong terms in `src/lib/bskyFeeds.ts`, filters and ranks the results, and returns post IDs. Bluesky renders the posts itself. Results are cached for two minutes, and nothing runs in the background.

The filtering is strict because general Bluesky isn't a tech forum:
- A post has to contain a strong term itself. A search hit alone isn't enough.
- Ambiguous words don't count: Prometheus is also a film, Jepsen a singer, React a verb.
- Posts mentioning election politics need two strong terms.
- Replies, other languages, status-page bots and job ads are dropped.
- No account gets more than three of the top slots.

The Tech feed also requires a shared link or two strong terms. The tests in `api/_lib/bsky.test.ts` pin real false positives so tuning can't reintroduce them. To see why a post got in, open `/api/atproto?route=stories&feed=<rkey>&why=1`.

To set it up:

1. In Vercel, set `BSKY_HANDLE` to your handle and redeploy. Check that `https://paperwing.io/.well-known/did.json` shows `did:web:paperwing.io` (it answers for whichever address it's fetched from).
2. Create an app password in Bluesky (Settings → Privacy and security → App passwords).
3. Publish the feeds you want:

   ```sh
   BSKY_HANDLE=you.bsky.social BSKY_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx \
   FEEDGEN_HOSTNAME=paperwing.io npm run publish-feeds -- tech observability ai
   ```

   The script reads the feed list from your deployment, checks the `did:web` document, uploads the PaperWing icon as the avatar, and confirms with Bluesky that each feed is online. Re-running it updates the feeds in place. `--remove` unpublishes them.
4. The feeds appear on your Bluesky profile under Feeds, ready to pin.

Search currently works without logging in. If Bluesky changes that, also set `BSKY_APP_PASSWORD` on the deployment and searches will run as your account.

## Domain

PaperWing lives at **paperwing.io**. It was first served from `tech-reader-nine.vercel.app`, which keeps working:
- **Sign-in metadata per address.** `/oauth-client-metadata.json` is built by `api/atproto.ts` for whichever of the two addresses asks (`src/lib/oauthClient.ts`), so Bluesky sign-in works on both. A sign-in belongs to the address it was made on.
- **Feeds keep working.** `/.well-known/did.json` answers for the address it's fetched from, so feeds published under `did:web:tech-reader-nine.vercel.app` keep being served, and new ones can use `did:web:paperwing.io` (`FEEDGEN_HOSTNAME=paperwing.io npm run publish-feeds`).
- **Moving your data.** Everything kept in the browser belongs to the address it was saved on. On the old address, a card offers the move once paperwing.io is live: it turns on sync if needed, syncs, and opens `paperwing.io/pair#<code>`, which pairs the new address with the same space. Bluesky, Hacker News and Mastodon sign-ins don't sync, so sign in again there.

## Brand artwork

The link preview image (`public/og.png`, used by the page's Open Graph tags) and the Bluesky account's avatar and banner (`brand/`) are drawn by the app itself, from Pip and the wordmark font, on a development-only page (`src/routes/BrandPage.tsx`). To redraw them after a change, run the dev server and then `node scripts/brand.mjs`.

## Develop

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full guide: setup, checks, how the code is laid out, and what to keep in mind.

```sh
npm install
npm run dev        # Vite plus the /api functions mounted as middleware
npm test
npm run build
```

`npm run icons` re-renders `public/icon.svg` and the PNG icons from `design/readout-mascot-icon.svg` with Playwright: Pip's head on an ink tile.

## Deploy

Import the repo into Vercel. It detects Vite, builds to `dist`, and deploys `api/*.ts` as functions. `vercel.json` handles SPA rewrites and cache headers. No configuration is required.

Optional environment variables (see `.env.example`):

- `GITHUB_TOKEN`: raises the GitHub search rate limit for the Projects feed.
- `PAPERWING_OFFICIAL`: PaperWing's own account DIDs. Boards they own are official (badge, moderators-only posting, a pinned front-page announcement). Without it no board is official.

## Pretext motion

[Pretext](https://github.com/chenglou/pretext) lays text out with arithmetic over cached glyph widths, so the app can ask where every word of a headline would sit at any width and size, sixty times a second, without touching the DOM. PaperWing uses that for motion (`src/lib/pretext/`):

- **Opening a story:** the row's headline words fly into the reader's headline, re-wrapping as they grow.
- **Arriving at a feed, or changing its sort:** the visible headlines settle in, each fading up a few pixels after the one above. It animates the real headlines, so nothing can land out of place. It has its own switch under Motion, for anyone who wants the rest without it.
- **While a feed loads:** the names of the sources drop into a justified block, as if set in a composing stick.
- **While Claude summarises:** something keeps you company, chosen in Settings, Discussion summaries (`src/lib/pretext/actors.ts`):
  - Pip (the default), waddling through the card with its book: feet stepping, wings rocking, glancing down to read along, blinking now and then.
  - The logo (Pip's head in one colour, and the wordmark) bouncing around like an old DVD screensaver, changing colour at every wall. It hits a corner now and then and celebrates.
  - A drifting orb.
  - A plain spinner.

  The discussion's own words flow around the animated ones, each row split where they stand and filled one line at a time. When the summary lands, its opening pours out of them.
- **Menus and sheets:** their items deal out of the button that opened them.
- **Launch on phones:** a paper plane swoops in and skims along the line, dropping each letter of the wordmark into place as it passes, loops back over the top and lands where the mark goes, then unfolds into a creased sheet that flips over into Pip (`src/lib/splash.ts`). The flight varies a little every launch, and the time of day shows: a sleepy glide and half-shut eyes at night, a warm glow in the morning, a barrel roll in the evening. Then the logo glides up into the header. A tap skips it; Settings, Appearance, Motion replays it.

Every animation starts and ends on the browser's real positions (measured once with Ranges), so nothing jumps at either end; pretext drives everything in between. Pretext loads in its own chunk when the browser is idle. It's on by default: Settings, Appearance, Motion turns it off (or just the feed animation), and it stays off under the system's reduced-motion setting. Without it the app uses plain, quick transitions and a spinner while Claude summarises.

## Votes and taste

Every row has Reddit-style up and down arrows around the source's own score. Votes never leave the device. They don't reach Hacker News or anywhere else: they teach PaperWing what you want more and less of.

Each story is tagged with weighted features (`src/lib/features.ts`):

- its topics, which count most
- its site or publisher, Lemmy community, or social author
- its source
- its format: paper, repo, release, incident, video, Show HN, question, postmortem, tutorial, launch, opinion, discussion or article
- up to six title keywords

A vote adds the story's features to your taste profile (or takes them away), normalised so a long title doesn't count more than a short one. Ranking multiplies each story by its similarity to the profile, between 0.35× and 2.5×.

Saves teach half as much as a vote, and hides a little less again. A story you voted on also moves itself: down to a third, or up by 1.3×. Votes don't reorder the list while you're on it; the next refresh or visit reflects them.

The profile syncs between devices. Settings → Tuning shows what it has learned, with a way to forget any of it. The reader shows why a story ranks where it does ("Ranked up: you like Observability and opentelemetry.io"). Shortcuts: `u` and `d`.

## Lemmy and Mastodon

**Lemmy** is read through programming.dev, which federates the big tech communities from lemmy.world, lemmy.ml and elsewhere. The Lemmy channel merges the busiest ones (c/technology, c/programming, c/selfhosted, c/opensource, c/localllama, c/linux). Each topic also has its own communities, set in `src/lib/topics.ts`. Broad communities like c/technology are checked against the topic's terms; dedicated ones like c/localllama aren't. Posts are Markdown, and threads come back already nested, up to 300 comments. Opening a link also finds Lemmy threads about it, alongside HN's.

**Mastodon** reads from Hachyderm by default, a tech-focused server:

- **Trending** is the server's trending links and posts, kept to ones that match a topic.
- **Hashtags** ORs the hashtags behind every topic into one request. Bots, replies and posts in languages you don't read are dropped.
- Each topic page also gets its own hashtags.
- **Following** is your home timeline, once you sign in under Settings. Posts from people you follow also join For you when they match your topics, with a boost, since they're the one source you curated yourself.

Sign-in is OAuth with PKCE, run entirely in the browser. PaperWing registers itself with your server, asks for `read` only, and keeps the token in `localStorage`. The token is never synced and only ever sent to your server. An installed iOS app can't be redirected back into, so there the server shows a code to paste instead.

## Status pages

The Status channel reads incidents from 23 providers' Atlassian Statuspage pages (`api/_lib/statuspages.ts`), with two views: Ongoing, and Last 7 days. The providers are:

- **AI:** OpenAI and Claude.
- **Cloud and hosting:** Cloudflare, Vercel, Netlify, Fly.io, Supabase, DigitalOcean, Render and HashiCorp.
- **Developer tools:** GitHub, npm, Docker, CircleCI and Atlassian.
- **Observability:** Datadog, Grafana Cloud, Honeycomb, Sentry, New Relic, Elastic and incident.io.
- **Chat:** Discord.

Each incident is a story with its impact, how long it lasted and what it affected. Opening one shows its updates as a timeline. Notices with no impact are left out, and so is Twilio, which posts dozens of carrier-level delays a week.

There are no votes, so incidents rank by impact: critical counts like a 300-point HN story, major 100, minor 30, half again while ongoing. Topic pages include the relevant providers: SRE gets all of them, Observability the observability vendors, Cloud the hosting platforms, and AI and LLMs get OpenAI and Claude. For you doesn't include them. Responses are cached for two minutes at the edge.

You can follow more pages under Settings → Status pages you follow, by pasting an address or just a name ("clickhouse" becomes status.clickhouse.com). There are one-tap suggestions for ClickHouse, Snowflake, MongoDB, Confluent, Temporal, Tailscale, Pinecone, LaunchDarkly, Cursor and Mistral.

- **Which pages work:** any page publishing the Statuspage API (`/api/v2/incidents.json`), which covers Atlassian Statuspage and incident.io pages. Instatus and Better Stack pages don't work yet.
- **Checks:** the server confirms a page is a public host that publishes incidents before you follow it. It fetches followed pages without following redirects, up to 25 per request.
- **Where they show up:** the Status channel and SRE, alongside the built-in providers. The list syncs between devices.

## Security

There are no accounts, so the things worth protecting are the secrets kept on each device (your Anthropic key, your Mastodon sign-in, your sync code) and the server's ability to fetch any URL.

- **Fetching URLs people chose.** Feeds, reader view, preview images and icons all go through `safeFetch` (`api/_lib/http.ts`). Every address is checked against private, loopback, link-local and other non-public ranges, including IPv6 forms that wrap an IPv4 address. Each redirect is checked as a new destination. The connection is pinned at connect time, so DNS rebinding can't swap in a private address. Downloads stop at a size limit rather than after buffering.
- **Content from elsewhere.** Comments, articles and posts are cleaned by DOMPurify in the browser right before they're shown. A Content-Security-Policy (`vercel.json`) allows only PaperWing's own scripts. The one inline script is allowed by its hash, which `api/_lib/csp.test.ts` keeps current. The app can't be framed by another site.
- **Served from our domain.** Site icons carry a sandbox CSP, so an SVG can never run as a page. The preview-image redirect only answers image requests, so it can't be used as an open redirect.
- **Sync.** Records are encrypted on the device (see Sync). Plain records written after encryption shipped are ignored, and a record can only speak for the item it's filed under. Synced preferences are filtered to the synced keys. A pairing link asks before joining, because joining someone else's space would upload your library to them.
- **Push.** Only real push services (Apple, Google, Mozilla, Microsoft) are accepted as endpoints. Sends time out. A run splits thread checks fairly across devices, and there's a cap on how many devices can register.

Accepted trade-offs:
- The sync function sees the code in transit, so encryption protects against the database, not against the deployment itself, which you run.
- The VAPID private key is kept in the database when it isn't set as an environment variable.
- Costly endpoints (summaries on the deployment's key, sync writes, push sign-ups, HN sign-in, spice grading) are rate-limited per caller, by a hash of the address with IPv6 grouped by /64. Read-only endpoints rely on edge caching instead; add Vercel Firewall rules if the deployment gets traffic it shouldn't.

## Why no Reddit

Reddit closed self-service API keys in November 2025; new apps need manual approval under its Responsible Builder Policy, and most are refused. Anonymous `.json` returns 403 and `.rss` is rate-limited from cloud IPs, so there's no reliable way to read it from a Vercel deployment. It was removed rather than left half-working. In September 2026 Reddit also announced that RSS ends in November 2026 and the remaining public API in 2027. Lemmy is the closest open stand-in.

## Not yet

- Full OG images for links offline: saved stories keep their own thumbnails and post images, but a preview image fetched through `/api/feed?src=og` isn't cached for offline use.
- The daily edition at a per-person time: its cron runs once a day for everyone. (Alerts run on their own schedule, above.)
- Background refresh (Periodic Background Sync) is Android-only, and feeds are ranked in the page rather than the service worker, so there's nothing useful for it to prefetch yet.

## License

PaperWing is open source under the [Apache License 2.0](LICENSE). See [NOTICE](NOTICE).

Contributions are welcome: see [CONTRIBUTING.md](CONTRIBUTING.md), [report a bug](https://github.com/paperwingio/paperwing/issues/new?template=bug_report.yml) or [suggest an idea](https://github.com/paperwingio/paperwing/issues/new?template=feature_request.yml). Security problems go privately: see [SECURITY.md](SECURITY.md).

PaperWing is free, with no ads. If it's useful to you, you can [support it on Ko-fi](https://ko-fi.com/jordo92): it keeps the servers running. The names and logos of Hacker News, Lobsters, Lemmy, Bluesky, Mastodon and other services shown in the app belong to their owners and are used only to identify where a story comes from.
