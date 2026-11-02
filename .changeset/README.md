# Changesets

Every change people can notice gets a changeset: a short note in this folder that becomes an item in
"What's new" (in the app, under Settings, and in `CHANGELOG.md`). Add one with:

```sh
npx changeset
```

Pick the bump, then write the body for readers, starting with what kind of change it is:

```md
---
"paperwing": minor
---

new: **Save from any app.** Share a link to PaperWing from another app on your phone and it lands in your queue.
```

| Kind | For | Bump |
| --- | --- | --- |
| `highlight` | The headline of a release | minor or major |
| `breaking` | Something that works differently now and people must adjust to | major |
| `new` | Something people couldn't do before | minor |
| `improved` | Something that works better | minor or patch |
| `fix` | Something that was broken | patch |

Open with a short bold summary, then a sentence or two in plain words: what people can now do or see,
and where. No file names, endpoints or code words. One paragraph. `npm run check:changesets` checks
all of this, and CI runs it. A change nobody can see (a refactor, tests, CI) gets an empty changeset:

```sh
npx changeset add --empty
```

To release: `npm run release` consumes the changesets, bumps the version in `package.json`, rewrites
`CHANGELOG.md` and the app's copy of it (`src/generated/changelog.json`). CI keeps a "Release" pull
request open that does this; merging it ships the version.
