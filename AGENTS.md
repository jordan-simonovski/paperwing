# Agent instructions

Repo-wide rules for coding agents (Claude Code reads this through `CLAUDE.md`). The project's words are in
`GLOSSARY.md`: name modules, tests and copy with them. How the code is laid out, the
safety rules and the house style are in `CONTRIBUTING.md`; read it first. Design references are in
`.claude/skills/`: `codebase-design` for module shape (deep modules, seams, adapters), `tdd` for the test loop,
`improve-codebase-architecture` for finding refactors, `ce-code-review` for review.

## Completion checklist

Before committing:

- `npm run build`, `npm run lint`, `npm test`, `npm run test:stories` and `npm run test:e2e` pass. Format what you
  touched, and only that: `npx prettier --write <files>` (Prettier is pinned in `package.json`; a global or cached one formats differently).
- New behaviour has a test at the module's interface (`*.test.ts` beside it), written before the code where it
  can be. UI you add or change has a story beside it (`*.stories.tsx`), rendered from its parameters only: no
  network, no shared state (see "Stories" in `CONTRIBUTING.md`).
- If you changed what's stored or sent, the privacy and terms pages say so in the same change.
- Commits carry no AI attribution: no `Co-Authored-By` or session trailers, and no model names anywhere in the repo.

Before opening a pull request:

- Add a changeset for every change people can notice, written for them (`release-notes` skill,
  `.changeset/README.md`), or an empty one (`npx changeset add --empty`) when there's nothing to notice.
  `npm run check:changesets` passes. Releasing is deploying: production only builds when the Release
  pull request merges, so anything that must reach production needs a real changeset. Never hand-edit
  `CHANGELOG.md` or `src/generated/changelog.json`.

- Run `/ce-code-review` and resolve what it raises. Use the pinned repo-local adapter in
  `.agents/skills/ce-code-review/SKILL.md` (Codex: `$ce-code-review`); see
  `docs/engineering/compound-code-review.md`. Verify the assets first (`python3 scripts/compound-review/verify.py`),
  follow the official workflow and record the review receipt. External cross-model review is disabled. A passing
  asset check is not a review.
- The description says what changed and why, how it was tested, and has screenshots (phone and desktop) for
  anything visible.
