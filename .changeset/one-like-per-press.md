---
"paperwing": patch
---

fix: **Pressing like twice quickly makes one like.** Pressing the up arrow on a Bluesky or Frontpage story again before the first like had gone through could make two likes, and taking it back then left one behind. A press while a like is still going through, or being taken back, now waits for it instead.
