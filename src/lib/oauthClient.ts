import { MIX_NSID } from './mixSources.js'
import { SUBMISSION_NSID } from './paperwing.js'

// PaperWing's atproto OAuth client: the permissions it asks for, and the metadata sign-in servers
// read from /oauth-client-metadata.json. That file is built per address (api/atproto.ts), so the app
// signs in correctly on paperwing.io and on its old vercel.app address alike.

export const SCOPE = [
  'atproto',
  'repo:app.bsky.feed.post?action=create',
  'repo:app.bsky.feed.like?action=create&action=delete',
  'repo:fyi.frontpage.feed.comment?action=create',
  'repo:fyi.frontpage.feed.vote?action=create&action=delete',
  // Reading your timeline, for links from people you follow (Bluesky's AppView serves it; your server forwards the call).
  'rpc:app.bsky.feed.getTimeline?aud=did:web:api.bsky.app%23bsky_appview',
  // Reading your notifications, for Activity (replies, mentions, likes): nothing is marked read on Bluesky.
  'rpc:app.bsky.notification.listNotifications?aud=did:web:api.bsky.app%23bsky_appview',
  // Publishing your mixes (mixSources.ts), and a mix as a Bluesky feed served by PaperWing.
  `repo:${MIX_NSID}?action=create&action=update&action=delete`,
  'repo:app.bsky.feed.generator?action=create&action=update&action=delete',
  // Submitting to PaperWing: a record beside your Bluesky post (paperwing.ts), and the link card's picture.
  `repo:${SUBMISSION_NSID}?action=create`,
  'blob:image/*',
].join(' ')

/** The addresses PaperWing is served from; the first is home. */
export const HOSTS = ['paperwing.io', 'tech-reader-nine.vercel.app']
export const HOME = HOSTS[0]

export function clientMetadata(origin: string) {
  return {
    client_id: `${origin}/oauth-client-metadata.json`,
    client_name: 'PaperWing',
    client_uri: origin,
    logo_uri: `${origin}/icon-192.png`,
    // Shown on Bluesky's consent screen.
    policy_uri: `${origin}/privacy`,
    tos_uri: `${origin}/terms`,
    redirect_uris: [`${origin}/atproto-callback`] as [string],
    scope: SCOPE,
    grant_types: ['authorization_code', 'refresh_token'] as ['authorization_code', 'refresh_token'],
    response_types: ['code'] as ['code'],
    token_endpoint_auth_method: 'none' as const,
    application_type: 'web' as const,
    dpop_bound_access_tokens: true,
  }
}
