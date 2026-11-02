import { createHash } from 'node:crypto'
import dns from 'node:dns'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import ipaddr from 'ipaddr.js'
import { Agent, EnvHttpProxyAgent, fetch as undiciFetch, type Dispatcher, type Response as UndiciResponse } from 'undici'

export const UA = 'Mozilla/5.0 (compatible; PaperWing/0.1; +https://github.com/jordan-simonovski/paperwing)'

export function json(data: unknown, maxAge = 300, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      // Vercel's CDN honours s-maxage, so upstreams see a request every few minutes at most.
      // maxAge 0 is a per-person answer (a sign-in, a sync): never stored anywhere.
      'cache-control': status === 200 && maxAge > 0 ? `public, s-maxage=${maxAge}, stale-while-revalidate=${maxAge * 4}` : 'no-store',
    },
  })
}

/**
 * Who's asking, for rate limits: a hash of the caller's address, with IPv6 cut to its /64 (one
 * home or server gets a whole /64, so counting each address would let one machine look like
 * billions). Never the address itself, so counters don't keep it.
 */
export function clientKey(request: Request): string {
  const raw = (request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim()
  let who = raw || 'unknown'
  if (ipaddr.IPv6.isValid(raw)) {
    const v6 = ipaddr.IPv6.parse(raw)
    who = v6.isIPv4MappedAddress() ? v6.toIPv4Address().toString() : `${v6.parts.slice(0, 4).join(':')}::/64`
  }
  return createHash('sha256').update(who).digest('hex').slice(0, 24)
}

export function fail(message: string, status = 400): Response {
  return json({ error: message }, 0, status)
}

/**
 * Anything but ordinary public unicast is off limits: loopback, private, link-local (cloud
 * metadata), CGNAT, multicast, and IPv6 forms that wrap an IPv4 address (::ffff:7f00:1 is
 * 127.0.0.1), which get judged by the address inside.
 */
export function isPrivateAddress(ip: string): boolean {
  try {
    let addr = ipaddr.parse(ip)
    if (addr.kind() === 'ipv6' && (addr as ipaddr.IPv6).isIPv4MappedAddress()) addr = (addr as ipaddr.IPv6).toIPv4Address()
    return addr.range() !== 'unicast'
  } catch {
    return true
  }
}

/** Rejects non-http(s) URLs and hosts resolving to private ranges, since extract/rss take arbitrary URLs. */
export async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new Error('Invalid URL')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Only http(s) URLs are allowed')
  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) throw new Error('Host not allowed')
  const addresses = isIP(host) ? [host] : (await lookup(host, { all: true })).map((r) => r.address)
  if (addresses.some(isPrivateAddress)) throw new Error('Host not allowed')
  return url
}

// Checking a host and then fetching it resolves DNS twice, and the second answer can be private
// (DNS rebinding). This connector refuses a private address at the moment of connecting instead.
type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | dns.LookupAddress[], family?: number) => void
const publicOnly = new Agent({
  connect: {
    lookup: (hostname: string, options: dns.LookupOptions, callback: LookupCallback) => {
      dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
        if (err) return callback(err, '', 0)
        const list = addresses as dns.LookupAddress[]
        if (!list.length || list.some((a) => isPrivateAddress(a.address))) return callback(Object.assign(new Error('Host not allowed'), { code: 'EHOSTNOTALLOWED' }), '', 0)
        if (options.all) callback(null, list)
        else callback(null, list[0].address, list[0].family)
      })
    },
  } as Agent.Options['connect'],
})
// Local development in a sandbox that only reaches the internet through a proxy: the proxy does
// the lookup there, so the pin can't apply. Never set on Vercel.
const dispatcher: Dispatcher = process.env.NODE_USE_ENV_PROXY ? new EnvHttpProxyAgent() : publicOnly

export interface SafeFetchInit {
  headers?: Record<string, string>
  timeoutMs?: number
  /** 'error' refuses any redirect; otherwise up to five are followed, each one checked. */
  redirect?: 'follow' | 'error'
}

/**
 * Fetches a URL someone else chose (a feed, a page, an icon) without letting it reach private
 * addresses: the URL and every redirect are checked, and the connection itself is pinned to a
 * public address.
 */
export async function safeFetch(raw: string, init: SafeFetchInit = {}): Promise<{ res: UndiciResponse; finalUrl: string }> {
  const { timeoutMs = 10_000, redirect = 'follow' } = init
  const signal = AbortSignal.timeout(timeoutMs)
  let url = (await assertPublicUrl(raw)).toString()
  for (let hop = 0; hop <= 5; hop++) {
    const res = await undiciFetch(url, { headers: { 'user-agent': UA, accept: '*/*', ...init.headers }, redirect: 'manual', signal, dispatcher })
    const location = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null
    if (!location) return { res, finalUrl: url }
    void res.body?.cancel().catch(() => {})
    if (redirect === 'error') throw new Error(`Redirected from ${new URL(url).hostname}`)
    url = (await assertPublicUrl(new URL(location, url).toString())).toString()
  }
  throw new Error('Too many redirects')
}

/** Reads a body up to a limit, stopping the download there rather than after buffering it all. */
export async function readLimited(res: UndiciResponse, maxBytes: number): Promise<Uint8Array> {
  if (Number(res.headers.get('content-length') ?? 0) > maxBytes) {
    void res.body?.cancel().catch(() => {})
    throw new Error('Response too large')
  }
  if (!res.body) return new Uint8Array()
  const chunks: Uint8Array[] = []
  let size = 0
  for await (const chunk of res.body) {
    size += chunk.byteLength
    if (size > maxBytes) throw new Error('Response too large')
    chunks.push(chunk)
  }
  const out = new Uint8Array(size)
  let at = 0
  for (const c of chunks) {
    out.set(c, at)
    at += c.byteLength
  }
  return out
}

export async function fetchText(url: string, init: SafeFetchInit & { maxBytes?: number } = {}): Promise<{ text: string; finalUrl: string; contentType: string }> {
  const { maxBytes = 5_000_000, ...rest } = init
  const { res, finalUrl } = await safeFetch(url, rest)
  if (!res.ok) {
    void res.body?.cancel().catch(() => {})
    throw new Error(`Upstream ${res.status} for ${new URL(url).hostname}`)
  }
  const text = new TextDecoder().decode(await readLimited(res, maxBytes))
  return { text, finalUrl, contentType: res.headers.get('content-type') ?? '' }
}

export async function fetchJson<T>(url: string, init: SafeFetchInit = {}): Promise<T> {
  const { text } = await fetchText(url, { ...init, headers: { accept: 'application/json', ...init.headers } })
  return JSON.parse(text) as T
}

export function linkKey(url: string): string {
  return 'ln-' + Buffer.from(url).toString('base64url')
}

const NAMED: Record<string, string> = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', mdash: '—', ndash: '–', hellip: '…' }

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const cp = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))
      return cp > 0 && cp < 0x110000 ? String.fromCodePoint(cp) : m
    }
    return NAMED[e.toLowerCase()] ?? m
  })
}

/** Plain text from feed HTML. Decodes twice because many WordPress feeds double-encode (&amp;#8217;). */
export function stripHtml(html: string): string {
  // [^<>] rather than [^>]: a run of '<' with no '>' would otherwise rescan to the end from each one.
  return decodeEntities(decodeEntities(html.replace(/<[^<>]*>/g, ' ')))
    .replace(/<[^<>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
