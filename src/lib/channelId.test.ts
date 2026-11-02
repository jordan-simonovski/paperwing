import { describe, expect, it } from 'vitest'
import { channelId, parseChannelId, type ChannelAddress } from './channelId'

const DID = 'did:plc:abcdefghijklmnopqrstuvwx'
const RKEY = '3l2abcdefghij'

describe('channel ids', () => {
  it('read back as the address they were written from', () => {
    const addresses: ChannelAddress[] = [
      { kind: 'named', name: 'for-you' },
      { kind: 'named', name: '3d-printing' },
      { kind: 'interest', id: 'q:sourdough' },
      { kind: 'paperwing' },
      { kind: 'paperwing', board: 'web' },
      { kind: 'board', did: DID, rkey: RKEY },
      { kind: 'board', did: 'did:web:example.com', rkey: RKEY },
      { kind: 'person', actor: 'anil.example' },
      { kind: 'mix', id: RKEY },
      { kind: 'followedMix', did: DID, rkey: RKEY },
      { kind: 'community', name: 'science@lemmy.world' },
      { kind: 'bskyFeed', uri: `at://${DID}/app.bsky.feed.generator/science` },
      { kind: 'feed', url: 'https://example.com/feed.xml?a=1' },
    ]
    for (const a of addresses) expect(parseChannelId(channelId(a)), channelId(a)).toEqual(a)
  })

  it('write a person the way their URL does: no @, lower case', () => {
    expect(channelId({ kind: 'person', actor: '@Anil.Example' })).toBe('u:anil.example')
  })

  it('refuse anything malformed, so it never reaches a fetch', () => {
    for (const bad of [
      'c:../../etc',
      'c:science',
      'cb:not-a-did:' + RKEY,
      `cb:${DID}:short`,
      `mix:${DID}:short`,
      'feed:javascript:alert(1)',
      'feed:not a url',
      'bf-%%%',
      'bf-' + btoa('https://example.com'),
      'paperwing:Web/../x',
      'u:a/b',
      'u:',
      'q:',
      'Not A Channel',
    ])
      expect(parseChannelId(bad), bad).toBeUndefined()
  })
})
