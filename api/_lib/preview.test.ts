import { describe, expect, it, vi } from 'vitest'

vi.mock('./og.js', () => ({
  pageCard: vi.fn(async () => ({ title: 'A "quoted" <title>', description: 'What it says' })),
  ogImage: vi.fn(async () => 'https://example.com/pic.jpg'),
}))

const { GET } = await import('../preview.js')
const preview = (path: string) => GET(new Request(`https://paperwing.io/api/preview?path=${encodeURIComponent(path)}`))
const card = async (path: string) => (await preview(path)).text()

describe('story preview cards', () => {
  it('describes a shared link with its own title and picture, escaped', async () => {
    const key = 'ln-' + Buffer.from('https://example.com/post').toString('base64url')
    const html = await card(`/t/for-you/${key}`)
    expect(html).toContain('<meta property="og:title" content="A &quot;quoted&quot; &lt;title&gt;">')
    expect(html).toContain('<meta property="og:image" content="https://example.com/pic.jpg">')
    expect(html).toContain(`<link rel="canonical" href="https://paperwing.io/t/for-you/${key}">`)
  })
  it('keeps a link that opens on the article opening on the article', async () => {
    const key = 'ln-' + Buffer.from('https://example.com/post').toString('base64url')
    const html = await (await GET(new Request(`https://paperwing.io/api/preview?path=${encodeURIComponent(`/t/for-you/${key}`)}&tab=article`))).text()
    expect(html).toContain(`<link rel="canonical" href="https://paperwing.io/t/for-you/${key}?tab=article">`)
    // Only the tabs there are: anything else is left off.
    const odd = await (await GET(new Request(`https://paperwing.io/api/preview?path=${encodeURIComponent(`/t/for-you/${key}`)}&tab=%22%3E%3Cx`))).text()
    expect(odd).toContain(`<link rel="canonical" href="https://paperwing.io/t/for-you/${key}">`)
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

  it('answers a profile path with a stray % with the PaperWing card, not an error', async () => {
    const res = await preview('/u/100%')
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('<meta property="og:title" content="PaperWing">')
  })
  it('caches a card it couldn’t build for minutes, not a day: the next share gets the real one', async () => {
    const { pageCard } = await import('./og.js')
    vi.mocked(pageCard).mockRejectedValueOnce(new Error('timeout'))
    const key = 'ln-' + Buffer.from('https://example.com/slow').toString('base64url')
    const failed = await preview(`/t/for-you/${key}`)
    expect(failed.headers.get('cache-control')).toMatch(/s-maxage=300\b/)
    expect((await preview(`/t/for-you/${key}`)).headers.get('cache-control')).toMatch(/s-maxage=86400/)
  })
})
