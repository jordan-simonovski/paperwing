import { afterEach, describe, expect, it, vi } from 'vitest'
import { frameProps, peertubeVideo, playerUrl, videoEmbedOf } from './videoEmbed'

describe('recognising a video link', () => {
  it('reads every shape of YouTube link, keeping where it starts', () => {
    const id = 'dQw4w9WgXcQ'
    for (const url of [
      `https://www.youtube.com/watch?v=${id}`,
      `https://youtube.com/watch?feature=share&v=${id}`,
      `https://m.youtube.com/watch?v=${id}`,
      `https://youtu.be/${id}`,
      `https://www.youtube.com/shorts/${id}`,
      `https://www.youtube.com/live/${id}`,
      `https://www.youtube.com/embed/${id}`,
      `https://www.youtube-nocookie.com/embed/${id}`,
    ])
      expect(videoEmbedOf(url)).toEqual({ kind: 'youtube', id })
    expect(videoEmbedOf(`https://youtu.be/${id}?t=95`)).toEqual({ kind: 'youtube', id, start: 95 })
    expect(videoEmbedOf(`https://www.youtube.com/watch?v=${id}&t=1h2m3s`)).toEqual({ kind: 'youtube', id, start: 3723 })
  })

  it('reads Vimeo links, public and unlisted', () => {
    expect(videoEmbedOf('https://vimeo.com/76979871')).toEqual({ kind: 'vimeo', id: '76979871' })
    expect(videoEmbedOf('https://vimeo.com/channels/staffpicks/76979871')).toEqual({ kind: 'vimeo', id: '76979871' })
    expect(videoEmbedOf('https://player.vimeo.com/video/76979871')).toEqual({ kind: 'vimeo', id: '76979871' })
    expect(videoEmbedOf('https://vimeo.com/76979871/a1b2c3d4e5')).toEqual({ kind: 'vimeo', id: '76979871', hash: 'a1b2c3d4e5' })
  })

  it('reads an unlisted Vimeo hash from the query, and ignores one that isn’t a hash', () => {
    expect(videoEmbedOf('https://player.vimeo.com/video/76979871?h=a1b2c3d4e5')).toEqual({ kind: 'vimeo', id: '76979871', hash: 'a1b2c3d4e5' })
    expect(videoEmbedOf('https://player.vimeo.com/video/76979871?h=<script>')).toEqual({ kind: 'vimeo', id: '76979871' })
  })

  it('reads start= and ignores a time it can’t read', () => {
    expect(videoEmbedOf('https://www.youtube.com/embed/dQw4w9WgXcQ?start=42')).toEqual({ kind: 'youtube', id: 'dQw4w9WgXcQ', start: 42 })
    expect(videoEmbedOf('https://youtu.be/dQw4w9WgXcQ?t=soon')).toEqual({ kind: 'youtube', id: 'dQw4w9WgXcQ' })
  })

  it('reads PeerTube links on any server by their shape', () => {
    expect(videoEmbedOf('https://framatube.org/w/9c9de5e8-0a1e-484a-b099-e80766180a6d')).toEqual({ kind: 'peertube', host: 'framatube.org', id: '9c9de5e8-0a1e-484a-b099-e80766180a6d' })
    expect(videoEmbedOf('https://tilvids.com/w/kkGMgK9ZtnKfYAgnEtQxbv')).toEqual({ kind: 'peertube', host: 'tilvids.com', id: 'kkGMgK9ZtnKfYAgnEtQxbv' })
    expect(videoEmbedOf('https://peertube.example/videos/watch/9c9de5e8-0a1e-484a-b099-e80766180a6d')).toEqual({
      kind: 'peertube',
      host: 'peertube.example',
      id: '9c9de5e8-0a1e-484a-b099-e80766180a6d',
    })
  })

  it('leaves everything else alone', () => {
    for (const url of [
      null,
      undefined,
      'not a url',
      'javascript:alert(1)',
      'http://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://www.youtube.com/watch?v=short',
      'https://www.youtube.com/@channel',
      'https://evil.example/watch?v=dQw4w9WgXcQ',
      'https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ',
      'https://vimeo.com/about',
      'https://en.wikipedia.org/w/index.php',
      'https://blog.example/w/short',
      'https://me:pw@tilvids.com/w/kkGMgK9ZtnKfYAgnEtQxbv',
      'https://www.youtube.com/embed/videoseries?list=PL123',
      'https://vimeo.com/showcase/1234567',
      'https://vimeo.com/album/1234567',
      'https://vimeo.com/event/1234567',
    ])
      expect(videoEmbedOf(url)).toBeUndefined()
  })
})

describe('the player', () => {
  it('is YouTube’s privacy-enhanced one, or Vimeo’s with do-not-track, starting on the tap', () => {
    expect(playerUrl({ kind: 'youtube', id: 'dQw4w9WgXcQ', start: 95 })).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&rel=0&start=95')
    expect(playerUrl({ kind: 'vimeo', id: '76979871', hash: 'a1b2c3d4e5' })).toBe('https://player.vimeo.com/video/76979871?autoplay=1&dnt=1&h=a1b2c3d4e5')
  })
})

describe('the frame it plays in', () => {
  it('is sandboxed, says what it is, and sends only our origin', () => {
    const f = frameProps({ kind: 'youtube', id: 'dQw4w9WgXcQ' }, 'A talk')
    expect(f).toMatchObject({ src: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&rel=0', title: 'A talk, playing from YouTube', referrerPolicy: 'strict-origin-when-cross-origin' })
    expect(f.sandbox.split(' ').sort()).toEqual(['allow-popups', 'allow-popups-to-escape-sandbox', 'allow-presentation', 'allow-same-origin', 'allow-scripts'])
    expect(f.allow).not.toMatch(/camera|microphone|geolocation/)
  })
})

describe('a PeerTube video', () => {
  afterEach(() => vi.unstubAllGlobals())
  const answer = (body: unknown, ok = true) =>
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok, json: async () => body }) as Response),
    )
  const video = { kind: 'peertube' as const, host: 'tilvids.com', id: 'kkGMgK9ZtnKfYAgnEtQxbv' }

  it('plays a file from its own server, at most 720p', async () => {
    answer({
      name: 'A talk',
      aspectRatio: 1.7778,
      previewPath: '/lazy-static/previews/p.jpg',
      files: [],
      streamingPlaylists: [
        {
          playlistUrl: 'https://tilvids.com/static/streaming-playlists/hls/x/master.m3u8',
          files: [
            { resolution: { id: 1080 }, fileUrl: 'https://tilvids.com/static/x-1080.mp4' },
            { resolution: { id: 720 }, fileUrl: 'https://tilvids.com/static/x-720.mp4' },
            { resolution: { id: 360 }, fileUrl: 'https://tilvids.com/static/x-360.mp4' },
          ],
        },
      ],
    })
    expect(await peertubeVideo(video)).toEqual({ src: 'https://tilvids.com/static/x-720.mp4', poster: 'https://tilvids.com/lazy-static/previews/p.jpg', aspect: 1.7778, sensitive: false })
    expect(vi.mocked(fetch)).toHaveBeenCalledWith('https://tilvids.com/api/v1/videos/kkGMgK9ZtnKfYAgnEtQxbv', expect.objectContaining({ credentials: 'omit' }))
  })

  it('says when it’s marked sensitive, and takes only https files', async () => {
    answer({
      nsfw: true,
      files: [
        { resolution: { id: 480 }, fileUrl: 'http://tilvids.com/x.mp4' },
        { resolution: { id: 240 }, fileUrl: 'https://tilvids.com/x-240.mp4' },
      ],
    })
    expect(await peertubeVideo(video)).toMatchObject({ src: 'https://tilvids.com/x-240.mp4', sensitive: true })
  })

  it('falls back to the smallest file when every one is over 720p', async () => {
    answer({
      files: [
        { resolution: { id: 2160 }, fileUrl: 'https://tilvids.com/x-2160.mp4' },
        { resolution: { id: 1080 }, fileUrl: 'https://tilvids.com/x-1080.mp4' },
      ],
    })
    expect((await peertubeVideo(video)).src).toBe('https://tilvids.com/x-1080.mp4')
  })

  it('takes nothing from the answer it can’t trust: a poster on another host, an odd shape, a file without a size or address', async () => {
    answer({
      previewPath: '//evil.example/p.jpg',
      aspectRatio: 50,
      files: [
        { resolution: { id: 0 }, fileUrl: 'https://tilvids.com/zero.mp4' },
        { resolution: { id: 480 }, fileUrl: 42 },
        { resolution: { id: 360 }, fileUrl: 'https://tilvids.com/x-360.mp4' },
      ],
    })
    expect(await peertubeVideo(video)).toEqual({ src: 'https://tilvids.com/x-360.mp4', sensitive: false })
    answer({ aspectRatio: 0, files: [{ resolution: { id: 360 }, fileUrl: 'https://tilvids.com/x-360.mp4' }] })
    expect((await peertubeVideo(video)).aspect).toBeUndefined()
  })

  it('never picks a file that’s only sound', async () => {
    answer({ files: [{ resolution: { id: 720 }, fileUrl: 'https://tilvids.com/a-720.mp4', hasVideo: false }, { resolution: { id: 480 }, fileUrl: 'https://tilvids.com/x-480.mp4' }] })
    expect((await peertubeVideo(video)).src).toBe('https://tilvids.com/x-480.mp4')
  })

  it('never picks a file with no sound in it', async () => {
    answer({
      files: [
        { resolution: { id: 720 }, fileUrl: 'https://tilvids.com/v-720.mp4', hasAudio: false },
        { resolution: { id: 480 }, fileUrl: 'https://tilvids.com/x-480.mp4', hasAudio: true },
      ],
    })
    expect((await peertubeVideo(video)).src).toBe('https://tilvids.com/x-480.mp4')
  })

  it('fails plainly when the server can’t be reached or answers nonsense', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))),
    )
    await expect(peertubeVideo(video)).rejects.toThrow(/can’t be played here/)
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => Promise.reject(new SyntaxError('bad json')) }) as unknown as Response),
    )
    await expect(peertubeVideo(video)).rejects.toThrow(/can’t be played here/)
    for (const odd of [null, 'text', { files: {} }, { streamingPlaylists: [null, { files: 'x' }] }, { files: [null, 7] }]) {
      answer(odd)
      await expect(peertubeVideo(video)).rejects.toThrow(/can’t be played here/)
    }
  })

  it('fails plainly when there’s nothing it can play', async () => {
    answer({ isLive: true, files: [], streamingPlaylists: [] })
    await expect(peertubeVideo(video)).rejects.toThrow(/can’t be played here/)
    answer({}, false)
    await expect(peertubeVideo(video)).rejects.toThrow(/can’t be played here/)
  })
})
