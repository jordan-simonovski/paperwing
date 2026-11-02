import { Bold, Code, Italic, Link2, List, ListOrdered, Quote } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import { sanitize } from '../lib/html'
import { format, markdownHtml, type FormatAction } from '../lib/markdown'

// Writing Markdown the GitHub way: a Write tab with a formatting toolbar over a plain text box, and
// a Preview tab showing it as it will look. What you type is what's stored; nothing is hidden.

const TOOLS: { action: FormatAction; label: string; keys?: string; icon: React.ReactNode }[] = [
  { action: 'bold', label: 'Bold', keys: 'b', icon: <Bold size={16} /> },
  { action: 'italic', label: 'Italic', keys: 'i', icon: <Italic size={16} /> },
  { action: 'link', label: 'Link', keys: 'k', icon: <Link2 size={16} /> },
  { action: 'list', label: 'Bulleted list', icon: <List size={16} /> },
  { action: 'numbered', label: 'Numbered list', icon: <ListOrdered size={16} /> },
  { action: 'quote', label: 'Quote', icon: <Quote size={16} /> },
  { action: 'code', label: 'Code', icon: <Code size={16} /> },
]

interface Props {
  value: string
  onChange: (value: string) => void
  label: string
  placeholder?: string
  autoFocus?: boolean
}

export function MarkdownEditor({ value, onChange, label, placeholder, autoFocus }: Props) {
  const id = useId()
  const [tab, setTab] = useState<'write' | 'preview'>('write')
  const box = useRef<HTMLTextAreaElement>(null)

  const apply = (action: FormatAction) => {
    const el = box.current
    if (!el) return
    const next = format({ value, start: el.selectionStart, end: el.selectionEnd }, action)
    onChange(next.value)
    // After React has put the new text in, select what the button left selected.
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(next.start, next.end)
    })
  }

  return (
    <div className="rounded-xl border border-line">
      <div className="flex flex-wrap items-center gap-1 border-b border-line px-1.5 py-1">
        <div className="seg" role="tablist" aria-label={`${label}: write or preview`}>
          {(['write', 'preview'] as const).map((t) => (
            <button key={t} type="button" role="tab" id={`${id}-${t}`} aria-selected={tab === t} aria-controls={`${id}-panel`} onClick={() => setTab(t)}>
              {t === 'write' ? 'Write' : 'Preview'}
            </button>
          ))}
        </div>
        {tab === 'write' && (
          <div className="ml-auto flex flex-wrap" role="toolbar" aria-label="Formatting">
            {TOOLS.map((t) => (
              <button
                key={t.action}
                type="button"
                className="icon-btn size-9"
                aria-label={t.label}
                title={t.keys ? `${t.label} (${navigator.platform?.includes('Mac') ? '⌘' : 'Ctrl+'}${t.keys.toUpperCase()})` : t.label}
                // Keep the text box's selection: the button acts on it.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => apply(t.action)}
              >
                {t.icon}
              </button>
            ))}
          </div>
        )}
      </div>
      <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-${tab}`}>
        {tab === 'write' ? (
          <textarea
            ref={box}
            className="block min-h-48 w-full resize-y bg-transparent px-3.5 py-3 text-[0.9375rem] leading-relaxed focus:outline-none"
            value={value}
            placeholder={placeholder}
            aria-label={label}
            autoFocus={autoFocus}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return
              const tool = TOOLS.find((t) => t.keys === e.key.toLowerCase())
              if (!tool) return
              e.preventDefault()
              apply(tool.action)
            }}
          />
        ) : value.trim() ? (
          <div className="prose-c min-h-48 px-3.5 py-3" dangerouslySetInnerHTML={{ __html: sanitize(markdownHtml(value)) }} />
        ) : (
          <p className="min-h-48 px-3.5 py-3 text-[0.9375rem] text-ink-3">Nothing to preview yet.</p>
        )}
      </div>
      <p className="border-t border-line px-3.5 py-2 text-[0.75rem] text-ink-3">Markdown: **bold**, _italic_, [link](https://…), - lists, &gt; quotes and `code`. Pictures show as links.</p>
    </div>
  )
}
