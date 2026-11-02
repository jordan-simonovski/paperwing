# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

An installable PWA (share target, app shortcuts, safe areas, offline shell). Mobile web and the iOS home-screen app are the same web product, not native.

## Users

General readers, not only technical ones: anyone who wants to follow what's being written and discussed on the open web without an attention-optimised social feed. Tech readers (HN, Lobsters, engineering blogs) are where PaperWing started and remain a core group, but they are one audience among equals. New work must not assume a technical reader; tech-only surfaces (Hacker News, Lobsters, Front page, Papers, Projects, Releases, Status) appear only for people who follow a tech topic.

Their job: catch up on the subjects they care about, read the story itself, see where it's being discussed, and join in on the network where that discussion lives. They read daily (Today's edition), in short sessions on phones and longer ones on desktop, sometimes offline.

## Product Purpose

A reader for the open web, organised by topic rather than by source. It pulls stories from Hacker News, Lemmy, Bluesky, Mastodon, RSS, publishers and more, merges copies of the same link into one story, ranks them together on the reader's own device, and sends the reader to the source and to the discussions.

Success is a reader who gets through what matters to them and then stops: Today ends after about 15 stories on purpose. Success is not time spent, growth, or engagement.

## Positioning

The ranking recipe is written down and runs on the device; the reader can switch to chronological in one tap. There are no accounts, analytics or ads; what PaperWing learns stays on the device and sync is end-to-end encrypted. Everything a reader posts, shares, lists or builds (mixes, boards, shared items, notes) lives in their own Bluesky, Mastodon, Lemmy or HN account, so if PaperWing vanished they would lose nothing they made. The whole thing is open source (Apache 2.0) and paid for by readers on Ko-fi. A neighbouring reader or social app with ads, accounts, a server-side algorithm or a proprietary graph cannot truthfully say this.

## Operating Context

- Daily ritual: Today, a fixed snapshot edition with an end, optionally pushed as a notification at 21:00 UTC.
- Browsing channels (topics, interests, mixes, communities, boards, For you), each with Hot, Latest, Top or Spicy.
- Reading in the reader: article text, the discussion bar across sources, nested threads, coverage across outlets.
- Desktop: split pane, keyboard-driven (`j`/`k`, `n`/`p`, `s`, `w`, ⌘K or `/`). Mobile: swipe to save, edge-swipe back in standalone.
- Acting where the discussion lives: network votes, replies and cross-posting through the reader's own signed-in accounts.
- Offline: saved stories keep article, images and thread; loaded feeds are cached for three days.

## Capabilities and Constraints

- Terminology is fixed by `GLOSSARY.md` (story, discussion, channel, feed ref, topic vs interest, community vs community board, listing, taste vote vs network vote). Copy and names use those words.
- No database for reader data: preferences and history in `localStorage`, saved articles and cached feeds in IndexedDB; sync is encrypted on device (passkey or sync code).
- No sign-in to PaperWing itself. Network sign-ins (atproto OAuth, Lemmy, HN, Mastodon) are per device and ask for narrow permissions.
- Anything that changes what's stored or sent must update the privacy and terms pages in the same change.
- The app was called Readout. Storage keys, IndexedDB names, sync and passkey labels and QStash ids still say `readout` and must not be renamed.
- Bluesky media video plays inline only where HLS is native; elsewhere it links out.
- Thumbnails are optional and off when the browser asks to save data.
- Undecided: the exceptions or nuance to the principles (see Product Principles).

## Brand Commitments

- Name: PaperWing, domain paperwing.io, lexicons under `io.paperwing.*`.
- Pip, a paper owl reading a book, is the mascot and the mark. Source SVGs in `design/readout-mascot.svg` and `design/readout-mascot-icon.svg`; avatars and banner in `brand/`.
- The eight principles are published in the app at `/principles` and in the README, and are a public promise.
- Voice: plain, specific, British spelling ("organised", "colour", "favourite"). Says what something does and how, names the mechanism, admits limits ("Frontpage is small and quiet for now"). No hype, no growth language.

## Evidence on Hand

None yet: no usage numbers, supporter counts, testimonials, reader quotes or press. Future surfaces may lean only on the product itself, the written principles, the open-source code and the documented mechanisms. Do not invent metrics, quotes, logos or claims of adoption.

## Product Principles

The eight published principles are binding on all future work, with exceptions or nuance the owner has yet to name (record them here when they do):

1. You're the reader, not the product. No ads, no selling data, no engagement targets.
2. A feed you can read, and switch off. Ranking is written down, runs on device, chronological is one tap away; nothing optimised for time spent.
3. What it learns about you stays with you. No accounts, no analytics, no tracking.
4. Open networks, not a walled garden. What people make lives in their own accounts.
5. Send people to the source. Credit and clicks go to writers and the communities discussing them.
6. Moderation you can see and choose.
7. Open source, so you can leave with the code too.
8. Small on purpose. Most work happens on the device, so it stays cheap enough to keep its promises.

## Accessibility & Inclusion

- Every text colour pairing clears 4.5:1 in both light and dark themes, including all topic hues.
- Motion is limited to state changes and respects reduced motion.
- Three text sizes and a compact density; full keyboard navigation on desktop.
- Every component story is rendered in Chromium and checked for accessibility problems (`npm run test:stories`).
