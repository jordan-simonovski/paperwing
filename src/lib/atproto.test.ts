import { describe, expect, it } from 'vitest'
import { CLIENT_METADATA, SCOPE } from './atproto'
import { clientMetadata, HOME } from './oauthClient'

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
