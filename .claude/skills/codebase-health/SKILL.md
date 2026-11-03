---
name: codebase-health
description: PaperWing's quality bar: security invariants, performance budgets, accessibility rules, where shared code lives, and the hooks and CI gates that enforce them. Use when touching an API endpoint or anything that fetches a URL, stores data or renders outside HTML; adding UI or a dependency; when a hook, the bundle budget, Lighthouse or a story's accessibility check fails; or when asked to review or improve code quality.
---

# Codebase health

The rules here are the ones the code can't tell you by itself: why a guard exists, what a gate
protects, and where the traps are. Each section is reference; read the one your change touches.

## The gates

Hooks install with `npm install` (the `prepare` script sets `core.hooksPath` to `.githooks/`; not in CI,
which runs the same checks itself). Tests for the hooks and the budget live in `scripts/*.test.mjs`.

| Where | What runs | Catches |
| --- | --- | --- |
| `pre-commit` | Prettier and ESLint on staged files; refuses `.env*` files | Formatting drift, hook-rule bugs, leaked keys |
| `commit-msg` | Refuses AI co-author and "Generated with" lines | Attribution `AGENTS.md` forbids |
| `pre-push` | Changeset present for app changes (`scripts/changelog/require.sh`), `check:changesets`, lint, format, build (types), `check:budget`, unit tests; refuses when the checkout isn't exactly what's pushed | Everything cheap enough to run on every push |
| CI `check` | All of the above (the changeset rule on pull requests), plus `test:stories` (axe set to `error`) and `test:e2e` | Broken UI, accessibility regressions, broken journeys, and anything pushed without hooks |
| CI `lighthouse` | `check:lighthouse` on `/welcome` and `/privacy`, phone emulation | Accessibility below 0.95, best practices below 0.9 and layout shift above 0.1 fail; performance, LCP and SEO warn |

A failing gate is fixed, never bypassed: `--no-verify` is for a broken hook, and the fix to the hook
lands in the same change. The `ship` skill runs every gate before a push.

## Security invariants

Each guard below has a test. A change near one keeps that test passing and adds a case for any new
path. A guard that fails closed has a test proving it fails closed.

- **URLs from a request** go through `safeFetch` or `assertPublicUrl` (`api/_lib/http.ts`): the
  check runs on every redirect, and the connection itself is pinned to a public address, so a DNS
  rebind can't redirect it. Plain `fetch` is only for hosts fixed in code or env.
- **HTML from elsewhere** renders only through `sanitize()` (`src/lib/html.ts`), the only input to
  `dangerouslySetInnerHTML`. Server HTML (`api/preview.ts`, `api/rss.ts`) escapes every
  interpolation with `escapeHtml` (`api/_lib/text.ts`).
- **Bytes from elsewhere served from our origin** (icons, card images) go through `inert()` in
  `api/feed.ts`: `nosniff` plus a `sandbox` CSP, so an SVG can't run as a page.
- **Costly endpoints** (a paid API, a KV write, a fan-out) are rate-limited with `overLimit()` keyed by
  `clientKey()`, and fail closed when KV can't count. For a paid API, check the caller's own allowance
  before the global one (`api/summarize.ts`, `api/spice.ts`).
- **Scheduled runs** (`api/push.ts` GET) accept only `CRON_SECRET`, compared in constant time, or a
  QStash JWT that names its destination (`verifyQStash`, `api/_lib/qstash.ts`).
- **Push endpoints** must match `PUSH_HOSTS`. Any other host would turn the alert run into a POST
  to an address a stranger chose.
- **Derived secrets are pinned.** The sync code a passkey derives (`src/lib/passkey.ts`, pinned in
  `passkey.test.ts`) is the address of everyone's data. Changing its input, salt or info moves
  people to an empty space.
- **The CSP** in `vercel.json` hashes the inline script in `index.html`; `api/_lib/csp.test.ts` fails
  when they drift. New third-party origins don't go in the CSP (`CONTRIBUTING.md`, "No accounts, no
  tracking"). The only exception is `frame-src`: YouTube's privacy-enhanced player and Vimeo's,
  loaded on a tap and sandboxed (`src/lib/videoEmbed.ts`). `csp.test.ts` pins it to those two.
- **What's stored or sent** changes the privacy and terms pages in the same change.

## Performance

`scripts/bundle-budget.mjs` gzips what a first visit downloads and fails over budget. Raise a number
only on purpose, in the change that needs it, with the reason in the pull request.

- **Routes and heavy paths load lazily** (`src/App.tsx`, `React.lazy` for `ItemPane`). A static
  import anywhere undoes a dynamic one: the build's "dynamically imported … but also statically
  imported" warnings name every module where that has happened (`atproto.ts`, `store.ts`, `mixes.ts`,
  `moderation.ts`). Splitting a module so the feed's path imports only what it uses is the fix.
- **The entry chunk carries what the feed row needs and no more.** Known passengers that don't need
  to be there: DOMPurify (via `plainText` in `src/lib/html.ts`, imported by `StoryRow`) and `marked`
  (via `src/lib/sources/lemmy.ts`). Moving them out is the cheapest win on the budget.
- **Server-only packages** (`linkedom`, `@mozilla/readability`, `undici`, `web-push`,
  `@anthropic-ai/sdk`, `fast-xml-parser`) never reach `src/`.
- **Zustand selectors return primitives** or use `useShallow`; destructuring `usePrefs()` subscribes
  to everything, and `Root.tsx` and `Chrome.tsx` re-render the shell on every prefs write because of it.
- **The service worker** (`sw/sw.template.js`, tested in `sw/sw.test.ts`) caps what it keeps. A new
  same-origin `/api/` route with one answer per site or image belongs outside the runtime cache, as icons
  and `og` images are. The saved-image cache is capped in `src/lib/library.ts` (`IMAGE_KEEP`).

## Accessibility

Every story runs axe with `test: 'error'` (`.storybook/preview.tsx`), in Chromium with reduced motion,
so the check sees settled UI. A story turns off one rule only for a known finding, with a comment;
today that's `color-contrast` in `TopicCard`, `TopicTag` and `WhatsNew` (tinted cards, `opacity-*`
text, the "Breaking changes" pill), waiting on new colour tokens.

- **Focus stays visible.** The global `:focus-visible` ring in `src/styles.css` is the indicator; a
  control that restyles focus replaces the ring with something as visible, never `outline-none` alone.
- **The accessible name starts with the visible text** (label in name): voice control users say what
  they see. `aria-label` on a control that shows words repeats those words first.
- **One interactive element per target**: a link or button never sits inside another.
- **Headings descend by one**: the reading pane's title is `h1`, its sections `h2`.
- **Stories wait for what's on screen** (`findByRole`, `waitFor`), never a lookup straight after a
  click into a sheet: under reduced motion, its visibility flips a frame later.
- **Known gap:** `Sheet` (`src/components/Sheet.tsx`) is `aria-modal` without a focus trap, and on
  phones the reading pane opens without taking focus. Native `<dialog>` with `showModal()` fixes both.

## Shared homes

Code both sides need lives in `src/lib/` (the server already imports from it); server-only helpers
live in `api/_lib/`. Before writing a helper, look for these first:

| Need | Home |
| --- | --- |
| JSON answer, error, request body | `json`, `fail`, `readJson` in `api/_lib/http.ts` |
| Entity decoding, tag stripping | `decodeEntities`, `stripHtml` in `api/_lib/http.ts` |
| Escaping, text to paragraphs, a link's site | `escapeHtml`, `textHtml`, `siteOf` in `api/_lib/text.ts` |
| Story keys | `src/lib/storyKey.ts` (`linkKey` wraps it) |
| A link's display domain in the app | `domainOf` in `src/lib/format.ts` |
| Bluesky post shape, keys, media | `src/lib/bskyPost.ts` |
| Rate limit, shared cache | `overLimit`, `cachedInKv` in `api/_lib/kv.ts` |

**Debt map.** These duplicates have already drifted; when your change touches one, collapse it into
the home named here and delete the line:

- A Bluesky post becomes a story twice (`api/_lib/bsky.ts` `toStory`, `src/lib/sources/bluesky.ts`
  `postStory`), and the copies differ on GIF cards and thumbnails. Home: `src/lib/bskyPost.ts`.
- Text to HTML exists three times (`textHtml`, `postHtml`, inline in `bsky.ts`); `escapeHtml` exists four
  times, and the Mastodon copy doesn't escape `"`.
- Entity decoders in `api/_lib/hn.ts` and `src/lib/sources/mastodon.ts` handle a handful of
  entities each. Home: `decodeEntities`.
- DID and handle patterns are copied across `src/lib/social.ts`, `api/atproto.ts`, `api/_lib/boards.ts`,
  `frontpage.ts` and `people.ts`, and the handle copies disagree on a trailing hyphen. Home: `social.ts`.
- Lemmy's comment tree is built twice (`api/_lib/spice.ts`, `src/lib/sources/lemmy.ts`).
- The per-caller-then-global daily allowance repeats in `api/spice.ts` and `api/summarize.ts`; a
  `dailyQuota()` in `kv.ts` would hold it.

## Tests that matter here

Tests sit at the module's interface, in the existing style (`tdd` skill, `CONTRIBUTING.md`). Extra
weight goes on:

- **Guards**: each refusal path (private address, bad signature, over limit, store down) has a case.
- **Pinned values**: derivations and formats other devices or stored data depend on.
- **Filters that keep content out** (NSFW, removed, labelled): a case that the hidden thing stays
  hidden, on every path that publishes (feeds, mixes, RSS, previews).
- **Untrusted parsers** (`api/_lib/og.ts`, `text.ts`, `discover.ts`): hostile input, odd entities,
  oversize bodies.
- **New UI states** (signed out, empty, failed) get a story, and so get the accessibility check.
