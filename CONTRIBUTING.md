# Contributing to PaperWing

Thanks for wanting to help. PaperWing is a reader for the open web: Hacker News, Lobsters, Lemmy, Bluesky, Mastodon and the sites you follow, ranked together, with what it learns about you kept on your own devices. Bug reports, ideas, fixes and new sources are all welcome.

## Ways to help

- **Report a bug.** [Open a bug report](https://github.com/paperwingio/paperwing/issues/new?template=bug_report.yml). In the app, Settings, About, Report a bug fills in your build and device for you.
- **Suggest an idea.** [Open a feature request](https://github.com/paperwingio/paperwing/issues/new?template=feature_request.yml). Say what you were trying to do, not just the feature you'd want.
- **Fix something.** Issues labelled `good first issue` are a gentle start. For anything bigger than a small fix, open an issue first so we can agree on the approach before you spend the time.
- **Security problems** go privately, never in a public issue: see [SECURITY.md](SECURITY.md).

## Running it locally

You need Node.js 22 or newer.

```sh
npm install
npm run dev        # the app on http://localhost:5173, with the /api functions mounted as middleware
npm run storybook  # every piece of the UI on its own, on http://localhost:6006
```

That's enough for almost everything: feeds, threads, reading, saving, Explore. No accounts or keys are needed.

Some features need a service behind them. Copy `.env.example` to `.env.local` and fill in only what you're working on:

- **Sync, push, rate limits, caches:** an Upstash Redis database (`KV_REST_API_URL`, `KV_REST_API_TOKEN`), or `SYNC_MEMORY=1` for an in-memory stand-in while developing.
- **Discussion summaries:** paste your own Anthropic key in Settings, Summaries. Nothing on the server is needed.
- **Bluesky sign-in:** works on `localhost`; the OAuth client is described per address by `api/atproto.ts`.

Never commit `.env.local`, keys, tokens or app passwords.

### Local services

To work on what needs the database (sync, rate limits, caches, the open web directory) without an
Upstash account, run the hosted services locally with Docker:

```sh
npm run dev:full        # starts Redis behind Upstash's REST API (compose.yaml), then the app with it
npm run task directory  # runs a scheduled task the way QStash would: alerts, edition or directory
docker compose down -v  # stops the services and empties the local database
```

`dev:full` points the functions at the local database and sets `CRON_SECRET` to `local`, whatever
`.env.local` says; the data stays between runs. The functions run in the dev server, with the same
rewrites as production (read from `vercel.json`), so `curl -A Bluesky localhost:5173/t/space` gets the
link preview a social app would. `npx vercel dev` also works if you've linked the project, but it's
slower and isn't needed for anything here.

## Before you open a pull request (or push to main)

Run the same checks CI runs:

```sh
npm run build          # type-checks (tsc -b) and builds
npm run lint
npm test               # unit tests, in Node
npm run test:stories   # every Storybook story, rendered in Chromium (npx playwright install chromium once)
npm run test:e2e       # the journeys in e2e/, against the built app, at desktop and phone sizes
```

All five must pass. `npm install` also installs git hooks (`.githooks/`): commits check formatting and lint on
what you staged, and pushes check for a changeset (CI checks pull requests for one too), then run the build, the bundle budget
(`npm run check:budget`) and the unit tests. CI adds the stories, the journeys and Lighthouse
(`npm run check:lighthouse`, settings in `lighthouserc.json`). Formatting is Prettier (pinned in `package.json`, with its settings there: no semicolons, single
quotes, a 200-character line). Format what you touched:

```sh
npx prettier --write <files>
```

Use purpose-based branch names: `feat/`, `bug/`, `chore/`, `docs/`, `refactor/` or `test/`,
followed by a short kebab-case description. Never include agent, assistant, vendor or model names.
Do not add agent attribution to commits, trailers, pull request titles or descriptions, comments,
release notes, documentation or code. Describe the change and how it was checked; omit generated-by
notices, session links and AI co-authors.

Then:

- Add a changeset for anything people can notice (`npx changeset`): it becomes an item in What's new. See [Releases](#releases).
- Keep each pull request to one change, and say what it changes and why. Screenshots help for anything you can see, ideally on a phone too.
- Add or update tests for logic you change (`*.test.ts` next to the code, run with Vitest).
- Add or update a story for UI you change (`*.stories.tsx` next to the component). See [Stories](#stories).
- Check the app at phone width as well as desktop: most people read PaperWing on a phone.

## How the code is laid out

| Path | What's there |
| --- | --- |
| `src/` | The app: React 19, React Router, TanStack Query, Zustand, Tailwind v4 |
| `src/lib/sources/` | One module per source (HN, Lemmy, Bluesky, Mastodon…), fetched from the browser where the source allows it |
| `src/lib/rank.ts` | How For you is ordered: engagement, age, source mixing and your taste |
| `src/lib/topics.ts`, `src/lib/packs.ts` | Topics and the feeds behind each one |
| `api/` | Vercel functions, one file per endpoint |
| `api/_lib/` | Server code shared by the endpoints: fetching, feeds, sync, push, atproto |
| `sw/` | The service worker template (offline reading, push) |
| `scripts/` | Icon rendering, Bluesky feed publishing, mobile checks |
| `.storybook/` | Storybook config and the harness every story renders in |
| `src/test/` | Fixtures shared by tests and stories |
| `e2e/` | End-to-end journeys, with the stubbed network they run against |
| `.claude/skills/` | References for coding agents (deep modules, seams, TDD, the quality bar in `codebase-health`) |
| `.githooks/` | The git hooks `npm install` turns on: format and lint on commit, the cheap checks on push |
| `AGENTS.md` | The checklist coding agents follow, including the pre-PR review |
| `.compound-engineering/` | The pinned Compound Engineering review, checked by `scripts/compound-review/` |

The README explains each feature in more depth.

## Stories

Every component has stories beside it (`StoryRow.stories.tsx` next to `StoryRow.tsx`), and every story is also a test: `npm run test:stories` renders each one in Chromium, runs its `play` function and checks it for accessibility problems.

A story renders from nothing but its own parameters. `.storybook/harness.tsx` resets every store to its defaults, empties the query cache and answers no network request unless the story says so:

```tsx
export const SignedIn: Story = {
  parameters: {
    app: {
      atproto: { did: 'did:plc:…', handle: 'reader.example' }, // any store, by name
      queries: [[['friends'], { … }]],                          // seeded into the query cache
      fetch: { '/api/feed?src=og': { image: '/icon-512.png' } }, // URL substring → JSON body
    },
  },
}
```

Build data with the helpers in `src/test/fixtures.ts` (`story()`, `ranked()`, `NOW`), use real public links, and keep images local (`/icon-512.png` or a data URI) so stories never touch the network. If a component can't be shown without reaching into the app, that's usually a sign it wants its data passed in as props.

## End-to-end tests

`npm run test:e2e` builds the app, serves it with `vite preview` and drives it in Chromium (Playwright), once at desktop size and once as a phone. Each spec in `e2e/` is one journey, written from the reader's side: find things by role, label and text (`getByRole('button', { name: 'Save' })`), never by class. `npx playwright test e2e/search.spec.ts --project=phone --headed` runs one where you can watch it.

The journeys never reach the network. `e2e/support/network.ts` answers every request the app makes from fixtures, our own `/api` and the sources the browser calls directly alike, and aborts anything it doesn't know. The clock is pinned to the fixtures' `NOW`, and any uncaught error in the page fails the test. A journey changes only what it needs:

```ts
import { fail } from './support/network'
import { gotoFeed, row } from './support/app'
import { expect, test } from './support/test'

test.use({ stubs: { hnTop: fail(500) } }) // Hacker News is down; `prefs: { followed: ['space'] }` would set up the reader

test('For you still shows every other source', async ({ page }) => {
  await gotoFeed(page)
  await expect(row(page, 'A New Proof Smooths Out the Math of Melting')).toBeVisible()
})
```

What each upstream sends is in `e2e/fixtures/upstream.ts`, in its own wire shape (Algolia hits, Lemmy posts, stories from `/api/feed`). If the app starts calling somewhere new, stub it in `network.ts`; a failing journey's report lists any request that went unanswered. Wait on what's on screen, never on a fixed delay.

## API tests

Each function in `api/` takes a `Request` and returns a `Response`, so it's tested in-process, end to end, with every
upstream faked by `api/_test/harness.ts` (`api/_test/feed.test.ts` is the example to copy):

```ts
const net = fakeUpstreams() // no real network: anything not intercepted fails the test
net.get('https://lobste.rs').intercept({ path: '/hottest.json' }).reply(200, [story])
const res = await call(GET, '/api/feed?src=lobsters')
```

Tests and their helpers live in `api/_test/` (or beside a module in `api/_lib/`): Vercel deploys every other file under
`api/` as a function, and `api/_test/deploy.test.ts` fails if one slips through. `memoryStore()` gives a file the in-process KV store, reset before each test. Test what a caller sees: the status,
the body and the headers that matter (caching, sandboxing), not the internals.

## Releases

Every change people can notice comes with a changeset in `.changeset/`, written for readers and
starting with its kind: `highlight`, `breaking`, `new`, `improved` or `fix` (`.changeset/README.md`
has the rules; `npm run check:changesets` checks them). CI keeps a **Release** pull request open
while changesets are waiting. Merging it bumps the version, rewrites `CHANGELOG.md` and the app's
What's new, and is the only production deploy: Vercel skips production builds for other commits
(`scripts/vercel-ignore.sh`). Put `[deploy]` in a commit message to force one.

## Things to keep in mind

- **No accounts, no tracking.** What PaperWing learns about you stays on your devices. Don't add analytics, third-party scripts or anything that sends reading behaviour to a server. If a feature needs server storage, it should be encrypted on the device first, the way sync is. The one exception is a video player you ask for: a YouTube or Vimeo video loads its own player (YouTube's privacy-enhanced one, Vimeo's with do-not-track) in a sandboxed frame only when you press play (`src/components/VideoEmbed.tsx`). Those two origins are the only ones in the CSP's `frame-src`, and `api/_lib/csp.test.ts` keeps it that way. Anything else plays as a plain file or links out.
- **Fetching URLs on the server.** Any URL that comes from a request must go through `safeFetch` or `assertPublicUrl` in `api/_lib/http.ts`, which block private networks and redirect tricks.
- **Showing HTML from elsewhere.** Always pass it through `sanitize()` in `src/lib/html.ts`. Links from posts go through `webUrl()` so only `http(s)` links are clickable.
- **Costly endpoints** (anything that calls a paid API, writes to the database or fans out to many requests) need a rate limit keyed with `clientKey()`: `overLimit()` in `api/_lib/kv.ts`, which fails closed. Answers worth sharing between callers go through `cachedInKv()`.
- **Zustand selectors return plain values.** A selector that builds a new object or array on every call re-renders forever. Select primitives, or use `useShallow`.
- **Copy.** Plain, friendly sentences that say what happens. The privacy and terms pages describe what the code actually does: if you change what's stored or sent, update them in the same pull request.

## Adding a source or a topic

- A **topic** is an entry in `src/lib/topics.ts` (or a pack in `src/lib/packs.ts`): a label, the words that match it, and the feeds behind it.
- A **source** needs a module in `src/lib/sources/`, a `FeedRef` kind in `src/lib/topics.ts`, and an entry in `FEED_KINDS` in `src/lib/sources/kinds.ts` (its cache id, name, logo, fetch and Latest). TypeScript won't build until both the table and the samples in `kinds.test.ts` have it. If the source doesn't allow browsers to call it directly, its fetch goes in `api/_lib/` and gets an entry in `SOURCES` in `api/feed.ts` (what it needs from the query string, and how long its answer may be cached). Add a reference engagement level in `src/lib/rank.ts` so its stories rank fairly against the others.

## Code of conduct

Be kind and assume good faith. Harassment, personal attacks and discrimination aren't welcome in issues, pull requests or anywhere else in the project, and maintainers may remove comments or block people who don't respect that.

## License

PaperWing is licensed under the [Apache License 2.0](LICENSE). By contributing, you agree that your contributions are licensed under the same terms.
