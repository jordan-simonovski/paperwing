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
is no per-request rendering or upstream lookup. Unknown topics and custom feeds
use the generic PaperWing preview. Ordinary browsers continue to receive the app.
Missing topic PNGs are excluded from the SPA rewrite so they cannot return HTML
disguised as an image.

Tests cover catalogue-wide metadata and text layout, PNG dimensions, bot routing,
fallbacks, static asset delivery, and opening a topic in the app.
