import { parseHTML } from 'linkedom'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRecord, deleteRecord, useAtproto } from '../lib/atproto'
import { useReactions } from '../lib/compose'
import { useActivity } from '../lib/store'
import { READER, story } from '../test/fixtures'
import { Votes } from './StoryRow'

vi.mock('../lib/atproto', async (real) => ({ ...(await real<typeof import('../lib/atproto')>()), createRecord: vi.fn(), deleteRecord: vi.fn() }))
vi.mock('../lib/plainText', () => ({ plainText: vi.fn() }))

const post = story({
  key: 'bs-paperwing',
  source: 'bluesky',
  sourceLabel: 'PaperWing',
  author: 'alice.example',
  ref: { uri: 'at://did:plc:alice/app.bsky.feed.post/1', cid: 'bafy-post' },
})
const like = { uri: `at://${READER.did}/app.bsky.feed.like/1`, cid: 'bafy-like' }

describe('tapping a PaperWing up arrow', () => {
  let root: Root
  let container: HTMLDivElement
  beforeEach(() => {
    const { window } = parseHTML('<html><body></body></html>')
    vi.stubGlobal('window', window)
    vi.stubGlobal('document', window.document)
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    useAtproto.setState({ did: READER.did, handle: READER.handle })
    useActivity.setState({ votes: {} })
    useReactions.setState({ made: {} })
    vi.mocked(createRecord).mockReset().mockResolvedValue(like)
    vi.mocked(deleteRecord).mockReset().mockResolvedValue()
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })
  afterEach(async () => {
    await act(async () => root.unmount())
    vi.unstubAllGlobals()
  })

  async function render() {
    function LiveVotes() {
      const vote = useActivity((s) => s.votes[post.key])
      return <Votes story={post} vote={vote} />
    }
    await act(async () => root.render(<LiveVotes />))
  }
  async function tapUp() {
    await act(async () => container.querySelector('button')!.click())
  }

  it('writes a Bluesky like on the listing’s original post, then takes it back on a second tap', async () => {
    await render()
    await tapUp()
    expect(createRecord).toHaveBeenCalledWith('app.bsky.feed.like', { subject: post.ref, createdAt: expect.any(String) })
    expect(useReactions.getState().made[post.ref!.uri]).toBe(like.uri)
    await tapUp()
    expect(deleteRecord).toHaveBeenCalledWith(like.uri)
    expect(useReactions.getState().made[post.ref!.uri]).toBeUndefined()
  })

  it('sends a like even when a local taste vote already exists', async () => {
    useActivity.setState({ votes: { [post.key]: 1 } })
    await render()
    await tapUp()
    expect(createRecord).toHaveBeenCalledWith('app.bsky.feed.like', { subject: post.ref, createdAt: expect.any(String) })
    expect(useActivity.getState().votes[post.key]).toBe(1)
  })

  it('takes back an existing Bluesky like without adding a local upvote', async () => {
    useReactions.setState({ made: { [post.ref!.uri]: like.uri } })
    await render()
    await tapUp()
    expect(deleteRecord).toHaveBeenCalledWith(like.uri)
    expect(createRecord).not.toHaveBeenCalled()
    expect(useActivity.getState().votes[post.key]).toBeUndefined()
  })

  it('keeps signed-out votes local and toggles them on a second tap', async () => {
    useAtproto.setState({ did: undefined, handle: undefined })
    await render()
    await tapUp()
    expect(useActivity.getState().votes[post.key]).toBe(1)
    await tapUp()
    expect(useActivity.getState().votes[post.key]).toBeUndefined()
    expect(createRecord).not.toHaveBeenCalled()
  })

  it('retries the Bluesky like on the next tap after a failed request', async () => {
    vi.mocked(createRecord).mockRejectedValueOnce(new Error('Could not reach Bluesky'))
    await render()
    await tapUp()
    await tapUp()
    expect(createRecord).toHaveBeenCalledTimes(2)
    expect(useReactions.getState().made[post.ref!.uri]).toBe(like.uri)
    expect(useActivity.getState().votes[post.key]).toBe(1)
  })
})
