import { KINDS } from './kinds.mjs'

const BY_TITLE = new Map(KINDS.map((k) => [k.title, k.kind]))

/**
 * "What's new" (CHANGELOG.md, as format.mjs leaves it) as data for the app: each release with its
 * date and sections, each change split into its bold title and the sentence or two after it.
 * @param {string} md
 */
export function parseChangelog(md) {
  const releases = []
  let release
  let section
  for (const raw of md.split('\n')) {
    const line = raw.trimEnd()
    let m
    if ((m = /^## (\d+\.\d+\.\d+)$/.exec(line))) {
      release = { version: m[1], date: null, sections: [] }
      releases.push(release)
      section = undefined
    } else if (!release) continue
    else if ((m = /^_Released (.+)_$/.exec(line))) release.date = m[1]
    else if ((m = /^### (.+)$/.exec(line))) {
      section = { kind: BY_TITLE.get(m[1]) ?? 'improved', title: m[1], changes: [] }
      release.sections.push(section)
    } else if ((m = /^- (.+)$/.exec(line)) && section) {
      const t = /^\*\*(.+?)\*\*\s*(.*)$/.exec(m[1])
      section.changes.push(t ? { title: t[1], detail: t[2] } : { title: m[1], detail: '' })
    }
  }
  return { version: releases[0]?.version ?? '0.0.0', releases }
}
