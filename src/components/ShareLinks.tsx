import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { ChevronRight, Copy, Link2, Loader2, MessageSquareQuote, Newspaper, Send, Share, Trash2 } from 'lucide-react'
import { storyActions, useAccounts } from '../lib/accounts'
import { useAtproto } from '../lib/atproto'
import { shareOnPaperWing, unshare } from '../lib/shares'
import { useComposer } from '../lib/compose'
import { domainOf } from '../lib/format'
import type { Story } from '../lib/types'
import { share, storyLink, toast } from '../lib/ui'
import { Pip } from './Pip'
import { Sheet } from './Sheet'
import { SOURCE_NAMES } from './Source'
import { SourceIcon } from './SourceIcon'

/**
 * Sharing a story: which link to send. The PaperWing link opens the story with every network's
 * discussion and shows its own preview card; the original goes straight to the article; the
 * discussion link to the thread where it was posted. Posting it to your networks is one more row.
 */
export function ShareLinks({ story, onClose }: { story: Story; onClose: () => void }) {
  const open = useComposer((c) => c.open)
  const qc = useQueryClient()
  const accounts = useAccounts()
  const signedIn = !!accounts.bluesky
  const canPost = storyActions(accounts, story).share
  const source = story.sourceLabel === 'PaperWing' ? 'Bluesky' : SOURCE_NAMES[story.source]
  const me = useAtproto((a) => a.did)
  const [noting, setNoting] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const mine = !!me && !!story.shareUri?.startsWith(`at://${me}/`)
  const sharePW = async () => {
    setBusy(true)
    try {
      const uri = await shareOnPaperWing(qc, story, note)
      onClose()
      toast('Shared on your PaperWing profile', { action: { label: 'Undo', run: () => void unshare(qc, uri).catch(() => {}) } })
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Couldn’t share it', { tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  // The phone's (or computer's) own share screen, with the link: Messages, WhatsApp, Mail, AirDrop…
  // Without one (most desktop browsers), the link is copied instead.
  const native = typeof navigator !== 'undefined' && !!navigator.share
  const go = (url: string) => {
    onClose()
    void share(story.title, url)
  }
  const copy = (url: string) => {
    void navigator.clipboard.writeText(url).then(
      () => toast('Link copied'),
      () => toast('Couldn’t copy the link', { tone: 'error' }),
    )
    onClose()
  }
  const options: { icon: React.ReactNode; title: string; detail: string; run: () => void; url?: string }[] = [
    {
      icon: <Pip variant="head" className="size-5" />,
      title: 'PaperWing link',
      detail: 'With every discussion of it',
      run: () => go(storyLink(story.key)),
      url: storyLink(story.key),
    },
    ...(story.url ? [{ icon: <Newspaper size={18} />, title: 'Original article', detail: domainOf(story.url) ?? story.url, run: () => go(story.url!), url: story.url }] : []),
    ...(story.discussionUrl && story.discussionUrl !== story.url
      ? [
          {
            icon: <SourceIcon source={story.source} size={18} />,
            title: `The ${source} discussion`,
            detail: domainOf(story.discussionUrl) ?? story.discussionUrl,
            run: () => go(story.discussionUrl!),
            url: story.discussionUrl,
          },
        ]
      : []),
    ...(signedIn && story.url && !mine
      ? [
          {
            icon: <MessageSquareQuote size={18} />,
            title: 'Share on PaperWing',
            detail: 'With a note, on your profile and for people who follow you',
            run: () => setNoting(true),
          },
        ]
      : []),
    ...(mine
      ? [
          {
            icon: <Trash2 size={18} />,
            title: 'Remove from your shared items',
            detail: 'Takes it off your profile and your followers’ feeds',
            run: () => {
              onClose()
              void unshare(qc, story.shareUri!).then(
                () => toast('Removed from your shared items'),
                (err: Error) => toast(err.message, { tone: 'error' }),
              )
            },
          },
        ]
      : []),
    ...(canPost
      ? [
          {
            icon: <Send size={18} />,
            title: 'Post it to your networks',
            detail: 'Bluesky, Mastodon, Hacker News or Lemmy, and list it on PaperWing',
            run: () => {
              onClose()
              open({ kind: 'share', story })
            },
          },
        ]
      : []),
  ]

  return (
    <Sheet open onClose={onClose} side="bottom" label="Share">
      <div className="p-4">
        <h2 className="flex items-center gap-2 text-[1.0625rem] font-bold">
          <Link2 size={17} /> Share
        </h2>
        <p className="mt-0.5 line-clamp-2 text-[0.875rem] text-ink-3">{story.title}</p>
        {noting && (
          <form
            className="mt-3 space-y-2.5"
            onSubmit={(e) => {
              e.preventDefault()
              void sharePW()
            }}
          >
            <textarea
              className="input min-h-24 resize-y py-2.5 leading-relaxed"
              placeholder="Why is it worth reading? (optional)"
              value={note}
              maxLength={1000}
              onChange={(e) => setNote(e.target.value)}
              aria-label="Your note"
              autoFocus
            />
            <p className="text-[0.8125rem] text-ink-3">
              It goes on your PaperWing profile and its RSS feed, and into For you for people who follow you here. It’s public, and it isn’t posted to Bluesky.
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn" onClick={() => setNoting(false)}>
                Back
              </button>
              <button className="btn btn-primary" disabled={busy}>
                {busy ? <Loader2 size={15} className="spin" /> : <MessageSquareQuote size={15} />} Share
              </button>
            </div>
          </form>
        )}
        {!noting && <p className="mt-2 text-[0.8125rem] text-ink-3">{native ? 'Tap a link to open your share screen, or copy it.' : 'Tap a link to copy it.'}</p>}
        <div className={`mt-2.5 space-y-1.5 ${noting ? 'hidden' : ''}`}>
          {options.map((o) => (
            <div key={o.title} className="flex items-stretch gap-1.5">
              <button className="flex min-w-0 flex-1 items-center gap-3 rounded-xl bg-sunk px-3.5 py-3 text-left hover:bg-line" onClick={o.url && !native ? () => copy(o.url!) : o.run}>
                <span className="grid size-8 flex-none place-items-center text-ink-2">{o.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[0.9375rem] font-semibold">{o.title}</span>
                  <span className="block truncate text-[0.8125rem] text-ink-3">{o.detail}</span>
                </span>
                {o.url ? (
                  native ? (
                    <Share size={16} className="flex-none text-ink-3" />
                  ) : (
                    <Copy size={16} className="flex-none text-ink-3" />
                  )
                ) : (
                  <ChevronRight size={16} className="flex-none text-ink-3" />
                )}
              </button>
              {o.url && native && (
                <button
                  className="grid w-12 flex-none place-items-center rounded-xl bg-sunk text-ink-2 hover:bg-line"
                  onClick={() => copy(o.url!)}
                  aria-label={`Copy the ${o.title.toLowerCase()}`}
                  title="Copy link"
                >
                  <Copy size={16} />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </Sheet>
  )
}
