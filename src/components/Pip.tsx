import { pipShapes, PIP_VIEWBOX, type PipShape } from '../lib/pip'
import { useSeason } from '../lib/season'

const style = (s: PipShape) => ({
  fill: s.fill ? `var(--pip-${s.fill})` : (s.paint ?? 'none'),
  stroke: s.stroke ? `var(--pip-${s.stroke})` : undefined,
  strokeWidth: s.width,
  strokeLinecap: s.round ? ('round' as const) : undefined,
  strokeLinejoin: s.round ? ('round' as const) : undefined,
})

/** Pip, PaperWing's paper owl, in the theme's colours: the whole owl, the head the logo uses, or Pip done reading. Dressed for the season. */
export function Pip({ variant = 'full', className, title }: { variant?: 'full' | 'head' | 'done'; className?: string; title?: string }) {
  const shapes = pipShapes(variant, useSeason())
  return (
    // Seasonal hats rise above the head's box; let them show.
    <svg className={className} overflow="visible" viewBox={PIP_VIEWBOX[variant].join(' ')} role={title ? 'img' : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      {shapes.map((s, i) =>
        s.ellipse ? (
          <ellipse data-part={s.part} key={i} cx={s.ellipse[0]} cy={s.ellipse[1]} rx={s.ellipse[2]} ry={s.ellipse[3]} style={style(s)} />
        ) : (
          <path data-part={s.part} key={i} d={s.d} style={style(s)} />
        ),
      )}
    </svg>
  )
}
