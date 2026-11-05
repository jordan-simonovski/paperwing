# Topic preview cards

`npm run build` renders a 1200×630 PNG for every curated topic from the same
catalogue and icon map used by Explore. The files live at
`dist/og/topics/<topic-id>.png`; adding a topic automatically adds its artwork.
The renderer runs in Vite's build process, using local Fontsource fonts and Pip's
SVG artwork. Fontkit converts text to paths and resvg produces the PNGs. Neither
requires a browser, system fonts or network access, and both are development-only
dependencies. Images are not added to the service worker's precache.

`scripts/topicCards.ts` owns the template. It wraps text using real font metrics
and fails the build if a title or description cannot fit or contains an unsupported
glyph. Update the template or shorten that topic's copy when this happens.
Run the build and `npm run preview`, then open `/og/topics/climbing.png` or any
other topic's image to inspect it. Artwork uses stable URLs and normal static-file
caching; sharing services may retain older previews until they crawl again.

For social crawlers, the `/t/:channel` rewrite serves the existing preview endpoint.
Curated topics receive their public name, description and static image URL. There
is no per-request rendering or upstream lookup for these topics. Ordinary browsers continue to receive the app.
Missing topic PNGs are excluded from the SPA rewrite so they cannot return HTML
disguised as an image.

Tests cover catalogue-wide metadata and text layout, PNG dimensions, bot routing,
fallbacks, static asset delivery, and opening a topic in the app.

The same build emits four reusable images under `/og/channels/`: mix, board, feed
and discover. Public mix and board records supply the metadata; they currently have
no cover-image field. Explicit interests and `/search?q=…` links use the discovery
image with the words from the link. RSS and Standard.site links use the feed image
and hostname without fetching the publisher. Local mixes and personal views stay
generic, and recognised credential-bearing feed URLs are omitted entirely.

Profiles use a single public Bluesky profile lookup, preferring a banner (large
card) and falling back to an avatar (small card). Bluesky feeds and lists reuse
their avatars. Lemmy communities resolve through lemmy.world and use a banner or
icon. Labelled profiles, feeds and creators, blocked owners/records, and removed,
private or NSFW communities do not contribute metadata or artwork. These remote
lookups use the guarded fetcher; failures receive a five-minute cache lifetime.
Public mix and board records are read directly without loading their stories.

Crawler rewrites also cover `/u/:actor`, `/c/:did/:rkey`, `/mix/:did/:rkey` and
`/search`. All images are existing assets or build output: request-time code only
assembles escaped metadata. Third-party sharing services control their own cache
and may crop artwork differently; no request-time image composition is performed.
