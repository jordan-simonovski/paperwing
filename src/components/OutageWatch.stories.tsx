import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent } from 'storybook/test'
import type { OutageReport } from '../lib/outageTypes'
import { OutageBanner, OutagePanel } from './OutageWatch'

// Sample times are relative to the real clock: the banner says "4m ago".
const ago = (min: number) => Date.now() - min * 60_000
const report: OutageReport = {
  checkedAt: ago(1),
  scanned: 1840,
  providers: [
    {
      id: 'cloudflare',
      name: 'Cloudflare',
      recent: 37,
      baseline: 1.4,
      level: 'spike',
      samples: [
        { text: 'Is Cloudflare down? Half the internet is throwing 500s', url: 'https://bsky.app/profile/a/post/1', at: ago(4) },
        { text: 'cloudflare dashboard not loading for anyone else?', url: 'https://bsky.app/profile/b/post/2', at: ago(9) },
      ],
      status: { indicator: 'major', description: 'Partial outage', url: 'https://www.cloudflarestatus.com' },
    },
    { id: 'github', name: 'GitHub', recent: 3, baseline: 2, level: 'chatter', samples: [] },
    { id: 'aws', name: 'AWS', recent: 0, baseline: 0.2, level: 'quiet', samples: [], status: { indicator: 'none', description: 'All systems operational', url: 'https://health.aws.amazon.com' } },
  ],
}
const quiet: OutageReport = { ...report, providers: report.providers.map((p) => ({ ...p, level: 'quiet', recent: 0, status: undefined })) }

const meta = {
  title: 'Feed/OutageWatch',
  component: OutageBanner,
  parameters: { app: { queries: [[['outages'], report]] } },
  decorators: [(Story) => <div style={{ maxWidth: 640 }}>{Story()}</div>],
} satisfies Meta<typeof OutageBanner>
export default meta
type Story = StoryObj<typeof meta>

export const Spike: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Possible Cloudflare outage')).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { expanded: false }))
    await expect(canvas.getByText(/Half the internet/)).toBeVisible()
  },
}

/** Nothing worth a banner: it renders nothing at all. */
export const AllQuiet: Story = { parameters: { app: { queries: [[['outages'], quiet]] } } }

export const Panel: Story = { render: () => <OutagePanel /> }
export const PanelUnavailable: Story = { render: () => <OutagePanel />, parameters: { app: { queries: [] } } }
