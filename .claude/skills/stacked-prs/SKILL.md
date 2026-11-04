---
name: stacked-prs
description: Open, update and merge pull requests that depend on each other as a GitHub stack, with the gh stack extension. Use whenever a change builds on another pull request that hasn't merged yet, when splitting a large change into reviewable layers, when a stacked PR needs rebasing after the one below it changed or merged, and before merging any PR whose base isn't main. Triggers: "stack", "stacked PR", "depends on #", "build on top of", "split this PR", "PR into another PR's branch", "retarget".
---

# Stacked pull requests

A stack is a chain of pull requests where each one builds on the one below it. GitHub tracks the
chain, so merges go bottom-up, the PRs above are retargeted when one below lands, and the remaining
branches are rebased for you. Reference: [about stacked pull requests](https://docs.github.com/en/pull-requests/get-started/about-stacked-prs)
and the [`gh stack` commands](https://docs.github.com/en/pull-requests/reference/stacked-prs-cli-commands).

## When to stack, and when not to

- **Stack only real dependencies.** A layer goes on top of another when its code needs the code below.
  Work that merely happens at the same time is a separate PR from `main`, not a layer.
- **One concern per layer.** Server change, then the UI that uses it; a refactor, then the feature on it.
- **Never build a PR from someone else's uncommitted work.** If the tree holds changes that aren't
  yours, branch from `main` and carry only your own commits; anything you build on has to be a PR first.

## Branches and contribution text

Every working branch uses a purpose prefix (`feat/`, `bug/`, `chore/`, `docs/`,
`refactor/` or `test/`) and a short kebab-case description. Never name a branch after an
agent, assistant, vendor or model. Follow `AGENTS.md`: no agent attribution in commits,
trailers, PR titles and descriptions, comments, release notes, documentation or code.

## Make a stack

The extension is `github/gh-stack` (`gh extension install github/gh-stack`; needs gh 2.0+, Git 2.36+).

```sh
gh stack init --base main feat/api        # the bottom layer; adopts the branch if it exists
# ...commit the first layer...
gh stack add feat/ui                       # a new layer on top (be on the top branch)
# ...commit the next layer...
gh stack submit --open                        # pushes every layer, opens a PR for each, links the stack
```

To stack PRs that already exist, list them bottom to top: `gh stack link 41 42 feat/ui`.
`gh stack view` shows the chain; exit code 9 means stacks aren't enabled for the repository yet, which
is a setting only the owner can change (ask; don't fall back to hand-made chains silently).

## The ship gate, per layer

Each layer is its own pull request and passes `ship` on its own:

- **Review the layer's own diff**, against the branch below it (`base:<branch below>`), not against
  `main`, so each review covers exactly what that PR adds.
- **Checks run on the layer's head**, which includes everything below it.
- **Changesets go with the layer that makes the change** people notice.
- The description names the PR below ("Stacked on #41") and says the base moves to `main` when it lands.

## Keep it up to date

- **A lower layer changed or merged:** `gh stack sync` fetches, rebases the layers above, pushes and
  updates the PRs. `gh stack rebase` does the rebase alone; on a conflict it stops (exit 3): fix the
  files, `git add`, then `gh stack rebase --continue`, or `--abort` to put every branch back.
- **Pushing rewritten layers** uses `--force-with-lease` (`gh stack push` does). That rewrites a shared
  branch, so ask before the first push of a rebased stack; never `git push --force`.
- **`main` moved and a layer conflicts:** sync the stack rather than merging `main` into one layer, so
  the layers above stay on top of it.

## Merge

- **Merge bottom-up, or merge the top PR to land the whole stack at once.** `gh stack merge <pr>`
  merges every PR up to and including that one, all or nothing, under the base branch's rules.
- **Never press merge on a higher PR before the one below has landed and it's been retargeted.**
  That is what happened with #28: it merged seconds after #26, still pointing at #26's branch, so the
  work landed in that branch instead of `main` and needed another PR (#29) to arrive.
- **Merging through the API** needs the asynchronous stack merge API, not the plain merge endpoint.

After the last layer lands, `gh stack sync --prune` removes the merged local branches.
