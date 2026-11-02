import { Link } from 'react-router'
import { Pip } from '../components/Pip'

// What PaperWing is for, and the mistakes it won't repeat. Social media went wrong in ways that
// were profitable: attention sold to advertisers, feeds tuned for time spent, people locked in so
// leaving cost them everything. These are the commitments that keep PaperWing from drifting there,
// written so anyone can hold it to them. Like the privacy and terms pages, they describe what the
// code does; a change that breaks one of them is a bug.

const REPO = 'https://github.com/paperwingio/paperwing'
const SUPPORT = 'https://ko-fi.com/jordo92'
const link = 'font-semibold text-ink underline underline-offset-2'

function Principle({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="mt-9">
      <h2 className="flex items-baseline gap-3 text-[1.25rem] font-bold leading-snug tracking-[-0.01em]">
        <span className="num text-[0.9375rem] text-signal">{String(n).padStart(2, '0')}</span>
        {title}
      </h2>
      <div className="mt-2.5 space-y-2.5 text-[0.9375rem] leading-relaxed text-ink-2 [&_strong]:font-semibold [&_strong]:text-ink">{children}</div>
    </section>
  )
}

export function PrinciplesPage() {
  return (
    <div className="wide-col">
      <article className="mx-auto max-w-[44rem] px-4 pb-24 pt-8 md:px-8">
        <Pip variant="head" className="size-12" />
        <h1 className="mt-4 text-[2.25rem] font-bold leading-[1.05] tracking-[-0.02em]">What PaperWing stands for</h1>
        <p className="mt-5 text-[1.125rem] leading-relaxed text-ink-2">
          Social media didn’t go wrong by accident. When the money comes from selling attention, every incentive points the same way: keep people scrolling, keep them angry, keep them locked in, and
          know as much about them as possible. The open web was meant to be something else, and the open networks growing now (Bluesky, Mastodon, Lemmy) are a second chance at it.
        </p>
        <p className="mt-3 text-[1.125rem] leading-relaxed text-ink-2">PaperWing is a reader for that web. These are the commitments that keep it on the reader’s side. Hold us to them.</p>

        <Principle n={1} title="You’re the reader, not the product">
          <p>
            No ads, no selling data, no sponsored stories, no engagement targets. PaperWing is free and paid for by the people who find it useful, through{' '}
            <a href={SUPPORT} target="_blank" rel="noopener noreferrer" className={link}>
              Ko-fi
            </a>
            . It won’t take money that comes with growth targets, because growth at any cost is exactly how the last generation of apps turned on their users.
          </p>
        </Principle>

        <Principle n={2} title="A feed you can read, and switch off">
          <p>
            For you is ranked by a recipe that’s written down (engagement on one fair scale, freshness, a mix of sources, and what you’ve told it you like) and it runs in your browser, not on a server
            tuned to keep you here. A plain chronological timeline is always one tap away. Nothing is optimised for time spent: reaching the end of what’s new is the app working, not failing.
          </p>
        </Principle>

        <Principle n={3} title="What it learns about you stays with you">
          <p>
            No accounts, no analytics, no tracking. Your topics, votes and reading history live on your device; sync is encrypted before it leaves, and your library exports in a click. The{' '}
            <Link to="/privacy" className={link}>
              privacy page
            </Link>{' '}
            says exactly what the server sees, and it’s kept as small as the features allow.
          </p>
        </Principle>

        <Principle n={4} title="Open networks, not a walled garden">
          <p>
            PaperWing doesn’t own the conversation. It reads Hacker News, Lobsters, Lemmy, Bluesky, Mastodon and the sites you follow, and when you post, your words go to your own account on those
            networks. Even a story you list on PaperWing is a Bluesky post and a record in your own Bluesky account. <strong>If PaperWing disappeared tomorrow, you’d lose nothing you made.</strong> No
            network effect holds you here: you stay because it’s good, or you leave and take everything with you.
          </p>
        </Principle>

        <Principle n={5} title="Send people to the source">
          <p>
            Stories link to the people who wrote them, and discussions to the communities that had them. The reader view and offline saving are for your convenience, not to keep you from leaving.
            Credit goes where the work was done.
          </p>
        </Principle>

        <Principle n={6} title="Moderation you can see and choose">
          <p>
            Each network’s own moderation applies, and you choose what else to filter: mute words, content warnings, the Bluesky labelers you trust. PaperWing’s own shared spaces (the front page,
            boards and feeds) keep spam and abuse off by rules written down in the{' '}
            <Link to="/terms" className={link}>
              terms
            </Link>
            , and leaving something off them never touches the person’s own post. And since nothing here earns more the longer you stay angry, there’s no reason to push outrage at you.
          </p>
        </Principle>

        <Principle n={7} title="Open source, so you can leave with the code too">
          <p>
            Every line is public under the{' '}
            <a href={REPO} target="_blank" rel="noopener noreferrer" className={link}>
              Apache 2.0 license
            </a>
            . Anyone can read how it works, run their own, or fork it. That’s the real check on all of the above: if PaperWing ever breaks these promises, the community can take the code and keep
            going without it.
          </p>
        </Principle>

        <Principle n={8} title="Small on purpose">
          <p>
            Most of the work happens on your device, the server mostly caches, and the costs are designed to stay tiny. A small, sustainable reader can afford to say no to the things that ruined the
            big ones.
          </p>
        </Principle>

        <section className="mt-12 rounded-[18px] bg-panel p-5 md:p-6">
          <h2 className="text-[1.25rem] font-bold">Where it’s going</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-[0.9375rem] leading-relaxed text-ink-2">
            <li>More of the open web: more networks and communities, read and joined from one place.</li>
            <li>Community spaces with their own moderators and rules, built on open protocols so they belong to the people in them.</li>
            <li>Curation as something people share: mixes and lists that anyone can follow, fork and improve.</li>
            <li>AI that works for the reader: summaries with your own key today, and running on your own device as that becomes possible.</li>
            <li>Easy to run yourself, for a newsroom, a club or a school.</li>
          </ul>
          <p className="mt-4 text-[0.9375rem] leading-relaxed text-ink-2">
            Want to help shape it?{' '}
            <a href={`${REPO}/blob/main/CONTRIBUTING.md`} target="_blank" rel="noopener noreferrer" className={link}>
              Contribute on GitHub
            </a>
            ,{' '}
            <a href={`${REPO}/issues/new?template=feature_request.yml`} target="_blank" rel="noopener noreferrer" className={link}>
              suggest an idea
            </a>
            , or{' '}
            <a href={SUPPORT} target="_blank" rel="noopener noreferrer" className={link}>
              support it on Ko-fi
            </a>
            .
          </p>
        </section>
      </article>
    </div>
  )
}
