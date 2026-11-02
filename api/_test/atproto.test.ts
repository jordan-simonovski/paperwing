import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { call, fakeUpstreams } from './harness.js'
import { GET } from '../atproto.js'

// The feed generator's answers about itself, which Bluesky and the publish step read.

const net = fakeUpstreams()
const PUBLISHER = 'did:plc:pppppppppppppppppppppppp'
const resolve = () => net.get('https://public.api.bsky.app').intercept({ path: '/xrpc/com.atproto.identity.resolveHandle?handle=feeds.example' })

describe('the feed generator', () => {
  beforeEach(() => {
    delete process.env.BSKY_DID
    process.env.BSKY_HANDLE = 'feeds.example'
  })
  afterEach(() => {
    delete process.env.BSKY_HANDLE
  })

  // A blip looking up the publisher must not tell Bluesky, for hours, that PaperWing has no feeds.
  it("doesn't answer, or let anyone cache, an empty feed list when the publisher can't be looked up", async () => {
    resolve().reply(500, 'busy')
    const listed = await call<{ feeds: unknown[] }>(GET, '/xrpc/app.bsky.feed.describeFeedGenerator?route=app.bsky.feed.describeFeedGenerator')
    expect(listed.status).toBe(502)
    expect(listed.headers.get('cache-control')).toBe('no-store')

    resolve().reply(500, 'busy')
    const status = await call(GET, '/api/atproto?route=status')
    expect(status.status).toBe(502)
    expect(status.headers.get('cache-control')).toBe('no-store')

    resolve().reply(200, { did: PUBLISHER })
    const again = await call<{ feeds: { uri: string }[] }>(GET, '/xrpc/app.bsky.feed.describeFeedGenerator?route=app.bsky.feed.describeFeedGenerator')
    expect(again.status).toBe(200)
    expect(again.body.feeds.length).toBeGreaterThan(0)
    expect(again.body.feeds.every((f) => f.uri.startsWith(`at://${PUBLISHER}/app.bsky.feed.generator/`))).toBe(true)
  })
})
