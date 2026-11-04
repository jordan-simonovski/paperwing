import { parseChannelId } from './channelId'
import type { Channel } from './channels'
import { isPrivateAddress } from './publishers'
import { AT_MIX } from './mixSources'
import type { Mix } from './store'
import type { SortMode, StoryKind } from './rank'
import type { SourceKind } from './types'

export interface ChannelView {
  sort: SortMode
  variant?: string
  sourceFilter?: SourceKind
  kindFilter?: StoryKind
}

/** A recipient can open this without the sender's saved preferences or an open story. */
export function channelShare(channel: Channel, view: ChannelView, mixes: Mix[] = []): { path?: string; note?: string; edit?: string } {
  const address = parseChannelId(channel.id)
  if (!address) return { note: 'This feed does not have a shareable link.' }
  if (address.kind === 'mix') {
    const mix = mixes.find((m) => m.id === address.id)
    const published = mix?.published?.match(AT_MIX)
    return published
      ? { path: `/mix/${encodeURIComponent(published[1])}/${encodeURIComponent(published[2])}` }
      : { note: 'Publish this mix to give it a link other people can open.', edit: `/mixes/${encodeURIComponent(address.id)}` }
  }
  if (address.kind === 'followedMix') return { path: `/mix/${encodeURIComponent(address.did)}/${encodeURIComponent(address.rkey)}` }
  if (address.kind === 'feed' && isPrivateAddress(address.url)) return { note: 'This feed’s address contains private access details, so it cannot be shared.' }

  const path =
    address.kind === 'board'
      ? `/c/${encodeURIComponent(address.did)}/${encodeURIComponent(address.rkey)}`
      : address.kind === 'person'
        ? `/u/${encodeURIComponent(address.actor)}`
        : `/t/${encodeURIComponent(channel.id)}`
  const params = new URLSearchParams({ sort: view.sort })
  if (view.variant) params.set('v', view.variant)
  if (view.sourceFilter) params.set('src', view.sourceFilter)
  if (view.kindFilter) params.set('kind', view.kindFilter)
  if (address.kind === 'feed' && channel.feeds[0]?.kind === 'standard') params.set('format', 'standard')
  const personal = ['for-you', 'blogs', 'lemmy', 'releases', 'status'].includes(channel.id) || view.variant === 'following'
  return { path: `${path}?${params}`, note: personal ? 'This opens each reader’s own version of this feed, using their follows and settings.' : 'Anyone with this link can open it in PaperWing.' }
}
