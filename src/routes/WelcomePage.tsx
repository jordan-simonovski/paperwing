import { ArrowLeft, Bookmark, Check, Code2, ExternalLink, Heart, Highlighter, KeyRound, Layers, Loader2, MessageSquareQuote, Plus, Rss, Send, UserPlus, Users, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { BlueskyAccount } from '../components/BlueskyAccount'
import { FeedFinder } from '../components/FollowBlogs'
import { HnAccount } from '../components/HnAccount'
import { LemmyAccount } from '../components/LemmyAccount'
import { MastodonSettings } from '../components/MastodonSettings'
import { Pip } from '../components/Pip'
import { RestoreSync } from '../components/RestoreSync'
import { PaperwingIcon, SourceIcon } from '../components/SourceIcon'
import { SummarySettings } from '../components/SummarySettings'
import { STEPS, useOnboarding, type Step } from '../lib/onboarding'
import { createSyncPasskey, useSyncReadiness } from '../lib/passkey'
import { usePrefs } from '../lib/store'
import { joinSync, useSync } from '../lib/sync'
import { signedInAs, useAccounts } from '../lib/accounts'
import { CLUSTERS, TOPICS, type ClusterId } from '../lib/topics'
import { toast } from '../lib/ui'

// The first thing a new install sees: a short tour that ends in a feed that's already yours.
// Pick topics, add your own sites, see how For you is ordered, sign in where you post (or don't),
// and learn the three things people miss: sharing everywhere at once, saving for offline, and
// bringing your own AI key. Every step but the topics can be skipped, and it all lives in Settings.

const GENERAL = (Object.keys(CLUSTERS) as ClusterId[]).filter((c) => CLUSTERS[c].pack === 'general')
const TECH = (Object.keys(CLUSTERS) as ClusterId[]).filter((c) => CLUSTERS[c].pack === 'tech')
const SECTIONS: { label: string; blurb: string; clusters: ClusterId[] }[] = [
  ...GENERAL.map((c) => ({ label: CLUSTERS[c].label, blurb: CLUSTERS[c].blurb, clusters: [c] })),
  { label: 'Tech', blurb: 'Where PaperWing started: AI, systems, code and the industry', clusters: TECH },
]

const FEED_URL = 'https://bsky.app/profile/paperwing.io/feed/paperwing'
const NEW_FEED_URL = 'https://bsky.app/profile/paperwing.io/feed/paperwing-new'

function Heading({ kicker, title, children }: { kicker: string; title: string; children?: React.ReactNode }) {
  return (
    <header>
      <p className="text-[0.8125rem] font-semibold uppercase tracking-[0.08em] text-ink-3">{kicker}</p>
      <h1 className="mt-2 text-[1.875rem] font-bold leading-[1.1] tracking-[-0.02em] md:text-[2.125rem]">{title}</h1>
      {children && <div className="mt-3 max-w-xl space-y-2 text-[0.9375rem] leading-relaxed text-ink-2">{children}</div>}
    </header>
  )
}

/** One idea, with an icon: the tour's explanations are lists of these. */
function Point({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3.5 rounded-[18px] bg-panel p-4">
      <span className="grid size-9 flex-none place-items-center rounded-full bg-sunk text-ink-2">{icon}</span>
      <div className="min-w-0">
        <p className="text-[0.9375rem] font-semibold">{title}</p>
        <div className="mt-0.5 text-[0.875rem] leading-relaxed text-ink-2">{children}</div>
      </div>
    </div>
  )
}

function Hello() {
  const set = usePrefs((p) => p.set)
  const navigate = useNavigate()
  return (
    <>
      <Pip className="h-16 w-auto" />
      <div className="mt-5">
        <Heading kicker="Welcome to PaperWing" title="The open web’s news, in one reader">
          <p>
            Hacker News, Lemmy, Bluesky, Mastodon, Lobsters and the publishers you trust, ranked together in one feed that learns what you like. No account needed: your topics, votes and saved stories
            live on this device.
          </p>
        </Heading>
      </div>
      <RestoreSync
        onRestored={() => {
          // The sync brought your topics: straight in. If it held none, pick some here.
          if (usePrefs.getState().followed.length) {
            set({ welcomed: true })
            useOnboarding.getState().go('hello')
            toast('Welcome back: your PaperWing is restored')
            navigate('/t/for-you', { replace: true })
          } else {
            toast('Synced. Pick some topics to finish.')
            useOnboarding.getState().go('topics')
          }
        }}
      />
      <p className="mt-4 text-[0.8125rem] text-ink-3">
        Free, open source, and no ads, analytics or tracking.{' '}
        <Link to="/principles" className="underline underline-offset-2">
          What PaperWing stands for
        </Link>
        {' · '}
        <Link to="/privacy" className="underline underline-offset-2">
          Privacy
        </Link>
        {' · '}
        <Link to="/terms" className="underline underline-offset-2">
          Terms
        </Link>
      </p>
    </>
  )
}

function Topics() {
  const { set, followed, interests, addInterest } = usePrefs()
  const [draft, setDraft] = useState('')
  const toggle = (id: string) => set({ followed: followed.includes(id) ? followed.filter((x) => x !== id) : [...followed, id] })
  return (
    <>
      <Heading kicker="Step 1: your topics" title="What do you want to read about?">
        <p>Pick a few. Each one pulls from publishers, Lemmy communities, Bluesky feeds and Mastodon hashtags, and For you ranks them together. Change them any time under Explore.</p>
      </Heading>

      {SECTIONS.map((s) => (
        <section key={s.label} className="mt-8">
          <div className="flex flex-wrap items-baseline gap-x-3">
            <h2 className="text-[1.125rem] font-bold">{s.label}</h2>
            <span className="text-[0.875rem] text-ink-3">{s.blurb}</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {TOPICS.filter((t) => s.clusters.includes(t.cluster)).map((t) => {
              const on = followed.includes(t.id)
              return (
                <button
                  key={t.id}
                  className={`chip topic h-10 gap-1.5 px-4 text-[0.9375rem] ${on ? 'following font-semibold' : ''}`}
                  style={{ '--h': t.hue } as React.CSSProperties}
                  aria-pressed={on}
                  title={t.blurb}
                  onClick={() => toggle(t.id)}
                >
                  {on ? <Check size={15} /> : <Plus size={15} />}
                  {t.label}
                </button>
              )
            })}
          </div>
        </section>
      ))}

      <section className="mt-8">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h2 className="text-[1.125rem] font-bold">Anything else</h2>
          <span className="text-[0.875rem] text-ink-3">A team, a band, a place, a hobby: anything you can search for becomes a feed</span>
        </div>
        <form
          className="mt-3 flex max-w-md gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (draft.trim()) addInterest(draft)
            setDraft('')
          }}
        >
          <input className="input" placeholder="e.g. Murray-Darling, Liverpool FC, sourdough" value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="Your own interest" />
          <button className="btn h-9 flex-none">Add</button>
        </form>
        {interests.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {interests.map((i) => (
              <span key={i.id} className="chip following h-9 gap-1.5 pl-4 pr-2 text-[0.9375rem]">
                {i.label}
                <button
                  className="icon-btn size-6"
                  aria-label={`Remove ${i.label}`}
                  onClick={() => set({ interests: interests.filter((x) => x.id !== i.id), followed: usePrefs.getState().followed.filter((f) => f !== i.id) })}
                >
                  <X size={13} />
                </button>
              </span>
            ))}
          </div>
        )}
      </section>
    </>
  )
}

function Feeds() {
  const feeds = usePrefs((p) => p.customFeeds)
  return (
    <>
      <Heading kicker="Step 2: your own sites" title="Follow any site that publishes">
        <p>PaperWing is an RSS reader at heart. Your topics already pull from publishers’ feeds; add any blog, newsletter or news site of your own and its new posts land in Blogs, next to them.</p>
        <p>Paste the site’s address, one of its posts, or the feed itself. PaperWing finds the feed for you.</p>
      </Heading>
      <div className="mt-6 max-w-lg rounded-[18px] bg-panel p-5">
        {feeds.length > 0 && (
          <ul className="mb-3 space-y-1">
            {feeds.map((f) => (
              <li key={f.url} className="flex items-center gap-2 text-[0.9375rem]">
                <Rss size={14} className="flex-none text-ink-3" />
                <span className="truncate font-semibold">{f.label}</span>
              </li>
            ))}
          </ul>
        )}
        <FeedFinder />
      </div>
      <p className="mt-4 max-w-xl text-[0.8125rem] text-ink-3">
        Coming from another reader? Import its OPML file under Settings, Sources, Your feeds. And it works the other way too: every topic, board, mix and profile here has an RSS feed of its own, so
        nothing only works inside PaperWing.
      </p>
      <p className="mt-2 max-w-xl text-[0.8125rem] text-ink-3">
        Later: in the reader, Follow and Add to mix appear beside any story whose site has a feed, and Settings suggests blogs you keep opening.
      </p>
    </>
  )
}

function Ranking() {
  const order = usePrefs((p) => p.feedOrder)
  const set = usePrefs((p) => p.set)
  return (
    <>
      <Heading kicker="Step 3: how For you works" title="No black box. Here’s the whole recipe.">
        <p>For you is ordered in your browser, from rules you can read. No server decides what you see, and nothing is optimised for time spent.</p>
      </Heading>
      <div className="mt-6 grid gap-3 md:grid-cols-2">
        <Point icon={<span className="font-bold">1</span>} title="Engagement, on one scale">
          A good day on Lemmy and a good day on Hacker News count the same: each network is measured against what’s normal there. On social networks, replies count for more than likes, so a
          conversation beats a celebrity one-liner.
        </Point>
        <Point icon={<span className="font-bold">2</span>} title="Fresh beats stale">
          Like Hacker News, a story sinks as it ages. A big story stays up for a while; a quiet new one still gets its turn.
        </Point>
        <Point icon={<span className="font-bold">3</span>} title="One story, one row">
          The same link on several networks becomes one row with all of their discussions, and their engagement adds up. Different outlets covering the same event are grouped too.
        </Point>
        <Point icon={<span className="font-bold">4</span>} title="No one source takes over">
          Each extra story from the same site or network has to earn its place a little more than the last, so the feed stays mixed.
        </Point>
        <Point icon={<span className="font-bold">5</span>} title="It learns from you, on your device">
          Upvotes, saves, hides and “more” or “fewer like this” teach it which topics, sites and subjects you care about. That profile stays on this device (and in your encrypted sync).
        </Point>
        <Point icon={<span className="font-bold">6</span>} title="You set the limits">
          Stories you’ve scrolled past sink. Mute words, content warnings and Bluesky labelers live in Settings, and any feed can be sorted by top or spiciest instead.
        </Point>
      </div>
      <section className="mt-6 max-w-xl rounded-[18px] bg-panel p-5">
        <h2 className="text-[1.0625rem] font-bold">Prefer a plain timeline?</h2>
        <p className="mt-1 text-[0.875rem] leading-relaxed text-ink-2">
          Latest skips the recipe: every source’s newest posts, newest first. Pick how feeds open; the other is always one tap away at the top of any feed.
        </p>
        <div className="seg mt-3 w-fit" role="radiogroup" aria-label="How feeds open">
          {(
            [
              ['ranked', 'Ranked'],
              ['latest', 'Latest'],
            ] as const
          ).map(([id, label]) => (
            <button key={id} role="radio" aria-checked={order === id} aria-pressed={order === id} onClick={() => set({ feedOrder: id })}>
              {label}
            </button>
          ))}
        </div>
      </section>
    </>
  )
}

function AccountCard({ id, name, signedIn, children }: { id: 'bluesky' | 'hn' | 'mastodon' | 'lemmy'; name: string; signedIn: string | undefined; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-[18px] bg-panel">
      <button className="flex w-full items-center gap-3 px-4 py-3.5 text-left" onClick={() => setOpen(!open)} aria-expanded={open}>
        <SourceIcon source={id} size={18} />
        <span className="flex-1 text-[0.9375rem] font-semibold">{name}</span>
        {signedIn ? (
          <span className="flex items-center gap-1 text-[0.8125rem] text-ink-2">
            <Check size={14} /> {signedIn}
          </span>
        ) : (
          <span className="text-[0.8125rem] text-ink-3">{open ? 'Close' : 'Sign in'}</span>
        )}
      </button>
      {open && <div className="border-t border-line px-4 pb-4 pt-3">{children}</div>}
    </div>
  )
}

function Accounts() {
  // Signed in means a sign-in that still works, as everywhere else in the app: a remembered name alone isn't one.
  const accounts = useAccounts()
  return (
    <>
      <Heading kicker="Step 4: your accounts (optional)" title="Vote and reply where the conversation is">
        <p>Reading never needs an account. Sign in to upvote, comment and post on each network from here. Sign-ins stay on this device and only go to that network.</p>
      </Heading>
      <div className="mt-6 max-w-2xl space-y-2.5">
        <AccountCard id="bluesky" name="Bluesky" signedIn={signedInAs(accounts, 'bluesky')}>
          <BlueskyAccount />
        </AccountCard>
        <AccountCard id="hn" name="Hacker News" signedIn={signedInAs(accounts, 'hn')}>
          <HnAccount />
        </AccountCard>
        <AccountCard id="mastodon" name="Mastodon" signedIn={signedInAs(accounts, 'mastodon')}>
          <MastodonSettings />
        </AccountCard>
        <AccountCard id="lemmy" name="Lemmy" signedIn={signedInAs(accounts, 'lemmy')}>
          <LemmyAccount />
        </AccountCard>
      </div>
      <p className="mt-4 max-w-xl text-[0.8125rem] text-ink-3">Skip this and sign in later under Settings, Sources.</p>
    </>
  )
}

function Sharing() {
  return (
    <>
      <Heading kicker="Step 5: sharing" title="Post once, everywhere you are">
        <p>Found something worth talking about? Share it from PaperWing to every network you’re signed in to, in one go.</p>
      </Heading>
      <div className="mt-6 grid gap-3 md:grid-cols-2">
        <Point icon={<Send size={16} />} title="Cross-post in one step">
          One title and your take, a tick for each place: Bluesky, Mastodon, Hacker News and a Lemmy community. Each gets the right format and length.
        </Point>
        <Point icon={<PaperwingIcon size={16} />} title="List it on PaperWing">
          Share to Bluesky and tick “List it on PaperWing”: your post goes on PaperWing’s front page and topic boards. Its likes are the votes and its replies are the comments. It lives in your own
          Bluesky account, so there’s no new account and nothing to lose.
        </Point>
        <Point icon={<SourceIcon source="bluesky" size={16} />} title="PaperWing, right inside Bluesky">
          The front page is also a pair of Bluesky feeds: PaperWing (what’s hot) and PaperWing New. Pin them in the Bluesky app and you can read and vote from there too.
          <span className="mt-2 flex flex-wrap gap-2">
            <a className="btn h-8 text-[0.8125rem]" href={FEED_URL} target="_blank" rel="noopener noreferrer">
              PaperWing feed <ExternalLink size={13} />
            </a>
            <a className="btn h-8 text-[0.8125rem]" href={NEW_FEED_URL} target="_blank" rel="noopener noreferrer">
              PaperWing New <ExternalLink size={13} />
            </a>
          </span>
        </Point>
      </div>
    </>
  )
}

function Social() {
  return (
    <>
      <Heading kicker="Step 6: the social web" title="The social web, the way it was">
        <p>
          Before feeds were tuned to keep you scrolling, the web was social through people: what they shared, the blogs they read, the places they gathered. PaperWing brings that back, built on
          Bluesky, so everything you make lives in your own account.
        </p>
      </Heading>
      <div className="mt-6 grid gap-3 md:grid-cols-2">
        <Point icon={<MessageSquareQuote size={16} />} title="Share with a note">
          Like Google Reader’s shared items: a link and a line on why it’s worth reading. It goes on your profile and into the feed of anyone who follows you here, without posting to Bluesky.
        </Point>
        <Point icon={<UserPlus size={16} />} title="Follow people, not just topics">
          Follow someone on PaperWing and what they share and list joins For you. Signed in with Bluesky, you’ll also see when people you follow shared or discussed a story.
        </Point>
        <Point icon={<Users size={16} />} title="Community boards">
          Spaces with their own rules and moderators, started by anyone. A board lives in its owner’s Bluesky account, so it belongs to its community, not to PaperWing.
        </Point>
        <Point icon={<Highlighter size={16} />} title="Margin notes">
          Select a passage in the reader view and add a note. Notes from other readers show highlighted in the article.
        </Point>
        <Point icon={<Rss size={16} />} title="Blogrolls">
          Show the blogs you read on your profile, and follow someone else’s blogroll in one tap. The way people found good blogs before algorithms did.
        </Point>
        <Point icon={<Layers size={16} />} title="Mixes">
          Your own channels, built from any blogs, topics, communities and feeds: tap Add to mix wherever you can follow. Publish one and others can follow it, here or as a Bluesky feed.
        </Point>
      </div>
    </>
  )
}

function Saving() {
  return (
    <>
      <Heading kicker="Step 7: saving" title="Saved means readable offline">
        <p>Saving isn’t just a bookmark. PaperWing downloads the story so it’s there on a plane, underground, or after the link dies.</p>
      </Heading>
      <div className="mt-6 grid gap-3 md:grid-cols-2">
        <Point icon={<Bookmark size={16} />} title="Tap save, or swipe right">
          The bookmark on any story saves it. On a phone, swipe a row right to save it and left to hide it.
        </Point>
        <Point icon={<span className="font-bold">↓</span>} title="Kept on this device">
          The article in a clean reader view, its pictures and the discussion are stored here and open without a connection.
        </Point>
        <Point icon={<span className="font-bold">✓</span>} title="A queue you finish">
          Saved stories wait in Saved; finished ones move to the archive, and you’ll see when a saved thread gets new replies.
        </Point>
        <Point icon={<span className="font-bold">↗</span>} title="Save from anywhere">
          Use the share sheet on your phone or the bookmarklet on a computer to send any page to your queue.
        </Point>
      </div>
    </>
  )
}

function Ai() {
  return (
    <>
      <Heading kicker="Step 8: summaries (optional)" title="Bring your own AI key">
        <p>
          PaperWing can summarise a long discussion across every network that covered a story: the main points, where people disagree, and the comments worth reading. It uses Claude, with your own
          Anthropic API key.
        </p>
      </Heading>
      <div className="mt-6 max-w-xl space-y-3 rounded-[18px] bg-panel p-5">
        <SummarySettings />
      </div>
      <div className="mt-4 max-w-xl">
        <Point icon={<KeyRound size={16} />} title="Your key stays yours">
          It’s stored only in this browser. It isn’t synced, isn’t part of your backups, and is never saved on a server: each summary request carries it to Anthropic for that one request, and nothing
          keeps it. Remove it any time under Settings, Summaries.
        </Point>
      </div>
    </>
  )
}

function Passkey({ onDone }: { onDone: () => void }) {
  const code = useSync((s) => s.code)
  const { available, passkeys: support } = useSyncReadiness()
  const [busy, setBusy] = useState(false)

  const create = async () => {
    setBusy(true)
    try {
      await joinSync(await createSyncPasskey(), { passkey: true })
      toast('Sync is on, and your passkey holds the key')
      onDone()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'The passkey didn’t work', { tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Heading kicker="Last step" title={code ? 'You’re synced' : 'Keep it safe with a passkey'}>
        {code ? (
          <p>This device is in sync. Your topics, library and settings follow you to every device with the same sync code or passkey.</p>
        ) : (
          <>
            <p>
              A sync passkey keeps your topics, saved stories, feeds and settings in step across your devices, end-to-end encrypted. It’s saved with your passwords, so on a new phone or laptop
              “Restore with my passkey” brings everything back.
            </p>
            <p>No email, no account, no password to remember.</p>
          </>
        )}
      </Heading>
      {!code &&
        (available === false || support === 'no' ? (
          <p className="mt-6 max-w-xl text-[0.875rem] text-ink-3">
            {available === false ? 'Sync isn’t set up on this deployment.' : 'This browser can’t make passkeys.'} You can still sync with a code under Settings, Saved and sync.
          </p>
        ) : (
          <div className="mt-6 flex flex-wrap gap-2">
            <button className="btn btn-primary h-11 px-5" disabled={busy || available === undefined} onClick={() => void create()}>
              {busy ? <Loader2 size={15} className="spin" /> : <KeyRound size={15} />} Create a sync passkey
            </button>
          </div>
        ))}
      <MadeInTheOpen />
    </>
  )
}

/** The tour's sign-off: PaperWing is open source and reader-supported, and here's where both happen. */
function MadeInTheOpen() {
  return (
    <section className="mt-8 max-w-xl rounded-[18px] bg-panel p-5">
      <h2 className="text-[1.0625rem] font-bold">Made in the open</h2>
      <p className="mt-1 text-[0.875rem] leading-relaxed text-ink-2">
        PaperWing is open source, free, and has no ads. Its code is on GitHub for anyone to read, improve or run themselves, and it’s kept going by readers who chip in.{' '}
        <Link to="/principles" className="font-semibold text-ink underline underline-offset-2">
          What it stands for
        </Link>
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <a className="btn h-9 text-[0.8125rem]" href="https://github.com/jordan-simonovski/paperwing" target="_blank" rel="noopener noreferrer">
          <Code2 size={14} /> PaperWing on GitHub
        </a>
        <a className="btn h-9 text-[0.8125rem]" href="https://ko-fi.com/jordo92" target="_blank" rel="noopener noreferrer">
          <Heart size={14} /> Support it on Ko-fi
        </a>
      </div>
    </section>
  )
}

export function WelcomePage() {
  const navigate = useNavigate()
  const { step, go } = useOnboarding()
  const picks = usePrefs((p) => p.followed.length + p.interests.length)
  const synced = useSync((s) => !!s.code)
  const at = Math.max(0, STEPS.indexOf(step))

  const finish = () => {
    usePrefs.getState().set({ welcomed: true })
    go('hello')
    navigate('/t/for-you', { replace: true })
  }
  const next = () => (at === STEPS.length - 1 ? finish() : go(STEPS[at + 1]))
  const back = () => go(STEPS[Math.max(0, at - 1)])
  useEffect(() => void window.scrollTo({ top: 0 }), [step])

  const body: Record<Step, React.ReactNode> = {
    hello: <Hello />,
    topics: <Topics />,
    feeds: <Feeds />,
    ranking: <Ranking />,
    accounts: <Accounts />,
    sharing: <Sharing />,
    social: <Social />,
    saving: <Saving />,
    ai: <Ai />,
    passkey: <Passkey onDone={finish} />,
  }
  const blocked = step === 'topics' && !picks
  const skippable: Step[] = ['feeds', 'accounts', 'ai', 'passkey']
  const label = step === 'hello' ? 'Start fresh' : at === STEPS.length - 1 ? 'Start reading' : 'Continue'

  return (
    <div className="wide-col">
      <div className="mx-auto max-w-[56rem] px-4 pb-32 pt-8 md:px-8">
        <div className="mb-7 flex items-center gap-1.5" role="progressbar" aria-valuemin={1} aria-valuemax={STEPS.length} aria-valuenow={at + 1} aria-label="Welcome tour">
          {STEPS.map((s, i) => (
            <span key={s} className={`h-1 flex-1 rounded-full ${i <= at ? 'bg-ink' : 'bg-line'}`} />
          ))}
        </div>
        {body[step]}
      </div>

      <div className="welcome-bar">
        <div className="flex items-center gap-2">
          {at > 0 && (
            <button className="icon-btn" onClick={back} aria-label="Back">
              <ArrowLeft size={17} />
            </button>
          )}
          <span className="text-[0.9375rem] text-ink-2">
            {step === 'topics' ? (picks ? `${picks} picked` : 'Pick at least one') : step === 'hello' ? 'Takes about a minute' : `${at} of ${STEPS.length - 1}`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {skippable.includes(step) && !(step === 'passkey' && synced) && (
            <button className="btn h-11" onClick={next}>
              {step === 'passkey' ? 'Not now' : 'Skip'}
            </button>
          )}
          {/* Without sync, the passkey step's own button is the way forward; this one would only skip it. */}
          {(step !== 'passkey' || synced) && (
            <button className="btn btn-primary h-11 px-6" disabled={blocked} onClick={next}>
              {label}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
