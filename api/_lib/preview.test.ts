import { describe, expect, it, vi } from 'vitest'

vi.mock('./og.js', () => ({
  pageCard: vi.fn(async () => ({ title: 'A "quoted" <title>', description: 'What it says' })),
  ogImage: vi.fn(async () => 'https://example.com/pic.jpg'),
}))

const { GET } = await import('../preview.js')
const card = async (path: string) => (await GET(new Request(`https://paperwing.io/api/preview?path=${encodeURIComponent(path)}`))).text()

describe('story preview cards', () => {
  it('describes a shared link with its own title and picture, escaped', async () => {
    const key = 'ln-' + Buffer.from('https://example.com/post').toString('base64url')
    const html = await card(`/t/for-you/${key}`)
    expect(html).toContain('<meta property="og:title" content="A &quot;quoted&quot; &lt;title&gt;">')
    expect(html).toContain('<meta property="og:image" content="https://example.com/pic.jpg">')
    expect(html).toContain(`<link rel="canonical" href="https://paperwing.io/t/for-you/${key}">`)
  })
  it('falls back to the PaperWing card for anything it does not know', async () => {
    const html = await card('/t/for-you/zz-unknown')
    expect(html).toContain('<meta property="og:title" content="PaperWing">')
    expect(html).toContain('https://paperwing.io/og.png')
  })
  it('ignores paths that are not story links', async () => {
    const html = await card('/t/for-you/"><script>x</script>')
    expect(html).not.toContain('<script>')
    expect(html).toContain('<link rel="canonical" href="https://paperwing.io/">')
  })
})
