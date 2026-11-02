# Security

PaperWing holds things worth protecting: people's sign-ins on their devices, their encrypted sync data, and a server that fetches URLs on their behalf. Thank you for helping keep them safe.

## Reporting a vulnerability

Please report privately, not in a public issue:

- **Preferred:** [report a vulnerability on GitHub](https://github.com/paperwingio/paperwing/security/advisories/new).
- **Or** send a direct message to [@paperwing.io](https://bsky.app/profile/paperwing.io) on Bluesky asking for a private channel.

Include what you found, how to reproduce it, and what someone could do with it. You'll get a reply within a few days. Please give a reasonable amount of time for a fix before disclosing it publicly.

## In scope

- The PaperWing app and its server functions (this repository), and the deployment at paperwing.io.
- Things like cross-site scripting, server-side request forgery, ways to read or change someone else's sync data, sign-in flaws, and ways to run up the deployment's costs or take it down.

Not in scope: the networks PaperWing reads (report those to Bluesky, Mastodon servers, Lemmy servers or Hacker News directly), and findings that need an already-compromised device.
