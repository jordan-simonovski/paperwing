---
"paperwing": patch
---

fix: **Votes and comments land on the right post after switching Lemmy servers.** Signing in to a different Lemmy server without reopening PaperWing could send an upvote or comment to an unrelated post there, because each server numbers its posts differently. PaperWing now looks each post up again on the server you're signed in to.
