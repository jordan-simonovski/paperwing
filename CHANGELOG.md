# What's new

## 0.12.0

_Released 3 November 2026_

### New

- **Spoilers stay folded.** In a discussion about a film, show, book or game, comments that may give the plot away are folded as "Possible spoiler" until you tap Show. Turn it off in Settings, Appearance.
- **Paste a Bluesky feed, a person, a Lemmy community or a board to open it.** Paste its link into Find (⌘K or /) and the first choice opens it in PaperWing, ready to follow or join. Other sites still get "Follow this site".
- **Rows say when your taste moved them.** In Hot, a story your votes and saves clearly lifted says so ("Up for you: you like Space"), and one they sank says why. It only appears where your taste shapes the order, never in Latest or Top.
- **The reader says what a discussion is like.** Beside the chillies, busy threads can now show Sad, Happy, Wholesome or Politically charged, Disputed when several people say the headline is wrong, and Answered when a question in the post gets answers. Tap Disputed or Answered to see who, and tap a name to jump to their comment. The chillies setting in Settings, Appearance turns these off too.

### Improved

- **Chillies tell a sharp argument from a busy thread.** Every reply is now judged against the comment it answers, so the chillies count how many people actually push back and how many turn personal, instead of guessing from the thread as a whole. A long, friendly thread stays calm, and tapping the chillies in the reader says what made a discussion heated. "Piling on" is no longer given as a reason.
- **A board that doesn't load offers to try again.** The board page now has a Try again button when it can't be reached, and Explore › Boards shows one way to start a board when there are none yet.
- **Calmer details on more screens.** Activity, profiles, quoted posts, mixes, moderation, margin notes, post history and Settings space their details instead of joining them with dots.
- **Small touches of motion and colour.** Switching channels, the header's colour glides to the next topic's instead of snapping. Pulling to refresh on a phone, Pip leans in and stands up straight when letting go will refresh. Activity's like, repost and follow badges use PaperWing's own colours and stay legible in dark mode. Motion stays off with Motion off or reduced motion.
- **A shorter welcome tour.** It's five steps instead of nine: your topics, your own sites, how For you is ordered, your accounts, and sync. Saving, sharing and posting now explain themselves the first time you use them, boards and mixes explain themselves where they live, and your own AI key is in Settings.

### Fixes

- **Chillies judge the whole discussion.** On big threads the chillies only looked at the first argument under the top comment, so a calm thread could show as heated and the reverse. They now read across the top sixteen conversations, and threads already graded are graded again.
- **PaperWing posts say PaperWing.** Opening a PaperWing post, or meeting one in a Bluesky feed, showed it as a Bluesky post because that's where it's stored. It's now shown as PaperWing's own, and the link out still says it opens on Bluesky.

## 0.11.0

_Released 3 November 2026_

### New

- **Paste a link to follow its site.** Paste any address into Find (⌘K or /) and the first choice is to follow that site: PaperWing opens the publisher finder with it already looked up. Posting the link is still the next choice.
- **Watch videos without leaving.** A story that's a YouTube, Vimeo or PeerTube video now plays right in the story when you press play. Until you do, only its preview picture loads; YouTube plays in its privacy-enhanced player and Vimeo with do-not-track, and PeerTube videos play as plain video files, with no player from anywhere else.

### Improved

- **The first time you do something, PaperWing says what it did.** Your first save, post, board joined, share, hidden story and press of j each get one line on what just happened: that saved stories read offline, that your post lives in your own Bluesky account, where a joined board shows up, and what the keyboard can do. Each says it once on a device, then never again.
- **When an article can't be shown, the discussion is one tap away.** If the reader can't load a story's article, it now offers to read the discussion, with its comment count, as well as opening the original.
- **Boards explain themselves before there are any.** With no community boards yet, Explore › Boards says what a board is, how it works and that it lives in your own Bluesky account, and offers to start the first one.
- **Switching threads shows where you are in the conversation.** The red part of the discussion bar fills in from the start of the thread you pick. It stays still with Motion off or reduced motion.
- **Every Explore section is easy to reach on a phone.** The section tabs fade at the edge to show there are more, the open one scrolls into view, and "Feeds" is now "Bluesky feeds" so it's clear where blogs and newsletters live (Publishers).
- **Saved says so when you've read through your queue.** Once everything you saved is finished, Pip closes the book and points you to the archive, instead of the empty-queue tips meant for someone who hasn't saved anything yet.
- **Calmer details on stories and pages.** Story and list details are spaced apart instead of joined by dots, and small labels are in normal sentence case rather than capitals.

### Fixes

- **Following a site works even when its Standard.site link can't be checked, and Standard.site publications show their newest posts.** If a site names both an ordinary feed and a Standard.site publication that can't be verified, the publisher finder offers the feed instead of an error. Publications with long archives now show their latest posts rather than their oldest. Mixes read in Bluesky keep loading when a publication is busy or down, and fill it in a minute later.
- **Sharing no longer says a story is on PaperWing when it isn't.** If your Bluesky post went out but couldn't be listed on PaperWing, the confirmation still said "Shared to Bluesky and PaperWing". It now says only Bluesky.

## 0.10.0

_Released 3 November 2026_

### Improved

- **Bring your feeds from FreshRSS.** Importing an OPML file from another reader now keeps its folders, in Settings and when you export again. It says what it left out and why: feeds PaperWing can't read, like scraped pages and JSON feeds, and private feeds with a password or token in their address. You can follow up to 250 feeds, fewer if their addresses are very long.

### Fixes

- **Private feeds stay private.** A feed whose address holds a password or a token, like a private GitLab or newsletter feed, is no longer published on your profile's blogroll or in a published mix and its Bluesky feed. It stays in your own copy of the mix, marked with a lock, and a mix you published before is published again without it, or unpublished if it has nothing public left. PaperWing no longer shows one from a blogroll or mix published earlier. If yours went out with a feed like that in it, its address has already been seen: reset that feed's token where you got it.

## 0.9.0

_Released 3 November 2026_

### New

- **Alt text is required.** A post can't go until every picture is described. Turn this off under Settings, Sources, Posting, and boards can choose to take no pictures at all.
- **Follow Discourse and Standard.site.** Paste a forum, category, tag or publication address in Explore’s publisher finder to follow it. Add these publishers to mixes and read their posts alongside your other feeds.
- **Post pictures.** Add up to four pictures to a post from Write a post, each with a description for people who can't see it. They go to your own Bluesky account as a picture post, resized on your device first with location details removed.

### Fixes

- **PaperWing upvotes reach Bluesky.** When signed in, tapping the up arrow on a listing sends a Bluesky like even if you already voted locally or an earlier attempt failed.

## 0.8.0

_Released 3 November 2026_

### New

- **Find boards from For you.** For you now suggests a few more posts from PaperWing's liveliest boards, marked Suggested, and any board post has a Join button. Joined boards' posts show up in For you too. Turn suggestions off under Settings, Tuning.

### Improved

- **PaperWing's announcements reach For you.** A new announcement from PaperWing's official board sits at the top of For you for its first few days, as it does on the front page. Hide it like any story once you've read it.
- **Announcements are yours to dismiss.** Tap the ✕ on a pinned announcement to put it away, or turn PaperWing's announcements off under Settings, Tuning to leave them out of For you.
- **PaperWing keeps less of your posts.** Earlier versions of an edited post are kept for about a day instead of a year, and are cleared once the post is deleted. A post you edit from now on says it was edited for as long as it's up.

### Fixes

- **Board changes show up straight away.** A board you start or edit (a new moderator, new rules) shows your changes the moment you save, and everyone else sees them within a minute or two instead of up to half an hour.
- **Formatting keeps up with fast typing.** When writing a post, pressing Bold, Italic or another formatting button and typing straight away puts your words inside the formatting, instead of sometimes splitting them around it.

## 0.7.1

_Released 3 November 2026_

### Fixes

- **Signing in with Bluesky works again.** Sign-in, PaperWing's front page and boards, threads, Bluesky feeds and RSS stopped loading after the last update; they're back.

## 0.7.0

_Released 2 November 2026_

### Highlights

- **Find boards worth joining.** Explore lists community boards by how busy they've been this week, Search and the command bar find boards by name, and each topic page shows the boards about it. Posts on the front page now say which board they're from.

### New

- **Choose whether a board post reaches the front page.** When you list a link on a community board, tick "Also on PaperWing's front page" in the share sheet to show it there too. Without the tick, board posts now stay on their board, and a board's hidden posts and blocked accounts stay off the front page as well.
- **Edit your posts.** Open a post you wrote on PaperWing and tap Edit to change its words; an edited post says so, and tapping Edited shows the earlier versions. If you signed in before today, allow the new Bluesky permission under Settings, Sources first.
- **Boards where only moderators post.** In a board's settings, turn on "Only moderators post here" and posts from anyone else stay off it. Everyone can still vote and reply, and the share sheet tells people before they try.
- **Official PaperWing announcements.** Boards run by PaperWing carry an Official badge wherever they show, and the newest announcement sits at the top of the front page for three days. A board that only puts "official" in its name gets no badge.
- **Write a post, not just a link.** On the front page or any board, tap Write a post to share a title and your own words, formatted with the toolbar and checked in Preview. It goes out as a Bluesky post, and its likes and replies are its votes and comments.

### Improved

- **Pip closes the book when you're caught up.** Finish Today's edition and Pip shuts its book with a small hop, so the end of the edition feels like an end.

### Fixes

- **GitHub links go to PaperWing's new home.** Report a bug, Suggest an idea and the source code links in Settings, on the welcome screen and on the Principles page now open PaperWing's own GitHub organisation.
- **Easier to use with a keyboard or screen reader.** Text boxes in Settings, Saved and the share sheet show a clear outline when they have focus, an outage notice's status page link can be reached on its own, the "Add to mix" buttons and quoted posts are announced by what they show, and your upvoted scores are a little easier to read.
- **Published mixes leave out hidden Lemmy posts.** A mix's share link and feed no longer include Lemmy posts marked NSFW, removed by moderators or deleted by their authors, the same ones PaperWing already hides everywhere else.
- **Offline reading keeps what matters.** Site icons no longer push your feeds and articles out of what PaperWing keeps for reading offline, and pictures from saved articles stop growing without limit, so they can't crowd out your saved library.
- **Saved links keep their emoji and symbols.** A link saved from your phone's share sheet without a title now shows the page's own title as written, emoji and dashes included, instead of stray codes.

## 0.6.1

_Released 2 November 2026_

### Fixes

- **Alerts you can count on.** A reply, incident or outage alert that your browser's push service couldn't take at that moment is now sent on the next check instead of being lost. Changing your alert settings while a check is running no longer gets undone, and the status pages you follow are checked in turn, however many other people follow theirs. Alerts take up to 10 status pages of your own, and a device you haven't opened PaperWing on for 60 days stops getting them (turn notifications on again to bring it back).

## 0.6.0

_Released 2 November 2026_

### Improved

- **Post a link from your phone.** The round + button in the phone's top bar posts a link from any page, and a Paste button fills in the address you copied. On a computer, "Post a link" sits in the sidebar. On Android, press and hold the app icon to post straight away. Your profile and the light/dark switch are now in the phone's menu.

### Fixes

- **The app always starts.** A link with a stray % in it, or a launch screen whose font fails to load, no longer leaves a blank screen. If you open the app offline, sync, summaries and alerts are checked again once you're back.
- **Going offline no longer signs you out of Bluesky.** If PaperWing couldn't reach Bluesky while picking your sign-in back up, it treated the sign-in as expired and made you sign in again. Now it says it couldn't connect and keeps you signed in for when you're back online; a sign-in that has really ended still signs you out.
- **Editing a board waits for it to load.** Opening your board's editor used to show an empty "Start a board" form until the board arrived, and saving that form replaced your board with a new, empty one. The editor now waits for your board, and says so with a way to try again if it can't reach it.
- **A board's moderation always holds.** When the services behind a community board's moderation were slow or down, listings its moderators had hidden and people on its block list could show up on the board, and in its feed, for a while. The board now shows an error until its moderation can be read again, every hide counts however many others pile up, and its owner can still open the board's settings meanwhile.
- **The busiest discussion leads.** When a link is being talked about in three or more places, its row now opens the liveliest discussion and shows its comment count, instead of sometimes keeping a quieter one.
- **Interests with symbols in them work.** An interest like "\*NSYNC" or "C++" no longer stops your feeds from loading; it matches the words as you typed them.
- **Shortcuts stay out of your way.** Escape on an open sheet closes just the sheet, not the story under it, and n and p no longer jump through the discussion while you type a reply. Typing in a sheet keeps your cursor where it is.
- **Votes and comments land on the right post after switching Lemmy servers.** Signing in to a different Lemmy server without reopening PaperWing could send an upvote or comment to an unrelated post there, because each server numbers its posts differently. PaperWing now looks each post up again on the server you're signed in to.
- **A Mastodon favourite that didn't go through no longer stays lit.** If your Mastodon server couldn't be reached, the up arrow stayed on as if the post had been favourited, and pressing it again took back a favourite that was never made. It now goes back off and says your server couldn't be reached, so you can try again.
- **Mix edits made while publishing stay.** Renaming a mix or changing its sources while it was being published, saved or unpublished could put the editor back the way it was when you pressed the button, so the change vanished. Those edits now stay in the editor, ready to save.
- **Save and open stays put when saving fails.** If republishing a published mix didn't work (offline, or a Bluesky sign-in that needs renewing), Save and open still took you to the mix, away from the editor, and the people following it never got the change. It now keeps you in the editor so you can try again.
- **The offline copy stays small.** PaperWing kept a copy of every article and list it loaded, for reading offline, and never let any go, so over months it could take up a lot of your device's storage. It now keeps the most recent few hundred. Stories you save for offline are kept as before.
- **Pressing like twice quickly makes one like.** Pressing the up arrow on a Bluesky or Frontpage story again before the first like had gone through could make two likes, and taking it back then left one behind. A press while a like is still going through, or being taken back, now waits for it instead.
- **Previews, feeds and alerts recover from slow sites.** When a site is slow or down, PaperWing's link previews and RSS feeds try again within minutes instead of serving a stand-in for a day, and reply alerts still arrive when some watched threads are on slow servers.
- **Replies post once, in the right place.** Pressing Cmd+Enter or Ctrl+Enter again while a reply is sending no longer posts it twice, and a comment on a Hacker News or Lemmy story now shows at the top of the thread rather than under the first comment.
- **Saved stories keep what you do to them.** Archiving, removing or reading a story on the Saved page while it was being checked for new discussion could be undone a moment later, and a removed story could come back. Stories that couldn't download for offline because the connection dropped now try again, instead of staying without their article.
- **Chillies come back after a hiccup.** If PaperWing couldn't find out how heated discussions were, because you were offline for a moment or the server was busy, those stories showed no chillies until you reloaded. It now asks again shortly after.
- **Heated discussions get their chillies sooner.** A new story's chillies could be held up for everyone for five minutes when someone else asking about it had used up their share for the day. Now it's graded for the next person who asks.
- **Sync carries all your settings.** People you follow, boards you've joined and your blogroll setting now reach your other devices, and a long list of feeds syncs too. If something is still too large to sync, Settings says so instead of looking up to date.
- **Today's edition is made from today's news.** Opening the app straight into Today, say from the morning notification, could build the edition from the stories you'd last seen, before the new ones arrived, and keep it that way all day. Today now waits for your sources to answer before it picks.
- **Today recovers when its sources come back.** If none of your sources answered when you opened Today, it kept saying it was putting your edition together, even once they were back. It now says it couldn't reach them, with a way to try again, and builds the edition as soon as they answer.

## 0.5.0

_Released 2 November 2026_

### New

- **Post any link to PaperWing.** "Post a link" on PaperWing and its boards takes any address, fills in the title from the page, then lets you list it on PaperWing (and share it anywhere else you're signed in). Paste a link into the command bar to post it from anywhere, no saving first.

### Improved

- **The command bar finds settings and pages.** Type "text size", "mute" or "sync" to go straight to the setting, or jump to Today, Activity, mixes and What's new. Its suggestions, and Search's, now come from the topics you follow.
- **A way forward when a channel is empty or won’t load.** "Try again" when sources can't be reached, a button to clear a filter that left nothing, related topics to try when a channel is quiet, and the same "Try again" on Explore.
- **Easier to get around on a phone.** A menu button now sits beside the logo, where your topics, sources and mixes live, and small buttons such as votes, save and share are easier to hit with a thumb.
- **Dialogs fit wide screens.** Sharing, adding to a mix, writing a reply and margin notes open as a dialog in the middle of the window on a computer, rather than a panel stretched across the whole bottom of the screen.
- **Saved, Activity and Settings stay in view on a computer.** The sidebar scrolls your topics and sources on their own, so however many you follow, the places you keep things never drop out of sight.
- **Things that explain themselves.** Choosing Hot, Latest, Top or Spicy says what it means, unfollowing a topic can be undone, Share offers posting even before you sign in (and says where), the reader's "open on" button shows the site's own logo, and starting a board or mix is clearer.
- **A quicker way in.** "Start fresh" is the obvious first step, every step after picking topics has "Skip the tour", and the bar at the bottom says your topics are in once you've picked them.

### Fixes

- **Margin notes work on desktop.** Select a passage in the reader and "Note this passage" now appears right beside it, instead of at the bottom of the window where it was easy to miss. If you're not signed in with Bluesky, it tells you how to sign in rather than doing nothing, and every article now mentions that you can leave notes.
- **The same sources everywhere.** The command bar now lists the sources you see in the sidebar, with their logos, instead of tech sources you don't follow, the machine learning papers source and topic are called ML papers so they aren't mistaken for the Papers topic, and the Hacker News and Lobsters front pages are Tech front pages, apart from PaperWing's own.
- **Joining sync mid-sync starts clean.** Entering a new sync code while this device was still syncing with its old one could carry the old code's place across, so some changes on the new code were missed until the next full sync. The new code now always gets its own first sync.
- **Setup shows your real sign-ins.** The accounts step of setup no longer shows Hacker News or Mastodon as signed in after that sign-in has stopped working, and joining sync gives the same clear message wherever you do it.

## 0.4.0

_Released 2 November 2026_

### Highlights

- **Papers: new research, shared by the people who did it.** Follow Papers to see preprints and papers that researchers post on Bluesky, alongside Retraction Watch, eLife and The Scholarly Kitchen. Any story in your feeds that links to arXiv, bioRxiv, medRxiv, OSF or a DOI is picked up by Papers too, wherever it was posted.

### New

- **3D printing and electronics.** A new Making section has 3D printing and Electronics topics, with Hackaday, Prusa, Hackster.io and CNX Software, plus the 3D printing and electronics crowds on Lemmy, Bluesky and Mastodon.
- **Science by field.** Physics, Maths, Chemistry, Biology, Ecology, Earth sciences, Brain and mind, and Archaeology are now topics of their own under Science, each with its own publishers, Bluesky feeds and Mastodon hashtags.

## 0.3.0

_Released 2 November 2026_

### Improved

- **A wordmark of its own.** PaperWing's name is now set in a soft serif in ink, with Pip carrying the red, in the app, the opening animation and link previews.
- **Start reading straight away.** New visitors land on a starter mix of news instead of a tour; a small bar offers to pick your own topics whenever you like, and goes away when you say not now.

### Fixes

- **Changing topics no longer jumps around.** Stories appear at their final size instead of resizing as they load, and headlines no longer fade in on every switch. You can turn that animation back on in Settings, Appearance.

## 0.2.0

_Released 2 November 2026_

### Highlights

- **The social web, the way it was.** Share a link with a note on why it's worth reading, start a community board with its own rules and moderators, leave notes in the margins of an article, publish your blogroll, and follow any topic, board, mix or profile by RSS.

### New

- **What's new.** Settings, App and data now has this list: every release in plain words, and the version you're on.

### Improved

- **Faster to open and to sort.** Switching between Hot, Latest and Top answers straight away on phones, the first stories appear sooner when you open the app, and your feed starts loading while the opening animation plays.

### Fixes

- **Sharing to Hacker News after your sign-in expires.** If Hacker News has signed you out, sharing there now signs you out here too, so you can sign in again, as voting already did.
- **"Just now", not "now ago".** Comments, notes and posts less than a minute old read properly.
- **Lemmy stories in published mixes open with their discussion.** People reading your mix's feed now get the Lemmy thread, not just the link.
- **Search hides what your moderation hides.** Posts your labelers hide, or keep behind a warning, are now hidden or covered in search results too, as they are in your feeds.
- **Today has everything For you has.** The daily edition now includes your Mastodon home timeline, the people you follow on PaperWing and your status pages, as For you always did.
