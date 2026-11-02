---
"paperwing": patch
---

fix: **Joining sync mid-sync starts clean.** Entering a new sync code while this device was still syncing with its old one could carry the old code's place across, so some changes on the new code were missed until the next full sync. The new code now always gets its own first sync.
