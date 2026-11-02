import { Link } from 'react-router'
import { Pip } from '../components/Pip'

// What PaperWing keeps, where, and who sees it. Written to match the code: if something here
// changes in the app (a new server store, a new service), this page changes with it.

const UPDATED = '2 November 2026'

function Part({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-[1.125rem] font-bold">{title}</h2>
      <div className="mt-2 space-y-2.5 text-[0.9375rem] leading-relaxed text-ink-2 [&_strong]:font-semibold [&_strong]:text-ink">{children}</div>
    </section>
  )
}

export function PrivacyPage() {
  return (
    <div className="wide-col">
      <article className="mx-auto max-w-[44rem] px-4 pb-24 pt-8 md:px-8">
        <Pip variant="head" className="size-12" />
        <h1 className="mt-4 text-[2rem] font-bold leading-[1.1] tracking-[-0.02em]">Privacy</h1>
        <p className="mt-2 text-[0.875rem] text-ink-3">Updated {UPDATED}</p>
        <p className="mt-5 text-[1.0625rem] leading-relaxed text-ink-2">
          The short version: PaperWing has no accounts, no ads, no analytics and no tracking. What it learns about you stays on your devices. The server only keeps what a feature you turned on needs,
          and as little of that as it can.
        </p>

        <Part title="On your device">
          <p>
            Your topics, feeds, votes, hides, what you’ve read, your taste profile, your saved stories and their downloaded articles are stored in this browser. Nobody else can see them, and clearing
            the site’s data removes them.
          </p>
        </Part>

        <Part title="Sync, if you turn it on">
          <p>
            Sync copies your library and settings between your devices through PaperWing’s database. Everything is <strong>encrypted on your device</strong> with your sync code before it’s sent, so
            the server stores only ciphertext under an address derived from the code. Without the code, it can’t be read, by us or anyone else. A sync passkey just holds that code for you, with your
            passwords.
          </p>
          <p>
            One exception: when you save a link from outside the app (the iOS Shortcut or share inbox), the server receives that link and its title, seals them with your code, and stores the sealed
            copy. Synced data that isn’t touched for 400 days is deleted.
          </p>
        </Part>

        <Part title="Signing in to other networks">
          <p>
            <strong>Bluesky, Mastodon and Lemmy:</strong> you sign in on their own sites, or straight from your browser to your Lemmy server. The sign-in stays on this device and is only ever sent to
            that network. PaperWing’s server never sees it.
          </p>
          <p>
            <strong>Hacker News:</strong> HN has no sign-in for apps, so your username and password pass through PaperWing’s server once, on their way to HN. They aren’t stored or logged. HN’s session
            cookie is kept on your device and sent through the server with each vote or comment. Signing out ends that session on HN too.
          </p>
          <p>
            Posting, voting and sharing happen only when you ask. Stories you list on PaperWing are ordinary public Bluesky posts with a small public record in your own Bluesky account (the link, its
            title, the board you chose and whether it goes on the front page too); you can delete them on Bluesky like any post.
          </p>
          <p>
            A post you write on PaperWing works the same way: its Bluesky post has the title, the start of your words and a link to it here, and the words themselves are in that public record in your
            own account, where you can edit them. Each version of the words PaperWing’s server sees is kept in its database (Upstash), with when it first saw it, so anyone can read what a post said
            before it was edited: the original and up to nine later versions, kept for a year after the post was last opened.
          </p>
          <p>
            The same goes for PaperWing’s social features, each only when you use it: items you share with a note, margin notes on articles, your blogroll (if you turn it on), and community boards you
            start or moderate. Each is a public record in your own Bluesky account that anyone can read, and you can remove it from PaperWing or any tool that manages your account.
          </p>
        </Part>

        <Part title="AI summaries">
          <p>
            Your Anthropic API key is stored only in this browser. It isn’t synced. With each summary request it goes to PaperWing’s server, which passes it to Anthropic for that request and doesn’t
            store or log it. The summary is cached for three days under a fingerprint of the (public) discussion, so the next reader of the same thread gets it without a new request.
          </p>
        </Part>

        <Part title="Notifications">
          <p>
            If you turn on alerts, the server stores your browser’s push address and keys, what you asked to be alerted about (for example, threads you watch), what it has already told you, and when
            you last opened PaperWing on that device, so it can send them. Turning alerts off removes the device, and a device PaperWing hasn’t been opened on for 60 days is removed on its own.
          </p>
        </Part>

        <Part title="What the server sees in passing">
          <p>
            To get around browser restrictions, the server fetches some things for you: feeds, articles for the reader view, link previews and site icons. It sees the address it fetches, and caches
            public results so other readers get them faster. Our host, Vercel, keeps short-lived request logs, as any website’s host does.
          </p>
          <p>
            To stop abuse, some actions are rate-limited by a one-way hash of your network address (IPv6 addresses are grouped by network). The counters expire within a day, and the address itself
            isn’t stored.
          </p>
        </Part>

        <Part title="Services involved">
          <p>
            Vercel (hosting), Upstash (the sync and cache database), Anthropic (summaries, with your key), and the networks you read and sign in to: Hacker News, Lobsters, Lemmy, Bluesky, Mastodon and
            the sites whose feeds you follow. Push notifications go through your browser maker’s push service.
          </p>
        </Part>

        <Part title="Questions">
          <p>
            Ask{' '}
            <a href="https://bsky.app/profile/paperwing.io" target="_blank" rel="noopener noreferrer" className="font-semibold text-ink underline underline-offset-2">
              @paperwing.io
            </a>{' '}
            on Bluesky. See also the{' '}
            <Link to="/terms" className="font-semibold text-ink underline underline-offset-2">
              terms of use
            </Link>
            .{' '}
            <Link to="/settings/app" className="font-semibold text-ink underline underline-offset-2">
              Back to Settings
            </Link>
          </p>
        </Part>
      </article>
    </div>
  )
}
