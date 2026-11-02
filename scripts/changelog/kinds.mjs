// The kinds of change a release can carry, in the order readers see them. Every changeset starts with
// its kind ("new: **…**"), and the kind decides the version bump: changesets' own grouping (by bump)
// says nothing a reader cares about, so releases are regrouped by kind (format.mjs).
export const KINDS = [
  { kind: 'highlight', title: 'Highlights', bumps: ['major', 'minor'] },
  { kind: 'breaking', title: 'Breaking changes', bumps: ['major'] },
  { kind: 'new', title: 'New', bumps: ['minor'] },
  { kind: 'improved', title: 'Improved', bumps: ['minor', 'patch'] },
  { kind: 'fix', title: 'Fixes', bumps: ['patch'] },
]
export const KIND = new Map(KINDS.map((k) => [k.kind, k]))
/** "new: **Title.** Detail" → kind and text; no kind when it doesn't start with one. */
export function splitKind(text) {
  const m = /^([a-z]+):\s+([\s\S]*)$/.exec(text.trim())
  return m && KIND.has(m[1]) ? { kind: m[1], text: m[2].trim() } : { kind: undefined, text: text.trim() }
}
