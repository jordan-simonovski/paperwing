import { useQuery } from '@tanstack/react-query'
import { Check, Loader2, Plus } from 'lucide-react'
import { Link, useParams } from 'react-router'
import { fetchMix, followMix, mixChannel, unfollowMix } from '../lib/mixes'
import { AT_MIX, mixUri, sourceLabel } from '../lib/mixSources'
import { usePrefs } from '../lib/store'

/** A shared mix: what's in it, who made it, and a button to follow it. */
export function MixPage() {
  const { did = '', rkey = '' } = useParams()
  const uri = mixUri(did, rkey)
  const valid = AT_MIX.test(uri)
  const followed = usePrefs((s) => s.followedMixes.find((m) => m.uri === uri))
  const own = usePrefs((s) => s.mixes.find((m) => m.published === uri))
  const found = useQuery({ queryKey: ['mix', uri], queryFn: () => fetchMix(uri), enabled: valid, staleTime: 5 * 60_000, retry: 1 })

  return (
    <div className="wide-col grid place-items-start px-4 py-10 md:px-8">
      <div className="mx-auto w-full max-w-[40rem]">
        <p className="text-[0.8125rem] font-semibold uppercase tracking-wide text-ink-3">PaperWing mix</p>
        {!valid && <p className="mt-3 text-[0.9375rem] text-signal">That isn’t a mix link.</p>}
        {found.isPending && valid && <Loader2 size={20} className="spin mt-4 text-ink-3" />}
        {found.isError && <p className="mt-3 text-[0.9375rem] text-signal">Couldn’t load this mix: {(found.error as Error).message}</p>}
        {found.data && (
          <>
            <h1 className="mt-1 text-[1.875rem] font-bold leading-tight tracking-[-0.02em]">{found.data.mix.name}</h1>
            <p className="mt-1 text-[0.9375rem] text-ink-2">by @{found.data.handle ?? found.data.did}</p>
            {found.data.mix.description && <p className="mt-4 whitespace-pre-line text-[0.9375rem] leading-relaxed">{found.data.mix.description}</p>}
            <h2 className="mt-6 text-[1rem] font-bold">
              What’s in it <span className="num font-normal text-ink-3">{found.data.mix.sources.length}</span>
            </h2>
            <div className="mt-2 flex flex-wrap gap-2">
              {found.data.mix.sources.map((s) => (
                <span key={JSON.stringify(s)} className="chip h-8 px-3 text-[0.875rem]">
                  {sourceLabel(s)}
                </span>
              ))}
            </div>
            <div className="mt-6 flex flex-wrap gap-2">
              {own ? (
                <Link className="btn btn-primary" to={`/mixes/${own.id}`}>
                  This is yours: edit it
                </Link>
              ) : followed ? (
                <>
                  <Link className="btn btn-primary" to={`/t/${mixChannel(followed)}`}>
                    Open
                  </Link>
                  <button className="btn following" onClick={() => unfollowMix(uri)}>
                    <Check size={15} /> Following
                  </button>
                </>
              ) : (
                <button className="btn btn-primary" onClick={() => followMix(uri, found.data!)}>
                  <Plus size={15} /> Follow this mix
                </button>
              )}
            </div>
            <p className="mt-6 text-[0.8125rem] leading-relaxed text-ink-3">
              Mixes live in their author’s own atproto account, not on PaperWing’s server. Following one keeps its sources in your PaperWing, and picks up the author’s edits.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
