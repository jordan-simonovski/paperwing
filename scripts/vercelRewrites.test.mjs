import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { rewrite } from './vercelRewrites'

const { rewrites } = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'))
const browser = () => 'Mozilla/5.0 (Macintosh) Safari/605.1.15'
const bluesky = () => 'Mozilla/5.0 (compatible; Bluesky Cardyb/1.1; +mailto:support@bsky.app)'
const at = (url, ua = browser) => rewrite(url, (name) => (name === 'user-agent' ? ua() : undefined), rewrites)

describe('the dev server applies vercel.json’s rewrites', () => {
  it('sends fixed paths to their function', () => {
    expect(at('/oauth-client-metadata.json')).toBe('/api/atproto?route=client-metadata')
    expect(at('/.well-known/atproto-did')).toBe('/api/atproto?route=atproto-did')
    expect(at('/rss')).toBe('/api/rss?path=')
  })

  it('fills in named segments and the rest of a path, keeping the query', () => {
    expect(at('/xrpc/app.bsky.feed.getFeedSkeleton?feed=at%3A%2F%2Fx&limit=30')).toBe('/api/atproto?route=app.bsky.feed.getFeedSkeleton&feed=at%3A%2F%2Fx&limit=30')
    expect(at('/rss/t/space')).toBe('/api/rss?path=t/space')
  })

  it('gives link previewers the preview and people the app', () => {
    expect(at('/t/space/hn-123', bluesky)).toBe('/api/preview?path=/t/space/hn-123')
    expect(at('/t/space/hn-123')).toBeUndefined()
  })

  it('leaves the app’s own fallback to the dev server', () => {
    expect(at('/settings')).toBeUndefined()
    expect(at('/api/feed?src=hn')).toBeUndefined()
  })
})
