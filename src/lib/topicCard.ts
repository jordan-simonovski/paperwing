/** Shared by the build renderer and the metadata endpoint; topic artwork is always a static PNG. */
export const TOPIC_CARD_SIZE = { width: 1200, height: 630 }
export const topicImagePath = (id: string) => `/og/topics/${encodeURIComponent(id)}.png`

export type ChannelArtwork = 'mix' | 'board' | 'discover' | 'feed'
export const channelImagePath = (kind: ChannelArtwork) => `/og/channels/${kind}.png`
