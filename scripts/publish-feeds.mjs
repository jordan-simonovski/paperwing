// Publishes PaperWing's Bluesky feeds to your account, pointing at your deployment.
//
//   BSKY_HANDLE=you.bsky.social BSKY_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx \
//   FEEDGEN_HOSTNAME=paperwing.io npm run publish-feeds -- tech observability ai
//
// With no feed names it publishes "tech". Pass --list to see every feed, --remove to unpublish.
// Re-running updates the records in place. Use an app password (Settings > App passwords), never
// your main password.

const { BSKY_HANDLE, BSKY_APP_PASSWORD, FEEDGEN_HOSTNAME } = process.env
const SERVICE = process.env.BSKY_SERVICE || 'https://bsky.social'
const args = process.argv.slice(2)
const remove = args.includes('--remove')
const wanted = args.filter((a) => !a.startsWith('--'))

const die = (msg) => {
  console.error(`\n${msg}\n`)
  process.exit(1)
}
if (!FEEDGEN_HOSTNAME) die('Set FEEDGEN_HOSTNAME to the address the feeds are served from, e.g. paperwing.io (no https://).')
// Plain http only for a local dev server; Bluesky itself only talks to https hosts.
const BASE = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(FEEDGEN_HOSTNAME) ? `http://${FEEDGEN_HOSTNAME}` : `https://${FEEDGEN_HOSTNAME}`

async function xrpc(method, { body, token, query, raw, contentType } = {}) {
  const url = `${SERVICE}/xrpc/${method}${query ? `?${new URLSearchParams(query)}` : ''}`
  const res = await fetch(url, {
    method: body ? 'POST' : 'GET',
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': contentType ?? 'application/json' } : {}) },
    body: raw ? body : body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`${method}: ${res.status} ${data.error ?? ''} ${data.message ?? ''}`.trim())
  return data
}

// The deployment says which feeds exist, so this script never drifts from the code.
const status = await fetch(`${BASE}/api/atproto?route=status`)
  .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`status ${r.status}`))))
  .catch((e) => die(`Could not reach ${BASE}/api/atproto?route=status (${e.message}). Deploy first.`))
const did = await fetch(`${BASE}/.well-known/did.json`).then((r) => r.json()).catch(() => null)
if (did?.id !== `did:web:${FEEDGEN_HOSTNAME}`) die(`${BASE}/.well-known/did.json should have id did:web:${FEEDGEN_HOSTNAME}, got ${did?.id}. Is PaperWing served at that address yet?`)

if (args.includes('--list')) {
  for (const f of status.feeds) console.log(`${f.rkey.padEnd(14)} ${f.displayName}`)
  process.exit(0)
}
if (!BSKY_HANDLE || !BSKY_APP_PASSWORD) die('Set BSKY_HANDLE and BSKY_APP_PASSWORD (an app password from Bluesky Settings > App passwords).')

const known = new Map(status.feeds.map((f) => [f.rkey, f]))
const chosen = wanted.length ? wanted : ['tech']
const unknown = chosen.filter((r) => !known.has(r))
if (unknown.length) die(`Unknown feed(s): ${unknown.join(', ')}. Run with --list to see them.`)

const session = await xrpc('com.atproto.server.createSession', { body: { identifier: BSKY_HANDLE, password: BSKY_APP_PASSWORD } }).catch((e) => die(`Login failed: ${e.message}`))
console.log(`Signed in as ${session.handle} (${session.did})`)

let avatar
if (!remove) {
  const icon = await fetch(`${BASE}/icon-512.png`)
  if (icon.ok) avatar = (await xrpc('com.atproto.repo.uploadBlob', { body: Buffer.from(await icon.arrayBuffer()), raw: true, contentType: 'image/png', token: session.accessJwt })).blob
}

for (const rkey of chosen) {
  const f = known.get(rkey)
  const uri = `at://${session.did}/app.bsky.feed.generator/${rkey}`
  if (remove) {
    await xrpc('com.atproto.repo.deleteRecord', { token: session.accessJwt, body: { repo: session.did, collection: 'app.bsky.feed.generator', rkey } })
    console.log(`Removed ${f.displayName}`)
    continue
  }
  await xrpc('com.atproto.repo.putRecord', {
    token: session.accessJwt,
    body: {
      repo: session.did,
      collection: 'app.bsky.feed.generator',
      rkey,
      record: { $type: 'app.bsky.feed.generator', did: `did:web:${FEEDGEN_HOSTNAME}`, displayName: f.displayName, description: f.description, ...(avatar ? { avatar } : {}), createdAt: new Date().toISOString() },
    },
  })
  // Ask Bluesky's AppView whether it can reach and use the generator.
  const check = await xrpc('app.bsky.feed.getFeedGenerator', { token: session.accessJwt, query: { feed: uri } }).catch((e) => ({ error: e.message }))
  const ok = check.isOnline && check.isValid
  console.log(`${ok ? 'Published' : 'Published, but Bluesky says it is not ready yet'}: ${f.displayName}  https://bsky.app/profile/${session.did}/feed/${rkey}${check.error ? `  (${check.error})` : ''}`)
}

if (!process.env.BSKY_DID && !status.publisher) console.log(`\nSet BSKY_HANDLE=${session.handle} (or BSKY_DID=${session.did}) on the deployment so it only serves feeds published by you.`)
