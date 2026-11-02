import { EyeOff, UserX } from 'lucide-react'
import { useAtproto } from '../lib/atproto'
import { hideFromBoard, keepOut, useCurrentBoard } from '../lib/boards'
import type { Story } from '../lib/types'
import { toast } from '../lib/ui'

/** On a community board, its moderators can hide a listing, and its owner can keep the poster out. */
export function ModerateOnBoard({ story }: { story: Story }) {
  const board = useCurrentBoard()
  const me = useAtproto((a) => a.did)
  if (!board || !me || !story.ref?.uri) return null
  const isMod = me === board.owner || board.moderators.includes(me)
  if (!isMod) return null
  const author = story.authorDid
  const hide = () => {
    if (!window.confirm(`Hide this listing from ${board.name}? It stays on Bluesky; it just won’t show on the board.`)) return
    void hideFromBoard(board.uri, story.ref!.uri).then(
      () => toast(`Hidden from ${board.name}`),
      (err: Error) => toast(err.message, { tone: 'error' }),
    )
  }
  const block = () => {
    if (!board.blockList || !author) return
    if (!window.confirm(`Keep @${story.author} out of ${board.name}? Their listings stop showing here. You can undo it from the moderation list in Bluesky.`)) return
    void keepOut(board.blockList, author).then(
      () => toast(`@${story.author} is kept out of ${board.name}`),
      (err: Error) => toast(err.message, { tone: 'error' }),
    )
  }
  return (
    <>
      <button className="pill" onClick={hide} title={`As a moderator of ${board.name}`}>
        <EyeOff size={14} /> Hide from board
      </button>
      {me === board.owner && board.blockList && author && author !== me && (
        <button className="pill" onClick={block} title={`As the owner of ${board.name}`}>
          <UserX size={14} /> Keep out
        </button>
      )}
    </>
  )
}
