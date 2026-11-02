import { LEMMY_DEFAULT } from './lemmyKey.js'

// A story key: a story's id everywhere (lists, the reader's address, saved stories, the server's
// caches): a two-letter network prefix and that network's own id. Built and read here only, by the
// app and the server alike, so the two can never disagree about a key's shape.
//
//   hn-<id>  lb-<id>  dv-<id>  st-<provider>-<incident>
//   bs-<base64url at:// URI>  fp-<base64url at:// URI>  ln-<base64url URL>
//   lm-<id>[@<instance>] (programming.dev unless said)  md-<server>-<status id>

export type StoryKeyParts =
  | { kind: 'hn' | 'lb' | 'dv' | 'st'; id: string }
  | { kind: 'bs' | 'fp'; uri: string }
  | { kind: 'ln'; url: string }
  | { kind: 'lm'; id: string; via: string }
  | { kind: 'md'; instance: string; id: string }

export function storyKey(p: StoryKeyParts): string {
  switch (p.kind) {
    case 'hn':
    case 'lb':
    case 'dv':
    case 'st':
      return `${p.kind}-${p.id}`
    case 'bs':
    case 'fp':
      return `${p.kind}-${toBase64Url(p.uri)}`
    case 'ln':
      return `ln-${toBase64Url(p.url)}`
    case 'lm':
      return p.via === LEMMY_DEFAULT ? `lm-${p.id}` : `lm-${p.id}@${p.via}`
    case 'md':
      return `md-${p.instance}-${p.id}`
  }
}

/** A key's parts; undefined for anything that isn't a well-formed key. */
export function parseStoryKey(key: string): StoryKeyParts | undefined {
  const kind = key.slice(0, 2)
  const rest = key.slice(3)
  if (key[2] !== '-' || !rest) return undefined
  switch (kind) {
    case 'hn':
    case 'lb':
    case 'dv':
    case 'st':
      return { kind, id: rest }
    case 'bs':
    case 'fp': {
      const uri = fromBase64Url(rest)
      return uri?.startsWith('at://') ? { kind, uri } : undefined
    }
    case 'ln': {
      const url = fromBase64Url(rest)
      return url && /^https?:\/\//.test(url) ? { kind, url } : undefined
    }
    case 'lm': {
      const m = /^(\d+)(?:@([a-z0-9.-]+))?$/.exec(rest)
      return m ? { kind, id: m[1], via: m[2] ?? LEMMY_DEFAULT } : undefined
    }
    case 'md': {
      // Server names can have hyphens; status ids can't.
      const at = rest.lastIndexOf('-')
      return at > 0 && at < rest.length - 1 ? { kind, instance: rest.slice(0, at), id: rest.slice(at + 1) } : undefined
    }
    default:
      return undefined
  }
}

/** The id in a key of this kind (hn, lb, dv, st); undefined for any other key. */
export function keyId(key: string, kind: 'hn' | 'lb' | 'dv' | 'st'): string | undefined {
  const p = parseStoryKey(key)
  return p?.kind === kind ? p.id : undefined
}

/** UTF-8, base64url without padding: the same bytes as Node's Buffer.toString('base64url'). */
function toBase64Url(s: string): string {
  let bin = ''
  for (const b of new TextEncoder().encode(s)) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(s: string): string | undefined {
  try {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
    return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))
  } catch {
    return undefined
  }
}
