// Runs a scheduled task against the local dev server, the way QStash or a cron would:
//   npm run task alerts | edition | directory
// Uses CRON_SECRET (`npm run dev:full` sets it to "local").
const task = process.argv[2]
if (!['alerts', 'edition', 'directory'].includes(task)) throw new Error('Usage: npm run task alerts|edition|directory')
const origin = process.env.DEV_ORIGIN ?? 'http://localhost:5173'
const res = await fetch(`${origin}/api/push?task=${task}`, { headers: { authorization: `Bearer ${process.env.CRON_SECRET ?? 'local'}` } })
console.log(res.status, await res.text())
if (!res.ok) process.exitCode = 1
