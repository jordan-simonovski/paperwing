import { beforeEach, describe, expect, it, vi } from 'vitest'

const puts: { collection: string; rkey: string; record: { feeds: Record<string, unknown>[] } }[] = []
vi.mock('./atproto', () => ({
  canWrite: () => true,
  deleteRecord: async () => {},
  putRecord: async (collection: string, rkey: string, record: { feeds: Record<string, unknown>[] }) => {
    puts.push({ collection, rkey, record })
    return { uri: `at://did:plc:x/${collection}/${rkey}`, cid: 'c' }
  },
  useAtproto: Object.assign(() => undefined, { getState: () => ({ did: 'did:plc:x' }) }),
}))

const { publishBlogroll } = await import('./blogroll')
const { usePrefs } = await import('./store')

beforeEach(() => {
  puts.length = 0
})

describe('your public blogroll', () => {
  it('publishes the blogs you follow, never a private feed’s address or your folders', async () => {
    usePrefs.setState({
      customFeeds: [
        { url: 'https://jvns.ca/atom.xml', label: 'Julia Evans', site: 'jvns.ca', folder: 'Engineering' },
        { url: 'https://gitlab.example/me.atom?feed_token=glft-secret', label: 'My GitLab activity' },
        { url: 'https://me:hunter2@intranet.example/rss', label: 'Intranet' },
        { url: 'https://letters.example/feed?api_key=s3cret', label: 'Paid letter' },
      ],
    })
    await publishBlogroll()
    expect(puts[0].record.feeds).toEqual([{ url: 'https://jvns.ca/atom.xml', label: 'Julia Evans', site: 'jvns.ca' }])
  })
})
