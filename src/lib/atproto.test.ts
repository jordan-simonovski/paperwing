import { FetchRequestError, TokenRefreshError } from '@atproto/oauth-client-browser'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { canUpdate, CLIENT_METADATA, SCOPE, session, useAtproto } from './atproto'
import { clientMetadata, HOME } from './oauthClient'

// The OAuth client is faked so a test chooses what restoring a sign-in does; its error classes stay real.
const { restore } = vi.hoisted(() => ({ restore: vi.fn<(did: string) => Promise<unknown>>() }))
vi.mock('@atproto/oauth-client-browser', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@atproto/oauth-client-browser')>()),
  BrowserOAuthClient: class {
    restore = restore
  },
}))

describe('atproto sign-in', () => {
  it('signs in with the metadata its own address serves', () => {
    // Tests run off-site, so the app takes its home address.
    expect(CLIENT_METADATA).toEqual(clientMetadata(`https://${HOME}`))
    expect(CLIENT_METADATA.client_id).toBe('https://paperwing.io/oauth-client-metadata.json')
    expect(CLIENT_METADATA.redirect_uris).toEqual(['https://paperwing.io/atproto-callback'])
  })
  it('asks for mix records under PaperWing’s own domain', () => {
    expect(SCOPE).toContain('repo:io.paperwing.mix?action=create&action=update&action=delete')
    expect(clientMetadata('https://tech-reader-nine.vercel.app').client_id).toBe('https://tech-reader-nine.vercel.app/oauth-client-metadata.json')
  })
})

describe('what a sign-in may change', () => {
  it('may edit self posts only once it was asked to', () => {
    expect(canUpdate(SCOPE, 'io.paperwing.submission')).toBe(true)
    expect(canUpdate('atproto repo:io.paperwing.submission?action=create', 'io.paperwing.submission')).toBe(false)
    expect(canUpdate('atproto repo:io.paperwing.submission', 'io.paperwing.submission')).toBe(true)
    expect(canUpdate('atproto repo:io.paperwing.submissionx?action=update', 'io.paperwing.submission')).toBe(false)
    expect(canUpdate(undefined, 'io.paperwing.submission')).toBeUndefined()
  })
})

describe('restoring a sign-in', () => {
  const did = 'did:plc:reader'
  beforeEach(() => {
    vi.stubGlobal('location', { hostname: HOME, origin: `https://${HOME}`, port: '' })
    useAtproto.setState({ did, handle: 'reader.example', scope: 'atproto' })
    restore.mockReset()
  })
  afterEach(() => vi.unstubAllGlobals())

  it('keeps the sign-in when Bluesky can’t be reached, so it works again once back online', async () => {
    // What the client throws when the browser's fetch fails (offline, DNS, a dropped connection) while refreshing.
    const offline = FetchRequestError.from(new Request('https://bsky.social/oauth/token'), new TypeError('Failed to fetch'))
    restore.mockRejectedValue(new Error('Refreshing failed', { cause: offline }))
    await expect(session()).rejects.toThrow(/Couldn’t reach Bluesky/)
    expect(useAtproto.getState()).toMatchObject({ did, handle: 'reader.example', scope: 'atproto' })
  })

  it('signs out when the sign-in has been revoked', async () => {
    restore.mockRejectedValue(new TokenRefreshError(did, 'The session was revoked'))
    await expect(session()).rejects.toThrow(/sign-in has expired/)
    expect(useAtproto.getState()).toMatchObject({ did: undefined, handle: undefined, scope: undefined })
  })
})
