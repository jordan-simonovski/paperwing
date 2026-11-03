import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor } from 'storybook/test'
import type { ContentLabel } from '../lib/selfPost'
import { PicturePicker, type Picture } from './PicturePicker'

/** A real picture, drawn here: a green square. */
export async function aPicture(name = 'kitchen.png'): Promise<File> {
  const canvas = document.createElement('canvas')
  canvas.width = 120
  canvas.height = 90
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#2f7d4f'
  ctx.fillRect(0, 0, 120, 90)
  const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/png'))
  return new File([blob], name, { type: 'image/png' })
}

const square = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="4" height="3"><rect width="4" height="3" fill="%232f7d4f"/></svg>'
const seeded = (n: number, alt = ''): Picture[] => Array.from({ length: n }, (_, i) => ({ id: `s${i}`, url: square, blob: new Blob(), width: 4, height: 3, alt }))

function Picker({ initial = [], requireAlt = true, initialLabel = '' }: { initial?: Picture[]; requireAlt?: boolean; initialLabel?: ContentLabel | '' }) {
  const [pictures, setPictures] = useState(initial)
  const [label, setLabel] = useState<ContentLabel | ''>(initialLabel)
  return (
    <div className="max-w-xl p-4">
      <PicturePicker pictures={pictures} onChange={setPictures} label={label} onLabel={setLabel} requireAlt={requireAlt} />
    </div>
  )
}

const meta = {
  title: 'Writing/PicturePicker',
  component: Picker,
} satisfies Meta<typeof Picker>
export default meta
type Story = StoryObj<typeof meta>

export const Empty: Story = {}

/** A picture is made ready on this device, then asks to be described. */
export const AddAndDescribe: Story = {
  play: async ({ canvas }) => {
    await userEvent.upload(canvas.getByLabelText('Choose pictures'), await aPicture())
    const describe = await canvas.findByRole('textbox', { name: /Describe picture 1/ })
    await expect(describe).toHaveAttribute('aria-invalid', 'true')
    await userEvent.type(describe, 'A green tiled kitchen')
    await waitFor(() => expect(describe).toHaveAttribute('aria-invalid', 'false'))
  },
}

/** Four is Bluesky's limit: no more to add. */
export const Full: Story = {
  args: { initial: seeded(4, 'A kitchen') },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole('button', { name: /Add/ })).toBeNull()
    await expect(canvas.getAllByRole('textbox')).toHaveLength(4)
  },
}

/** With alt text not required, descriptions are optional. */
export const AltOptional: Story = {
  args: { initial: seeded(1), requireAlt: false },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('textbox', { name: /optional/ })).toHaveAttribute('aria-invalid', 'false')
  },
}

/** A content warning says what it does, here and on Bluesky. */
export const WithAWarning: Story = {
  args: { initial: seeded(1, 'A scene'), initialLabel: 'graphic-media' },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/keeps posts with a content warning off its front page/)).toBeVisible()
  },
}
