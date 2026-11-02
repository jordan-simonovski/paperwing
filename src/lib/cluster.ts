// Groups stories about the same event when they link to different places: the NYT and the
// Guardian on one lawsuit, an HN post and a Bluesky thread about the same launch.
//
// Titles are compared by their distinctive words, weighted by how rare each word is across the
// batch being ranked. "Elvis" and "Presley" in the same 48 hours mean something; "AI" doesn't.

const STOP = new Set(
  'the a an and or but for nor of on in at to from by with without into onto about over under after before as is are was were be been being it its this that these those than then there their they them he she his her we our you your i my me not no yes can could will would should may might must do does did done has have had having just how why what when where who whom which while new now says said say via using use used get gets got make makes made more most less least very also all any each every some such own same other only first last next one two three show ask tell hn launch'.split(
    ' ',
  ),
)

const norm = (w: string) => {
  const t = w
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u2019']s$/, '')
    .replace(/^[.]+|[.]+$/g, '')
  // Plurals only ("songs" is "song"), and not names like Elvis or Linus. Stemming further merges too much.
  return t.length > 4 && /[^siu]s$/.test(t) ? t.slice(0, -1) : t
}

// Every ranking pass splits every title again; the titles rarely change, so remember them.
const parsedTitles = new Map<string, { token: string; entity: boolean }[]>()

/** A title's words, with a flag for the ones that look like names, products or numbers. */
export function words(title: string): { token: string; entity: boolean }[] {
  let parsed = parsedTitles.get(title)
  if (!parsed) {
    parsed = parseWords(title)
    if (parsedTitles.size > 5000) parsedTitles.clear()
    parsedTitles.set(title, parsed)
  }
  return parsed
}

function parseWords(title: string): { token: string; entity: boolean }[] {
  // Credits say who published, not what happened: "(Alexandra Alter/New York Times)", " | TechCrunch".
  const headline = title.replace(/\s*\([^()]*\)\s*$/, '').replace(/\s+[|\u2013\u2014-]\s+[^|\u2013\u2014-]{2,40}$/, '')
  const raw = headline.split(/[^\p{L}\p{N}.+#'\u2019]+/u).filter(Boolean)
  // In Title Case Headlines capitals say nothing; in sentence case they mark names.
  const long = raw.slice(1).filter((w) => /^\p{L}{4,}$/u.test(w))
  const titleCase = long.length >= 3 && long.filter((w) => /^\p{Lu}/u.test(w)).length / long.length > 0.6
  const out = new Map<string, boolean>()
  raw.forEach((w, i) => {
    const token = norm(w)
    if (!(token.length >= 3 || /^\d+$/.test(token)) || STOP.has(token)) return
    const entity = (/\d/.test(w) && (/\p{L}/u.test(w) || w.replace(/\D/g, '').length >= 2)) || /\p{Ll}\p{Lu}/u.test(w) || /^[\p{Lu}\d]{2,}$/u.test(w) || (i > 0 && !titleCase && /^\p{Lu}/u.test(w))
    out.set(token, (out.get(token) ?? false) || entity)
  })
  return [...out].map(([token, entity]) => ({ token, entity }))
}

export const tokens = (title: string) => words(title).map((w) => w.token)

export interface Clusterable {
  key: string
  title: string
  createdAt: number
}

const WINDOW = 48 * 3_600_000

/**
 * Returns leader index -> member indexes. `order` lists candidates strongest first; each story
 * joins the first leader it matches, never another member, so groups can't chain.
 */
export function clusterEvents<T extends Clusterable>(stories: T[], order: number[]): Map<number, number[]> {
  const parsed = stories.map((s) => words(s.title))
  const toks = parsed.map((ws) => ws.map((w) => w.token))
  const df = new Map<string, number>()
  const entity = new Set<string>()
  parsed.forEach((ws) =>
    ws.forEach((w) => {
      df.set(w.token, (df.get(w.token) ?? 0) + 1)
      if (w.entity) entity.add(w.token)
    }),
  )
  const n = stories.length
  const idf = (t: string) => Math.log((n + 1) / (df.get(t) ?? 1))
  // Rare enough to identify an event: a handful of stories at most.
  const rareMax = n >= 200 ? 5 : n >= 50 ? 3 : 2
  const isKey = (t: string) => entity.has(t) && (df.get(t) ?? 0) <= rareMax
  const weight = toks.map((ts) => ts.reduce((sum, t) => sum + idf(t), 0))
  const exact = toks.map((ts, i) => ts.join(' ') || stories[i].title.toLowerCase())

  const groups = new Map<number, number[]>()
  // Inverted index from every word to the leaders using it, so only plausible pairs get compared.
  const byWord = new Map<string, number[]>()

  for (const i of order) {
    const mine = toks[i]
    const candidates = new Set<number>()
    for (const t of mine) if ((df.get(t) ?? 0) <= 12) for (const l of byWord.get(t) ?? []) candidates.add(l)
    let joined = -1
    for (const l of candidates) {
      if (Math.abs(stories[l].createdAt - stories[i].createdAt) > WINDOW) continue
      const theirs = new Set(toks[l])
      const shared = mine.filter((t) => theirs.has(t))
      const overlap = shared.reduce((sum, t) => sum + idf(t), 0) / Math.max(1e-9, Math.min(weight[i], weight[l]))
      const same =
        // The same headline posted twice.
        (exact[i] === exact[l] && mine.length >= 3) ||
        // Two distinctive names in common: "Elvis Presley", "Python 3.15".
        shared.filter(isKey).length >= 2 ||
        // Mostly the same words, including a name.
        (shared.length >= 4 && overlap >= 0.5 && shared.some((t) => entity.has(t))) ||
        // Nearly the same headline, reworded.
        (shared.length >= 5 && overlap >= 0.72)
      if (same) {
        joined = l
        break
      }
    }
    if (joined >= 0 && (groups.get(joined)?.length ?? 0) < 8) {
      groups.set(joined, [...(groups.get(joined) ?? []), i])
      continue
    }
    for (const t of mine) byWord.set(t, [...(byWord.get(t) ?? []), i])
  }
  return groups
}
