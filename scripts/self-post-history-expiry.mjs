#!/usr/bin/env node
// One-off, run once after the release that keeps self-post history for a day: histories kept
// before it were stored for a year. This shortens each one still holding longer to a day, so the
// privacy page's "within a day" is true for them too. Safe to run more than once.
//
//   KV_REST_API_URL=… KV_REST_API_TOKEN=… node scripts/self-post-history-expiry.mjs
//
// (or UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN). Prints how many it shortened.

const DAY = 86_400

/** Shortens every pw:self:* key living longer than a day. `command` runs one Redis command. */
export async function shortenHistories(command) {
  let cursor = '0'
  let shortened = 0
  do {
    const [next, keys] = await command(['SCAN', cursor, 'MATCH', 'pw:self:*', 'COUNT', 200])
    cursor = String(next)
    for (const key of keys) {
      const ttl = Number(await command(['TTL', key]))
      // -1: no expiry at all; anything over a day: kept from before the change.
      if (ttl === -1 || ttl > DAY) {
        await command(['EXPIRE', key, DAY])
        shortened++
      }
    }
  } while (cursor !== '0')
  return shortened
}

const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL
const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN

if (import.meta.url === `file://${process.argv[1]}`) {
  if (!url || !token) {
    console.error('Set KV_REST_API_URL and KV_REST_API_TOKEN (the production store).')
    process.exit(1)
  }
  const command = async (args) => {
    const res = await fetch(url, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(args) })
    const out = await res.json()
    if (!res.ok || out.error) throw new Error(out.error ?? `Store answered ${res.status}`)
    return out.result
  }
  console.log(`Shortened ${await shortenHistories(command)} self-post histories to a day.`)
}
