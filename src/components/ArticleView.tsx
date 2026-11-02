import { AlertTriangle, ArrowUpRight, Minus, Plus } from 'lucide-react'
import { useArticle } from '../lib/hooks'
import { sanitize } from '../lib/html'
import { usePrefs } from '../lib/store'
import { QuoteCard } from './QuoteCard'
import type { Story } from '../lib/types'

const SIZES = ['sm', 'md', 'lg'] as const

export function TextSizeControl() {
  const { textSize, set } = usePrefs()
  const i = SIZES.indexOf(textSize)
  return (
    <div className="flex items-center rounded-full bg-sunk p-0.5">
      <button className="icon-btn h-8 w-8" disabled={i === 0} onClick={() => set({ textSize: SIZES[i - 1] })} title="Smaller text" aria-label="Smaller text">
        <Minus size={13} />
      </button>
      <span className="w-7 text-center text-[0.8125rem] font-bold text-ink-2" aria-hidden>
        Aa
      </span>
      <button className="icon-btn h-8 w-8" disabled={i === SIZES.length - 1} onClick={() => set({ textSize: SIZES[i + 1] })} title="Larger text" aria-label="Larger text">
        <Plus size={13} />
      </button>
    </div>
  )
}

export function ArticleView({ story }: { story: Story }) {
  const article = useArticle(story.url, story.key, true)

  if (!story.url) {
    if (!story.text && !story.quote) return <p className="py-10 text-center text-ink-3">This post has no body text.</p>
    return (
      <div className="prose mx-auto py-8">
        {story.text && <div dangerouslySetInnerHTML={{ __html: sanitize(story.text) }} />}
        {story.quote && (
          <div className="mt-6">
            <QuoteCard quote={story.quote} />
          </div>
        )}
      </div>
    )
  }

  if (article.isPending) {
    return (
      <div className="mx-auto max-w-[38rem] space-y-3.5 py-10" aria-label="Loading article">
        <div className="skel mb-6 h-3.5 w-40" />
        {Array.from({ length: 9 }, (_, i) => (
          <div key={i} className="skel h-4" style={{ width: `${92 - ((i * 13) % 30)}%` }} />
        ))}
      </div>
    )
  }

  if (article.isError) {
    return (
      <div className="mx-auto max-w-[32rem] py-14 text-center">
        <AlertTriangle className="mx-auto mb-3 text-ink-3" size={22} />
        <p className="text-[1.125rem] font-bold">No reader view for this one</p>
        <p className="mt-2 text-[0.9375rem] text-ink-3">{article.error.message}. Some sites block fetching, render with JavaScript, or are PDFs.</p>
        <a className="btn mt-5" href={story.url} target="_blank" rel="noopener noreferrer">
          Open original <ArrowUpRight size={14} />
        </a>
      </div>
    )
  }

  const a = article.data
  const minutes = a.length ? Math.max(1, Math.round(a.length / 5 / 230)) : undefined
  const showTitle = a.title && a.title.trim().toLowerCase() !== story.title.trim().toLowerCase()
  return (
    <article className="mx-auto max-w-[38rem] py-7">
      <div className="meta mb-7 text-[0.875rem]">
        {a.siteName && <span>{a.siteName}</span>}
        {a.byline && <span>{a.byline}</span>}
        {minutes && <span>{minutes} min read</span>}
        <span className="ml-auto">
          <TextSizeControl />
        </span>
      </div>
      {showTitle && <h2 className="mb-6 text-[1.625rem] font-bold leading-tight tracking-[-0.02em]">{a.title}</h2>}
      <div className="prose" dangerouslySetInnerHTML={{ __html: sanitize(a.html) }} />
      <div className="mt-14 flex justify-center">
        <a className="btn" href={story.url} target="_blank" rel="noopener noreferrer">
          Continue on {new URL(story.url).hostname.replace(/^www\./, '')} <ArrowUpRight size={14} />
        </a>
      </div>
    </article>
  )
}
