import { useSearchParams } from 'react-router'
import { Pip } from '../components/Pip'

// Development only (App.tsx): PaperWing's brand artwork laid out at its exact pixel size, for
// scripts/brand.mjs to capture as PNGs: the link preview image, and the Bluesky avatar and banner.

const PAPER = '#f4f1e8'
const INK = '#23221f'
const RED = 'oklch(0.55 0.215 27)'

function Wordmark({ size }: { size: number }) {
  // As in the header (styles.css, .wordmark): Fraunces, soft and wonky, in ink beside Pip's red.
  return (
    <span style={{ fontFamily: 'var(--font-wordmark)', fontWeight: 600, fontVariationSettings: "'SOFT' 100, 'WONK' 1", fontSize: size, letterSpacing: '-0.01em', color: INK, lineHeight: 1 }}>
      PaperWing
    </span>
  )
}

export function BrandPage() {
  const [params] = useSearchParams()
  const asset = params.get('asset') ?? 'og'
  const frame = (w: number, h: number, bg: string, children: React.ReactNode) => (
    <div id="asset" style={{ width: w, height: h, background: bg, position: 'relative', overflow: 'hidden', fontFamily: 'var(--font-text)' }}>
      {children}
    </div>
  )

  if (asset === 'avatar' || asset === 'avatar-light')
    return frame(
      1000,
      1000,
      asset === 'avatar' ? INK : PAPER,
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
        <Pip variant="head" className="block" title="Pip" />
        <style>{`#asset svg { width: 720px; height: 720px; margin-top: 40px }`}</style>
      </div>
    )

  if (asset === 'banner')
    // Bluesky crops a banner to 3:1 and puts the avatar over its lower left, so the words sit centre-right.
    return frame(
      3000,
      1000,
      PAPER,
      <>
        <div style={{ position: 'absolute', left: 820, top: 270, width: 1300 }}>
          <Wordmark size={210} />
          <p style={{ marginTop: 50, fontSize: 80, lineHeight: 1.15, fontWeight: 600, color: INK, letterSpacing: '-0.01em' }}>The open web, read your way.</p>
          <p style={{ marginTop: 30, fontSize: 54, fontWeight: 500, color: '#6b675e', whiteSpace: 'nowrap' }}>News, communities and conversations · paperwing.io</p>
        </div>
        <div style={{ position: 'absolute', right: 180, top: 110, width: 780, height: 780 }}>
          <Pip variant="full" className="block size-full" title="Pip" />
        </div>
      </>
    )

  // The link preview: what a share of paperwing.io shows on Bluesky, Slack, iMessage and the rest.
  return frame(
    1200,
    630,
    PAPER,
    <>
      <div style={{ position: 'absolute', left: 80, top: 150, width: 640 }}>
        <Wordmark size={112} />
        <p style={{ marginTop: 34, fontSize: 46, lineHeight: 1.15, fontWeight: 650, color: INK, letterSpacing: '-0.01em' }}>The open web, read your way.</p>
        <p style={{ marginTop: 22, fontSize: 28, lineHeight: 1.35, fontWeight: 500, color: '#5f5b52' }}>News, Lemmy communities, Bluesky and Hacker News, by topic. Free, and yours.</p>
        <p style={{ marginTop: 34, fontSize: 28, fontWeight: 700, color: RED }}>paperwing.io</p>
      </div>
      <div style={{ position: 'absolute', right: 40, top: 55, width: 520, height: 520 }}>
        <Pip variant="full" className="block size-full" title="Pip" />
      </div>
    </>
  )
}
