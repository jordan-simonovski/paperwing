import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { lemmyKey } from './lemmyKey'
import type { LemmyCommunity } from './store'

// Your Lemmy account, on whichever Lemmy server it lives. Lemmy's API is open to browsers, so
// signing in goes straight from this browser to your server: PaperWing's server never sees the
// password. The token your server returns stays on this device (never synced).
//
// PaperWing reads Lemmy through programming.dev and lemmy.world, and every Lemmy server numbers
// posts and comments its own way, so acting on one (a vote, a reply) first looks it up on your
// server by its address (resolve_object), then acts there.

interface LemmyAccountState {
  instance?: string
  user?: string
  jwt?: string
  /** Votes made from here, by item address (ap_id): 1 for up. */
  votes: Record<string, 1>
  set: (s: Partial<Pick<LemmyAccountState, 'instance' | 'user' | 'jwt' | 'votes'>>) => void
}

export const useLemmyAccount = create<LemmyAccountState>()(
  persist((set) => ({ votes: {}, set: (s) => set(s) }), { name: 'readout:lemmy-account', version: 1, partialize: ({ instance, user, jwt, votes }) => ({ instance, user, jwt, votes }) }),
)

export const normalizeLemmyInstance = (input: string) =>
  input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')

const HOST = /^(?=.{3,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/

export class TotpRequired extends Error {}

async function call<T>(path: string, init: { method?: string; body?: unknown; auth?: boolean } = {}): Promise<T> {
  const { instance, jwt } = useLemmyAccount.getState()
  if (!instance) throw new Error('Sign in to Lemmy first (Settings, Sources)')
  const headers: Record<string, string> = {}
  if (init.body !== undefined) headers['content-type'] = 'application/json'
  if (init.auth !== false && jwt) headers.authorization = `Bearer ${jwt}`
  const res = await fetch(`https://${instance}/api/v3/${path}`, { method: init.method ?? 'GET', headers, body: init.body === undefined ? undefined : JSON.stringify(init.body) })
  const data = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (res.status === 401 || data.error === 'not_logged_in' || data.error === 'incorrect_login') {
    if (init.auth !== false) useLemmyAccount.getState().set({ jwt: undefined, user: undefined })
    throw new Error('Your Lemmy sign-in has expired. Sign in again under Settings, Sources.')
  }
  if (!res.ok || data.error) throw new Error(lemmyError(data.error) ?? `Lemmy said no (${res.status})`)
  return data
}

const lemmyError = (code?: string) =>
  code &&
  ({
    incorrect_login: 'Lemmy didn’t accept that username and password.',
    password_incorrect: 'Lemmy didn’t accept that username and password.',
    email_not_verified: 'Verify your email with your Lemmy server first.',
    registration_application_is_pending: 'Your Lemmy account is still waiting for approval.',
    missing_totp_token: 'Enter the code from your authenticator app.',
    incorrect_totp_token: 'That authenticator code didn’t work.',
    rate_limit_error: 'Your Lemmy server says slow down. Try again in a minute.',
    couldnt_find_object: 'Your Lemmy server can’t find that yet. Try again in a moment.',
    banned_from_community: 'You’re banned from that community.',
    locked: 'That thread is locked.',
  }[code] ??
    code.replace(/_/g, ' '))

/** Signs in on your own server. Throws TotpRequired when the account uses two-factor codes. */
export async function lemmySignIn(instanceInput: string, username: string, password: string, totp?: string) {
  const instance = normalizeLemmyInstance(instanceInput)
  if (!HOST.test(instance)) throw new Error('That doesn’t look like a Lemmy server')
  useLemmyAccount.getState().set({ instance })
  const res = await fetch(`https://${instance}/api/v3/user/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username_or_email: username.trim(), password, ...(totp ? { totp_2fa_token: totp.trim() } : {}) }),
  }).catch(() => {
    throw new Error(`Couldn’t reach ${instance}. Is it a Lemmy server?`)
  })
  const data = (await res.json().catch(() => ({}))) as { jwt?: string; error?: string }
  if (data.error === 'missing_totp_token') throw new TotpRequired(lemmyError(data.error))
  if (!res.ok || !data.jwt) throw new Error(lemmyError(data.error) ?? `${instance} didn’t sign you in (${res.status})`)
  const site = await fetch(`https://${instance}/api/v3/site`, { headers: { authorization: `Bearer ${data.jwt}` } }).then(
    (r) => r.json() as Promise<{ my_user?: { local_user_view: { person: { name: string } } } }>,
  )
  const user = site.my_user?.local_user_view.person.name ?? username.trim()
  useLemmyAccount.getState().set({ instance, user, jwt: data.jwt, votes: {} })
  return user
}

export function lemmySignOut() {
  const { instance, jwt } = useLemmyAccount.getState()
  if (instance && jwt) void fetch(`https://${instance}/api/v3/user/logout`, { method: 'POST', headers: { authorization: `Bearer ${jwt}` } }).catch(() => {})
  useLemmyAccount.getState().set({ user: undefined, jwt: undefined, votes: {} })
}

/* --------------------------------------------------------- finding things */

interface Resolved {
  post?: { post: { id: number; ap_id: string } }
  comment?: { comment: { id: number; ap_id: string; post_id: number } }
}
const resolved = new Map<string, Resolved>()

/** A post or comment on your server, by its address anywhere. */
async function resolve(apId: string): Promise<Resolved> {
  const hit = resolved.get(apId)
  if (hit) return hit
  const r = await call<Resolved>(`resolve_object?q=${encodeURIComponent(apId)}`)
  resolved.set(apId, r)
  return r
}

/* ---------------------------------------------------------------- acting */

/** Upvotes a post or comment (by its address), or takes the vote back. Shown straight away; undone if your server says no. */
export async function lemmyVote(apId: string, kind: 'post' | 'comment'): Promise<boolean> {
  const { votes, set } = useLemmyAccount.getState()
  const up = !votes[apId]
  const next = { ...votes }
  if (up) next[apId] = 1
  else delete next[apId]
  set({ votes: next })
  try {
    const r = await resolve(apId)
    if (kind === 'post') {
      if (!r.post) throw new Error('Your Lemmy server can’t find that post')
      await call('post/like', { method: 'POST', body: { post_id: r.post.post.id, score: up ? 1 : 0 } })
    } else {
      if (!r.comment) throw new Error('Your Lemmy server can’t find that comment')
      await call('comment/like', { method: 'POST', body: { comment_id: r.comment.comment.id, score: up ? 1 : 0 } })
    }
    return up
  } catch (err) {
    set({ votes })
    throw err
  }
}

/** Comments on a post, or replies to a comment (by addresses). Returns the new comment's address. */
export async function lemmyComment(postApId: string, text: string, parentApId?: string): Promise<string> {
  const post = (await resolve(postApId)).post
  if (!post) throw new Error('Your Lemmy server can’t find that post')
  const parent = parentApId ? (await resolve(parentApId)).comment : undefined
  if (parentApId && !parent) throw new Error('Your Lemmy server can’t find that comment')
  const r = await call<{ comment_view: { comment: { ap_id: string } } }>('comment', {
    method: 'POST',
    body: { content: text, post_id: post.post.id, ...(parent ? { parent_id: parent.comment.id } : {}) },
  })
  return r.comment_view.comment.ap_id
}

/** A community on your server, by its full name ("world@lemmy.world"). */
async function communityId(name: string): Promise<number> {
  const r = await call<{ community_view: { community: { id: number } } }>(`community?name=${encodeURIComponent(name)}`)
  return r.community_view.community.id
}

/** Joins or leaves a community on your account. */
export async function lemmyFollow(name: string, follow: boolean) {
  await call('community/follow', { method: 'POST', body: { community_id: await communityId(name), follow } })
}

/** Posts a link to a community. Returns where it can be seen. */
export async function lemmyPost(community: string, title: string, url: string, body?: string): Promise<string> {
  const r = await call<{ post_view: { post: { ap_id: string } } }>('post', { method: 'POST', body: { name: title, url, community_id: await communityId(community), ...(body ? { body } : {}) } })
  return r.post_view.post.ap_id
}

/** The communities your account follows, as PaperWing's joined communities. */
export async function lemmySubscriptions(): Promise<LemmyCommunity[]> {
  const site = await call<{ my_user?: { follows: { community: { name: string; title: string; actor_id: string; icon?: string } }[] } }>('site')
  return (site.my_user?.follows ?? []).map(({ community: c }) => ({ name: `${c.name}@${new URL(c.actor_id).hostname}`, title: c.title, icon: c.icon }))
}

/* -------------------------------------------------------------- activity */

export interface LemmyInboxItem {
  id: string
  kind: 'reply' | 'mention'
  author: string
  text: string
  at: number
  postTitle: string
  postApId: string
  /** The thread's key here, read through your server. */
  postKey: string
  apId: string
  /** Whether the reply is straight to your post (a comment on it), not to a comment. */
  onPost: boolean
}
export interface LemmyMine {
  apId: string
  kind: 'post' | 'comment'
  text: string
  on?: string
  postApId: string
  postKey: string
  at: number
  score: number
  replies?: number
}

interface CommentReplyView {
  comment: { id: number; content: string; published: string; ap_id: string; path: string }
  creator: { name: string; actor_id: string }
  post: { id: number; name: string; ap_id: string }
}

const who = (u: { name: string; actor_id: string }) => `${u.name}@${new URL(u.actor_id).hostname}`

export async function lemmyInbox(): Promise<{ notices: LemmyInboxItem[]; mine: LemmyMine[] }> {
  const { user, instance } = useLemmyAccount.getState()
  const key = (id: number) => lemmyKey(id, instance)
  const [replies, mentions, me] = await Promise.all([
    call<{ replies: CommentReplyView[] }>('user/replies?sort=New&limit=40&unread_only=false'),
    call<{ mentions: CommentReplyView[] }>('user/mention?sort=New&limit=20&unread_only=false'),
    call<{
      posts: { post: { id: number; name: string; ap_id: string; published: string }; counts: { score: number; comments: number } }[]
      comments: { comment: { content: string; ap_id: string; published: string }; post: { id: number; name: string; ap_id: string }; counts: { score: number; child_count: number } }[]
    }>(`user?username=${encodeURIComponent(user ?? '')}&sort=New&limit=40`),
  ])
  const item =
    (kind: 'reply' | 'mention') =>
    (v: CommentReplyView): LemmyInboxItem => ({
      id: `lm:${v.comment.ap_id}`,
      kind,
      author: who(v.creator),
      text: v.comment.content,
      at: Date.parse(v.comment.published.endsWith('Z') ? v.comment.published : `${v.comment.published}Z`),
      postTitle: v.post.name,
      postApId: v.post.ap_id,
      postKey: key(v.post.id),
      apId: v.comment.ap_id,
      // Lemmy paths are "0.<ancestors>.<id>": two parts means it answers the post itself.
      onPost: v.comment.path.split('.').length === 2,
    })
  const time = (t: string) => Date.parse(t.endsWith('Z') ? t : `${t}Z`)
  return {
    notices: [...replies.replies.map(item('reply')), ...mentions.mentions.map(item('mention'))],
    mine: [
      ...me.posts.map((p) => ({
        apId: p.post.ap_id,
        kind: 'post' as const,
        text: p.post.name,
        postApId: p.post.ap_id,
        postKey: key(p.post.id),
        at: time(p.post.published),
        score: p.counts.score,
        replies: p.counts.comments,
      })),
      ...me.comments.map((c) => ({
        apId: c.comment.ap_id,
        kind: 'comment' as const,
        text: c.comment.content,
        on: c.post.name,
        postApId: c.post.ap_id,
        postKey: key(c.post.id),
        at: time(c.comment.published),
        score: c.counts.score,
        replies: c.counts.child_count,
      })),
    ],
  }
}
