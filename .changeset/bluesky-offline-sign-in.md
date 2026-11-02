---
"paperwing": patch
---

fix: **Going offline no longer signs you out of Bluesky.** If PaperWing couldn't reach Bluesky while picking your sign-in back up, it treated the sign-in as expired and made you sign in again. Now it says it couldn't connect and keeps you signed in for when you're back online; a sign-in that has really ended still signs you out.
