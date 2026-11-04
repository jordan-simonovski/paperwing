import { clientKey, fail, json } from './_lib/http.js'
import { fanOutLimited, overLimit } from './_lib/kv.js'
import { NotSelfPost, selfPostBody } from './_lib/selfPost.js'
import { lobstersThread } from './_lib/sources.js'
import { statusThread } from './_lib/statuspages.js'
import { NoticeGone, WARN_KEY, warnThread } from './_lib/warn.js'
import { frontpageThread } from './_lib/frontpage.js'

export async function GET(request: Request): Promise<Response> {
  const p = new URL(request.url).searchParams
  const id = p.get('id')
  const src = p.get('src')
  if ((src !== 'lobsters' && src !== 'status' && src !== 'frontpage' && src !== 'paperwing' && src !== 'warn') || !id) return fail('src=lobsters|status|frontpage|paperwing|warn&id= required')
  if (src === 'paperwing') return selfPost(request, id)
  if (src === 'warn') return warnNotice(request, id)
  // A Frontpage thread asks Constellation and every commenter's server: it counts against the caller's fan-out allowance.
  if (src === 'frontpage' && (await fanOutLimited(request, 3))) return fail('That was a lot at once. Try again in a minute.', 429)
  try {
    if (src === 'frontpage') return json(await frontpageThread(id), 60)
    return json(src === 'status' ? await statusThread(id) : await lobstersThread(id), src === 'status' ? 60 : 120)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'fetch failed'
    // Gone where it was posted (removed by moderators or deleted): say so, and let it cache a while.
    // (Built here: json() never caches an error, and this one is worth caching.)
    if (/\b404\b/.test(message))
      return new Response(JSON.stringify({ error: `It was removed or deleted on ${src === 'lobsters' ? 'Lobsters' : src === 'frontpage' ? 'Frontpage' : 'its status page'}` }), {
        status: 404,
        headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, s-maxage=600' },
      })
    return fail(message, 502)
  }
}

/**
 * One WARN notice, for a link to it. Reading it can mean reading the whole state's list again, so
 * it's charged like the feed that lists it, and only a well-formed key gets that far.
 */
async function warnNotice(request: Request, key: string): Promise<Response> {
  if (!WARN_KEY.test(key)) return fail('Not a WARN notice key')
  if (await fanOutLimited(request, 1)) return fail('That was a lot at once. Try again in a minute.', 429)
  try {
    // A notice never changes; its state's list is cached for hours.
    return json(await warnThread(key), 3600)
  } catch (err) {
    // Aged out, not deleted: say so in the notice's own words, and let it cache a while.
    if (err instanceof NoticeGone)
      return new Response(JSON.stringify({ error: err.message }), { status: 404, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, s-maxage=600' } })
    return fail(err instanceof Error ? err.message : 'fetch failed', 502)
  }
}

/** A self post's body and its versions (selfPost.ts): it reads the author's repo and writes what it sees, so it's rate limited. */
async function selfPost(request: Request, key: string): Promise<Response> {
  if (await overLimit(`rd:pwself:${clientKey(request)}`, 60, 120)) return fail('That was a lot of posts at once. Try again in a minute.', 429)
  try {
    return json(await selfPostBody(key), 60)
  } catch (err) {
    if (err instanceof NotSelfPost) return fail(err.message, 404)
    return fail(err instanceof Error ? err.message : 'fetch failed', 502)
  }
}
