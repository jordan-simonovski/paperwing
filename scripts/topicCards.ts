import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { createElement } from 'react'
import { Layers, Users, Search, Rss, type LucideIcon } from 'lucide-react'
import { renderToStaticMarkup } from 'react-dom/server'
import { openSync, type Font } from 'fontkit'
import { Resvg } from '@resvg/resvg-js'
import type { Plugin } from 'vite'
import { TOPICS, CLUSTERS, type Topic } from '../src/lib/topics'
import { topicIcon } from '../src/lib/topicIcons'
import { TOPIC_CARD_SIZE, topicImagePath, channelImagePath, type ChannelArtwork } from '../src/lib/topicCard'

const require = createRequire(import.meta.url)
interface Artwork extends Pick<Topic, 'id' | 'label' | 'blurb' | 'hue'> {
  cluster?: Topic['cluster']
  category?: string
  icon?: LucideIcon
}
export const CHANNEL_ARTWORK: (Artwork & { id: ChannelArtwork })[] = [
  { id: 'mix', label: 'A little of everything.', blurb: 'Hand-picked sources. One lovely place to read.', hue: 285, category: 'Mixes', icon: Layers },
  { id: 'board', label: 'Good company.', blurb: 'Find your people. Share something worth reading.', hue: 160, category: 'Communities', icon: Users },
  { id: 'discover', label: 'Follow your curiosity.', blurb: 'There is always something new to discover.', hue: 38, category: 'Discover', icon: Search },
  { id: 'feed', label: 'Your next good read.', blurb: 'Fresh stories from the sources you love.', hue: 210, category: 'Feeds', icon: Rss },
]

/** Font outlines make rendering independent of system fonts and browser installations. */
export function createTopicRenderer(root = process.cwd()) {
  const font = openSync(require.resolve('@fontsource-variable/atkinson-hyperlegible-next/files/atkinson-hyperlegible-next-latin-wght-normal.woff2')) as Font
  const body = font
  const heading = font
  const brand = openSync(require.resolve('@fontsource-variable/fraunces/files/fraunces-latin-full-normal.woff2')) as Font
  const source = readFileSync(resolve(root, 'design/readout-mascot-icon.svg'), 'utf8')
  const mark = source
    .replace(/^[\s\S]*?<svg[^>]*>/, '')
    .replace(/<\/svg>\s*$/, '')
    .replace(/<title[\s\S]*?<\/title>|<desc[\s\S]*?<\/desc>/g, '')
    .replace(/#d62f35/gi, '#d2161e')
  const viewBox = source.match(/viewBox="([^"]+)"/)![1]
  const width = (text: string, font: Font, size: number) => (font.layout(text).advanceWidth * size) / font.unitsPerEm
  const text = (value: string, font: Font, size: number, x: number, y: number, fill: string) => {
    const run = font.layout(value)
    let pen = 0
    const paths = run.glyphs
      .map((glyph, i) => {
        if (glyph.id === 0) throw new Error(`Missing glyph in topic artwork: ${value}`)
        const pos = run.positions[i]
        const path = `<path transform="translate(${pen + pos.xOffset} ${pos.yOffset})" d="${glyph.path.toSVG()}"/>`
        pen += pos.xAdvance
        return path
      })
      .join('')
    return `<g fill="${fill}" transform="translate(${x} ${y}) scale(${size / font.unitsPerEm} ${-size / font.unitsPerEm})">${paths}</g>`
  }
  const wrap = (value: string, font: Font, size: number, max: number) => {
    const lines: string[] = []
    for (const word of value.split(/\s+/)) {
      const last = lines.length - 1
      if (last >= 0 && width(`${lines[last]} ${word}`, font, size) <= max) lines[last] += ` ${word}`
      else lines.push(word)
    }
    return lines
  }
  const svg = (topic: Artwork) => {
    let size = 80
    let title = wrap(topic.label, heading, size, 730)
    const fitsTitle = () => title.length <= 2 && title.every((line) => width(line, heading, size) <= 730)
    while (!fitsTitle() && size > 60) title = wrap(topic.label, heading, (size -= 4), 730)
    const description = wrap(topic.blurb, body, 32, 710)
    if (!fitsTitle() || description.length > 3 || description.some((line) => width(line, body, 32) > 710)) throw new Error(`Topic text cannot fit: ${topic.id}`)
    const hue = Number(topic.hue)
    if (!Number.isFinite(hue)) throw new Error(`Invalid topic hue: ${topic.id}`)
    const accent = `hsl(${hue}, 68%, 76%)`
    const icon = renderToStaticMarkup(createElement(topic.icon ?? topicIcon(topic.id), { size: 224, color: accent, strokeWidth: 1.25 }))
    const cluster = topic.category ?? CLUSTERS[topic.cluster!].label
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${TOPIC_CARD_SIZE.width}" height="${TOPIC_CARD_SIZE.height}" viewBox="0 0 1200 630">
<rect width="1200" height="630" fill="#10151d"/>
<rect width="1200" height="10" fill="${accent}"/>
<svg x="66" y="46" width="68" height="68" viewBox="${viewBox}">${mark}</svg>
${text('PaperWing', brand, 44, 150, 99, '#ffffff')}
${text(cluster, body, 28, 1128 - width(cluster, body, 28), 94, accent)}
<rect x="844" y="186" width="284" height="284" rx="60" fill="${accent}" fill-opacity="0.09"/>
<g transform="translate(874 216)">${icon}</g>
${title.map((line, i) => text(line, heading, size, 72, 234 + i * 88, '#ffffff')).join('')}
${description.map((line, i) => text(line, body, 32, 72, 286 + (title.length - 1) * 88 + i * 42, '#c9d0da')).join('')}
${text('Find your next good read.', body, 28, 72, 560, '#c9d0da')}
${text('paperwing.io', body, 28, 1128 - width('paperwing.io', body, 28), 560, accent)}
</svg>`
  }
  return { svg, png: (topic: Artwork) => new Resvg(svg(topic), { font: { loadSystemFonts: false } }).render().asPng() }
}

/** Emits only build assets. Neither renderer nor its dependencies reach the app or API bundle. */
export function topicCards(): Plugin {
  let root: string
  return {
    name: 'topic-cards',
    apply: 'build',
    configResolved(config) {
      root = config.root
    },
    generateBundle() {
      const render = createTopicRenderer(root)
      for (const topic of TOPICS) this.emitFile({ type: 'asset', fileName: topicImagePath(topic.id).slice(1), source: render.png(topic) })
      for (const card of CHANNEL_ARTWORK) this.emitFile({ type: 'asset', fileName: channelImagePath(card.id).slice(1), source: render.png(card) })
    },
  }
}
