# PaperWing

A reader for the open web: stories from Hacker News, Lemmy, Bluesky, Mastodon, RSS and more, ranked together on the reader's own device, with discussion and posting where those stories live.

## Reading

**Story**:
One thing to read, normalised from whichever network it came from: the row in every list. Several networks' copies of one link merge into one story.
_Avoid_: item, post (for the normalised row), entry

**Story key**:
A story's id across the app: a two-letter network prefix and that network's id (`hn-123`, `lm-42@lemmy.world`, `bs-…`, `ln-…` for a bare link).
_Avoid_: item key, id

**Post**:
A network's own thing (a Bluesky post, a Mastodon status, a Lemmy post) before it becomes a story.

**Thread**:
A story with its comment tree.

**Discussion**:
One place a story's link is being talked about (an HN thread, a Lemmy post, Bluesky posts). A story can have several.
_Avoid_: comments page

**Also on**:
The same link on other networks, merged into one story.

**Coverage**:
Different links about the same event, grouped under the strongest one. Outlets: how many publishers that coverage spans.

**Saved story**:
A story kept for offline reading, with its article and thread, in the library.
_Avoid_: item, bookmark

## Lists

**Channel**:
What one list page shows: a label, the feeds it reads and how to rank them. Topics, mixes, communities, profiles, boards and For you are all channels.
_Avoid_: feed (for the page)

**Channel id**:
How a channel is named in URLs, prefs and sync (`for-you`, `observability`, `c:science@lemmy.world`). Read and written only by `channelId.ts`, as a channel address; a malformed id is no channel.

**Feed ref**:
One request a channel makes to one source ("HN top", "Quanta's RSS", "c/technology, today's top").
_Avoid_: feed, source (for the request)

**Feed kind**:
One kind of feed ref (HN, RSS, a Lemmy community…) and everything about it: its cache id, name, brand, logo, fetch and Latest. One entry each in `FEED_KINDS`.

**Channel feed**:
The module that turns a reader and a channel into ranked stories: plan the channel, fetch its feed refs, rank what came back.

**Reader**:
Everything about the person reading that a channel and its ranking depend on: what they follow, where they're signed in, what they keep out, and their taste. Named after the person, not the app.
_Avoid_: user, ctx, profile (for this)

**Sort**:
PaperWing's order for a list: Hot, Latest, Top or Spicy.

**Variant**:
A network's own list on a channel that shows one network (HN top, new or best; Lemmy hot or today's top).
_Avoid_: sort (for this)

**Native**:
A channel that keeps its source's own order for Hot instead of PaperWing's ranking.

**Taste**:
The reader's affinity profile, their votes and how often they've scrolled past each story: what Hot ranking learns from.

## What the reader follows

**Topic**:
A curated subject with its own terms, feeds and related topics (Space, Web, SRE).

**Interest**:
A reader's own search turned into a topic (`q:` ids).
_Avoid_: topic (for these)

**Mix**:
A channel the reader builds from any blogs, topics, communities and feeds; it can be published and followed.

**Community**:
A Lemmy community (`c:<name>@<instance>`).
_Avoid_: board (for this)

**Community board**:
A board someone creates (an `io.paperwing.board` record) with its own rules and moderators.
_Avoid_: community (for this)

**Topic board**:
PaperWing's listings for one topic.

**Person**:
Someone on PaperWing, by their Bluesky account: what they list and share, and their blogroll.
_Avoid_: user, member

## Acting on stories

**Listing**:
Putting a story on PaperWing's front page and boards: a Bluesky post plus a submission record in the reader's account. "Submission" is the record's name; say listing everywhere else.

**Shared item**:
A link with a note on why, kept in the reader's account (`io.paperwing.share`), shown on their profile and in followers' For you.
_Avoid_: share (unqualified)

**Cross-posting**:
Posting a story to several networks at once from the share sheet.

**Taste vote**:
The up or down arrow's effect on PaperWing's ranking, kept on the device.

**Network vote**:
What the up arrow also does where the reader is signed in: an HN upvote, a Lemmy upvote, a Bluesky like, a Mastodon favourite.
_Avoid_: vote (unqualified, when it matters which)

**Reading history**:
What the reader has opened, hidden and voted on, kept on the device.
_Avoid_: activity (for this)

**Activity**:
The inbox: notifications and the reader's own posts across the networks they're signed in to.

## Networks

**Network**:
Somewhere PaperWing reads from and can act on with a sign-in: Bluesky, Hacker News, Mastodon, Lemmy, Frontpage.

**Source**:
Where a story came from, networks and publishers alike (`hn`, `rss`, `arxiv`, `release`…).
