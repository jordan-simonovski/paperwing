---
name: ship
description: The gate before PaperWing work leaves this checkout, whether as a pull request or a push to main. Use before every `git push`, before opening a pull request, and when asked to ship, release, push, merge or "get this live". Runs the checks, the changesets and the pinned Compound Engineering review, then fixes what it raises before anything is pushed. Triggers: "push", "ship it", "open a PR", "raise a PR", "is this ready", "deploy".
---

# Ship

Nothing leaves this checkout without passing this gate: not a pull request, and not a direct push to
`main`. Pushing to `main` is not a shortcut around review. Every commit on `main` goes out in the next
release, and merging the Release pull request is the production deploy.

## The gate, in order

1. **Checks.** Each of these must pass:
   - `npm run build`
   - `npm run check:budget` (after the build)
   - `npm run lint`
   - `npm run format:check`
   - `npm test`
   - `npm run test:stories`
   - `npm run test:e2e`

   A failure is fixed, not skipped. The `pre-push` hook runs the cheap half of this; CI adds Lighthouse.
   What each gate protects, and how to fix what it raises, is in the `codebase-health` skill.
2. **Changesets.** Every change people can notice has one (`release-notes` skill), and
   `npm run check:changesets` passes. A change with nothing to notice gets an empty changeset.
3. **Review.** Run `/ce-code-review` (the `ce-code-review` skill) over exactly what will be pushed:
   - Use `base:<the remote's tip>` for a push to `main`. Use the branch's merge base for a pull request.
   - Follow the pinned adapter in `.agents/skills/ce-code-review/SKILL.md` all the way to its receipt. A
     passing `python3 scripts/compound-review/verify.py` checks the assets; it is not a review.
4. **Resolve.**
   - Fix every P0 and P1, and every P2 that is a real defect in the new code, with a test that fails
     without the fix. Then rerun the checks.
   - If a fix changed more than a few lines, re-review the changed paths.
   - Findings left as they are get one line each, saying why, in the pull request description or the
     commit message.
5. **Push, or open the pull request.**
   - Work that builds on another open pull request goes up as a GitHub stack, never as a PR whose base
     you set by hand (`stacked-prs` skill). Each layer passes this gate on its own diff.
   - Commits are authored as the repository owner and carry no AI attribution (`AGENTS.md`).
   - A pull request description cites the reviewed commit, summarises what the review found, and links
     screenshots for anything visible.

## Things the review has caught here before

- **Test files deployed as functions.** Vercel deploys every file under `api/` as a function unless the
  file or a folder above it starts with `_`. Tests and their helpers belong in `api/_test/` or `api/_lib/`.
  `api/_test/deploy.test.ts` guards this.
- **Untested guards.** A guard that fails closed needs a test proving it fails closed. A rate limit that
  quietly fails open still passes every other test.
- **Missing stories.** New UI states (signed out, empty, failed) need a story, or the bug they fix can
  come back unseen.
