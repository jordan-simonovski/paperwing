import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, waitFor } from 'storybook/test'
import { useComposer } from '../lib/compose'
import { Composer } from './Composer'

const ref = { uri: 'at://did:plc:readerexampleabcdefghijk/app.bsky.feed.post/3kabc', cid: 'bafyreiexample' }

const meta = {
  title: 'Chrome/Composer',
  component: Composer,
  parameters: { app: { composer: { target: { kind: 'bsky-reply', threadKey: 'bs-1', root: ref, parent: ref, to: 'anildash.com' } } } },
  globals: { viewport: { value: 'mobile2', isRotated: false } },
} satisfies Meta<typeof Composer>
export default meta
type Story = StoryObj<typeof meta>

export const BlueskyReply: Story = {}
export const HackerNewsReply: Story = { parameters: { app: { composer: { target: { kind: 'hn-reply', threadKey: 'hn-1', parent: '1', story: true, to: 'pg' } } } } }
export const Closed: Story = { parameters: { app: { composer: { target: undefined } } } }

/** Bluesky's 300-character limit: past it, Post is disabled. */
export const OverTheLimit: Story = {
  play: async ({ canvas }) => {
    const box = await canvas.findByRole('textbox', { name: 'Your post' })
    await userEvent.click(box)
    await userEvent.paste('a'.repeat(301))
    await expect(canvas.getByRole('button', { name: /Post|Reply/ })).toBeDisabled()
  },
}

export const Cancel: Story = {
  play: async ({ canvas }) => {
    await userEvent.click(await canvas.findByRole('button', { name: 'Cancel' }))
    await expect(useComposer.getState().target).toBeUndefined()
  },
}

// Counts what reaches Hacker News, and holds each send open so a second press lands mid-send.
let sent = 0
let release = () => {}

/** Cmd/Ctrl+Enter while a reply is still sending doesn't post it twice. */
export const SendsOnce: Story = {
  parameters: { app: { hn: { user: 'reader', cookie: 'user=reader&x' }, composer: { target: { kind: 'hn-reply', threadKey: 'hn-1', parent: '1', story: true, to: 'pg' } } } },
  beforeEach: () => {
    sent = 0
    const real = globalThis.fetch
    globalThis.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (!url.startsWith('/api/hn')) return real(input, init)
      sent++
      return new Promise((done) => (release = () => done(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }))))
    }
    return () => {
      release()
      globalThis.fetch = real
    }
  },
  play: async ({ canvas }) => {
    const box = await canvas.findByRole('textbox', { name: 'Your post' })
    await userEvent.click(box)
    await userEvent.paste('Worth reading.')
    await userEvent.keyboard('{Meta>}{Enter}{/Meta}')
    await userEvent.keyboard('{Meta>}{Enter}{/Meta}')
    await userEvent.keyboard('{Control>}{Enter}{/Control}')
    await waitFor(() => expect(sent).toBe(1))
    await new Promise((r) => setTimeout(r, 100))
    await expect(sent).toBe(1)
    release()
    await waitFor(() => expect(useComposer.getState().target).toBeUndefined())
  },
}
