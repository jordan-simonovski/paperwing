import { compileTerm, TOPIC_BY_ID } from './topics.js'

/**
 * Bluesky custom feeds served by api/atproto.ts and published to the owner's account by
 * scripts/publish-feeds.mjs.
 *
 * General Bluesky is not a tech forum, so these use strong terms only: words that mean the tech
 * thing on their own ("OpenTelemetry", not "metrics"; "CVE", not "exploit"). The same list is the
 * search query and the filter a post must pass, because Bluesky's search stems and fuzzes.
 * Term syntax as in Topic.terms: = case-sensitive, * prefix.
 */
export interface BskyFeedDef {
  /**
   * For the merged feed only: topic feeds to draw from, and the stricter bar it holds them to
   * (a shared link, or two strong terms) so passing mentions in opinion posts stay out.
   */
  merge?: { from: string[]; minHits: number }
  /** Record key of the app.bsky.feed.generator record. Short and stable: changing it orphans the feed. */
  rkey: string
  displayName: string
  description: string
  terms: string[]
  /** Topic ids the feed's posts are tagged with in PaperWing. */
  topics: string[]
}

const STRONG: Record<string, string[]> = {
  ai: ['OpenAI', 'Anthropic', 'DeepMind', 'ChatGPT', 'generative AI', 'frontier model', 'frontier models', 'AI model', 'AI models', 'AI lab', 'AI labs', 'Gemini model'],
  llms: ['=LLM', '=LLMs', 'open weights', 'open-weight', 'fine-tuning', 'fine-tuned', 'Llama 4', 'Qwen', 'DeepSeek', 'Mistral AI', 'language model', 'language models', 'context window', '=RLHF'],
  agents: ['AI agent', 'AI agents', 'coding agent', 'coding agents', 'MCP server', 'Model Context Protocol', 'Claude Code', 'agentic', 'tool calling', 'function calling', 'vibe coding'],
  'ml-research': ['arxiv', 'preprint', 'NeurIPS', 'ICLR', 'ICML', 'machine learning', 'deep learning', 'interpretability', 'reinforcement learning'],
  'ai-infra': ['=CUDA', 'vLLM', 'llama.cpp', 'Ollama', 'GPU cluster', 'inference engine', 'quantization', '=H100', '=B200', 'Google TPU', 'Cloud TPU', 'TPU pod', 'Blackwell GPU'],
  observability: [
    'OpenTelemetry',
    '=OTel',
    'observability',
    'distributed tracing',
    'eBPF',
    'Grafana',
    'PromQL',
    'Datadog',
    'Jaeger tracing',
    'SigNoz',
    'Pyroscope',
    'Honeycomb.io',
    'Prometheus metrics',
    'Prometheus exporter',
  ],
  sre: [
    '=SRE',
    '=SREs',
    'site reliability',
    'incident postmortem',
    'blameless postmortem',
    'outage postmortem',
    'incident review',
    'incident response',
    'on-call rotation',
    'error budget',
    'error budgets',
    'chaos engineering',
  ],
  'cloud-native': ['Kubernetes', '=K8s', '=k8s', 'Terraform', 'OpenTofu', 'platform engineering', 'Helm chart', 'Cilium', 'service mesh', 'Istio', 'ArgoCD', 'GitOps', 'Docker'],
  distributed: [
    'distributed systems',
    'distributed system',
    'Raft consensus',
    'Paxos',
    'Apache Kafka',
    'Kafka cluster',
    'Kafka topics',
    'CRDT',
    'CRDTs',
    'Jepsen test',
    'Jepsen analysis',
    'jepsen.io',
    'linearizability',
    'consensus algorithm',
  ],
  databases: ['Postgres', 'PostgreSQL', 'SQLite', 'DuckDB', 'ClickHouse', 'pgvector', 'MySQL', 'query planner', 'MongoDB', 'TigerBeetle', 'Redis', 'Valkey'],
  programming: ['software engineering', 'software engineer', 'software engineers', 'programmers', 'code review', 'compiler', 'compilers', 'refactoring', 'pull request', 'unit tests', 'type system'],
  languages: [
    'rustlang',
    'Rust programming',
    'Rust 1.*',
    'golang',
    '=Go 1.*',
    'ziglang',
    'Zig language',
    'TypeScript',
    'Python 3.*',
    'elixirlang',
    'Phoenix LiveView',
    'Haskell language',
    '=GHC',
    'OCaml',
    'Kotlin',
  ],
  web: [
    'JavaScript',
    'TypeScript',
    '=CSS',
    'React Native',
    'ReactJS',
    'React components',
    'React app',
    'React 19',
    'React Server Components',
    'web platform',
    'WebAssembly',
    '=WASM',
    'Svelte',
    'Next.js',
    'webdev',
    'web dev',
    'WebKit',
  ],
  'open-source': ['open source', 'open-source', 'Show HN', 'maintainers', '=FOSS', 'GitHub repo', 'open sourced'],
  security: [
    'infosec',
    '=CVE',
    '=CVE-*',
    'zero-day',
    '0day',
    'ransomware',
    'supply chain attack',
    'malware',
    'security researcher',
    'security researchers',
    '=RCE',
    'remote code execution',
    'data breach',
  ],
  hardware: [
    'semiconductor',
    'semiconductors',
    'RISC-V',
    'TSMC',
    'Apple silicon',
    'chipmaker',
    'chipmakers',
    'Raspberry Pi',
    '=FPGAs',
    'FPGA board',
    'Qualcomm Snapdragon',
    'Snapdragon X',
    'AMD Ryzen',
    'Ryzen 9',
  ],
  industry: ['tech industry', 'Big Tech', 'tech layoffs', 'tech companies', 'tech company', 'tech giant', 'tech giants', 'Silicon Valley', 'venture capital'],
  leadership: [
    'engineering manager',
    'engineering managers',
    'engineering management',
    'engineering leadership',
    'staff engineer',
    'staff engineers',
    'tech lead',
    'developer productivity',
    'developer experience',
    'engineering teams',
  ],
}

/** Election-cycle politics floods general search. A post mentioning it needs two strong terms. */
export const OFF_TOPIC = [
  'Trump',
  'MAGA',
  'Biden',
  'Republican*',
  'Democrat*',
  '=GOP',
  'election',
  'Congress',
  'Senate',
  'Gaza',
  'Israel*',
  'Ukrain*',
  'Russia*',
  'Putin',
  'Venezuela*',
  'immigra*',
  '=ICE',
  'abortion',
  'Epstein',
  'Musk',
  '=DOGE',
  'fascis*',
]

export const BSKY_FEEDS: BskyFeedDef[] = [
  {
    rkey: 'tech',
    displayName: 'PaperWing Tech',
    description: 'Tech on Bluesky without the noise: AI, observability, infrastructure, databases, languages and security, filtered by PaperWing and ranked by how fast posts are moving.',
    terms: [],
    // Industry stays its own feed: on Bluesky it is mostly commentary rather than news.
    topics: Object.keys(STRONG).filter((id) => id !== 'industry'),
    merge: { from: Object.keys(STRONG).filter((id) => id !== 'industry'), minHits: 2 },
  },
  ...Object.entries(STRONG).map(([id, terms]) => {
    const t = TOPIC_BY_ID.get(id)!
    return {
      rkey: id,
      displayName: t.label,
      description: `${t.blurb}. Bluesky posts filtered to this topic by PaperWing, ranked by how fast they are moving.`,
      terms,
      topics: [id],
    }
  }),
]

export const BSKY_FEED_BY_RKEY = new Map(BSKY_FEEDS.map((f) => [f.rkey, f]))

/** The search side: terms joined with Bluesky's || in batches, quoted where they have spaces. */
export function searchQueries(feed: BskyFeedDef, batch = 8): string[] {
  const plain = [...new Set(feed.terms.map((t) => t.replace(/^=/, '').replace(/\*$/, '').replace(/[.-]$/, '').trim()).filter(Boolean))]
  const out: string[] = []
  for (let i = 0; i < plain.length; i += batch)
    out.push(
      plain
        .slice(i, i + batch)
        .map((t) => (/[\s.:+-]/.test(t) ? `"${t}"` : t))
        .join(' || '),
    )
  return out
}

const compiled = new Map<string, RegExp[]>()
const patterns = (key: string, terms: string[]) => {
  let list = compiled.get(key)
  if (!list) compiled.set(key, (list = terms.map(compileTerm)))
  return list
}

/** Which of a feed's strong terms appear in the text. For debugging a feed's precision. */
export function strongTerms(feed: BskyFeedDef, text: string): string[] {
  return patterns(feed.rkey, feed.terms).flatMap((re, i) => (re.test(text) ? [feed.terms[i]] : []))
}

/** How many of a feed's strong terms appear in the text (distinct terms, not occurrences). */
export function strongHits(feed: BskyFeedDef, text: string): number {
  return patterns(feed.rkey, feed.terms).filter((re) => re.test(text)).length
}

export function isOffTopic(text: string): boolean {
  return patterns('__off', OFF_TOPIC).some((re) => re.test(text))
}
