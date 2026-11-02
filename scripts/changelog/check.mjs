import { readFileSync } from 'node:fs'
import { KIND, KINDS, splitKind } from './kinds.mjs'

// Internal detail that has no place in what readers see.
const JARGON = [
  [/`[^`]*\.(?:ts|tsx|mjs|cjs|js|json|css)`|\b(?:src|api|scripts)\/[\w./-]+/, 'a source file'],
  [/\/api\/[a-z]/, 'an API endpoint'],
  [/\b(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{7,40}\b/, 'a commit hash'],
  [/\b(?:refactor(?:ed|ing)?|zustand|TanStack|React|Vite|Vercel|CI)\b/, 'a technical term readers don’t need'],
]

/**
 * What keeps a changeset from becoming a good "What's new" item: it starts with its kind
 * (highlight, breaking, new, improved, fix), the kind matches the version bump, then a short bold
 * summary and a sentence or two in plain words, in one paragraph. An empty changeset is fine.
 * @param {string} md the whole changeset file
 */
export function problems(md) {
  // Changesets reads the header as YAML, so the package name may be quoted either way or not at all.
  const header = /^---\s*\n([\s\S]*?)^---/m.exec(md)?.[1] ?? ''
  const bump = /^\s*(?:"[^"]+"|'[^']+'|[\w@/.-]+)\s*:\s*(major|minor|patch)\s*$/m.exec(header)?.[1]
  const body = md.replace(/^---[\s\S]*?---\s*/, '').trim()
  if (!body) return []
  const out = []
  if (!bump) out.push('give it a version bump: "paperwing": major, minor or patch')
  const { kind, text } = splitKind(body)
  if (!kind) out.push(`start with its kind: ${KINDS.map((k) => k.kind).join(', ')} (e.g. "new: **Save from any app.** …")`)
  else if (bump && !KIND.get(kind).bumps.includes(bump)) out.push(`"${kind}" is a ${KIND.get(kind).bumps.join(' or ')} change, not ${bump}`)
  if (!text.startsWith('**')) out.push('open with a short bold summary, e.g. **Save from any app.**')
  if (text.split('\n').filter((l) => l.trim()).length > 1) out.push('keep it to one paragraph: it is one item in the list')
  for (const [re, what] of JARGON) if (re.test(text)) out.push(`mentions ${what} (${text.match(re)[0]})`)
  return out
}

// CLI: node scripts/changelog/check.mjs .changeset/*.md
if (import.meta.url === `file://${process.argv[1]}`) {
  let failed = false
  for (const file of process.argv.slice(2).filter((f) => /\.changeset\/[^/]+\.md$/.test(f) && !/README\.md$/i.test(f))) {
    for (const p of problems(readFileSync(file, 'utf8'))) {
      console.error(`${file}: ${p}`)
      failed = true
    }
  }
  process.exit(failed ? 1 : 0)
}
