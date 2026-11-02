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
