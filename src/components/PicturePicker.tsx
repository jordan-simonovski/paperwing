import { ImagePlus, Loader2, X } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import { MAX_ALT, MAX_IMAGES, prepareImage } from '../lib/images'
import type { ContentLabel } from '../lib/selfPost'
import { toast } from '../lib/ui'

// Pictures for a post: up to four, each made ready on this device (fitted to Bluesky's limits,
// re-encoded so the camera's details stay behind) and described. The description is what a
// screen reader says and what shows when a picture doesn't load.

export interface Picture {
  id: string
  /** This device's copy, for the preview. */
  url: string
  blob: Blob
  width: number
  height: number
  alt: string
}

const LABELS: [ContentLabel | '', string][] = [
  ['', 'No content warning'],
  ['nudity', 'Nudity'],
  ['sexual', 'Sexual'],
  ['graphic-media', 'Graphic'],
]

interface Props {
  pictures: Picture[]
  onChange: (pictures: Picture[]) => void
  label: ContentLabel | ''
  onLabel: (label: ContentLabel | '') => void
  /** Every picture needs a description (the reader's setting). */
  requireAlt: boolean
}

let next = 0

export function PicturePicker({ pictures, onChange, label, onLabel, requireAlt }: Props) {
  const input = useRef<HTMLInputElement>(null)
  const labelId = useId()
  const [reading, setReading] = useState(false)

  const add = async (files: FileList | null) => {
    const room = MAX_IMAGES - pictures.length
    const chosen = [...(files ?? [])].slice(0, room)
    if (files && files.length > room) toast(`Bluesky takes ${MAX_IMAGES} pictures to a post`)
    if (!chosen.length) return
    setReading(true)
    const added: Picture[] = []
    for (const file of chosen) {
      try {
        const ready = await prepareImage(file)
        added.push({ id: `p${next++}`, url: URL.createObjectURL(ready.blob), ...ready, alt: '' })
      } catch (err) {
        toast((err as Error).message, { tone: 'error' })
      }
    }
    setReading(false)
    onChange([...pictures, ...added])
    if (input.current) input.current.value = ''
  }

  const remove = (p: Picture) => {
    URL.revokeObjectURL(p.url)
    onChange(pictures.filter((x) => x !== p))
  }

  return (
    <div className="space-y-3">
      {pictures.map((p, n) => (
        <div key={p.id} className="flex gap-3 rounded-xl bg-sunk p-3">
          <img src={p.url} alt="" className="size-20 flex-none rounded-lg object-cover" />
          <label className="min-w-0 flex-1">
            <span className="text-[0.8125rem] font-semibold text-ink-2">
              Describe picture {n + 1}
              {requireAlt ? '' : ' (optional)'}
            </span>
            <textarea
              className="input mt-1 min-h-16 resize-y py-2 text-[0.875rem]"
              value={p.alt}
              maxLength={MAX_ALT}
              placeholder="What’s in it, for someone who can’t see it"
              aria-invalid={requireAlt && !p.alt.trim()}
              onChange={(e) => onChange(pictures.map((x) => (x === p ? { ...x, alt: e.target.value } : x)))}
            />
          </label>
          <button type="button" className="icon-btn flex-none self-start" aria-label={`Remove picture ${n + 1}`} onClick={() => remove(p)}>
            <X size={15} />
          </button>
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-2">
        {pictures.length < MAX_IMAGES && (
          <button type="button" className="btn h-9 text-[0.8125rem]" onClick={() => input.current?.click()} disabled={reading}>
            {reading ? <Loader2 size={14} className="spin" /> : <ImagePlus size={14} />} {pictures.length ? 'Add another picture' : 'Add pictures'}
          </button>
        )}
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/heic" multiple hidden aria-label="Choose pictures" onChange={(e) => void add(e.target.files)} />
        {pictures.length > 0 && (
          <select className="input h-9 w-auto text-[0.8125rem]" value={label} onChange={(e) => onLabel(e.target.value as ContentLabel | '')} aria-labelledby={labelId}>
            {LABELS.map(([v, name]) => (
              <option key={v} value={v}>
                {name}
              </option>
            ))}
          </select>
        )}
        {pictures.length > 0 && (
          <span id={labelId} className="sr-only">
            Content warning
          </span>
        )}
      </div>
      {label && (
        <p className="text-[0.8125rem] text-ink-3">
          The post goes to Bluesky with this warning, which covers the pictures there. PaperWing keeps posts with a content warning off its front page and boards.
        </p>
      )}
    </div>
  )
}
