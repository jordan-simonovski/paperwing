import { beforeEach, describe, expect, it, vi } from 'vitest'

const DID = 'did:plc:ukwly4246zmbi537o4u36pff'
const writes: { op: string; collection: string; rkey?: string; record: Record<string, unknown> }[] = []
const own: Record<string, { uri: string; cid: string; value: Record<string, unknown> }> = {}
let scope = 'atproto repo:app.bsky.feed.post?action=create repo:io.paperwing.submission?action=create&action=update'
let failSubmission = 0

vi.mock('./atproto', async (orig) => {
  const real = await orig<typeof import('./atproto')>()
  return {
    useAtproto: { getState: () => ({ did: DID, handle: 'me.example', scope }) },
    canWrite: real.canWrite,
    canUpdate: real.canUpdate,
    createRecord: async (collection: string, record: Record<string, unknown>, rkey?: string) => {
      if (collection === 'io.paperwing.submission' && failSubmission-- > 0) throw new Error('PDS hiccup')
      writes.push({ op: 'create', collection, rkey, record })
      const uri = `at://${DID}/${collection}/${rkey ?? '3m2zzzzzzzzzz'}`
      own[uri] = { uri, cid: 'bafy1', value: { $type: collection, ...record } }
      return { uri, cid: 'bafypost' }
    },
    putRecord: async (collection: string, rkey: string, record: Record<string, unknown>) => {
      writes.push({ op: 'put', collection, rkey, record })
      return { uri: `at://${DID}/${collection}/${rkey}`, cid: 'bafy2' }
    },
    getOwnRecord: async (collection: string, rkey: string) => {
      const r = own[`at://${DID}/${collection}/${rkey}`]
      if (!r) throw new Error('RecordNotFound')
      return r
    },
  }
})
vi.mock('./facets', () => ({ facetsFor: async () => [], graphemes: (s: string) => [...s].length }))

const { editSelfPost, postText, writeSelfPost } = await import('./selfPost')
const { selfPostUrl, cleanSubmission } = await import('./paperwing')
const { parseStoryKey } = await import('./storyKey')

beforeEach(() => {
  writes.length = 0
  for (const k of Object.keys(own)) delete own[k]
  scope = 'atproto repo:app.bsky.feed.post?action=create repo:io.paperwing.submission?action=create&action=update'
  failSubmission = 0
})

describe('writing a self post', () => {
  it('posts the title and a snippet to Bluesky, linking to its own page, with the words beside it', async () => {
    const out = await writeSelfPost({ title: 'What are you reading?', body: 'I’m on **Piranesi**.\n\nYou?', board: 'books' })
    const [post, sub] = writes
    expect(post.collection).toBe('app.bsky.feed.post')
    expect(sub.collection).toBe('io.paperwing.submission')
    // One key for both, chosen before either is written, so the post can link to itself.
    expect(post.rkey).toBe(sub.rkey)
    const uri = `at://${DID}/app.bsky.feed.post/${post.rkey}`
    expect(parseStoryKey(out.key)).toEqual({ kind: 'bs', uri })
    expect(post.record.text).toBe('What are you reading?\n\nI’m on Piranesi. You?')
    expect(post.record.embed).toEqual({ $type: 'app.bsky.embed.external', external: { uri: selfPostUrl(uri), title: 'What are you reading?', description: 'I’m on Piranesi. You?' } })
    expect(cleanSubmission(sub.record)).toMatchObject({ post: { uri, cid: 'bafypost' }, url: selfPostUrl(uri), title: 'What are you reading?', body: 'I’m on **Piranesi**.\n\nYou?' })
    expect(out.story).toMatchObject({ key: out.key, title: 'What are you reading?', url: null, selfPost: { body: 'I’m on **Piranesi**.\n\nYou?' } })
  })

  it('tries the words twice before saying they didn’t save', async () => {
    failSubmission = 1
    await writeSelfPost({ title: 'T', body: 'B' })
    expect(writes.map((w) => w.collection)).toEqual(['app.bsky.feed.post', 'io.paperwing.submission'])
    failSubmission = 2
    await expect(writeSelfPost({ title: 'T', body: 'B' })).rejects.toThrow(/Posted to Bluesky, but its words didn’t save/)
  })

  it('needs a title and some words', async () => {
    await expect(writeSelfPost({ title: ' ', body: 'B' })).rejects.toThrow(/title/)
    await expect(writeSelfPost({ title: 'T', body: ' ' })).rejects.toThrow(/Write something/)
    expect(writes).toHaveLength(0)
  })
})

describe('the Bluesky post’s words', () => {
  it('fit Bluesky’s 300, cutting the snippet at a word', () => {
    const text = postText('A title', 'word '.repeat(200))
    expect([...text].length).toBeLessThanOrEqual(300)
    expect(text.startsWith('A title\n\nword word')).toBe(true)
    expect(text.endsWith('…')).toBe(true)
  })
})

describe('editing a self post', () => {
  it('replaces only the words in its record, keeping the rest', async () => {
    const { key } = await writeSelfPost({ title: 'T', body: 'old', board: 'books' })
    const { uri } = parseStoryKey(key) as { uri: string }
    await editSelfPost(uri, '  new words  ')
    const put = writes.at(-1)!
    expect(put).toMatchObject({ op: 'put', collection: 'io.paperwing.submission', rkey: uri.split('/').pop() })
    expect(cleanSubmission(put.record)).toMatchObject({ title: 'T', board: 'books', body: 'new words' })
  })

  it('needs the newer Bluesky permission', async () => {
    const { key } = await writeSelfPost({ title: 'T', body: 'old' })
    scope = 'atproto repo:app.bsky.feed.post?action=create repo:io.paperwing.submission?action=create'
    await expect(editSelfPost((parseStoryKey(key) as { uri: string }).uri, 'new')).rejects.toThrow(/Settings, Sources/)
  })

  it('only ever edits your own', async () => {
    await expect(editSelfPost('at://did:plc:someoneelsesomeoneelse12/app.bsky.feed.post/3m2abcdefghij', 'x')).rejects.toThrow(/your own/)
  })
})
