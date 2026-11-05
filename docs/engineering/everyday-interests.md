# Everyday interests

The 13 topics in `src/lib/interests.ts` extend the existing general pack. They use
dedicated RSS sources, search aliases and specific matching terms, with the same
following, related-topic and preview-card behaviour as the rest of the catalogue.
Food remains the broad cooking topic; baking and coffee offer narrower interests.
Renewable energy covers the energy transition separately from broader climate news,
and electric vehicles sit alongside general motoring.

Sources were checked on 4 November 2026: each selected feed returned HTTP 200 and
at least two RSS items. This is an availability check, not a guarantee of future
uptime or every article's relevance. No new community or Bluesky feed identifiers
are guessed. The empty BirdWatching feed and the older Dicebreaker feed were left
out; birdwatching starts with Cornell's All About Birds.

| Topic | Publishers |
| --- | --- |
| Renewable energy | Renew Economy, pv magazine |
| Cars | Carscoops, Motor1 |
| Electric vehicles | InsideEVs, The Driven |
| Gardening | Gardeners’ World, Guardian Gardens |
| DIY & home repair | Family Handyman, Bob Vila |
| Woodworking | Lost Art Press, Popular Woodworking |
| Photography | PetaPixel, DIY Photography |
| Hiking & camping | The Trek, SectionHiker |
| Birdwatching | All About Birds |
| Board games & tabletop | Board Game Quest, Tabletop Gaming News |
| Knitting & sewing | Tin Can Knits, Sew Liberated |
| Coffee | Daily Coffee News, Sprudge |
| Baking & bread | The Perfect Loaf, Sally’s Baking |

Source addresses are kept in the topic records. The knitting starter guide was
also checked, following its redirect to the canonical article. Other potential
starter pages refused the check and were not added. Broad words such as “hobbies”
are search aliases only. Tests check discoverability, following, story matching,
and common programming metaphors that should not become hobby stories.

The catalogue and icons add about 4.1 KB gzip to the entry bundle. They stay in the
entry because the first feed tags its stories against the catalogue. The explicit
entry budget changes from 304 to 307 KiB and total JavaScript from 566 to 572 KiB;
the measured totals are about 305.8 and 570.1 KiB. Static preview PNGs remain out
of the service worker's precache.
