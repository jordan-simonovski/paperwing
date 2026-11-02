// Sync records are encrypted before they're stored, with keys derived from the sync code, so the
// database holds only ciphertext under opaque ids: not what you saved, its titles, or your topics.
// The sync function still sees the code in transit, as it always has, to find your space; it keeps
// none of it. The same code runs in the browser and on the server (the inbox seals what it saves).
//
// A sealed record's key is `x:` plus an HMAC of the real key, stable per item so the server can
// still keep the newest version of each. Clients from before encryption ignore `x:` keys, so they
// never mistake ciphertext for a record; records they wrote stay readable.

export interface SyncRecord {
  key: string
  updatedAt: number
  deleted?: boolean
  data?: unknown
}

const SEALED = 'x:'
const VERSION = 'v1'
const enc = new TextEncoder()

interface Keys {
  aes: CryptoKey
  hmac: CryptoKey
}
const derived = new Map<string, Promise<Keys>>()

function keysFor(code: string): Promise<Keys> {
  let keys = derived.get(code)
  if (!keys) {
    keys = (async () => {
      const base = await crypto.subtle.importKey('raw', enc.encode(code), 'HKDF', false, ['deriveKey'])
      const hkdf = (info: string) => ({ name: 'HKDF', hash: 'SHA-256', salt: enc.encode('readout-sync'), info: enc.encode(info) })
      const [aes, hmac] = await Promise.all([
        crypto.subtle.deriveKey(hkdf('records v1'), base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']),
        crypto.subtle.deriveKey(hkdf('record ids v1'), base, { name: 'HMAC', hash: 'SHA-256', length: 256 }, false, ['sign']),
      ])
      return { aes, hmac }
    })()
    derived.set(code, keys)
  }
  return keys
}

export const toB64url = (bytes: ArrayBuffer | Uint8Array) => {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let s = ''
  for (let i = 0; i < view.length; i += 0x8000) s += String.fromCharCode(...view.subarray(i, i + 0x8000))
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
export const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0))

export const isSealed = (r: Pick<SyncRecord, 'key'>) => r.key.startsWith(SEALED)

/** Encrypts a record. Deletions are sealed too, so the server never learns which key went away. */
export async function seal(code: string, r: SyncRecord): Promise<SyncRecord> {
  const { aes, hmac } = await keysFor(code)
  const key = SEALED + toB64url(await crypto.subtle.sign('HMAC', hmac, enc.encode(r.key))).slice(0, 32)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const body = enc.encode(JSON.stringify(r.deleted ? { k: r.key, x: 1 } : { k: r.key, d: r.data }))
  // The id and time are bound in, so a record can't be replayed under another item or date.
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(`${key}|${r.updatedAt}`) }, aes, body)
  return { key, updatedAt: r.updatedAt, data: `${VERSION}.${toB64url(iv)}.${toB64url(ct)}` }
}

/** Decrypts a sealed record; passes plain ones through. Undefined when it can't be read with this code. */
export async function open(code: string, r: SyncRecord): Promise<SyncRecord | undefined> {
  if (!isSealed(r)) return r
  if (typeof r.data !== 'string') return undefined
  const [version, iv, ct] = r.data.split('.')
  if (version !== VERSION || !iv || !ct) return undefined
  try {
    const { aes } = await keysFor(code)
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64url(iv), additionalData: enc.encode(`${r.key}|${r.updatedAt}`) }, aes, fromB64url(ct))
    const { k, d, x } = JSON.parse(new TextDecoder().decode(plain)) as { k: string; d?: unknown; x?: 1 }
    return x ? { key: k, updatedAt: r.updatedAt, deleted: true } : { key: k, updatedAt: r.updatedAt, data: d }
  } catch {
    return undefined
  }
}
