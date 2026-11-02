import { useEffect } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router'
import { toggleSaved } from '../components/StoryRow'
import { useLibrary } from '../lib/library'
import { linkKey, storyFromKey } from '../lib/sources'
import { postLink } from '../lib/compose'

/**
 * Web Share Target and bookmarklet landing: the link is saved to your queue and opens in the reader.
 * `?read=1` opens it without saving; `?post=1` opens "Post a link" with it, over PaperWing's front page.
 */
export function SharePage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  // Android often puts the URL in `text` rather than `url`.
  const candidates = [params.get('url'), ...(params.get('text') ?? '').split(/\s+/)]
  const url = candidates.find((c) => !!c && /^https?:\/\//.test(c))
  const title = params.get('title')?.trim()
  const justRead = params.get('read') === '1'
  const post = params.get('post') === '1'

  useEffect(() => {
    if (post) {
      postLink({ url: url ?? undefined, title: title || undefined })
      navigate('/t/paperwing', { replace: true })
      return
    }
    if (!url) return
    const key = linkKey(url)
    if (!justRead) {
      const ready = useLibrary.getState().ready ? Promise.resolve() : useLibrary.getState().load()
      void ready.then(() => {
        const story = storyFromKey(key)!
        if (!useLibrary.getState().items[key]) void toggleSaved({ ...story, title: title || story.title })
      })
    }
    navigate(`/saved/${key}?tab=article`, { replace: true })
  }, [url, title, justRead, post, navigate])

  if (!url && !post) return <Navigate to="/t/for-you" replace />
  return null
}
