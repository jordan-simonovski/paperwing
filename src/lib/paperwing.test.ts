import { describe, expect, it } from 'vitest'
import { BODY_LIMIT, cleanSubmission, isSelfPost, newTid, selfPostUrl, submissionRecord, submissionUriOf } from './paperwing'
import { storyKey } from './storyKey'

const DID = 'did:plc:ukwly4246zmbi537o4u36pff'
const POST = `at://${DID}/app.bsky.feed.post/3m2abcdefghij`
const ref = { uri: POST, cid: 'c' }

describe('a self post', () => {
  it('links to its own page on PaperWing, which only it can claim', () => {
    const url = selfPostUrl(POST)
    expect(url).toBe(`https://paperwing.io/t/paperwing/${storyKey({ kind: 'bs', uri: POST })}`)
    expect(isSelfPost(url, POST)).toBe(true)
    // Someone else's post linking to it is a link to that post, not a self post.
    expect(isSelfPost(url, `at://${DID}/app.bsky.feed.post/3m2abcdefghik`)).toBe(false)
    expect(isSelfPost(`https://evil.example/t/paperwing/${storyKey({ kind: 'bs', uri: POST })}`, POST)).toBe(false)
    expect(isSelfPost(undefined, POST)).toBe(false)
    expect(isSelfPost('not a url', POST)).toBe(false)
  })

  it('keeps its body beside the post, at the same key', () => {
    expect(submissionUriOf(POST)).toBe(`at://${DID}/io.paperwing.submission/3m2abcdefghij`)
    expect(submissionUriOf('at://did:plc:x/app.bsky.feed.like/abc')).toBeUndefined()
  })

  it('carries its Markdown body through the record, trimmed and capped', () => {
    const record = submissionRecord(ref, selfPostUrl(POST), 'Ask PaperWing: what are you reading?', 'space', { body: '  **Tell me.**\n\nI mean it.  ' })
    const read = cleanSubmission(record)
    expect(read?.body).toBe('**Tell me.**\n\nI mean it.')
    expect(cleanSubmission({ ...record, body: 'x'.repeat(BODY_LIMIT + 50) })?.body).toHaveLength(BODY_LIMIT)
    expect(cleanSubmission({ ...record, body: '   ' })?.body).toBeUndefined()
    expect(cleanSubmission({ ...record, body: 42 })?.body).toBeUndefined()
  })

  it('a link listing has no body', () => {
    expect(submissionRecord(ref, 'https://a.example/x', 'T', 'space')).not.toHaveProperty('body')
  })
})

describe('record keys made here', () => {
  it('are valid, sortable TIDs that never repeat', () => {
    const a = newTid(Date.parse('2026-11-02T10:00:00Z'))
    const b = newTid(Date.parse('2026-11-02T10:00:01Z'))
    expect(a).toMatch(/^[234567abcdefghij][234567abcdefghijklmnopqrstuvwxyz]{12}$/)
    expect(b > a).toBe(true)
    expect(new Set(Array.from({ length: 50 }, () => newTid())).size).toBe(50)
  })
})
