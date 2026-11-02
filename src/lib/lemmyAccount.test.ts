import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { lemmyComment, lemmyFollow, lemmyInbox, lemmyPost, lemmySignIn, lemmyVote, TotpRequired, useLemmyAccount } from './lemmyAccount'

type Call = { url: string; method: string; body?: Record<string, unknown>; auth?: string | null }
let calls: Call[] = []
const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })

function server(routes: Record<string, (c: Call) => Response>) {
  vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
    const c: Call = { url, method: init.method ?? 'GET', body: init.body ? JSON.parse(String(init.body)) : undefined, auth: new Headers(init.headers).get('authorization') }
    calls.push(c)
    const path = new URL(url).pathname.replace('/api/v3/', '')
    return (routes[path] ?? (() => reply({ error: 'not_found' }, 404)))(c)
  })
}

describe('Lemmy account', () => {
  beforeEach(() => {
    calls = []
    useLemmyAccount.setState({ instance: undefined, user: undefined, jwt: undefined, votes: {} })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('signs in on your own server, asking for a two-factor code when it wants one', async () => {
    server({
      'user/login': (c) => (c.body?.totp_2fa_token ? reply({ jwt: 'tok' }) : reply({ error: 'missing_totp_token' }, 400)),
      site: () => reply({ my_user: { local_user_view: { person: { name: 'jordan' } } } }),
    })
    await expect(lemmySignIn('https://Lemmy.World/', 'jordan', 'pw')).rejects.toBeInstanceOf(TotpRequired)
    expect(await lemmySignIn('lemmy.world', 'jordan', 'pw', '123456')).toBe('jordan')
    expect(useLemmyAccount.getState()).toMatchObject({ instance: 'lemmy.world', user: 'jordan', jwt: 'tok' })
    expect(calls.every((c) => c.url.startsWith('https://lemmy.world/'))).toBe(true)
  })

  it('votes and comments on a post read elsewhere, through its id on your server', async () => {
    useLemmyAccount.setState({ instance: 'lemmy.world', user: 'jordan', jwt: 'tok' })
    server({
      resolve_object: (c) =>
        c.url.includes('comment')
          ? reply({ comment: { comment: { id: 77, ap_id: 'https://programming.dev/comment/9', post_id: 5 } } })
          : reply({ post: { post: { id: 5, ap_id: 'https://programming.dev/post/1' } } }),
      'post/like': () => reply({}),
      comment: () => reply({ comment_view: { comment: { ap_id: 'https://lemmy.world/comment/100' } } }),
    })
    expect(await lemmyVote('https://programming.dev/post/1', 'post')).toBe(true)
    expect(calls.find((c) => c.url.endsWith('post/like'))).toMatchObject({ method: 'POST', body: { post_id: 5, score: 1 }, auth: 'Bearer tok' })
    expect(useLemmyAccount.getState().votes['https://programming.dev/post/1']).toBe(1)
    expect(await lemmyComment('https://programming.dev/post/1', 'Good point', 'https://programming.dev/comment/9')).toBe('https://lemmy.world/comment/100')
    expect(calls.find((c) => c.url.endsWith('/comment') && c.method === 'POST')?.body).toEqual({ content: 'Good point', post_id: 5, parent_id: 77 })
  })

  it('takes a vote back when the server refuses it', async () => {
    useLemmyAccount.setState({ instance: 'lemmy.world', user: 'jordan', jwt: 'tok' })
    server({ resolve_object: () => reply({ post: { post: { id: 5, ap_id: 'x' } } }), 'post/like': () => reply({ error: 'banned_from_community' }, 400) })
    await expect(lemmyVote('https://a.example/post/2', 'post')).rejects.toThrow(/banned/)
    expect(useLemmyAccount.getState().votes['https://a.example/post/2']).toBeUndefined()
  })

  it('joins communities and posts links to them on your account', async () => {
    useLemmyAccount.setState({ instance: 'lemmy.world', user: 'jordan', jwt: 'tok' })
    server({
      community: () => reply({ community_view: { community: { id: 12 } } }),
      'community/follow': () => reply({}),
      post: () => reply({ post_view: { post: { ap_id: 'https://lemmy.world/post/55' } } }),
    })
    await lemmyFollow('science@mander.xyz', true)
    expect(calls.find((c) => c.url.includes('community?name='))?.url).toContain('science%40mander.xyz')
    expect(calls.find((c) => c.url.endsWith('community/follow'))?.body).toEqual({ community_id: 12, follow: true })
    expect(await lemmyPost('science@mander.xyz', 'Primes', 'https://q.example/p', 'Lovely')).toBe('https://lemmy.world/post/55')
  })

  it('reads replies, mentions and your history, opening threads through your server', async () => {
    useLemmyAccount.setState({ instance: 'lemmy.world', user: 'jordan', jwt: 'tok' })
    const view = (id: number, path: string) => ({
      comment: { id, content: 'Hi', published: '2026-11-01T10:00:00.000Z', ap_id: `https://x/comment/${id}`, path },
      creator: { name: 'pg', actor_id: 'https://lemmy.ml/u/pg' },
      post: { id: 5, name: 'Post', ap_id: 'https://x/post/5' },
    })
    server({
      'user/replies': () => reply({ replies: [view(1, '0.1'), view(2, '0.9.2')] }),
      'user/mention': () => reply({ mentions: [] }),
      user: () => reply({ posts: [], comments: [] }),
    })
    const { notices } = await lemmyInbox()
    expect(notices.map((n) => [n.author, n.onPost, n.postKey])).toEqual([
      ['pg@lemmy.ml', true, 'lm-5@lemmy.world'],
      ['pg@lemmy.ml', false, 'lm-5@lemmy.world'],
    ])
  })
})
