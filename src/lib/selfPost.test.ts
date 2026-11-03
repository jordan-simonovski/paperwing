import { beforeEach, describe, expect, it, vi } from 'vitest'

const DID = 'did:plc:ukwly4246zmbi537o4u36pff'
const writes: { op: string; collection: string; rkey?: string; record: Record<string, unknown> }[] = []
const own: Record<string, { uri: string; cid: string; value: Record<string, unknown> }> = {}
let scope = 'atproto repo:app.bsky.feed.post?action=create repo:io.paperwing.submission?action=create&action=update'
let failSubmission = 0
const uploads: Blob[] = []
/** The server writes the record but the answer never arrives. */
let loseAnswer = false
/** How many reads of your own records fail before one answers. */
let failReads = 0

vi.mock('./atproto', async (orig) => {
  const real = await orig<typeof import('./atproto')>()
  return {
    useAtproto: { getState: () => ({ did: DID, handle: 'me.example', scope }) },
    canWrite: real.canWrite,
    canUpdate: real.canUpdate,
    createRecord: async (collection: string, record: Record<string, unknown>, rkey?: string) => {
      if (collection === 'io.paperwing.submission' && failSubmission-- > 0) throw new Error('PDS hiccup')
      const uri = `at://${DID}/${collection}/${rkey ?? '3m2zzzzzzzzzz'}`
      if (own[uri]) throw new Error('Record already exists')
      writes.push({ op: 'create', collection, rkey, record })
      own[uri] = { uri, cid: 'bafy1', value: { $type: collection, ...record } }
      if (loseAnswer && collection === 'io.paperwing.submission') throw new Error('Network connection lost')
      return { uri, cid: 'bafypost' }
    },
    putRecord: async (collection: string, rkey: string, record: Record<string, unknown>) => {
      writes.push({ op: 'put', collection, rkey, record })
      const uri = `at://${DID}/${collection}/${rkey}`
      own[uri] = { uri, cid: 'bafy2', value: { $type: collection, ...record } }
      return { uri: `at://${DID}/${collection}/${rkey}`, cid: 'bafy2' }
    },
    uploadBlob: async (bytes: Blob) => {
      uploads.push(bytes)
      return { $type: 'blob', ref: { $link: `bafyimg${uploads.length}` }, mimeType: bytes.type || 'image/jpeg', size: bytes.size }
    },
    getOwnRecord: async (collection: string, rkey: string) => {
      if (failReads-- > 0) throw new Error('Read timed out')
      const r = own[`at://${DID}/${collection}/${rkey}`]
      if (!r) throw new Error('RecordNotFound')
      return r
    },
  }
})
vi.mock('./facets', () => ({ facetsFor: async () => [], graphemes: (s: string) => [...s].length }))

const { editSelfPost, postText, saveWords, WordsNotSaved, writeSelfPost } = await import('./selfPost')
const { selfPostUrl, cleanSubmission } = await import('./paperwing')
const { parseStoryKey } = await import('./storyKey')

beforeEach(() => {
  writes.length = 0
  for (const k of Object.keys(own)) delete own[k]
  scope = 'atproto repo:app.bsky.feed.post?action=create repo:io.paperwing.submission?action=create&action=update'
  failSubmission = 0
  uploads.length = 0
  loseAnswer = false
  failReads = 0
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

  it('tries the words twice before saying they didn’t save, and trying again never posts twice', async () => {
    failSubmission = 1
    await writeSelfPost({ title: 'T', body: 'B' })
    expect(writes.map((w) => w.collection)).toEqual(['app.bsky.feed.post', 'io.paperwing.submission'])
    writes.length = 0

    failSubmission = 2
    const err = await writeSelfPost({ title: 'T', body: 'B' }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(WordsNotSaved)
    expect((err as Error).message).toMatch(/Posted to Bluesky, but its words didn’t save/)
    // Trying again writes only the words, at the post's own key: still one Bluesky post.
    const { key, story } = await saveWords((err as InstanceType<typeof WordsNotSaved>).pending, 'B, edited meanwhile')
    expect(writes.map((w) => w.collection)).toEqual(['app.bsky.feed.post', 'io.paperwing.submission'])
    expect(writes[1].rkey).toBe(writes[0].rkey)
    expect(writes[1].record.body).toBe('B, edited meanwhile')
    expect(story).toMatchObject({ key, selfPost: { body: 'B, edited meanwhile' } })
  })

  it('saving again after a lost answer keeps the newer words, or says which words are there', async () => {
    // The words landed, but neither the answer nor the read-back arrived: it looks like they didn't save.
    loseAnswer = true
    failReads = 2
    const err = (await writeSelfPost({ title: 'T', body: 'old words' }).catch((e: unknown) => e)) as InstanceType<typeof WordsNotSaved>
    expect(err).toBeInstanceOf(WordsNotSaved)
    loseAnswer = false

    const saved = await saveWords(err.pending, 'new words')
    expect(writes.at(-1)).toMatchObject({ op: 'put', collection: 'io.paperwing.submission', rkey: err.pending.rkey })
    expect(writes.at(-1)!.record.body).toBe('new words')
    expect(saved.story.selfPost?.body).toBe('new words')

    // Without the permission to change it, the story shows the words that are actually there.
    scope = 'atproto repo:app.bsky.feed.post?action=create repo:io.paperwing.submission?action=create'
    const kept = await saveWords(err.pending, 'newer still')
    expect(kept.story.selfPost?.body).toBe('new words')
  })

  it('counts words that saved even when the answer was lost', async () => {
    loseAnswer = true
    const { story } = await writeSelfPost({ title: 'T', body: 'B' })
    expect(story.selfPost?.body).toBe('B')
    expect(writes.filter((w) => w.collection === 'io.paperwing.submission')).toHaveLength(1)
  })

  it('needs a title and some words', async () => {
    await expect(writeSelfPost({ title: ' ', body: 'B' })).rejects.toThrow(/title/)
    await expect(writeSelfPost({ title: 'T', body: ' ' })).rejects.toThrow(/Write something/)
    expect(writes).toHaveLength(0)
  })
})

describe('posting pictures', () => {
  const picture = (alt: string) => ({ blob: new Blob(['jpeg'], { type: 'image/jpeg' }), width: 1600, height: 1200, alt })

  it('uploads them to your own account as a Bluesky image post, described, with a link back to its page here', async () => {
    const { key, story } = await writeSelfPost({ title: 'Our new kitchen', body: '', board: 'food', images: [picture('A green tiled kitchen'), picture('The window over the sink')] })
    expect(uploads).toHaveLength(2)
    const post = writes.find((w) => w.collection === 'app.bsky.feed.post')!
    const uri = `at://${DID}/app.bsky.feed.post/${post.rkey}`
    expect(post.record.embed).toEqual({
      $type: 'app.bsky.embed.images',
      images: [
        { image: expect.objectContaining({ ref: { $link: 'bafyimg1' } }), alt: 'A green tiled kitchen', aspectRatio: { width: 1600, height: 1200 } },
        { image: expect.objectContaining({ ref: { $link: 'bafyimg2' } }), alt: 'The window over the sink', aspectRatio: { width: 1600, height: 1200 } },
      ],
    })
    // Pictures leave no room for a link card: the link back is in the words, as a link.
    const text = post.record.text as string
    expect(text.startsWith('Our new kitchen')).toBe(true)
    const facets = post.record.facets as { index: { byteStart: number; byteEnd: number }; features: { uri: string }[] }[]
    const link = facets.find((f) => f.features[0].uri === selfPostUrl(uri))!
    expect(new TextDecoder().decode(new TextEncoder().encode(text).slice(link.index.byteStart, link.index.byteEnd))).toBe('paperwing.io')
    // Words are optional with pictures; the listing is written all the same.
    expect(writes.find((w) => w.collection === 'io.paperwing.submission')?.record).toMatchObject({ url: selfPostUrl(uri), board: 'food' })
    expect(story).toMatchObject({ key, media: [expect.objectContaining({ kind: 'image', alt: 'A green tiled kitchen' }), expect.objectContaining({ alt: 'The window over the sink' })] })
    expect(story.selfPost).toBeUndefined()
  })

  it('needs every picture described, unless you’ve turned that off', async () => {
    await expect(writeSelfPost({ title: 'T', body: '', images: [picture('Described'), picture('  ')], requireAlt: true })).rejects.toThrow(/Describe/)
    expect(uploads).toHaveLength(0)
    await writeSelfPost({ title: 'T', body: '', images: [picture('')], requireAlt: false })
    expect(uploads).toHaveLength(1)
  })

  it('carries a content warning as Bluesky’s own self-label', async () => {
    await writeSelfPost({ title: 'T', body: 'B', images: [picture('A')], label: 'graphic-media' })
    expect(writes.find((w) => w.collection === 'app.bsky.feed.post')!.record.labels).toEqual({ $type: 'com.atproto.label.defs#selfLabels', values: [{ val: 'graphic-media' }] })
  })

  it('takes four at most, and words or pictures, not neither', async () => {
    await expect(writeSelfPost({ title: 'T', body: '', images: Array.from({ length: 5 }, () => picture('A')) })).rejects.toThrow(/four/)
    await expect(writeSelfPost({ title: 'T', body: '', images: [] })).rejects.toThrow(/Write something/)
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
    expect(Date.parse(cleanSubmission(put.record)!.editedAt!)).toBeGreaterThan(Date.now() - 5000)
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
