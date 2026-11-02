// The handful of Redis commands sync needs, over Upstash's REST API. Vercel's Upstash
// integration sets KV_REST_API_*; a database made on upstash.com gives UPSTASH_REDIS_REST_*.
// SYNC_MEMORY=1 swaps in an in-process store for local development.

export interface Kv {
  hmget(key: string, fields: string[]): Promise<(string | null)[]>
  hset(key: string, entries: [string, string][]): Promise<void>
  hdel(key: string, fields: string[]): Promise<void>
  hgetall(key: string): Promise<Record<string, string>>
  zadd(key: string, entries: [number, string][]): Promise<void>
  /** Members with score > min, lowest first. */
  zrangeAbove(key: string, min: number, limit: number): Promise<[string, number][]>
  expire(keys: string[], seconds: number): Promise<void>
  get(key: string): Promise<string | null>
  mget(keys: string[]): Promise<(string | null)[]>
  set(key: string, value: string, seconds: number): Promise<void>
  /** Sets a key that never expires, unless it already exists. True if this call set it. */
  setOnce(key: string, value: string): Promise<boolean>
  /** Adds `by` (1 unless given) to a counter that expires `seconds` after it was first created; returns the new value. */
  bump(key: string, seconds: number, by?: number): Promise<number>
}

const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL
const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN

export const kvConfigured = () => !!(url && token) || process.env.SYNC_MEMORY === '1'

async function pipeline(commands: (string | number)[][]): Promise<unknown[]> {
  const res = await fetch(`${url}/pipeline`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(commands),
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) throw new Error(`Sync store answered ${res.status}`)
  const out = (await res.json()) as { result?: unknown; error?: string }[]
  const failed = out.find((r) => r.error)
  if (failed) throw new Error(failed.error)
  return out.map((r) => r.result)
}

const upstash: Kv = {
  async hmget(key, fields) {
    if (!fields.length) return []
    return (await pipeline([['HMGET', key, ...fields]]))[0] as (string | null)[]
  },
  async hset(key, entries) {
    if (entries.length) await pipeline([['HSET', key, ...entries.flat()]])
  },
  async hdel(key, fields) {
    if (fields.length) await pipeline([['HDEL', key, ...fields]])
  },
  async hgetall(key) {
    const flat = ((await pipeline([['HGETALL', key]]))[0] ?? []) as string[]
    const out: Record<string, string> = {}
    for (let i = 0; i < flat.length; i += 2) out[flat[i]] = flat[i + 1]
    return out
  },
  async zadd(key, entries) {
    if (entries.length) await pipeline([['ZADD', key, ...entries.flatMap(([score, member]) => [score, member])]])
  },
  async zrangeAbove(key, min, limit) {
    const flat = (await pipeline([['ZRANGE', key, `(${min}`, '+inf', 'BYSCORE', 'LIMIT', 0, limit, 'WITHSCORES']]))[0] as string[]
    const out: [string, number][] = []
    for (let i = 0; i < flat.length; i += 2) out.push([flat[i], Number(flat[i + 1])])
    return out
  },
  async expire(keys, seconds) {
    await pipeline(keys.map((k) => ['EXPIRE', k, seconds]))
  },
  async get(key) {
    return ((await pipeline([['GET', key]]))[0] as string | null) ?? null
  },
  async mget(keys) {
    if (!keys.length) return []
    return (await pipeline([['MGET', ...keys]]))[0] as (string | null)[]
  },
  async set(key, value, seconds) {
    await pipeline([['SET', key, value, 'EX', seconds]])
  },
  async setOnce(key, value) {
    return (await pipeline([['SET', key, value, 'NX']]))[0] === 'OK'
  },
  async bump(key, seconds, by = 1) {
    const [n] = await pipeline([
      ['INCRBY', key, by],
      ['EXPIRE', key, seconds, 'NX'],
    ])
    return Number(n)
  },
}

// Survives Vite reloading this module during development.
const g = globalThis as unknown as { __readoutKv?: { hashes: Map<string, Map<string, string>>; zsets: Map<string, Map<string, number>>; strings: Map<string, { value: string; until: number }> } }
const mem = (g.__readoutKv ??= { hashes: new Map(), zsets: new Map(), strings: new Map() })
mem.strings ??= new Map()
const memory: Kv = {
  async hmget(key, fields) {
    const h = mem.hashes.get(key)
    return fields.map((f) => h?.get(f) ?? null)
  },
  async hset(key, entries) {
    const h = mem.hashes.get(key) ?? new Map()
    for (const [f, v] of entries) h.set(f, v)
    mem.hashes.set(key, h)
  },
  async hdel(key, fields) {
    for (const f of fields) mem.hashes.get(key)?.delete(f)
  },
  async hgetall(key) {
    return Object.fromEntries(mem.hashes.get(key) ?? [])
  },
  async zadd(key, entries) {
    const z = mem.zsets.get(key) ?? new Map()
    for (const [score, member] of entries) z.set(member, score)
    mem.zsets.set(key, z)
  },
  async zrangeAbove(key, min, limit) {
    return [...(mem.zsets.get(key) ?? new Map<string, number>()).entries()]
      .filter(([, s]) => s > min)
      .sort((a, b) => a[1] - b[1])
      .slice(0, limit)
  },
  async expire() {},
  async get(key) {
    const hit = mem.strings.get(key)
    return hit && hit.until > Date.now() ? hit.value : null
  },
  async mget(keys) {
    return Promise.all(keys.map((k) => memory.get(k)))
  },
  async set(key, value, seconds) {
    mem.strings.set(key, { value, until: Date.now() + seconds * 1000 })
  },
  async setOnce(key, value) {
    const hit = mem.strings.get(key)
    if (hit && hit.until > Date.now()) return false
    mem.strings.set(key, { value, until: Infinity })
    return true
  },
  async bump(key, seconds, by = 1) {
    const hit = mem.strings.get(key)
    const n = hit && hit.until > Date.now() ? Number(hit.value) + by : by
    mem.strings.set(key, { value: String(n), until: hit && hit.until > Date.now() ? hit.until : Date.now() + seconds * 1000 })
    return n
  },
}

export const kv = (): Kv => (url && token ? upstash : memory)
