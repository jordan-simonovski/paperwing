import type { Story } from './types'
import { videoEmbedOf } from './videoEmbed'

/**
 * A story's path on PaperWing, as shared. A story that links to an article opens on the article:
 * whoever follows a shared link wants the thing itself first, and every discussion of it is a tab
 * away. A post of its own (no link) or a video (its player sits above the tabs) opens as usual.
 */
export function storyPath(story: Pick<Story, 'key' | 'url'>): string {
  const article = !!story.url && !videoEmbedOf(story.url)
  return `/t/for-you/${story.key}${article ? '?tab=article' : ''}`
}
