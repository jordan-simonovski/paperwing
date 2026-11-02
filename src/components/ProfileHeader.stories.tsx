import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent } from 'storybook/test'
import type { Person } from '../lib/people'
import { usePrefs } from '../lib/store'
import { story } from '../test/fixtures'
import { ProfileHeader } from './ProfileHeader'

const DID = 'did:plc:paperwingownerabcdefghij'
const person: Person = {
  profile: { did: DID, handle: 'paperwing.io', name: 'PaperWing', avatar: '/icon-512.png', bio: 'The open web, read your way. Free, open source, no ads.', followers: 1840 },
  stories: [story()],
  mixes: [{ uri: `at://${DID}/io.paperwing.mix/aaaaaaaaaaaab`, rkey: 'aaaaaaaaaaaab', name: 'Open web reading', description: 'Blogs and protocols', sources: 6 }],
  shares: [{ ...story(), note: 'Still the clearest case for why feeds mattered.' }],
  blogroll: [
    { url: 'https://anildash.com/feed.xml', label: 'Anil Dash', site: 'anildash.com' },
    { url: 'https://www.robinsloan.com/feed.xml', label: 'Robin Sloan', site: 'robinsloan.com' },
  ],
  totals: { listed: 14, votes: 212, comments: 48 },
}

const meta = {
  title: 'Feed/ProfileHeader',
  component: ProfileHeader,
  args: { actor: 'paperwing.io' },
  parameters: { app: { queries: [[['person', 'paperwing.io'], person]] } },
  decorators: [(Story) => <div style={{ maxWidth: 640 }}>{Story()}</div>],
} satisfies Meta<typeof ProfileHeader>
export default meta
type Story = StoryObj<typeof meta>

export const Someone: Story = {}
export const You: Story = { parameters: { app: { queries: [[['person', 'paperwing.io'], person]], atproto: { did: DID, handle: 'paperwing.io' } } } }
export const NewToPaperWing: Story = {
  parameters: {
    app: {
      queries: [[['person', 'paperwing.io'], { ...person, mixes: [], shares: [], blogroll: undefined, totals: { listed: 0, votes: 0, comments: 0 }, profile: { did: DID, handle: 'paperwing.io' } }]],
    },
  },
}
export const NotFound: Story = { args: { actor: 'nobody.example' }, parameters: { app: { fetch: { 'src=person': { error: 'not found' } } } } }

export const Follow: Story = {
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: /^Follow/ }))
    await expect(usePrefs.getState().people.map((p) => p.did)).toEqual([DID])
  },
}
