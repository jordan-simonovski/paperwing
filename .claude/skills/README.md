# Agent skills

Design and refactoring references for coding agents working on PaperWing, from
[mattpocock/skills](https://github.com/mattpocock/skills) (MIT, copyright (c) 2026 Matt Pocock,
see LICENSE in this folder), copied unmodified at commit 4ae2317.

- `codebase-design`: the vocabulary for module shape (module, interface, depth, seam, adapter,
  leverage, locality) and how to test across a seam. A reference, not a process.
- `improve-codebase-architecture`: scans for deepening opportunities and reports them.
- `tdd`: the red → green loop, and what makes a test worth keeping.
- `domain-modeling`, `grilling`: used by the architecture review to pin down terms and decisions.

`release-notes` is PaperWing's own: how to write changesets (kinds, wording, bumps) and how a
release becomes "What's new" and a production deploy.

`ship` is PaperWing's own too: the gate before any push or pull request (checks, changesets, then the
review below, then fixing what it raises).

`ce-code-review` is different: a pointer to the pinned Compound Engineering review
(EveryInc/compound-engineering-plugin, MIT), whose assets live byte-for-byte in
`.compound-engineering/vendor/` with their own licence. See
`docs/engineering/compound-code-review.md`.

PaperWing's own domain terms live in `GLOSSARY.md` at the repo root.
