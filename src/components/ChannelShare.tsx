import { Copy, Share } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router'
import { channelShare, type ChannelView } from '../lib/channelShare'
import type { Channel } from '../lib/channels'
import { usePrefs } from '../lib/store'
import { homeOrigin, share, toast } from '../lib/ui'
import { Sheet } from './Sheet'

/** Sharing a feed always describes the destination, including when it is personal or unpublished. */
export function ChannelShare({ channel, ...view }: { channel: Channel } & ChannelView) {
  const [open, setOpen] = useState(false)
  const opener = useRef<HTMLButtonElement>(null)
  const inputId = useId()
  const close = () => {
    setOpen(false)
    opener.current?.focus()
  }
  const mixes = usePrefs((p) => p.mixes)
  const target = channelShare(channel, view, mixes)
  const url = target.path ? `${homeOrigin()}${target.path}` : undefined
  const copy = async () => {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      toast('Link copied')
    } catch {
      toast('Couldn’t copy the link. You can select it above and copy it.', { tone: 'error' })
    }
  }
  if (channel.id === 'for-you') return null
  return (
    <>
      <button ref={opener} className="btn h-8 flex-none px-3 text-[0.8125rem]" aria-label={`Share ${channel.label}`} aria-haspopup="dialog" onClick={() => setOpen(true)}>
        <Share size={14} /> Share
      </button>
      {open &&
        createPortal(
          <Sheet open side="bottom" label={`Share ${channel.label}`} onClose={close}>
            <div className="p-5">
              <h2 className="text-lg font-bold">Share {channel.label}</h2>
              {target.note && <p className="mt-2 text-sm text-ink-2">{target.note}</p>}
              {url && (
                <>
                  <label className="mt-4 block text-sm font-semibold" htmlFor={inputId}>
                    Link
                  </label>
                  <input id={inputId} className="input mt-1 w-full" readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button className="btn btn-primary" onClick={() => void copy()}>
                      <Copy size={15} /> Copy link
                    </button>
                    {typeof navigator.share === 'function' && (
                      <button className="btn" onClick={() => void share(channel.label, url).catch(() => toast('Couldn’t share the link. Try Copy link instead.', { tone: 'error' }))}>
                        <Share size={15} /> Share link
                      </button>
                    )}
                  </div>
                </>
              )}
              {target.edit && (
                <Link className="btn btn-primary mt-4 inline-flex" to={target.edit}>
                  Open mix editor
                </Link>
              )}
              <button className="btn mt-4" onClick={close}>
                Done
              </button>
            </div>
          </Sheet>,
          document.body,
        )}
    </>
  )
}
