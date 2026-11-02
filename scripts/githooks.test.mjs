import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// AGENTS.md: commits carry no AI attribution. The hook is the only thing that enforces it.
const commitMsg = (message) => {
  const file = join(mkdtempSync(join(tmpdir(), 'msg-')), 'COMMIT_EDITMSG')
  writeFileSync(file, message)
  return spawnSync('sh', ['.githooks/commit-msg', file]).status
}

describe('the commit-msg hook', () => {
  it.each([
    'Fix it\n\nCo-Authored-By: Claude <noreply@anthropic.com>\n',
    'Fix it\n\nco-authored-by: GitHub Copilot <copilot@github.com>\n',
    'Fix it\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)\n',
  ])('refuses AI attribution: %j', (message) => expect(commitMsg(message)).toBe(1))

  it.each(['Fix it\n', 'Fix it\n\nCo-Authored-By: Jane Doe <jane@example.com>\n', 'Explain how Claude summaries are cached\n'])('allows ordinary messages and human co-authors: %j', (message) =>
    expect(commitMsg(message)).toBe(0),
  )
})

// The changeset rule, shared by the pre-push hook and CI: changed paths in, pass or fail out.
const requireSh = resolve('scripts/changelog/require.sh')
function changesetCheck(paths) {
  const repo = mkdtempSync(join(tmpdir(), 'repo-'))
  const git = (...args) => spawnSync('git', ['-c', 'user.email=t@example.com', '-c', 'user.name=t', '-c', 'core.hooksPath=/dev/null', ...args], { cwd: repo })
  git('init', '-q')
  writeFileSync(join(repo, 'README'), 'base')
  git('add', '.')
  git('commit', '-qm', 'base')
  for (const p of paths) {
    mkdirSync(join(repo, dirname(p)), { recursive: true })
    writeFileSync(join(repo, p), 'x')
  }
  git('add', '.')
  git('commit', '-qm', 'change')
  return spawnSync('sh', [requireSh, 'HEAD~1', 'HEAD'], { cwd: repo }).status
}

describe('the changeset rule', () => {
  it('fails an app change with no changeset', () => expect(changesetCheck(['src/lib/rank.ts'])).toBe(1))
  it('passes it with one', () => expect(changesetCheck(['src/lib/rank.ts', '.changeset/rank.md'])).toBe(0))
  it('passes changes readers never get: tests, stories, tooling', () => expect(changesetCheck(['src/lib/rank.test.ts', 'src/components/Row.stories.tsx', 'scripts/x.mjs'])).toBe(0))
  it('passes a release, which consumes the changesets', () => expect(changesetCheck(['src/lib/rank.ts', 'CHANGELOG.md'])).toBe(0))
})

// pre-push runs the checks on the checkout, so it refuses when that isn't exactly what's pushed.
// Each case here stops before the npm checks run.
function prePush({ ref = 'refs/heads/topic', sha = 'HEAD', dirty = false, untracked = '' } = {}) {
  const repo = mkdtempSync(join(tmpdir(), 'push-'))
  const git = (...args) => spawnSync('git', ['-c', 'user.email=t@example.com', '-c', 'user.name=t', '-c', 'core.hooksPath=/dev/null', ...args], { cwd: repo, encoding: 'utf8' })
  git('init', '-q')
  mkdirSync(join(repo, 'scripts/changelog'), { recursive: true })
  writeFileSync(join(repo, 'scripts/changelog/require.sh'), 'exit 0\n')
  writeFileSync(join(repo, 'README'), 'one')
  git('add', '.')
  git('commit', '-qm', 'one')
  writeFileSync(join(repo, 'README'), 'two')
  git('commit', '-qam', 'two')
  if (dirty) writeFileSync(join(repo, 'README'), 'three')
  if (untracked) {
    mkdirSync(join(repo, dirname(untracked)), { recursive: true })
    writeFileSync(join(repo, untracked), 'x')
  }
  const local = git('rev-parse', sha).stdout.trim()
  return spawnSync('sh', [resolve('.githooks/pre-push')], { cwd: repo, input: `${ref} ${local} ${ref} ${'0'.repeat(40)}\n`, encoding: 'utf8' })
}

describe('the pre-push hook', () => {
  it('refuses to vouch for a commit other than the checkout', () => expect(prePush({ sha: 'HEAD~1' }).stderr).toMatch(/pushing another one/))
  it('refuses with uncommitted changes', () => expect(prePush({ dirty: true }).stderr).toMatch(/uncommitted changes/))
  it('refuses with untracked files the checks would read', () => expect(prePush({ untracked: 'src/lib/new.ts' }).stderr).toMatch(/untracked/))
  it('leaves tags alone', () => expect(prePush({ ref: 'refs/tags/v1', sha: 'HEAD~1' }).status).toBe(0))
})
