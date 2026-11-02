---
name: release-notes
description: Turn changes into PaperWing's user-facing release notes. Use when writing a changeset (every PR that changes something people can notice needs one), deciding a change's kind and version bump, reviewing changeset wording, cutting a release, or editing "What's new" (CHANGELOG.md and the in-app page). Triggers: "add a changeset", "release notes", "changelog", "what's new", "cut a release", "bump the version", "is this a breaking change".
---

# Release notes

PaperWing's release notes are written for the people who read with it, not for developers. Each
change people can notice gets a **changeset**: a short file in `.changeset/` that becomes one item in
"What's new", shown in the app (Settings, App and data, then What's new) and in `CHANGELOG.md`.

## The loop

1. **List what someone using PaperWing can notice.** Read the diff and ask, for each part: would a
   reader see, use or feel this? A new screen, a button, a faster list, a bug they hit: yes. A
   refactor, tests, CI, a renamed module: no.
2. **One changeset per noticeable change.** A pull request with three things people will notice gets
   three changesets. Don't bundle unrelated changes into one item; don't split one change into several.
3. **Pick its kind** (table below). The kind decides the section it appears in and the version bump.
4. **Write it** (rules below), then run `npm run check:changesets`.
5. **Nothing noticeable?** Add an empty changeset (`npx changeset add --empty`) so the PR still says
   so on purpose.

Create a changeset with `npx changeset`, or write the file directly:

```md
---
"paperwing": minor
---

new: **Save from any app.** Share a link to PaperWing from another app on your phone and it lands in your queue.
```

## Kinds

| Kind | What it is | Section | Bump |
| --- | --- | --- | --- |
| `highlight` | The headline of a release: a big new capability people should hear about first | Highlights | minor (major for a release the owner calls one) |
| `breaking` | Something that works differently now and people must adjust: a removed feature, a moved setting, data that won't carry over | Breaking changes | major |
| `new` | Something people couldn't do before | New | minor |
| `improved` | Something that works better: faster, clearer, more complete | Improved | minor, or patch for a small polish |
| `fix` | Something that was broken and now isn't | Fixes | patch |

Choosing:

- **Highlight or new?** At most one or two highlights per release: the thing you'd lead a post about
  the release with. Everything else new is `new`.
- **Breaking is about people, not code.** Changing an internal interface isn't breaking. Moving where
  a setting lives, removing a feature, or anything that loses something people had, is. Say what
  they need to do.
- **Improved or fix?** If it worked as designed but could be better, `improved`. If it did the wrong
  thing, `fix`.
- **Before 1.0**, a breaking change still takes `major` here; whether the next release is 1.0 is
  the owner's call. If that isn't wanted, say so in the PR and ask.

## Writing it

The body is one paragraph: the kind, a short **bold summary**, then one or two plain sentences.

- **The summary is the headline**: what people get or what's fixed, in sentence case, ending with a
  full stop. "**Search hides what your moderation hides.**", not "**Moderation in search**".
- **The sentences say what people can now do or see, and where**, naming screens as people see them:
  "the reader", "For you", "Settings, Sources", "the share sheet".
- **Plain words.** No file names, endpoints, store or library names, ticket numbers, commit hashes,
  or words like refactor. The checker rejects the common ones.
- **Be honest.** If something was removed, say so and why. If a fix only covers some cases, say which.
- **For a fix, name the symptom people saw**, not the cause: "Comments less than a minute old read
  'now ago'", not "timeAgo returned 'now'".

Good:

```md
fix: **Today has everything For you has.** The daily edition now includes your Mastodon home timeline, the people you follow on PaperWing and your status pages, as For you always did.
```

Not this:

```md
fix: TodayPage now uses useChannelFeed so the ctx includes mastodon and people (refactor of channelFeed.ts).
```

## Releasing

CI keeps a "Release" pull request open whenever changesets are waiting. It runs `npm run release`,
which:

1. consumes the changesets and bumps the version in `package.json`;
2. rewrites `CHANGELOG.md` as "What's new": each release grouped by kind (Highlights, Breaking
   changes, New, Improved, Fixes), dated, with no commit hashes (`scripts/changelog/format.mjs`);
3. writes the copy the app shows, `src/generated/changelog.json`.

**Releasing is deploying.** Vercel builds production only for a release commit, one that changes
`CHANGELOG.md` (`scripts/vercel-ignore.sh`); ordinary merges to main wait there for the next
release. So merging the Release pull request is the one production deploy, and the version and
What's new in the app always describe what's live. The app shows the version under Settings
(instead of a commit hash), and a dot marks What's new until it's been opened.

- **A change that must reach production needs a real changeset**, even one nobody sees (a server
  fix, a security patch): an empty changeset never makes a release. Use `fix` or `improved` and
  describe what it protects or keeps working, in plain words.
- **Urgent and can't wait for a release?** Put `[deploy]` in the commit message to build production
  from that commit; the next release still records it.
- Previews build for every branch as usual, except the Release pull request's own branch. To release locally instead, run
`npm run release` and commit the result. Never hand-edit `CHANGELOG.md` or the JSON; fix a
released note by changing the source and regenerating, or in the next release.

## Checks

- `npm run check:changesets` checks every pending changeset: kind present, kind matches the bump,
  bold summary, one paragraph, no internal detail. CI runs it on every pull request.
- `scripts/changelog/changelog.test.mjs` covers the grouping, dating, parsing and checks; it runs
  with `npm test`.
