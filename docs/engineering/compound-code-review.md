# Pinned Compound Engineering review

Copied from the public open space planning project's integration, with the same
pin and assets; only the host mapping and this introduction differ.

PaperWing asks for the official Compound Engineering code-review workflow before
a pull request. This integration provides its source assets inside the repository, plus a
small host adapter for native agents. It does not install a global plugin,
register an MCP server, change host configuration, or start another agent CLI.

## Source and licence

- Upstream: [EveryInc/compound-engineering-plugin](https://github.com/EveryInc/compound-engineering-plugin)
- Pin: [`2e41b4490a37f53db0beb6d4904618da9af2f559`](https://github.com/EveryInc/compound-engineering-plugin/commit/2e41b4490a37f53db0beb6d4904618da9af2f559)
- Upstream manifest version: `3.31.0`; retrieved 19 October 2026
- Vendored scope: the complete `skills/ce-code-review/` subtree, `LICENSE` and
  `plugin.json`, without changes. The MIT licence and copyright notice remain
  at `.compound-engineering/vendor/compound-engineering/LICENSE`.
- `.compound-engineering/upstream.lock.json` records every file's original path,
  byte size, Git blob SHA-1 and SHA-256. The 42 assets include the official
  workflow, all reference documents, all 16 personas and all six helper scripts.
  The scripts use Python's standard library or the commands named in their
  source; the native path needs Python 3 and Git, with no package installation.

This is a scoped source integration, not a claim that the full plugin is
installed. Other CE skills are not installed. Where the finish reference names
`ce-noslop`, its documented fallback applies the reference's own presentation
rules. No missing workflow step may be silently replaced with an invented one.

## Start a review

From the repository root:

```sh
python3 scripts/compound-review/verify.py
python3 -m unittest discover -s scripts/compound-review -p 'test_*.py'
```

Then ask the agent to run `$ce-code-review mode:agent depth:full base:<base-sha>`
on the current checkout, or `/ce-code-review` on a slash-skill host. `base:` and a
PR target cannot be combined. For a remote PR, pass its URL and follow the
upstream remote-scope rules. `depth:full` is appropriate for an explicitly
thorough review; omit it for the official automatic depth gate.

If the host has not discovered the skill, explicitly read
`.agents/skills/ce-code-review/SKILL.md`. Claude's repo-local skill is a pointer
to that same adapter. Discovery is explicit so a future session does not confuse
an unavailable global command with a completed review.

The adapter resolves `SKILL_DIR` to
`.compound-engineering/vendor/compound-engineering/skills/ce-code-review`.
The official `SKILL.md` supplies the workflow, including its stage-specific
references. The Python verifier only checks the pin and safety configuration;
it does not launch agents, call a model, assess code, or satisfy the PR gate.

## External review is disabled

The committed configuration is intentionally small:

```yaml
docs_root: docs
cross_model_review_mode: off
```

The verifier accepts exactly this configuration and rejects `config.local.yaml`
because an unreviewed local override could re-enable the upstream default route.
Changing the policy requires an explicit, separately reviewed integration change
and the necessary user permission. Merely invoking the upstream skill never
grants permission to send code outside the current assistant session.

When selected, the official local adversarial persona covers that lens. The
review must say that cross-model coverage did not run. Upstream external-dispatch
scripts remain in the byte-exact snapshot, but are not executed. The supported
native path executes only `review-scope.py`, `run-log.py`,
`findings-mechanics.py` and the scope helper's config-only
`packs-resolve.py --declared-only`. No remote or local Compound Packs are
configured in this integration.

## Host adaptation and scope

The adapter lists the exact file, shell, native agent, collection, GitHub and
tracking tools used by this host. Native agents receive the real official
persona and dispatch templates. Local agents share a provider/session; their
agreement is not independent-model confirmation.

A full run keeps the upstream spine: scope and intent, risk-based persona
selection, collected reviewers, a separate merge leaf, validation, then a
separate report leaf. Collection uses the host's native result delivery and
bounded waits. Capacity limits queue reviewers; they do not justify dropping
lenses. Missing host capabilities or failed reviewers are recorded as limits,
not represented as successful coverage. No global configuration edit is needed.

The upstream scope helper ignores untracked files. For a work-in-progress PR,
review a faithful separate snapshot containing the intended files, or use a
separate Git index for scope. Do not stage another worker's changes in the shared
index. Capture the exact base, reviewed tree and diff; record any excluded files.
A HEAD SHA alone does not identify dirty content. Run a fresh review or bounded
re-review of affected paths after fixes change the reviewed bytes.

Testing personas may mutate only a faithful disposable snapshot, never the
shared checkout. Review is report-only. It never authorises edits, commits,
external comments, pull requests, merging or deployment.

## Untrusted refs and paths

The adapter overrides upstream shell placeholders: PR metadata, branch names and
paths are data. Valid Git branch names can contain shell syntax. Prefer connected
GitHub exact-ref reads; otherwise use separately validated argv with
`subprocess.run(..., shell=False)` and option terminators where supported. With a
shell-only host, static Python can read a metadata JSON file and construct argv;
never interpolate metadata into code, a here-document or a shell command. Explicit
shell quoting is a fallback, not a substitute for option-injection checks. These
boundaries apply to every reviewer and finish leaf; upstream assets stay unchanged.

## Evidence of an actual run

The official run directory is private scratch under
`/tmp/compound-engineering-<uid>/ce-code-review/<run-id>/`. Keep the upstream
artifacts: scope and diff, persona returns, stage log, finish input, merged
findings, validator inputs/outcome/verdicts, final review and metadata. The
workflow owns the exact requirements for each depth; do not manufacture missing
stages or report a partial run as complete.

Also save `adapter-receipt.json` in that run directory with:

- `upstream_commit`, `upstream_version`, and the lock file's SHA-256
- `host`, the actual tool mapping and model choices, and the verification result
- `reviewed_base`, `reviewed_head`, `scope_mode`, diff SHA-256 and a path-to-SHA-256
  map for reviewed working-tree files, or an immutable reviewed Git tree
- `reviewers`: persona path, native launch ID, actual model choice, terminal
  outcome and artifact path for each dispatched reviewer
- `finish`: merge, validator and report launch IDs/outcomes; an empty validator
  batch is recorded explicitly rather than attributed to an agent that never ran
- `external_review: "disabled"`, `external_dispatches: []`, `deviations` and
  `coverage_limits`, including any unsupported host capability or lost coverage
- `status`: complete only when the upstream workflow's required stages finished

The PR description should cite the reviewed commit/tree and summarise retained
findings and limitations. If the run used dirty snapshots, disclose that scope.
Scratch paths are local audit artifacts, not links a remote reviewer can open;
include the relevant receipt summary in the PR or a deliberate durable artifact.
Do not publish raw review material by default. A pre-integration independent
review is not retroactively an official CE run.

## Update the pin

1. Choose and inspect a full upstream commit. Review changes to permissions,
   dispatch, helper execution, references, personas and finish contracts.
2. Replace only the vendored subtree and upstream licence/manifest with exact
   bytes from that commit. Recompute every recorded hash and verify Git blob IDs
   against the upstream tree. Keep native-only policy and local adapters separate.
3. Check that all workflow references and helper dependencies are still present.
   Update the verifier's independent complete inventory when upstream adds or
   removes an asset; its closure tests must still fail when any required file is
   removed from both the lock and disk. Reassess any new external tool, network
   access or package dependency before running it. Preserve the MIT notice.
4. Update the lock and this guide, run verifier and unit tests, then perform an
   actual adapted review of the integration change. Do not regenerate hashes to
   conceal a locally edited upstream file.

The `Compound review assets` CI job checks integrity and fail-closed behaviour.
It does not execute the review or certify the findings, and is not a substitute
for the review receipt.
