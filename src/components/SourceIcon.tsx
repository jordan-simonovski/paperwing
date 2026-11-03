import { Activity, FileText, FolderGit2, Rss, Tag } from 'lucide-react'
import type { SourceMark } from '../lib/channels'
import { useState } from 'react'
import type { Logo as SimpleIcon } from '../lib/logos'
import {
  siArstechnica,
  siArxiv,
  siBluesky,
  siCloudflare,
  siCncf,
  siDatadog,
  siDeepmind,
  siDevdotto,
  siDuckdb,
  siFlydotio,
  siGithub,
  siGo,
  siGoogle,
  siGrafana,
  siHuggingface,
  siInfoq,
  siLemmy,
  siLobsters,
  siMastodon,
  siMeta,
  siMozilla,
  siNetflix,
  siNvidia,
  siOpentelemetry,
  siPlanetscale,
  siPostgresql,
  siPrometheus,
  siRss,
  siRust,
  siStripe,
  siTailscale,
  siTheregister,
  siYcombinator,
} from '../lib/logos'
import { feedMark } from '../lib/sources/kinds'
import type { FeedRef } from '../lib/topics'
import { Pip } from './Pip'
import type { SourceKind, Story } from '../lib/types'
import { feedUrl } from '../lib/sources/http'

// Logos from Simple Icons (CC0) where the brand has one; the site's own favicon otherwise.
const BY_KIND: Partial<Record<SourceKind, SimpleIcon>> = {
  hn: siYcombinator,
  lobsters: siLobsters,
  devto: siDevdotto,
  arxiv: siArxiv,
  hf: siHuggingface,
  github: siGithub,
  release: siGithub,
  bluesky: siBluesky,
  lemmy: siLemmy,
  mastodon: siMastodon,
}

const BY_HOST: [string, SimpleIcon][] = [
  ['deepmind.google', siDeepmind],
  ['research.google', siGoogle],
  ['grafana.com', siGrafana],
  ['prometheus.io', siPrometheus],
  ['opentelemetry.io', siOpentelemetry],
  ['datadoghq.com', siDatadog],
  ['cloudflare.com', siCloudflare],
  ['cncf.io', siCncf],
  ['netflixtechblog.com', siNetflix],
  ['nvidia.com', siNvidia],
  ['stripe.com', siStripe],
  ['go.dev', siGo],
  ['rust-lang.org', siRust],
  ['this-week-in-rust.org', siRust],
  ['fly.io', siFlydotio],
  ['tailscale.com', siTailscale],
  ['duckdb.org', siDuckdb],
  ['planetscale.com', siPlanetscale],
  ['postgresweekly.com', siPostgresql],
  ['arstechnica.com', siArstechnica],
  ['theregister.com', siTheregister],
  ['huggingface.co', siHuggingface],
  ['github.blog', siGithub],
  ['infoq.com', siInfoq],
  ['engineering.fb.com', siMeta],
  ['mozilla.org', siMozilla],
]

const hostOf = (url: string | null | undefined) => {
  try {
    return url ? new URL(url).hostname.replace(/^www\./, '') : undefined
  } catch {
    return undefined
  }
}

function brandFor(host: string): SimpleIcon | undefined {
  return BY_HOST.find(([h]) => host === h || host.endsWith(`.${h}`))?.[1]
}

/** Relative luminance of a brand hex, to keep near-black logos visible in dark mode and pale ones in light. */
function luminance(hex: string): number {
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function Logo({ icon, size, mono, title }: { icon: SimpleIcon; size: number; mono?: boolean; title?: string }) {
  const l = luminance(icon.hex)
  const cls = `logo${mono ? '' : l < 0.03 ? ' logo-dark' : l > 0.55 ? ' logo-light' : ''}`
  return (
    <svg
      className={cls}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      style={mono ? undefined : ({ '--brand': `#${icon.hex}` } as React.CSSProperties)}
      aria-hidden={!title}
      role={title ? 'img' : undefined}
    >
      {title && <title>{title}</title>}
      <path d={icon.path} fill="currentColor" />
    </svg>
  )
}

/** Tries each host in turn (a feed's site, then the link's own host), then falls back to the RSS glyph. */
function Favicon({ hosts, size }: { hosts: string[]; size: number }) {
  const [tried, setTried] = useState(0)
  const host = hosts[tried]
  if (!host) return <Logo icon={siRss} size={size} mono />
  return <img key={host} className="favicon" src={feedUrl('icon', { d: host })} width={size} height={size} alt="" loading="lazy" decoding="async" onError={() => setTried((n) => n + 1)} />
}

interface Props {
  source: SourceKind
  /** Publisher host for feed items; falls back to the story's link. */
  site?: string
  url?: string | null
  size?: number
  /** Ink instead of the brand colour, for dense or decorative spots. */
  mono?: boolean
}

export function SourceIcon({ source, site, url, size = 14, mono }: Props) {
  const kind = BY_KIND[source]
  if (kind) return <Logo icon={kind} size={size} mono={mono} />
  // Frontpage has no Simple Icons logo; its own favicon, not the linked site's.
  if (source === 'frontpage') return <Favicon key="frontpage.fyi" hosts={['frontpage.fyi']} size={size} />
  const linkHost = source === 'rss' ? hostOf(url) : undefined
  const host = site ?? linkHost
  if (!host) return <Logo icon={siRss} size={size} mono />
  const brand = brandFor(host)
  if (brand) return <Logo icon={brand} size={size} mono={mono} />
  const hosts = linkHost && linkHost !== host ? [host, linkHost] : [host]
  return <Favicon key={hosts.join()} hosts={hosts} size={size} />
}

export function StoryIcon({ story, size, mono }: { story: Pick<Story, 'source' | 'site' | 'url'> & { sourceLabel?: string }; size?: number; mono?: boolean }) {
  // A PaperWing submission is a Bluesky post, but it's shown as PaperWing's own.
  if (story.sourceLabel === 'PaperWing')
    return (
      <span className="inline-block flex-none" style={{ width: size ?? 14, height: size ?? 14 }}>
        <Pip variant="head" className="block size-full" />
      </span>
    )
  return <SourceIcon source={story.source} site={story.site} url={story.url} size={size} mono={mono} />
}

/** The logo for a feed before any of its stories have loaded. */
export function FeedIcon({ feed, size = 14 }: { feed: FeedRef; size?: number }) {
  const mark = feedMark(feed)
  if ('source' in mark) return <SourceIcon source={mark.source} site={mark.site} size={size} />
  if (mark.own === 'status') return <Activity size={size} aria-hidden />
  return (
    <span className="inline-block flex-none" style={{ width: size, height: size }}>
      <Pip variant="head" className="block size-full" />
    </span>
  )
}

/** PaperWing's own mark at icon size: Pip's head. */
export function PaperwingIcon({ size = 16 }: { size?: number }) {
  return (
    <span className="inline-block flex-none" style={{ width: size, height: size }} aria-hidden>
      <Pip variant="head" className="block size-full" />
    </span>
  )
}

/** A source channel's mark, wherever source channels are listed (the sidebar, Explore, the command bar). */
export function SourceChannelIcon({ mark, size = 16 }: { mark: SourceMark; size?: number }) {
  switch (mark) {
    case 'paperwing':
      return <PaperwingIcon size={size} />
    case 'status':
      return <Activity size={size} aria-hidden />
    case 'papers':
      return <FileText size={size} aria-hidden />
    case 'projects':
      return <FolderGit2 size={size} aria-hidden />
    case 'releases':
      return <Tag size={size} aria-hidden />
    case 'blogs':
      return <Rss size={size} aria-hidden />
    default:
      return <SourceIcon source={mark} size={size} />
  }
}
