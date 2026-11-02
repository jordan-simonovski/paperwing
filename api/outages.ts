import { json } from './_lib/http.js'
import { outageReport } from './_lib/outageScan.js'

// GET /api/outages: providers people are saying are down right now (Bluesky posts and HN titles),
// with each one's status page alongside. Cached two minutes at the edge.

export async function GET(): Promise<Response> {
  return json(await outageReport(), 120)
}
