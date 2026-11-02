# Contributing to PaperWing

Thanks for wanting to help. PaperWing is a reader for the open web: Hacker News, Lobsters, Lemmy, Bluesky, Mastodon and the sites you follow, ranked together, with what it learns about you kept on your own devices. Bug reports, ideas, fixes and new sources are all welcome.

## Ways to help

- **Report a bug.** [Open a bug report](https://github.com/jordan-simonovski/paperwing/issues/new?template=bug_report.yml). In the app, Settings, About, Report a bug fills in your build and device for you.
- **Suggest an idea.** [Open a feature request](https://github.com/jordan-simonovski/paperwing/issues/new?template=feature_request.yml). Say what you were trying to do, not just the feature you'd want.
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

## Before you open a pull request

Run the same checks CI runs:

```sh
npm run build          # type-checks (tsc -b) and builds
npm run lint
npm test               # unit tests, in Node
npm run test:stories   # every Storybook story, rendered in Chromium (npx playwright install chromium once)
```

All four must pass. Formatting is Prettier (pinned in `package.json`, with its settings there: no semicolons, single
quotes, a 200-character line). Format what you touched:

```sh
npx prettier --write <files>
```

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
| `.claude/skills/` | Design references for coding agents (deep modules, seams, TDD) |
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

## API tests

Each function in `api/` takes a `Request` and returns a `Response`, so it's tested in-process, end to end, with every
upstream faked by `api/test/harness.ts` (`api/feed.test.ts` is the example to copy):

```ts
const net = fakeUpstreams() // no real network: anything not intercepted fails the test
net.get('https://lobste.rs').intercept({ path: '/hottest.json' }).reply(200, [story])
const res = await call(GET, '/api/feed?src=lobsters')
```

`memoryStore()` gives a file the in-process KV store, reset before each test. Test what a caller sees: the status,
the body and the headers that matter (caching, sandboxing), not the internals.

## Releases

Every change people can notice comes with a changeset in `.changeset/`, written for readers and
starting with its kind: `highlight`, `breaking`, `new`, `improved` or `fix` (`.changeset/README.md`
has the rules; `npm run check:changesets` checks them). CI keeps a **Release** pull request open
while changesets are waiting. Merging it bumps the version, rewrites `CHANGELOG.md` and the app's
What's new, and is the only production deploy: Vercel skips production builds for other commits
(`scripts/vercel-ignore.sh`). Put `[deploy]` in a commit message to force one.

## Things to keep in mind

- **No accounts, no tracking.** What PaperWing learns about you stays on your devices. Don't add analytics, third-party scripts or anything that sends reading behaviour to a server. If a feature needs server storage, it should be encrypted on the device first, the way sync is.
- **Fetching URLs on the server.** Any URL that comes from a request must go through `safeFetch` or `assertPublicUrl` in `api/_lib/http.ts`, which block private networks and redirect tricks.
- **Showing HTML from elsewhere.** Always pass it through `sanitize()` in `src/lib/html.ts`. Links from posts go through `webUrl()` so only `http(s)` links are clickable.
- **Costly endpoints** (anything that calls a paid API, writes to the database or fans out to many requests) need a rate limit keyed with `clientKey()`: `overLimit()` in `api/_lib/kv.ts`, which fails closed. Answers worth sharing between callers go through `cachedInKv()`.
- **Zustand selectors return plain values.** A selector that builds a new object or array on every call re-renders forever. Select primitives, or use `useShallow`.
- **Copy.** Plain, friendly sentences that say what happens. The privacy and terms pages describe what the code actually does: if you change what's stored or sent, update them in the same pull request.

## Adding a source or a topic

- A **topic** is an entry in `src/lib/topics.ts` (or a pack in `src/lib/packs.ts`): a label, the words that match it, and the feeds behind it.
- A **source** needs a module in `src/lib/sources/`, a `FeedRef` kind in `src/lib/topics.ts`, and cases in `feedId`, `feedLabel` and `fetchFeed` in `src/lib/sources/index.ts`. If the source doesn't allow browsers to call it directly, its fetch goes in `api/_lib/` and gets an entry in `SOURCES` in `api/feed.ts` (what it needs from the query string, and how long its answer may be cached). Add a reference engagement level in `src/lib/rank.ts` so its stories rank fairly against the others.

## Code of conduct

Be kind and assume good faith. Harassment, personal attacks and discrimination aren't welcome in issues, pull requests or anywhere else in the project, and maintainers may remove comments or block people who don't respect that.

## License

PaperWing is licensed under the [Apache License 2.0](LICENSE). By contributing, you agree that your contributions are licensed under the same terms.
