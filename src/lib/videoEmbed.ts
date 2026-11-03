// Videos a story links to, played in PaperWing on a tap. YouTube and Vimeo play in their own
// players, loaded only when you press play: YouTube's privacy-enhanced one (youtube-nocookie.com)
// and Vimeo's with do-not-track. These are the only third-party frames PaperWing allows
// (vercel.json, frame-src). A PeerTube video plays as a plain file, from wherever its server keeps it,
// the way a Mastodon video does, so no player from anywhere else runs.

export type VideoEmbed = { kind: 'youtube'; id: string; start?: number } | { kind: 'vimeo'; id: string; hash?: string } | { kind: 'peertube'; host: string; id: string }

const YOUTUBE = /^(?:www\.|m\.)?(?:youtube\.com|youtube-nocookie\.com)$/
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/
const VIMEO = /^(?:www\.|player\.)?vimeo\.com$/
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
/** PeerTube's own watch paths: /w/<uuid or short uuid> and the older /videos/watch/<uuid>. */
const PEERTUBE_PATH = new RegExp(`^/(?:w/(${UUID}|[1-9A-HJ-NP-Za-km-z]{22})|videos/watch/(${UUID}))/?$`)

/** Seconds from YouTube's t= or start= (95, 95s, 1h2m3s). */
function seconds(t: string | null): number | undefined {
  if (!t) return undefined
  if (/^\d+s?$/.test(t)) return parseInt(t, 10) || undefined
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(t)
  if (!m || !m[0]) return undefined
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0) || undefined
}

/** The video a link is, when PaperWing can play it: YouTube, Vimeo, or a PeerTube server by its paths. */
export function videoEmbedOf(link: string | null | undefined): VideoEmbed | undefined {
  if (!link) return undefined
  let u: URL
  try {
    u = new URL(link)
  } catch {
    return undefined
  }
  if (u.protocol !== 'https:' || u.username || u.password) return undefined
  const host = u.hostname.toLowerCase()
  const parts = u.pathname.split('/').filter(Boolean)

  if (YOUTUBE.test(host) || host === 'youtu.be') {
    const id = host === 'youtu.be' ? parts[0] : parts[0] === 'watch' ? u.searchParams.get('v') : ['shorts', 'live', 'embed'].includes(parts[0]) ? parts[1] : undefined
    // 'videoseries' is a playlist, not a video, though it has a video id's shape.
    if (!id || !YOUTUBE_ID.test(id) || id === 'videoseries') return undefined
    const start = seconds(u.searchParams.get('t') ?? u.searchParams.get('start'))
    return { kind: 'youtube', id, ...(start ? { start } : {}) }
  }

  if (VIMEO.test(host)) {
    // The video's number, by where it sits: after video(s)/ (in a showcase or group), after a
    // channel's name, or first. A showcase, album or event on its own is a collection, not a video.
    const numeric = (i: number) => i >= 0 && /^\d{6,12}$/.test(parts[i] ?? '')
    const after = parts.findIndex((p, i) => (p === 'video' || p === 'videos') && numeric(i + 1))
    const at = after >= 0 ? after + 1 : parts[0] === 'channels' && numeric(2) ? 2 : numeric(0) ? 0 : -1
    if (at < 0) return undefined
    const hash = parts[at + 1] && /^[0-9a-f]{6,20}$/.test(parts[at + 1]) ? parts[at + 1] : (u.searchParams.get('h') ?? undefined)
    return { kind: 'vimeo', id: parts[at], ...(hash && /^[0-9a-f]{6,20}$/.test(hash) ? { hash } : {}) }
  }

  const m = PEERTUBE_PATH.exec(u.pathname)
  if (m) return { kind: 'peertube', host: u.host.toLowerCase(), id: m[1] ?? m[2] }
  return undefined
}

/** The player a tap loads: YouTube's privacy-enhanced one, or Vimeo's with do-not-track. */
export function playerUrl(v: Extract<VideoEmbed, { kind: 'youtube' | 'vimeo' }>): string {
  if (v.kind === 'youtube') return `https://www.youtube-nocookie.com/embed/${v.id}?autoplay=1&rel=0${v.start ? `&start=${v.start}` : ''}`
  return `https://player.vimeo.com/video/${v.id}?autoplay=1&dnt=1${v.hash ? `&h=${v.hash}` : ''}`
}

/** Where the video is shown from, for the poster's words. */
export const videoHost = (v: VideoEmbed) => (v.kind === 'youtube' ? 'YouTube' : v.kind === 'vimeo' ? 'Vimeo' : v.host)

export interface PlayableVideo {
  /** A video file, from wherever the PeerTube server keeps it. */
  src: string
  poster?: string
  aspect?: number
  /** Its uploader marked it sensitive. */
  sensitive: boolean
}

/** An object from the server's answer, or nothing: every field of it is checked before use. */
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])

/** A playable file: an https address, a height, and both picture and sound (newer servers can keep them apart). */
function fileOf(raw: unknown): { url: string; height: number } | undefined {
  const f = obj(raw)
  const height = obj(f.resolution).id
  if (typeof f.fileUrl !== 'string' || !f.fileUrl.startsWith('https://') || typeof height !== 'number' || height <= 0 || f.hasAudio === false || f.hasVideo === false) return undefined
  return { url: f.fileUrl, height }
}

/** The PeerTube video's own file, read from its server's public API on the tap: the largest no bigger than 720p. */
export async function peertubeVideo(v: Extract<VideoEmbed, { kind: 'peertube' }>, can: { hls?: boolean } = {}): Promise<PlayableVideo> {
  const cant = () => new Error('This video can’t be played here: watch it on its own site')
  const res = await fetch(`https://${v.host}/api/v1/videos/${encodeURIComponent(v.id)}`, {
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
    signal: AbortSignal.timeout(10_000),
  }).catch(() => undefined)
  if (!res?.ok) throw cant()
  const data = obj(await res.json().catch(() => undefined))
  const playlists = list(data.streamingPlaylists).map(obj)
  const files = [...list(data.files), ...playlists.flatMap((p) => list(p.files))].flatMap((f) => fileOf(f) ?? [])
  const fits = files.filter((f) => f.height <= 720).sort((a, b) => b.height - a.height)
  // No one file with both picture and sound (a server keeping them apart): the stream itself, where the browser plays it.
  const stream = can.hls ? playlists.map((p) => p.playlistUrl).find((u): u is string => typeof u === 'string' && u.startsWith('https://')) : undefined
  const pick = fits[0] ?? [...files].sort((a, b) => a.height - b.height)[0] ?? (stream ? { url: stream } : undefined)
  if (!pick) throw cant()
  const aspect = typeof data.aspectRatio === 'number' && data.aspectRatio > 0.2 && data.aspectRatio < 5 ? data.aspectRatio : undefined
  const poster = typeof data.previewPath === 'string' && /^\/[^/]/.test(data.previewPath) ? `https://${v.host}${data.previewPath}` : undefined
  return { src: pick.url, ...(poster ? { poster } : {}), ...(aspect ? { aspect } : {}), sensitive: !!data.nsfw }
}

/**
 * The frame a YouTube or Vimeo player plays in, after the tap: sandboxed to what a player needs
 * (its scripts, its own origin for its cookies-free storage, fullscreen, and opening the video on its
 * site), sending only PaperWing's origin as the referrer, which YouTube's player now requires.
 */
export function frameProps(v: Extract<VideoEmbed, { kind: 'youtube' | 'vimeo' }>, title: string) {
  return {
    src: playerUrl(v),
    title: `${title}, playing from ${videoHost(v)}`,
    allow: 'autoplay; encrypted-media; picture-in-picture; fullscreen',
    allowFullScreen: true,
    referrerPolicy: 'strict-origin-when-cross-origin' as const,
    sandbox: 'allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox',
  }
}
