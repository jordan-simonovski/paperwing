import { Link } from 'react-router'
import { Pip } from '../components/Pip'

// What PaperWing keeps, where, and who sees it. Written to match the code: if something here
// changes in the app (a new server store, a new service), this page changes with it.

const UPDATED = '4 November 2026'

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
            Your topics, feeds, votes, hides, what you’ve read, your taste profile, your saved stories and their downloaded articles, and which one-time explanations you’ve already seen are stored in
            this browser. Nobody else can see them, and clearing the site’s data removes them.
          </p>
          <p>
            So Hot can show what’s new to you, this browser also keeps which stories have been on your screen, when, and how many comments they had then. Your taste profile learns from your votes,
            saves and hides, and a little from stories you open, stay with for a while or pass over visit after visit. Older lessons fade over the months. None of this leaves your device, except your
            taste profile in encrypted sync if you turn sync on.
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
            Sharing a topic, interest or feed link includes its address, any interest search words, and the sort and filters you chose. Copying puts it on your clipboard; sharing sends it to the app
            you choose. These links do not include your reading history or sign-in details, and opening one does not subscribe the recipient automatically.
          </p>
          <p>
            Posting, voting and sharing happen only when you ask. Stories you list on PaperWing are ordinary public Bluesky posts with a small public record in your own Bluesky account (the link, its
            title, the board you chose and whether it goes on the front page too); you can delete them on Bluesky like any post.
          </p>
          <p>
            When you’re signed in with Bluesky, upvoting someone else’s PaperWing listing also likes its Bluesky post under your account. Taking the upvote back removes that like. Downvotes aren’t
            published.
          </p>
          <p>
            A post you write on PaperWing works the same way: its Bluesky post has the title, the start of your words and a link to it here, and the words themselves are in that public record in your
            own account, where you can edit them, along with when you last edited them. So that a fresh edit shows what it changed, PaperWing’s server keeps the versions of the words it sees in its
            database (Upstash) for about a day after each is replaced. All of it goes within a day of the post last being opened, and is removed the next time the post is opened after you delete its
            words.
          </p>
          <p>
            Pictures you add to a post are resized and re-encoded on your device first, which leaves behind what the camera wrote into the file (where it was taken, the device), and then uploaded to
            your own Bluesky account with their descriptions, as an ordinary Bluesky picture post. PaperWing never stores them.
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

        <Part title="Chillies and discussion notes">
          <p>
            To show how heated a busy discussion is and what it’s like, and to fold comments that may spoil a film, show, book or game, PaperWing’s server fetches the thread’s public post and comments
            itself and sends them to TypeSafe’s Jev model to classify. Nothing about you goes with them: your device only asks the server which of the stories on screen have been graded. The results
            (a few numbers, and the ids of a few comments to jump to) are kept on the server for two weeks and shared by every reader.
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
            Downloading a picture asks its image host directly from your browser, without sign-in cookies, and saves a file on your device. The host sees that request; PaperWing’s server does not
            receive the picture or keep a download history. Files you download remain on your device when you clear PaperWing’s data.
          </p>
          <p>
            To get around browser restrictions, the server fetches some things for you: feeds, articles for the reader view, link previews and site icons. It sees the address it fetches, and caches
            public results so other readers get them faster. Our host, Vercel, keeps short-lived request logs, as any website’s host does.
          </p>
          <p>
            When a messaging or social service previews a shared PaperWing link, our server may read the public profile, Bluesky feed, Lemmy community, board or published mix it names. The preview
            includes public titles, descriptions and existing artwork, and the service may fetch that artwork from its original host and cache the preview. Topic artwork is built ahead of time.
            Personal feeds use a generic card; previews do not read your follows or local mixes. A shared search or interest link includes the words in that link.
          </p>
          <p>
            Suggested posts from community boards in For you are picked from how lively each board is across PaperWing, only from posts their posters also put on the front page, and are the same for
            everyone. Nothing about you is sent to pick them: the boards you’ve joined are left out on your device. You can turn suggestions, and PaperWing’s announcements, off under Settings, Tuning.
          </p>
          <p>
            The Layoffs topic reads US states’ public lists of WARN notices (layoff filings) on the server, the same for everyone. Opening the Related tab on a story about one employer’s layoffs asks
            the server for that employer’s open roles, which it reads from the employer’s own public job board (Greenhouse, Ashby, Lever or Workday). The request names the employer, not the story, and
            the answer is cached and shared between readers.
          </p>
          <p>
            Following a Discourse forum fetches its public RSS feed. Following a Standard.site publication reads its public records from the author’s server and checks its website and article links.
            The publication address and format stay with your other feed settings, including encrypted sync and your public blogroll if you turn it on.
          </p>
          <p>
            Importing an OPML file from another reader reads it on your device. The feeds it holds, and the names of the folders they were in, join your feed settings and encrypted sync; folder names
            never go into your public blogroll. An import leaves out feeds whose address holds a password, or a token in a part of it it can recognise, so those don’t reach PaperWing unless you add
            one yourself. Your public blogroll and published mixes leave out those feeds too, however you followed them (a mix keeps them in your own copy; one you published before is published again
            without them once you sign in, or unpublished if nothing public is left), and PaperWing doesn’t show or fetch them from blogrolls or mixes published before it did. A secret hidden
            elsewhere in an address can’t be told apart from the rest of it, so check private feeds before importing or turning your blogroll on.
          </p>
          <p>
            A story that’s a YouTube, Vimeo or PeerTube video shows its preview picture, like any link. Nothing else from those sites loads until you press play. Then a YouTube video plays in
            YouTube’s privacy-enhanced player (youtube-nocookie.com), or a Vimeo video in Vimeo’s player with do-not-track set, in a sandboxed frame: YouTube or Vimeo sees that you played it, as it
            would on its own site. A PeerTube video’s details are read from its own server, straight from your browser, and it plays as a plain video file from wherever that server keeps it.
          </p>
          <p>
            To stop abuse, some actions are rate-limited by a one-way hash of your network address (IPv6 addresses are grouped by network). When Bluesky reads a published mix, the count is kept
            against the mix owner’s public account ID instead. The counters expire within a day, and the address itself isn’t stored.
          </p>
        </Part>

        <Part title="Services involved">
          <p>
            Vercel (hosting), Upstash (the sync and cache database), Anthropic (summaries, with your key), and the networks you read and sign in to: Hacker News, Lobsters, Lemmy, Bluesky, Mastodon and
            the sites whose feeds you follow. For the Layoffs topic, US state labour departments’ WARN pages, and employers’ job boards on Greenhouse, Ashby, Lever and Workday. YouTube, Vimeo and
            PeerTube servers, only when you press play on one of their videos. Push notifications go through your browser maker’s push service.
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
