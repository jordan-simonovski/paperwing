import { useAtproto } from '../lib/atproto'
import { boardParts, useBoard } from '../lib/boards'
import { canPost } from '../lib/social'
import { usePrefs } from '../lib/store'
import { TOPICS } from '../lib/topics'

// Where a listing goes on PaperWing: no board, one of your community boards, or a topic board. On a
// community board, a tick puts it on the front page too. Shared by sharing a link and writing a post.

/** Whether you can't post on this board (only its moderators do), and its name. */
export function useBoardShut(board: string): { shut: boolean; name?: string } {
  const parts = board.startsWith('at://') ? boardParts(board) : undefined
  const { data: picked } = useBoard(parts?.did, parts?.rkey)
  const me = useAtproto((a) => a.did)
  // Every official board is moderators-only: say so rather than fail.
  return { shut: !!picked && !canPost(picked, picked.owner, me ?? '', !!picked.official), name: picked?.name }
}

interface Props {
  board: string
  onBoard: (board: string) => void
  front: boolean
  onFront: (front: boolean) => void
}

export function BoardPicker({ board, onBoard, front, onFront }: Props) {
  const joinedBoards = usePrefs((p) => p.boards)
  const { shut, name } = useBoardShut(board)
  return (
    <>
      <select className="input h-10" value={board} onChange={(e) => onBoard(e.target.value)} aria-label="Board">
        <option value="">No board, just PaperWing</option>
        {joinedBoards.length > 0 && (
          <optgroup label="Your community boards">
            {joinedBoards.map((b) => (
              <option key={b.uri} value={b.uri}>
                {b.name}
              </option>
            ))}
          </optgroup>
        )}
        <optgroup label="Topic boards">
          {TOPICS.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </optgroup>
      </select>
      {shut && <p className="mt-2 text-[0.8125rem] text-ink-3">Only its moderators post on {name}.</p>}
      {board.startsWith('at://') && !shut && (
        <label className="mt-2.5 flex items-center gap-3">
          <input type="checkbox" className="size-4 accent-[var(--ink)]" checked={front} onChange={(e) => onFront(e.target.checked)} />
          <span className="text-[0.875rem]">Also on PaperWing’s front page</span>
        </label>
      )}
    </>
  )
}
