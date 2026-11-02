import { beforeEach, describe, expect, it, vi } from 'vitest'

// Each redirect is a fresh destination to check: a public page that answers 302 to a private
// address must not get the server to follow it.
const hops: { status: number; location?: string }[] = []
const asked: string[] = []
vi.mock('undici', () => {
  class Agent {}
  return {
    Agent,
    EnvHttpProxyAgent: Agent,
    fetch: async (url: string) => {
      asked.push(url)
      const hop = hops.shift() ?? { status: 200 }
      return new Response(hop.status === 200 ? 'ok' : null, { status: hop.status, headers: hop.location ? { location: hop.location } : {} })
    },
  }
})

const { safeFetch } = await import('./http')

beforeEach(() => {
  hops.length = 0
  asked.length = 0
})

describe('safeFetch', () => {
  it('follows a redirect to another public address', async () => {
    hops.push({ status: 301, location: 'https://1.1.1.1/next' })
    const { finalUrl } = await safeFetch('https://1.0.0.1/start')
    expect(finalUrl).toBe('https://1.1.1.1/next')
    expect(asked).toEqual(['https://1.0.0.1/start', 'https://1.1.1.1/next'])
  })
  it('refuses a redirect into a private range, without requesting it', async () => {
    for (const location of ['http://169.254.169.254/latest/meta-data/', 'http://[::ffff:7f00:1]:9001/', 'http://10.0.0.5/', 'file:///etc/passwd']) {
      hops.length = 0
      asked.length = 0
      hops.push({ status: 302, location })
      await expect(safeFetch('https://1.0.0.1/start'), location).rejects.toThrow()
      expect(asked).toEqual(['https://1.0.0.1/start'])
    }
  })
  it('refuses any redirect when asked to', async () => {
    hops.push({ status: 302, location: 'https://1.1.1.1/' })
    await expect(safeFetch('https://1.0.0.1/', { redirect: 'error' })).rejects.toThrow(/Redirected/)
  })
  it('gives up after five hops', async () => {
    for (let i = 0; i < 7; i++) hops.push({ status: 302, location: `https://1.1.1.1/${i}` })
    await expect(safeFetch('https://1.0.0.1/')).rejects.toThrow(/Too many redirects/)
  })
})
