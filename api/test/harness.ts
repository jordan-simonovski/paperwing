import { afterEach, beforeEach } from 'vitest'
import { MockAgent, setGlobalDispatcher, getGlobalDispatcher, type Dispatcher } from 'undici'
import { setUpstream } from '../_lib/http.js'
import { resetMemoryKv } from '../_lib/kv.js'

// In-process integration tests for the API: call a handler with a Request, with every upstream
// faked. No real network: anything not intercepted fails the test.
//
//   const net = fakeUpstreams()
//   net.get('https://lobste.rs').intercept({ path: '/hottest.json' }).reply(200, [...])
//   const res = await call(GET, '/api/feed?src=lobsters')

/** Fakes every upstream for each test in this file: the safe fetcher and plain fetch alike. Returns the agent to intercept on. */
export function fakeUpstreams(): MockAgent {
  const agent = new MockAgent()
  let restore: () => void = () => {}
  let before: Dispatcher
  beforeEach(() => {
    agent.disableNetConnect()
    before = getGlobalDispatcher()
    setGlobalDispatcher(agent)
    // Every host resolves to an ordinary public address (documentation ranges count as reserved), so the private-address check passes.
    restore = setUpstream({ dispatcher: agent, lookup: async () => ['93.184.215.14'] })
    resetMemoryKv()
  })
  afterEach(async () => {
    restore()
    setGlobalDispatcher(before)
    agent.assertNoPendingInterceptors()
  })
  return agent
}

/** Uses the in-process store for this file's tests, as SYNC_MEMORY=1 does in local development, empty for each test. */
export function memoryStore(): void {
  beforeEach(() => {
    process.env.SYNC_MEMORY = '1'
    resetMemoryKv()
  })
  afterEach(() => {
    delete process.env.SYNC_MEMORY
  })
}

export interface Answer<T = unknown> {
  status: number
  headers: Headers
  body: T
}

/** Calls a handler the way Vercel would, from a path and an optional init. JSON bodies are parsed. */
export async function call<T = unknown>(handler: (request: Request) => Promise<Response>, path: string, init: RequestInit & { json?: unknown } = {}): Promise<Answer<T>> {
  const { json, ...rest } = init
  const request = new Request(`https://paperwing.test${path}`, {
    ...rest,
    ...(json !== undefined ? { method: rest.method ?? 'POST', body: JSON.stringify(json), headers: { 'content-type': 'application/json', ...rest.headers } } : {}),
  })
  const res = await handler(request)
  const text = await res.text()
  let body: unknown = text
  if ((res.headers.get('content-type') ?? '').includes('json')) body = JSON.parse(text)
  return { status: res.status, headers: res.headers, body: body as T }
}
