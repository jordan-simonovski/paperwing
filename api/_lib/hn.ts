// Writing to Hacker News, the way every third-party HN app does: HN has no write API, so this
// signs in with the reader's username and password, keeps nothing, and hands HN's own session
// cookie back to the reader's device. Each vote or comment then sends that cookie along, and the
// server reads the auth token HN puts in its own page (a vote link, a reply form) and acts with it.
//
// Only news.ycombinator.com is ever fetched, with fixed paths and validated parameters.

const HN = 'https://news.ycombinator.com'
const UA = 'PaperWing (+https://paperwing.io)'

export const USERNAME = /^[A-Za-z0-9_-]{2,15}$/
/** HN's `user` cookie: "<username>&<token>". */
export const COOKIE = /^[A-Za-z0-9_-]{2,15}&[A-Za-z0-9]{8,128}$/
export const ITEM = /^\d{1,12}$/

export class HnError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message)
  }
}

const decode = (s: string) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&#x2F;/g, '/')
    .replace(/&quot;/g, '"')

/** The reason HN gave on a page that didn't do what was asked, in its words where it has them. */
export function pageProblem(html: string): string | undefined {
  if (/recaptcha|Validation required/i.test(html)) return 'Hacker News wants a captcha for this sign-in. Sign in once at news.ycombinator.com, then try again here.'
  if (/Bad login/i.test(html)) return 'Hacker News didn’t accept that username and password.'
  if (/posting too fast|slow down/i.test(html)) return 'Hacker News says you’re posting too fast. Wait a little and try again.'
  if (/You have to be logged in|Please log in/i.test(html)) return 'Your Hacker News sign-in has expired. Sign in again under Settings, Sources.'
  return undefined
}

/** The `user` cookie from a sign-in response's Set-Cookie headers. */
export function sessionCookie(setCookies: string[]): string | undefined {
  for (const c of setCookies) {
    const m = /(?:^|;\s*)user=([^;]+)/.exec(c) ?? /^user=([^;]+)/.exec(c)
    if (m && COOKIE.test(decodeURIComponent(m[1]))) return decodeURIComponent(m[1])
  }
  return undefined
}

/** The vote link for an item on its page: `how` up, or un to take a vote back. */
export function voteLink(html: string, id: string, how: 'up' | 'un'): string | undefined {
  const re = new RegExp(`id=['"]${how}_${id}['"][^>]*href=['"]([^'"]+)['"]|href=['"]([^'"]*vote\\?id=${id}&(?:amp;)?how=${how}[^'"]*)['"]`)
  const m = re.exec(html)
  const href = m?.[1] ?? m?.[2]
  if (!href) return undefined
  const path = decode(href)
  return /^vote\?id=\d+&how=(up|un)&auth=[A-Za-z0-9]+(&goto=[^\s]*)?$/.test(path) ? path : undefined
}

/** The reply form's hidden fields: what HN needs back to accept a comment. */
export function replyForm(html: string): { parent: string; goto: string; hmac: string } | undefined {
  const form = /<form[^>]*action=["']comment["'][^>]*>([\s\S]*?)<\/form>/i.exec(html)?.[1]
  if (!form) return undefined
  const field = (name: string) => new RegExp(`name=["']${name}["'][^>]*value=["']([^"']*)["']|value=["']([^"']*)["'][^>]*name=["']${name}["']`).exec(form)
  const pick = (name: string) => {
    const m = field(name)
    return m ? decode(m[1] ?? m[2] ?? '') : undefined
  }
  const parent = pick('parent')
  const goto = pick('goto')
  const hmac = pick('hmac')
  return parent && goto && hmac && ITEM.test(parent) && /^[a-f0-9]{20,128}$/i.test(hmac) ? { parent, goto, hmac } : undefined
}

const loggedIn = (html: string) => /href=["']logout/.test(html)

async function page(path: string, cookie: string): Promise<string> {
  const res = await fetch(`${HN}/${path}`, { headers: { cookie: `user=${cookie}`, 'user-agent': UA }, redirect: 'manual', signal: AbortSignal.timeout(10_000) })
  if (res.status >= 500) throw new HnError('Hacker News isn’t answering right now', 502)
  return res.text()
}

/** Signs in; returns HN's session cookie for the reader's device. The password is used once and kept nowhere. */
export async function signIn(username: string, password: string): Promise<{ user: string; cookie: string }> {
  if (!USERNAME.test(username) || !password || password.length > 200) throw new HnError('Enter your Hacker News username and password')
  const res = await fetch(`${HN}/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': UA },
    body: new URLSearchParams({ acct: username, pw: password, goto: 'news' }),
    redirect: 'manual',
    signal: AbortSignal.timeout(10_000),
  })
  const cookie = sessionCookie(res.headers.getSetCookie?.() ?? [res.headers.get('set-cookie') ?? ''])
  if (cookie) return { user: cookie.split('&')[0], cookie }
  const html = await res.text().catch(() => '')
  throw new HnError(pageProblem(html) ?? `Hacker News didn’t sign you in (${res.status})`, 401)
}

/** Upvotes an item (story or comment), or takes a vote back. */
export async function vote(cookie: string, id: string, how: 'up' | 'un'): Promise<{ voted: boolean }> {
  const html = await page(`item?id=${id}`, cookie)
  if (!loggedIn(html)) throw new HnError(pageProblem(html) ?? 'Your Hacker News sign-in has expired. Sign in again under Settings, Sources.', 401)
  const link = voteLink(html, id, how)
  if (!link) {
    // Already in the state asked for: nothing to do.
    if (voteLink(html, id, how === 'up' ? 'un' : 'up')) return { voted: how === 'up' }
    throw new HnError(how === 'up' ? 'Hacker News doesn’t offer a vote on this one (your own, or too old)' : 'There’s no vote here to take back')
  }
  const res = await fetch(`${HN}/${link}`, { headers: { cookie: `user=${cookie}`, 'user-agent': UA }, redirect: 'manual', signal: AbortSignal.timeout(10_000) })
  if (res.status !== 302 && res.status !== 200) throw new HnError(`Hacker News didn’t take the vote (${res.status})`, 502)
  return { voted: how === 'up' }
}

/** Comments on a story, or replies to a comment. */
export async function comment(cookie: string, parent: string, text: string): Promise<{ ok: true }> {
  const body = text.trim()
  if (!body) throw new HnError('Write something first')
  if (body.length > 20_000) throw new HnError('That’s too long for Hacker News')
  // A story's page has the comment form; a comment's reply page has the reply form.
  let html = await page(`item?id=${parent}`, cookie)
  if (!loggedIn(html)) throw new HnError(pageProblem(html) ?? 'Your Hacker News sign-in has expired. Sign in again under Settings, Sources.', 401)
  let form = replyForm(html)
  if (!form || form.parent !== parent) {
    html = await page(`reply?id=${parent}&goto=${encodeURIComponent(`item?id=${parent}`)}`, cookie)
    form = replyForm(html)
  }
  if (!form) throw new HnError(pageProblem(html) ?? 'Hacker News isn’t taking replies here (the thread may be closed)')
  const res = await fetch(`${HN}/comment`, {
    method: 'POST',
    headers: { cookie: `user=${cookie}`, 'content-type': 'application/x-www-form-urlencoded', 'user-agent': UA },
    body: new URLSearchParams({ parent: form.parent, goto: form.goto, hmac: form.hmac, text: body }),
    redirect: 'manual',
    signal: AbortSignal.timeout(10_000),
  })
  if (res.status === 302) return { ok: true }
  throw new HnError(pageProblem(await res.text().catch(() => '')) ?? `Hacker News didn’t post that (${res.status})`, 502)
}

/** The submit form's hidden token: HN wants it back with a new story. */
export function submitForm(html: string): { fnid: string; fnop: string } | undefined {
  const form = /<form[^>]*action=["']\/?r["'][^>]*>([\s\S]*?)<\/form>/i.exec(html)?.[1]
  if (!form) return undefined
  const pick = (name: string) => {
    const m = new RegExp(`name=["']${name}["'][^>]*value=["']([^"']*)["']|value=["']([^"']*)["'][^>]*name=["']${name}["']`).exec(form)
    return m ? decode(m[1] ?? m[2] ?? '') : undefined
  }
  const fnid = pick('fnid')
  const fnop = pick('fnop')
  return fnid && /^[A-Za-z0-9]{8,64}$/.test(fnid) && fnop ? { fnid, fnop } : undefined
}

/** Submits a link to Hacker News. HN sends an existing submission of the same link straight to it. */
export async function submit(cookie: string, title: string, url: string): Promise<{ url: string; existing: boolean }> {
  const t = title.trim()
  if (!t) throw new HnError('Add a title')
  if (t.length > 80) throw new HnError('Hacker News titles are 80 characters at most')
  if (!/^https?:\/\/\S+$/.test(url) || url.length > 2000) throw new HnError('That link won’t work on Hacker News')
  const html = await page('submit', cookie)
  if (!loggedIn(html)) throw new HnError(pageProblem(html) ?? 'Your Hacker News sign-in has expired. Sign in again under Settings, Sources.', 401)
  const form = submitForm(html)
  if (!form) throw new HnError(pageProblem(html) ?? 'Hacker News isn’t taking submissions from this account right now')
  const res = await fetch(`${HN}/r`, {
    method: 'POST',
    headers: { cookie: `user=${cookie}`, 'content-type': 'application/x-www-form-urlencoded', 'user-agent': UA },
    body: new URLSearchParams({ fnid: form.fnid, fnop: form.fnop, title: t, url, text: '' }),
    redirect: 'manual',
    signal: AbortSignal.timeout(10_000),
  })
  const location = res.headers.get('location') ?? ''
  if (res.status === 302) {
    // A repost of a recent submission goes to that item instead of making a new one.
    const item = /item\?id=(\d+)/.exec(location)?.[1]
    return item ? { url: `${HN}/item?id=${item}`, existing: true } : { url: `${HN}/submitted?id=${cookie.split('&')[0]}`, existing: false }
  }
  throw new HnError(pageProblem(await res.text().catch(() => '')) ?? `Hacker News didn’t take that submission (${res.status})`, 502)
}

/** The logout link HN puts on every page for a signed-in reader. */
export function logoutLink(html: string): string | undefined {
  const href = /href=["'](logout\?[^"']+)["']/.exec(html)?.[1]
  if (!href) return undefined
  const path = decode(href)
  return /^logout\?auth=[A-Za-z0-9]+(&goto=[^\s"']*)?$/.test(path) ? path : undefined
}

/** Signs out on HN itself, ending the session the cookie belongs to. */
export async function logout(cookie: string): Promise<{ ok: true }> {
  const link = logoutLink(await page('news', cookie))
  if (link) await fetch(`${HN}/${link}`, { headers: { cookie: `user=${cookie}`, 'user-agent': UA }, redirect: 'manual', signal: AbortSignal.timeout(10_000) }).catch(() => {})
  return { ok: true }
}
