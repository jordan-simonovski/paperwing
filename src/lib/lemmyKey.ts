import { parseStoryKey, storyKey } from './storyKey.js'
// Lemmy post ids are per instance: the same post has one id on programming.dev and another on
// lemmy.world. Tech communities are read through programming.dev (keys "lm-<id>", as they always
// were); everything else through lemmy.world ("lm-<id>@lemmy.world"). Only these instances are
// ever fetched, so a key can't point the server anywhere else.

export const LEMMY_DEFAULT = 'programming.dev'
export const LEMMY_INSTANCES = new Set([LEMMY_DEFAULT, 'lemmy.world'])

export const lemmyKey = (id: number | string, via = LEMMY_DEFAULT) => storyKey({ kind: 'lm', id: String(id), via })

/**
 * A Lemmy key's post id and the instance it belongs to; undefined for anything else. `also` is one
 * more instance the caller may read: in the app, your own Lemmy server (never on PaperWing's server).
 */
export function parseLemmyKey(key: string, also?: string): { id: string; via: string } | undefined {
  const p = parseStoryKey(key)
  if (p?.kind !== 'lm') return undefined
  return LEMMY_INSTANCES.has(p.via) || (!!also && p.via === also) ? { id: p.id, via: p.via } : undefined
}
