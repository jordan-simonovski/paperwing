import { describe, expect, it } from 'vitest'
import { problems } from './check.mjs'
import { formatChangelog } from './format.mjs'
import { parseChangelog } from './parse.mjs'

const changeset = (bump, body) => `---\n"paperwing": ${bump}\n---\n\n${body}\n`

// What `changeset version` writes: bump-type headings and our entry lines (entry.cjs), newest first.
const RAW = `# paperwing

## 0.2.0

### Minor Changes

- new: **What's new in the app.** Settings now shows this list, and the version you're on.
- improved: **Faster sorting.** Hot, Latest and Top switch in a blink on phones.

### Patch Changes

- fix: **"Just now", not "now ago".** Brand-new comments read properly.

## 0.1.0

### Minor Changes

- highlight: **PaperWing is here.** The open web's news in one reader.
`

describe('formatting a release', () => {
  const md = formatChangelog(RAW, '2 November 2026')

  it('groups changes by what they are, for readers, not by version bump', () => {
    const v2 = md.slice(md.indexOf('## 0.2.0'), md.indexOf('## 0.1.0'))
    expect(v2).toContain('### New\n\n- **What')
    expect(v2).toContain('### Improved\n\n- **Faster sorting.**')
    expect(v2).toContain('### Fixes\n\n- **"Just now"')
    expect(v2).not.toMatch(/Minor Changes|Patch Changes|new: |fix: /)
    expect(v2.indexOf('### New')).toBeLessThan(v2.indexOf('### Improved'))
    expect(v2.indexOf('### Improved')).toBeLessThan(v2.indexOf('### Fixes'))
  })

  it('dates each release once, and leaves earlier releases as they were', () => {
    expect(md.startsWith("# What's new\n")).toBe(true)
    expect(md).toContain('## 0.2.0\n\n_Released 2 November 2026_')
    const again = formatChangelog(md, '9 December 2026')
    expect(again).toBe(md)
  })

  it('puts highlights and breaking changes first', () => {
    const raw = `# paperwing\n\n## 1.0.0\n\n### Major Changes\n\n- breaking: **Old links moved.** Saved links still open.\n\n### Minor Changes\n\n- new: **A thing.** It works.\n- highlight: **Version 1.0.** Ready for everyone.\n`
    const out = formatChangelog(raw, '1 January 2027')
    expect(out.indexOf('### Highlights')).toBeLessThan(out.indexOf('### Breaking changes'))
    expect(out.indexOf('### Breaking changes')).toBeLessThan(out.indexOf('### New'))
  })
})

describe('reading the changelog for the app', () => {
  it('gives each release its date and sections, each change a title and its detail', () => {
    const { version, releases } = parseChangelog(formatChangelog(RAW, '2 November 2026'))
    expect(version).toBe('0.2.0')
    expect(releases[0]).toMatchObject({ version: '0.2.0', date: '2 November 2026' })
    expect(releases[0].sections.map((s) => s.kind)).toEqual(['new', 'improved', 'fix'])
    expect(releases[0].sections[0].changes[0]).toEqual({ title: "What's new in the app.", detail: "Settings now shows this list, and the version you're on." })
    expect(releases[1].sections[0]).toMatchObject({ kind: 'highlight', title: 'Highlights' })
  })
})

describe('checking a changeset before it lands', () => {
  it('accepts one that says what kind of change it is, in plain words', () => {
    expect(problems(changeset('minor', "new: **Save from any app.** Share a link to PaperWing from another app and it's in your queue."))).toEqual([])
    expect(problems(changeset('patch', ''))).toEqual([])
  })

  it('asks which kind of change it is', () => {
    expect(problems(changeset('minor', '**Save from any app.** It works.'))[0]).toMatch(/start with its kind/)
  })

  it('keeps the kind and the version bump in step', () => {
    expect(problems(changeset('patch', 'new: **A feature.** As a patch.'))[0]).toMatch(/"new" is a minor/)
    expect(problems(changeset('minor', 'breaking: **Links moved.** Old ones redirect.'))[0]).toMatch(/"breaking" is a major/)
    expect(problems(changeset('minor', 'fix: **A bug.** Fixed.'))[0]).toMatch(/"fix" is a patch/)
  })

  it('reads the version bump however the package name is quoted', () => {
    // Changesets reads the header as YAML, so a hand-written one without quotes still bumps the version.
    expect(problems('---\npaperwing: patch\n---\n\nbreaking: **Links moved.** Old ones redirect.\n')[0]).toMatch(/"breaking" is a major/)
    expect(problems("---\n'paperwing': patch\n---\n\nbreaking: **Links moved.** Old ones redirect.\n")[0]).toMatch(/"breaking" is a major/)
    expect(problems('---\npaperwing: patch\n---\n\nfix: **A bug.** Fixed.\n')).toEqual([])
  })

  it('asks for a version bump when it can’t find one', () => {
    expect(problems('---\n---\n\nfix: **A bug.** Fixed.\n')[0]).toMatch(/version bump/)
  })

  it('keeps internal detail out of what readers see', () => {
    const p = problems(changeset('patch', 'fix: **Thread counts.** `api/_lib/threadCounts.ts` handled md- keys from commit abc1234f.'))
    expect(p.join(' ')).toMatch(/a source file/)
    expect(problems(changeset('minor', 'new: Save from any app.'))[0]).toMatch(/bold summary/)
    expect(problems(changeset('minor', 'new: **One.** Two.\n\nA second paragraph.'))[0]).toMatch(/one paragraph/)
  })
})
