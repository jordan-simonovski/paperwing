import { createHash } from 'node:crypto'
import { COOKIE, comment, HnError, ITEM, logout, signIn, submit, vote } from './_lib/hn.js'
import { clientKey, fail, json, readJson } from './_lib/http.js'
import { kv, kvConfigured } from './_lib/kv.js'

// Hacker News sign-in, votes and comments (api/_lib/hn.ts). POST only, JSON in and out, nothing
// cached and nothing stored: the password is used once and never logged, and HN's session cookie
// lives on the reader's device, which sends it with each action.

const LOGINS_PER_WINDOW = 8
const LOGINS_PER_USER = 5

export async function POST(request: Request): Promise<Response> {
  const body = await readJson<Record<string, unknown>>(request)
  if (!body || typeof body !== 'object') return fail('JSON body required')
  const str = (k: string) => (typeof body[k] === 'string' ? (body[k] as string) : '')
  try {
    switch (body.action) {
      case 'login': {
        // Our server mustn't become a way to guess HN passwords: a few sign-ins per address and per
        // username each quarter hour. Without a working counter, no sign-ins at all.
        if (!kvConfigured()) return fail('Hacker News sign-in isn’t available right now', 503)
        const hash = (v: string) => createHash('sha256').update(v).digest('hex').slice(0, 24)
        const user = str('username').trim().toLowerCase()
        const counts = await Promise.all([kv().bump(`rd:hn-login:${clientKey(request)}`, 900), kv().bump(`rd:hn-login-user:${hash(user)}`, 900)]).catch(() => undefined)
        if (!counts) return fail('Hacker News sign-in isn’t available right now', 503)
        if (counts[0] > LOGINS_PER_WINDOW || counts[1] > LOGINS_PER_USER) return fail('Too many sign-in attempts. Try again in a few minutes.', 429)
        return json(await signIn(str('username').trim(), str('password')), 0)
      }
      case 'vote': {
        const cookie = str('cookie')
        const id = str('id')
        const how = str('how') === 'un' ? 'un' : 'up'
        if (!COOKIE.test(cookie)) return fail('Sign in to Hacker News first', 401)
        if (!ITEM.test(id)) return fail('Not a Hacker News item')
        return json(await vote(cookie, id, how), 0)
      }
      case 'comment': {
        const cookie = str('cookie')
        const parent = str('parent')
        if (!COOKIE.test(cookie)) return fail('Sign in to Hacker News first', 401)
        if (!ITEM.test(parent)) return fail('Not a Hacker News item')
        return json(await comment(cookie, parent, str('text')), 0)
      }
      case 'submit': {
        const cookie = str('cookie')
        if (!COOKIE.test(cookie)) return fail('Sign in to Hacker News first', 401)
        return json(await submit(cookie, str('title'), str('url')), 0)
      }
      case 'logout': {
        // Ends the session on HN too, so a copy of the cookie stops working.
        const cookie = str('cookie')
        if (!COOKIE.test(cookie)) return json({ ok: true }, 0)
        return json(await logout(cookie), 0)
      }
      default:
        return fail('action must be login, logout, vote, comment or submit')
    }
  } catch (err) {
    if (err instanceof HnError) return fail(err.message, err.status)
    return fail('Couldn’t reach Hacker News', 502)
  }
}
