import { fail, json } from './_lib/http.js'
import { lobstersThread } from './_lib/sources.js'
import { statusThread } from './_lib/statuspages.js'
import { frontpageThread } from './_lib/frontpage.js'

export async function GET(request: Request): Promise<Response> {
  const p = new URL(request.url).searchParams
  const id = p.get('id')
  const src = p.get('src')
  if ((src !== 'lobsters' && src !== 'status' && src !== 'frontpage') || !id) return fail('src=lobsters|status|frontpage&id= required')
  try {
    if (src === 'frontpage') return json(await frontpageThread(id), 60)
    return json(src === 'status' ? await statusThread(id) : await lobstersThread(id), src === 'status' ? 60 : 120)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'fetch failed'
    // Gone where it was posted (removed by moderators or deleted): say so, and let it cache a while.
    if (/\b404\b/.test(message)) return json({ error: `It was removed or deleted on ${src === 'lobsters' ? 'Lobsters' : src === 'frontpage' ? 'Frontpage' : 'its status page'}` }, 600, 404)
    return fail(message, 502)
  }
}
