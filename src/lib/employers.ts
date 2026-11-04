// Employers PaperWing follows for layoffs and hiring: who they are in filings and headlines, and
// where their job board is. Shared by the app (which stories get a Still hiring panel) and the server
// (which WARN notices become stories, and which job board to read). A board is named by its slug or
// Workday tenant, never by an address, so a request can't point the server anywhere else.
//
// Every board here was checked live: it answers and lists that company's own roles. Big Tech
// (Google, Meta, Apple, Amazon, Microsoft) runs its own careers sites, so those are followed for
// layoffs only.

export type JobBoard =
  | { ats: 'greenhouse' | 'ashby' | 'lever'; slug: string }
  /** Workday has no public API; its career pages read JSON from /wday/cxs/<tenant>/<site>/jobs on wd<n>. */
  | { ats: 'workday'; tenant: string; wd: number; site: string }

export interface Employer {
  name: string
  /** Other names it files or is reported under: subsidiaries, old names, legal names. */
  aliases?: string[]
  /** Its name is an everyday word ("Block", "Linear"), so it's only matched where it can't be anything else. */
  generic?: boolean
  board?: JobBoard
}

export const EMPLOYERS: Employer[] = [
  { name: '1Password', aliases: ['AgileBits'], board: { ats: 'ashby', slug: '1password' } },
  { name: 'Abnormal Security', aliases: ['Abnormal'], board: { ats: 'greenhouse', slug: 'abnormalsecurity' } },
  { name: 'Activision Blizzard', aliases: ['Activision', 'Blizzard Entertainment'] },
  { name: 'Adobe', board: { ats: 'workday', tenant: 'adobe', wd: 5, site: 'external_experienced' } },
  { name: 'Affirm', generic: true, board: { ats: 'greenhouse', slug: 'affirm' } },
  { name: 'Airbnb', board: { ats: 'greenhouse', slug: 'airbnb' } },
  { name: 'Airtable', board: { ats: 'greenhouse', slug: 'airtable' } },
  { name: 'Amazon', aliases: ['Amazon.com', 'Amazon Web Services', 'AWS'] },
  { name: 'AMD' },
  { name: 'Amplitude', board: { ats: 'ashby', slug: 'amplitude' } },
  { name: 'Anduril' },
  { name: 'Anthropic', board: { ats: 'greenhouse', slug: 'anthropic' } },
  { name: 'Apple', generic: true },
  { name: 'Asana', board: { ats: 'greenhouse', slug: 'asana' } },
  { name: 'Atlassian' },
  { name: 'Attentive', generic: true, board: { ats: 'greenhouse', slug: 'attentive' } },
  { name: 'Autodesk' },
  { name: 'Automattic' },
  { name: 'Benchling', generic: true, board: { ats: 'ashby', slug: 'benchling' } },
  { name: 'Block', aliases: ['Block, Inc.', 'Square'], generic: true, board: { ats: 'greenhouse', slug: 'block' } },
  { name: 'Box', generic: true, board: { ats: 'greenhouse', slug: 'boxinc' } },
  { name: 'Brex', generic: true, board: { ats: 'greenhouse', slug: 'brex' } },
  { name: 'Broadcom', aliases: ['VMware'], board: { ats: 'workday', tenant: 'broadcom', wd: 1, site: 'External_Career' } },
  { name: 'Bungie' },
  { name: 'Calendly', board: { ats: 'greenhouse', slug: 'calendly' } },
  { name: 'Canva' },
  { name: 'Carvana', board: { ats: 'greenhouse', slug: 'carvana' } },
  { name: 'Chainalysis' },
  { name: 'Character.AI', aliases: ['Character Technologies'], generic: true, board: { ats: 'ashby', slug: 'character' } },
  { name: 'Chegg' },
  { name: 'Chime', generic: true, board: { ats: 'greenhouse', slug: 'chime' } },
  { name: 'Cisco', aliases: ['Cisco Systems'], board: { ats: 'workday', tenant: 'cisco', wd: 5, site: 'Cisco_Careers' } },
  { name: 'ClickHouse', board: { ats: 'ashby', slug: 'clickhouse' } },
  { name: 'Cloudflare', board: { ats: 'greenhouse', slug: 'cloudflare' } },
  { name: 'Cockroach Labs', board: { ats: 'greenhouse', slug: 'cockroachlabs' } },
  { name: 'Cohere', generic: true, board: { ats: 'ashby', slug: 'cohere' } },
  { name: 'Coinbase', board: { ats: 'greenhouse', slug: 'coinbase' } },
  { name: 'Compass', aliases: ['Urban Compass'], generic: true, board: { ats: 'greenhouse', slug: 'urbancompass' } },
  { name: 'Confluent' },
  { name: 'Coursera', generic: true, board: { ats: 'greenhouse', slug: 'coursera' } },
  { name: 'CrowdStrike', board: { ats: 'workday', tenant: 'crowdstrike', wd: 5, site: 'crowdstrikecareers' } },
  { name: 'Cursor', generic: true, board: { ats: 'ashby', slug: 'cursor' } },
  { name: 'Databricks', board: { ats: 'greenhouse', slug: 'databricks' } },
  { name: 'Datadog', board: { ats: 'greenhouse', slug: 'datadog' } },
  { name: 'dbt Labs' },
  { name: 'Deel' },
  { name: 'Dell' },
  { name: 'DigitalOcean' },
  { name: 'Discord', generic: true, board: { ats: 'greenhouse', slug: 'discord' } },
  { name: 'Docker', generic: true, board: { ats: 'ashby', slug: 'docker' } },
  { name: 'DoorDash', aliases: ['DoorDash USA'], board: { ats: 'greenhouse', slug: 'doordashusa' } },
  { name: 'Dropbox', board: { ats: 'greenhouse', slug: 'dropbox' } },
  { name: 'Duolingo', board: { ats: 'greenhouse', slug: 'duolingo' } },
  { name: 'eBay', board: { ats: 'workday', tenant: 'ebay', wd: 5, site: 'apply' } },
  { name: 'Elastic', generic: true, board: { ats: 'greenhouse', slug: 'elastic' } },
  { name: 'Electronic Arts', aliases: ['EA'] },
  { name: 'ElevenLabs', board: { ats: 'ashby', slug: 'elevenlabs' } },
  { name: 'Epic Games', generic: true, board: { ats: 'greenhouse', slug: 'epicgames' } },
  { name: 'Etsy' },
  { name: 'Expedia', board: { ats: 'workday', tenant: 'expedia', wd: 108, site: 'search' } },
  { name: 'Faire', generic: true, board: { ats: 'greenhouse', slug: 'faire' } },
  { name: 'Fastly', board: { ats: 'greenhouse', slug: 'fastly' } },
  { name: 'Figma', board: { ats: 'greenhouse', slug: 'figma' } },
  { name: 'Fivetran', board: { ats: 'greenhouse', slug: 'fivetran' } },
  { name: 'Flexport', board: { ats: 'greenhouse', slug: 'flexport' } },
  { name: 'Gemini', generic: true, board: { ats: 'greenhouse', slug: 'gemini' } },
  { name: 'GitLab', board: { ats: 'greenhouse', slug: 'gitlab' } },
  { name: 'Glean', generic: true, board: { ats: 'greenhouse', slug: 'gleanwork' } },
  { name: 'Gong', aliases: ['Gong.io'], generic: true, board: { ats: 'greenhouse', slug: 'gongio' } },
  { name: 'Google', aliases: ['Alphabet', 'Google LLC'] },
  { name: 'Grafana Labs', board: { ats: 'greenhouse', slug: 'grafanalabs' } },
  { name: 'Grammarly' },
  { name: 'Gusto', generic: true, board: { ats: 'greenhouse', slug: 'gusto' } },
  { name: 'Harvey', generic: true, board: { ats: 'ashby', slug: 'harvey' } },
  { name: 'HashiCorp' },
  { name: 'HP', aliases: ['HP Inc.', 'Hewlett Packard Enterprise', 'HPE'], board: { ats: 'workday', tenant: 'hp', wd: 5, site: 'ExternalCareerSite' } },
  { name: 'HubSpot' },
  { name: 'Hugging Face' },
  { name: 'IBM' },
  { name: 'Indeed' },
  { name: 'Instacart', board: { ats: 'greenhouse', slug: 'instacart' } },
  { name: 'Intel', board: { ats: 'workday', tenant: 'intel', wd: 1, site: 'External' } },
  { name: 'Intercom', aliases: ['Fin'], generic: true, board: { ats: 'greenhouse', slug: 'intercom' } },
  { name: 'Intuit' },
  { name: 'Klarna' },
  { name: 'Klaviyo', board: { ats: 'greenhouse', slug: 'klaviyo' } },
  { name: 'Kraken', generic: true, board: { ats: 'ashby', slug: 'kraken.com' } },
  { name: 'Lattice', generic: true, board: { ats: 'greenhouse', slug: 'lattice' } },
  { name: 'Linear', generic: true, board: { ats: 'ashby', slug: 'linear' } },
  { name: 'Lucid', aliases: ['Lucid Motors', 'Lucid USA'], generic: true, board: { ats: 'greenhouse', slug: 'lucidmotors' } },
  { name: 'Lyft', generic: true, board: { ats: 'greenhouse', slug: 'lyft' } },
  { name: 'Mercury', generic: true, board: { ats: 'greenhouse', slug: 'mercury' } },
  { name: 'Meta', aliases: ['Meta Platforms', 'Facebook'], generic: true },
  { name: 'Micron', board: { ats: 'workday', tenant: 'micron', wd: 1, site: 'External' } },
  { name: 'Microsoft', aliases: ['LinkedIn', 'GitHub'] },
  { name: 'Miro', generic: true, board: { ats: 'ashby', slug: 'miro' } },
  { name: 'Mistral' },
  { name: 'Mixpanel', generic: true, board: { ats: 'greenhouse', slug: 'mixpanel' } },
  { name: 'Modal', generic: true, board: { ats: 'ashby', slug: 'modal' } },
  { name: 'MongoDB', board: { ats: 'greenhouse', slug: 'mongodb' } },
  { name: 'Monzo', generic: true, board: { ats: 'greenhouse', slug: 'monzo' } },
  { name: 'Mozilla', board: { ats: 'greenhouse', slug: 'mozilla' } },
  { name: 'N26', board: { ats: 'greenhouse', slug: 'n26' } },
  { name: 'Navan', aliases: ['TripActions'], generic: true, board: { ats: 'greenhouse', slug: 'tripactions' } },
  { name: 'Netflix' },
  { name: 'Netlify', board: { ats: 'greenhouse', slug: 'netlify' } },
  { name: 'Nextdoor', board: { ats: 'greenhouse', slug: 'nextdoor' } },
  { name: 'Notion', generic: true, board: { ats: 'ashby', slug: 'notion' } },
  { name: 'Nubank', board: { ats: 'ashby', slug: 'nubank' } },
  { name: 'Nuro', generic: true, board: { ats: 'greenhouse', slug: 'nuro' } },
  { name: 'Nvidia', board: { ats: 'workday', tenant: 'nvidia', wd: 5, site: 'NVIDIAExternalCareerSite' } },
  { name: 'Okta', generic: true, board: { ats: 'greenhouse', slug: 'okta' } },
  { name: 'OpenAI', board: { ats: 'ashby', slug: 'openai' } },
  { name: 'Opendoor' },
  { name: 'Oracle' },
  { name: 'Outreach', generic: true, board: { ats: 'lever', slug: 'outreach' } },
  { name: 'PagerDuty', board: { ats: 'greenhouse', slug: 'pagerduty' } },
  { name: 'Palantir', board: { ats: 'lever', slug: 'palantir' } },
  { name: 'PayPal', board: { ats: 'workday', tenant: 'paypal', wd: 1, site: 'jobs' } },
  { name: 'Peloton', board: { ats: 'greenhouse', slug: 'peloton' } },
  { name: 'Perplexity', generic: true, board: { ats: 'ashby', slug: 'perplexity' } },
  { name: 'Pinecone', generic: true, board: { ats: 'ashby', slug: 'pinecone' } },
  { name: 'Pinterest', board: { ats: 'greenhouse', slug: 'pinterest' } },
  { name: 'Plaid', generic: true, board: { ats: 'ashby', slug: 'plaid' } },
  { name: 'PlanetScale', board: { ats: 'greenhouse', slug: 'planetscale' } },
  { name: 'PostHog', board: { ats: 'ashby', slug: 'posthog' } },
  { name: 'Postman' },
  { name: 'Pure Storage', aliases: ['Everpure'], board: { ats: 'greenhouse', slug: 'purestorage' } },
  { name: 'Qualcomm' },
  { name: 'Ramp', generic: true, board: { ats: 'ashby', slug: 'ramp' } },
  { name: 'Reddit', generic: true, board: { ats: 'greenhouse', slug: 'reddit' } },
  { name: 'Redfin' },
  { name: 'Replit', board: { ats: 'ashby', slug: 'replit' } },
  { name: 'Retool' },
  { name: 'Revolut' },
  { name: 'Riot Games', generic: true, board: { ats: 'greenhouse', slug: 'riotgames' } },
  { name: 'Rippling' },
  { name: 'Rivian' },
  { name: 'Robinhood', board: { ats: 'greenhouse', slug: 'robinhood' } },
  { name: 'Roblox', board: { ats: 'greenhouse', slug: 'roblox' } },
  { name: 'Runway', generic: true, board: { ats: 'ashby', slug: 'runway' } },
  { name: 'Salesforce', aliases: ['Slack Technologies', 'Tableau'], board: { ats: 'workday', tenant: 'salesforce', wd: 12, site: 'External_Career_Site' } },
  { name: 'Samsara', generic: true, board: { ats: 'greenhouse', slug: 'samsara' } },
  { name: 'Scale AI', aliases: ['Scale'], generic: true, board: { ats: 'greenhouse', slug: 'scaleai' } },
  { name: 'SentinelOne', board: { ats: 'greenhouse', slug: 'sentinellabs' } },
  { name: 'Sentry', generic: true, board: { ats: 'ashby', slug: 'sentry' } },
  { name: 'ServiceNow' },
  { name: 'Shopify' },
  { name: 'Sigma Computing', generic: true, board: { ats: 'greenhouse', slug: 'sigmacomputing' } },
  { name: 'Snap', generic: true, board: { ats: 'workday', tenant: 'snapchat', wd: 1, site: 'snap' } },
  { name: 'Snowflake', generic: true, board: { ats: 'ashby', slug: 'snowflake' } },
  { name: 'Snyk', board: { ats: 'ashby', slug: 'snyk' } },
  { name: 'SoFi', board: { ats: 'greenhouse', slug: 'sofi' } },
  { name: 'SpaceX', board: { ats: 'greenhouse', slug: 'spacex' } },
  { name: 'Spotify', board: { ats: 'lever', slug: 'spotify' } },
  { name: 'Squarespace', generic: true, board: { ats: 'greenhouse', slug: 'squarespace' } },
  { name: 'Stripe', board: { ats: 'greenhouse', slug: 'stripe' } },
  { name: 'Supabase', board: { ats: 'ashby', slug: 'supabase' } },
  { name: 'Tailscale', board: { ats: 'greenhouse', slug: 'tailscale' } },
  { name: 'Temporal', generic: true, board: { ats: 'ashby', slug: 'temporal' } },
  { name: 'Tesla' },
  { name: 'Toast', generic: true, board: { ats: 'greenhouse', slug: 'toast' } },
  { name: 'Together AI', generic: true, board: { ats: 'greenhouse', slug: 'togetherai' } },
  { name: 'Twilio', board: { ats: 'greenhouse', slug: 'twilio' } },
  { name: 'Twitch', generic: true, board: { ats: 'greenhouse', slug: 'twitch' } },
  { name: 'Twitter/X', aliases: ['X Corp', 'Twitter', 'xAI'] },
  { name: 'Uber' },
  { name: 'Udemy', board: { ats: 'greenhouse', slug: 'udemy' } },
  { name: 'Unity', generic: true },
  { name: 'Vanta', generic: true, board: { ats: 'ashby', slug: 'vanta' } },
  { name: 'Vercel', board: { ats: 'greenhouse', slug: 'vercel' } },
  { name: 'Wayfair' },
  { name: 'Waymo', board: { ats: 'greenhouse', slug: 'waymo' } },
  { name: 'Webflow', board: { ats: 'ashby', slug: 'webflow' } },
  { name: 'Weights & Biases' },
  { name: 'Wikimedia', board: { ats: 'greenhouse', slug: 'wikimedia' } },
  { name: 'Wiz', aliases: ['Wiz, Inc.'], generic: true, board: { ats: 'greenhouse', slug: 'wizinc' } },
  { name: 'Workday', generic: true, board: { ats: 'workday', tenant: 'workday', wd: 5, site: 'Workday' } },
  { name: 'Yelp' },
  { name: 'Zapier', board: { ats: 'ashby', slug: 'zapier' } },
  { name: 'Zendesk', board: { ats: 'workday', tenant: 'zendesk', wd: 1, site: 'zendesk' } },
  { name: 'Zillow', board: { ats: 'workday', tenant: 'zillow', wd: 5, site: 'Zillow_Group_External' } },
  { name: 'Zoom', generic: true },
  { name: 'Zoox', board: { ats: 'lever', slug: 'zoox' } },
  { name: 'Zscaler', board: { ats: 'greenhouse', slug: 'zscaler' } },
]

const BY_NAME = new Map(EMPLOYERS.map((e) => [e.name, e]))
export const employerByName = (name: string): Employer | undefined => BY_NAME.get(name)

const SUFFIXES = new Set(['inc', 'incorporated', 'llc', 'l', 'c', 'corp', 'corporation', 'co', 'company', 'ltd', 'limited', 'plc', 'lp', 'llp', 'pbc', 'gmbh', 'holdings', 'usa', 'us', 'na'])

/** A company name as filings write it, reduced to compare: "Amazon.com Services, LLC" is "amazon com services". */
export function legalName(name: string): string {
  const words = name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’]/g, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
  while (words.length && SUFFIXES.has(words[words.length - 1])) words.pop()
  if (words[0] === 'the') words.shift()
  return words.join(' ')
}

const namesOf = (e: Employer) => [...e.name.split('/'), ...(e.aliases ?? [])]

const exact = new Map<string, Employer>()
const prefixes: [string, Employer][] = []
for (const e of EMPLOYERS) {
  for (const n of namesOf(e)) {
    const key = legalName(n)
    if (!key) continue
    if (!exact.has(key)) exact.set(key, e)
    // "Amazon - SJC13" is Amazon, but "Block Builders" isn't Block: an everyday-word name only
    // prefix-matches through a name of two words or more ("Meta Platforms - Menlo Park"), or with its
    // legal suffix still on ("Apple, Inc. - Cupertino").
    if (!e.generic || key.includes(' ')) prefixes.push([key, e])
    else for (const suffix of ['inc', 'llc', 'corp', 'corporation']) prefixes.push([`${key} ${suffix}`, e])
  }
}
prefixes.sort((a, b) => b[0].length - a[0].length)

/** The employer behind a filer's name on a WARN notice, which often adds a site ("Intel Corporation - SC-12"). */
export function employerFiling(filer: string): Employer | undefined {
  const key = legalName(filer)
  const hit = exact.get(key)
  if (hit) return hit
  return prefixes.find(([p]) => key.startsWith(p + ' '))?.[1]
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** Words that say a company is cutting, right after its name: "Block lays off", "Linear's layoffs". */
const CUTTING = String.raw`(?:['’]s)?\s+(?:is\s+|will\s+|to\s+|has\s+|reportedly\s+)?(?:lay|lays|laid|laying|cut|cuts|cutting|slash|slashes|eliminat\w*|layoffs?|job cuts|announce\w*|begins?)\b`
const mentions = EMPLOYERS.map((e) => {
  const names = namesOf(e)
    .filter((n) => n.length > 1)
    .sort((a, b) => b.length - a.length)
    .map(escape)
    .join('|')
  // Case-sensitive: headlines capitalise company names, and "block" or "box" in lower case is a word.
  // Not inside a domain, path or handle ("amazon.com", "@netflix").
  return { e, re: new RegExp(String.raw`(?<![\w.@/])(?:${names})${e.generic ? CUTTING : String.raw`(?![\w-])`}`) }
})

/** Every employer a headline or post names. */
export function employersIn(text: string): Employer[] {
  return mentions.filter((m) => m.re.test(text)).map((m) => m.e)
}

export const LAYOFF_WORDS =
  /\blay ?offs?\b|\blaid off\b|\blays off\b|\blaying off\b|\bjob cuts\b|\bcuts? (?:\d[\d,]* )?(?:jobs|roles|staff|workers|employees)\b|\bcutting (?:\d[\d,]* )?(?:jobs|roles|staff)\b|\bworkforce reduction\b|\bredundanc|\bWARN notice\b/i

/**
 * The employer a layoff story is about, when its job board can be read: what the Still hiring panel
 * shows. One employer only: a headline naming two ("Adobe rival Canva cuts…") is about neither for sure.
 */
export function hiringEmployer(text: string): Employer | undefined {
  if (!LAYOFF_WORDS.test(text)) return undefined
  const found = employersIn(text)
  return found.length === 1 && found[0].board ? found[0] : undefined
}
