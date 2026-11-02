import { Link } from 'react-router'
import { Pip } from '../components/Pip'

// The terms of using PaperWing, in plain words. Like the privacy page, written to match what the app
// actually does: if a promise here changes in the code, it changes here too.

const UPDATED = '2 November 2026'

function Part({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-[1.125rem] font-bold">{title}</h2>
      <div className="mt-2 space-y-2.5 text-[0.9375rem] leading-relaxed text-ink-2 [&_strong]:font-semibold [&_strong]:text-ink">{children}</div>
    </section>
  )
}

const link = 'font-semibold text-ink underline underline-offset-2'

export function TermsPage() {
  return (
    <div className="wide-col">
      <article className="mx-auto max-w-[44rem] px-4 pb-24 pt-8 md:px-8">
        <Pip variant="head" className="size-12" />
        <h1 className="mt-4 text-[2rem] font-bold leading-[1.1] tracking-[-0.02em]">Terms of use</h1>
        <p className="mt-2 text-[0.875rem] text-ink-3">Updated {UPDATED}</p>
        <p className="mt-5 text-[1.0625rem] leading-relaxed text-ink-2">
          The short version: PaperWing is a free reader for the open web, run as a small independent project. Use it in good faith, respect the networks it connects you to, and understand it comes as
          it is. By using PaperWing you agree to these terms and to the{' '}
          <Link to="/privacy" className={link}>
            privacy page
          </Link>
          .
        </p>

        <Part title="What PaperWing is">
          <p>
            PaperWing gathers stories and discussions from other places (Hacker News, Lobsters, Lemmy, Bluesky, Mastodon, and the sites and feeds you follow) and lets you read, save and join in. It
            doesn’t host those networks or their content, and it isn’t affiliated with any of them.
          </p>
          <p>It’s free, it’s new, and it will change: features may be added, changed or removed, and it may be unavailable at times.</p>
        </Part>

        <Part title="Other people’s content">
          <p>
            Stories, articles, posts and comments belong to the people and publishers who made them. PaperWing shows headlines, short excerpts and links, and the reader view and saved stories fetch an
            article for your own reading, the way your browser would. Follow the link to the original to support the people who wrote it.
          </p>
          <p>
            If you own something shown here and want it removed, ask{' '}
            <a href="https://bsky.app/profile/paperwing.io" target="_blank" rel="noopener noreferrer" className={link}>
              @paperwing.io
            </a>{' '}
            and it will be dealt with promptly.
          </p>
        </Part>

        <Part title="What you post">
          <p>
            Anything you post, reply, vote on or share from PaperWing goes to the network you chose (Bluesky, Mastodon, Hacker News, Lemmy) under your own account, and that network’s terms and rules
            apply to it. It’s yours, and you’re responsible for it.
          </p>
          <p>
            <strong>Listing a story on PaperWing</strong> publishes a public Bluesky post and a small public record in your Bluesky account. They can be seen and copied by anyone, like any Bluesky
            post, and you can delete them on Bluesky.
          </p>
        </Part>

        <Part title="Using it fairly">
          <p>Don’t use PaperWing to:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>spam, harass or deceive people, or post anything illegal;</li>
            <li>overload, scrape or attack PaperWing or the networks it reads, or get around its limits;</li>
            <li>sign in to accounts that aren’t yours, or break the rules of the networks you use through it.</li>
          </ul>
          <p>
            PaperWing’s front page, boards and Bluesky feeds are shared spaces. Listings that are spam, abusive or illegal, or that a network’s own moderation has labelled, can be left off them, and
            so can the accounts behind them. That only affects PaperWing’s pages: your Bluesky post stays yours.
          </p>
        </Part>

        <Part title="Your accounts on other networks">
          <p>
            You sign in to other networks at your own choice, and your use of them is between you and them. Hacker News has no sign-in for apps, so PaperWing signs in on your behalf with the details
            you give it (see the privacy page for how). Any network can change or block that kind of access at any time, and PaperWing can’t promise it will keep working.
          </p>
        </Part>

        <Part title="AI summaries">
          <p>
            Summaries use your own Anthropic API key, on your Anthropic account, under Anthropic’s terms, and you pay Anthropic for them. They’re written by an AI from the discussion and can be wrong
            or miss the point: read the thread before relying on one.
          </p>
        </Part>

        <Part title="Your data and sync">
          <p>
            Your library and settings live on your devices. Sync is offered as is: keep your sync code or passkey safe, because without it nobody (including us) can recover your data, and synced data
            untouched for 400 days is deleted. Export your library from Settings if it matters to you.
          </p>
        </Part>

        <Part title="No guarantees">
          <p>
            PaperWing is provided as is, without warranties of any kind, to the extent the law allows. To the extent the law allows, its makers aren’t liable for losses from using it, or from not
            being able to: lost saved stories, a missed notification, something a summary got wrong, or anything another network or website does. None of this limits rights you have under consumer law
            that can’t be excluded.
          </p>
        </Part>

        <Part title="Changes and questions">
          <p>
            These terms may change as PaperWing does; the date at the top says when they last did. Questions go to{' '}
            <a href="https://bsky.app/profile/paperwing.io" target="_blank" rel="noopener noreferrer" className={link}>
              @paperwing.io
            </a>{' '}
            on Bluesky.{' '}
            <Link to="/settings/app" className={link}>
              Back to Settings
            </Link>
          </p>
        </Part>
      </article>
    </div>
  )
}
