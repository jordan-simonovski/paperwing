import { SOURCE_NAMES } from '../components/Source'
import { findTopic } from './channels'
import type { Interest } from './store'
import type { SourceKind } from './types'

const FORMATS: Record<string, string> = {
  paper: 'papers',
  repo: 'repositories',
  release: 'releases',
  incident: 'incidents',
  video: 'videos',
  show: 'things people built',
  question: 'questions',
  postmortem: 'postmortems',
  tutorial: 'tutorials and guides',
  launch: 'launches',
  opinion: 'opinion pieces',
  image: 'image posts',
  discussion: 'discussion posts',
  article: 'articles',
}

/** A taste feature (see features.ts) in words: what it is, and the thing itself. */
export function featureLabel(key: string, interests: Interest[]): { kind: string; name: string } {
  const v = key.slice(2)
  switch (key.slice(0, 2)) {
    case 't:':
      return { kind: 'Topic', name: findTopic(v, interests)?.label ?? v }
    case 'd:':
      return { kind: 'Site', name: v }
    case 'p:':
      return { kind: 'Publisher', name: v }
    case 'c:':
      return { kind: 'Community', name: v }
    case 'a:':
      return { kind: 'Author', name: `@${v}` }
    case 's:':
      return { kind: 'Source', name: SOURCE_NAMES[v as SourceKind] ?? v }
    case 'f:':
      return { kind: 'Format', name: FORMATS[v] ?? v }
    case 'k:':
      return { kind: 'Keyword', name: v }
    default:
      return { kind: '', name: key }
  }
}
