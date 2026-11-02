import { KINDS, splitKind } from './kinds.mjs'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** "2 November 2026", in UTC. */
export function releaseDate(now = new Date()) {
  return `${now.getUTCDate()} ${MONTHS[now.getUTCMonth()]} ${now.getUTCFullYear()}`
}

const VERSION = /^## (\d+\.\d+\.\d+)\s*$/

/**
 * Turns what `changeset version` wrote into "What's new": each new release's changes regrouped
 * under reader headings (Highlights, Breaking changes, New, Improved, Fixes) instead of bump types,
 * their kind prefixes dropped, and the release dated. Releases already formatted are left alone,
 * so it can run over the whole file every release.
 * @param {string} md
 * @param {string} today
 */
export function formatChangelog(md, today) {
  const lines = md.split('\n')
  const out = ["# What's new"]
  let i = lines[0]?.startsWith('# ') ? 1 : 0
  while (i < lines.length) {
    if (!VERSION.test(lines[i])) {
      out.push(lines[i++])
      continue
    }
    const start = i++
    while (i < lines.length && !VERSION.test(lines[i])) i++
    const block = lines.slice(start + 1, i)
    out.push(lines[start], ...(block.some((l) => l.startsWith('_Released ')) ? block : release(block, today)))
  }
  return out
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\n*$/, '\n')
}

function release(block, today) {
  const byKind = new Map()
  for (const line of block) {
    const m = /^- (.+)$/.exec(line)
    if (!m) continue
    const { kind, text } = splitKind(m[1])
    const k = kind ?? 'improved'
    byKind.set(k, [...(byKind.get(k) ?? []), text])
  }
  const out = ['', `_Released ${today}_`]
  for (const { kind, title } of KINDS) {
    const items = byKind.get(kind)
    if (items) out.push('', `### ${title}`, '', ...items.map((t) => `- ${t}`))
  }
  out.push('')
  return out
}
