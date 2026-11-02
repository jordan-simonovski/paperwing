import { ClipboardPaste, Copy } from 'lucide-react'
import { useNavigate } from 'react-router'
import { isIOS } from '../lib/pwa'
import { useSync } from '../lib/sync'
import { toast } from '../lib/ui'

/** Reads a link off the clipboard and saves it, the way the share sheet would. */
export function useSaveFromClipboard() {
  const navigate = useNavigate()
  return async () => {
    try {
      const text = await navigator.clipboard.readText()
      const url = text.match(/https?:\/\/\S+/)?.[0]
      if (!url) return toast('There’s no link on the clipboard', { tone: 'error' })
      navigate(`/share?url=${encodeURIComponent(url)}`)
    } catch {
      toast('PaperWing wasn’t allowed to read the clipboard', { tone: 'error' })
    }
  }
}

export function SaveFromClipboardButton({ className = 'btn' }: { className?: string }) {
  const save = useSaveFromClipboard()
  return (
    <button className={className} onClick={() => void save()} title="Save the link on your clipboard">
      <ClipboardPaste size={15} /> Save link from clipboard
    </button>
  )
}

const copy = (text: string, what: string) =>
  void navigator.clipboard.writeText(text).then(
    () => toast(`${what} copied`),
    () => toast('Couldn’t copy', { tone: 'error' }),
  )

function Copyable({ label, value }: { label: string; value: string }) {
  return (
    <span className="mt-1 flex items-center gap-2">
      <code className="min-w-0 flex-1 truncate rounded-[var(--r-control)] bg-sunk px-3 py-2 font-mono text-[0.8125rem]">{value}</code>
      <button className="icon-btn flex-none" onClick={() => copy(value, label)} aria-label={`Copy ${label}`}>
        <Copy size={15} />
      </button>
    </span>
  )
}

/**
 * Saving from other apps. iOS doesn't put web apps in the share sheet, so there an Apple Shortcut
 * stands in: it posts the shared link to your sync inbox, and your devices pull it in. Android
 * and desktop Chrome have PaperWing in the share sheet once it's installed.
 */
export function SaveFromApps() {
  const code = useSync((s) => s.code)
  const ios = isIOS()
  const inbox = `${location.origin}/api/sync?inbox`
  return (
    <div className="space-y-3">
      <SaveFromClipboardButton />
      {ios ? (
        code ? (
          <div className="text-[0.9375rem] leading-relaxed text-ink-2">
            <p>To save from the share sheet in any app, make an Apple Shortcut once:</p>
            <ol className="mt-2 list-decimal space-y-2.5 pl-5 marker:font-semibold marker:text-ink">
              <li>
                In Shortcuts, tap <strong>+</strong>, name it <strong>Save to PaperWing</strong>, and in its settings (ⓘ) turn on <strong>Show in Share Sheet</strong>.
              </li>
              <li>
                Add <strong>Get Contents of URL</strong> with this URL:
                <Copyable label="Inbox URL" value={inbox} />
              </li>
              <li>
                Tap <strong>Show More</strong>: set Method to <strong>POST</strong>, Request Body to <strong>JSON</strong>, and add two text fields: <strong>url</strong> set to <em>Shortcut Input</em>
                , and <strong>code</strong> set to:
                <Copyable label="Sync code" value={code} />
              </li>
              <li>
                Optionally add <strong>Show Notification</strong> saying “Saved to PaperWing”.
              </li>
            </ol>
            <p className="mt-2 text-[0.8125rem] text-ink-3">
              Shared links land in your queue on every synced device, article and all. The code is your sync code: anyone with it can add to your queue, so keep the shortcut to yourself.
            </p>
          </div>
        ) : (
          <p className="text-[0.9375rem] leading-relaxed text-ink-2">
            iPhone doesn’t list web apps in the share sheet. Turn on Sync below and PaperWing will show you a one-time Apple Shortcut that saves from any app.
          </p>
        )
      ) : (
        <p className="text-[0.9375rem] leading-relaxed text-ink-2">Once PaperWing is installed, it appears in the share sheet on Android and in Chrome on desktop.</p>
      )}
    </div>
  )
}
