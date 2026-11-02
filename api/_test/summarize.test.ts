import { afterEach, describe, expect, it } from 'vitest'
import { clientKey, today } from '../_lib/http.js'
import { kv } from '../_lib/kv.js'
import { call, memoryStore } from './harness.js'
import { POST } from '../summarize.js'

// Who pays for a summary, and when the answer is no. None of these reach Anthropic: each stops
// before the model is asked.

memoryStore()
afterEach(() => {
  delete process.env.ANTHROPIC_API_KEY
})

const discussion = { title: 'A story', url: 'https://example.com', threads: [{ source: 'Hacker News', comments: [{ author: 'ana', text: 'A thought', depth: 0 }] }] }
const summarize = (body: unknown, headers: Record<string, string> = {}) => call<{ error: string }>(POST, '/api/summarize', { json: body, headers })

describe('discussion summaries', () => {
  it('need a key: the deployment’s or the reader’s own', async () => {
    const res = await summarize(discussion)
    expect(res.status).toBe(501)
    expect(res.body.error).toMatch(/your own key in Settings/)
  })

  it('refuse a discussion with nothing to sum up', async () => {
    process.env.ANTHROPIC_API_KEY = 'deployment-key'
    expect((await summarize({ title: 'A story', threads: [] })).status).toBe(400)
    expect((await call(POST, '/api/summarize', { method: 'POST', body: 'not json' })).status).toBe(400)
  })

  it('stop on the deployment’s key once everyone together has used today’s budget', async () => {
    process.env.ANTHROPIC_API_KEY = 'deployment-key'
    await kv().bump(`rd:summary-quota:*:${today()}`, 86_400, 10_000)
    const res = await summarize(discussion)
    expect(res.status).toBe(429)
    expect(res.body.error).toMatch(/Add your own Anthropic key/)
  })

  it('never spend the deployment’s key without a counter to cap it', async () => {
    process.env.ANTHROPIC_API_KEY = 'deployment-key'
    delete process.env.SYNC_MEMORY
    expect((await summarize(discussion)).status).toBe(401)
  })

  it('a caller over their own limit doesn’t use up everyone else’s', async () => {
    process.env.ANTHROPIC_API_KEY = 'deployment-key'
    const headers = { 'x-forwarded-for': '203.0.113.9' }
    const mine = `rd:summary-quota:${clientKey(new Request('https://x', { headers }))}:${today()}`
    await kv().bump(mine, 86_400, 10_000)
    for (let i = 0; i < 5; i++) expect((await summarize(discussion, headers)).status).toBe(429)
    expect(await kv().get(`rd:summary-quota:*:${today()}`)).toBeNull()
  })
})
