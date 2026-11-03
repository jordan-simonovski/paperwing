import { ExternalLink, Loader2, Play } from 'lucide-react'
import { useState } from 'react'
import { frameProps, peertubeVideo, videoEmbedOf, videoHost, type PlayableVideo } from '../lib/videoEmbed'
import { Covered } from './Covered'

type State = { at: 'poster' } | { at: 'loading' } | { at: 'frame' } | { at: 'file'; video: PlayableVideo } | { at: 'failed'; message: string }

/**
 * A video the story links to (YouTube, Vimeo or PeerTube), played here on a tap. Until then it's a
 * picture and a play button: no player, script or cookie from anywhere else. Nothing for other links.
 */
export function VideoEmbed({ url, title, thumb }: { url: string | null | undefined; title: string; thumb?: string }) {
  const video = videoEmbedOf(url)
  const [state, setState] = useState<State>({ at: 'poster' })
  if (!video || !url) return null
  const from = videoHost(video)

  const play = async () => {
    if (video.kind !== 'peertube') return setState({ at: 'frame' })
    setState({ at: 'loading' })
    try {
      setState({ at: 'file', video: await peertubeVideo(video) })
    } catch (err) {
      setState({ at: 'failed', message: (err as Error).message })
    }
  }

  const aspect = state.at === 'file' ? (state.video.aspect ?? 16 / 9) : 16 / 9
  return (
    <figure className="mt-5">
      <div className="media-frame relative w-full overflow-hidden" style={{ aspectRatio: aspect }}>
        {state.at === 'frame' && video.kind !== 'peertube' ? (
          <iframe className="absolute inset-0 h-full w-full border-0" {...frameProps(video, title)} />
        ) : state.at === 'file' ? (
          <Covered warning={state.video.sensitive ? 'Its uploader marked this video sensitive' : undefined} className="absolute inset-0">
            <video className="absolute inset-0 h-full w-full bg-black" src={state.video.src} poster={state.video.poster} controls playsInline autoPlay={!state.video.sensitive} aria-label={title} />
          </Covered>
        ) : state.at === 'failed' ? (
          <div className="absolute inset-0 grid place-items-center bg-sunk p-6 text-center">
            <div>
              <p className="text-[0.9375rem]">{state.message}</p>
              <a className="btn mt-3" href={url} target="_blank" rel="noopener noreferrer">
                <ExternalLink size={14} /> Watch on {from}
              </a>
            </div>
          </div>
        ) : (
          <button type="button" className="absolute inset-0 block h-full w-full bg-sunk" onClick={() => void play()} aria-label={`Play ${title} from ${from}`} disabled={state.at === 'loading'}>
            {thumb && <img src={thumb} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" className="h-full w-full object-cover" />}
            <span className="absolute inset-0 grid place-items-center">
              <span className="grid size-16 place-items-center rounded-full bg-ink/75 text-ground">
                {state.at === 'loading' ? <Loader2 size={26} className="spin" /> : <Play size={26} fill="currentColor" aria-hidden />}
              </span>
            </span>
          </button>
        )}
      </div>
      {state.at === 'poster' && (
        <figcaption className="mt-1.5 text-[0.8125rem] text-ink-3">
          Plays from {from} when you press play{video.kind === 'youtube' ? ', in its privacy-enhanced player' : video.kind === 'vimeo' ? ', asking it not to track you' : ''}.
        </figcaption>
      )}
    </figure>
  )
}
