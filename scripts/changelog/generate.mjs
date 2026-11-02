import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { formatChangelog, releaseDate } from './format.mjs'
import { parseChangelog } from './parse.mjs'

// Run after `changeset version` (npm run release): rewrites CHANGELOG.md as "What's new" and writes
// the copy the app shows (src/generated/changelog.json), checking both agree with package.json.

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const md = formatChangelog(readFileSync(join(root, 'CHANGELOG.md'), 'utf8'), releaseDate())
const parsed = parseChangelog(md)
if (!parsed.releases.length) throw new Error('CHANGELOG.md has no releases ("## x.y.z" headings)')
if (parsed.version !== pkg.version) throw new Error(`package.json is ${pkg.version} but CHANGELOG.md's latest release is ${parsed.version}`)
writeFileSync(join(root, 'CHANGELOG.md'), md)
writeFileSync(join(root, 'src', 'generated', 'changelog.json'), JSON.stringify(parsed, null, 2) + '\n')
console.log(`What's new: v${parsed.version}, ${parsed.releases.length} release${parsed.releases.length === 1 ? '' : 's'}`)
