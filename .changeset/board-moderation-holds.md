---
"paperwing": patch
---

fix: **A board's moderation always holds.** When the services behind a community board's moderation were slow or down, listings its moderators had hidden and people on its block list could show up on the board, and in its feed, for a while. The board now shows an error until its moderation can be read again, every hide counts however many others pile up, and its owner can still open the board's settings meanwhile.
