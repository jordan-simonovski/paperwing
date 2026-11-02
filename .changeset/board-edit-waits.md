---
"paperwing": patch
---

fix: **Editing a board waits for it to load.** Opening your board's editor used to show an empty "Start a board" form until the board arrived, and saving that form replaced your board with a new, empty one. The editor now waits for your board, and says so with a way to try again if it can't reach it.
