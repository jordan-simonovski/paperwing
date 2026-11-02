import { GENERAL_TOPICS } from './packs.js'
import type { Story } from './types.js'

export type FeedRef =
  | { kind: 'hn'; list: 'top' | 'new' | 'best' | 'ask' | 'show' }
  /** `topic` re-checks results against that topic's terms; `anyWord` ORs the query words. */
  | { kind: 'hnSearch'; query: string; topic?: string; anyWord?: boolean }
  | { kind: 'lobsters'; path: string }
  | { kind: 'devto'; tag: string }
  | { kind: 'rss'; url: string; label: string }
  | { kind: 'arxiv'; q: string }
  | { kind: 'hf' }
  | { kind: 'github'; q: string }
  /** One of PaperWing's own Bluesky feeds (src/lib/bskyFeeds.ts), served by api/atproto.ts. */
  | { kind: 'releases'; repos: string[] }
  | { kind: 'bluesky'; feed: string }
  /** A Lemmy community as programming.dev sees it ("technology@lemmy.world"). `topic` re-checks posts against that topic. */
  | { kind: 'frontpage'; feed: 'hot' | 'new' | 'top' }
  | { kind: 'bskyFeed'; uri: string; name: string }
  | { kind: 'lemmy'; community: string; sort?: 'Hot' | 'Active' | 'New' | 'TopDay' | 'TopWeek'; topic?: string; via?: string }
  /** PaperWing's own front page (submissions: Bluesky posts listed on PaperWing), or one board. */
  | { kind: 'paperwing'; sort: 'hot' | 'new' | 'top'; board?: string }
  /** Headlines from anywhere matching a search (news search RSS): what makes a free-text interest work for any subject. */
  | { kind: 'news'; q: string }
  /** Mastodon through the reader's server: its tech trends, hashtags, or their home timeline. */
  | { kind: 'mastodon'; feed: 'trends' | 'home' | 'tags'; tags?: string[]; topic?: string; topics?: string[] }
  /** What someone has listed on PaperWing, newest first (api/_lib/people.ts). `actor` is a handle or DID. */
  | { kind: 'person'; actor: string; label?: string }
  /** A community board's listings (api/_lib/boards.ts). */
  | { kind: 'board'; did: string; rkey: string; sort: 'hot' | 'new' | 'top'; name?: string }
  /** Incidents from providers' status pages (api/_lib/statuspages.ts); every provider when `providers` is unset. */
  | { kind: 'status'; providers?: string[]; active?: boolean; hosts?: string[] }

export type ClusterId = 'intelligence' | 'systems' | 'code' | 'world' | 'news' | 'science' | 'culture' | 'sport' | 'making' | 'life'

/** Topics come in packs: tech (where PaperWing started) and everything else. */
export type Pack = 'tech' | 'general'

export const CLUSTERS: Record<ClusterId, { label: string; blurb: string; pack: Pack }> = {
  news: { label: 'News', blurb: 'The world, its politics and its money', pack: 'general' },
  science: { label: 'Science', blurb: 'Findings, fields and the papers behind them', pack: 'general' },
  culture: { label: 'Culture', blurb: 'Screens, records, books and games', pack: 'general' },
  sport: { label: 'Sport', blurb: 'Results and the stories around them', pack: 'general' },
  making: { label: 'Making', blurb: 'Printers, circuits and things people build', pack: 'general' },
  life: { label: 'Life', blurb: 'The everyday good stuff', pack: 'general' },
  intelligence: { label: 'Intelligence', blurb: 'Models, agents, papers and the hardware under them', pack: 'tech' },
  systems: { label: 'Systems', blurb: 'Running software in production and knowing what it is doing', pack: 'tech' },
  code: { label: 'Code', blurb: 'Languages, craft and the open source commons', pack: 'tech' },
  world: { label: 'Industry', blurb: 'Security, hardware and the industry around it', pack: 'tech' },
}

export interface Topic {
  id: string
  label: string
  hue: number
  cluster: ClusterId
  blurb: string
  /**
   * Match terms. Plain terms are case-insensitive whole words ("k8s", "open source").
   * A trailing * allows suffixes ("observab*"). A leading = is case-sensitive ("=Go").
   */
  terms: string[]
  related: string[]
  feeds: FeedRef[]
  /** HN keyword query. Results are re-checked against `terms` to drop noise. */
  hnQuery?: string
  /** GitHub repositories whose releases belong in this topic (the release radar). */
  repos?: string[]
  /**
   * Lemmy communities for this topic, busiest first. `check` re-checks a broad community's posts
   * against `terms`. `via` is the instance that reads it (programming.dev when unset).
   */
  lemmy?: { community: string; check?: boolean; via?: string }[]
  /**
   * Community-run Bluesky feeds for this topic, shown on its own page. `forYou` also reads it in
   * For you, for a topic whose conversation is the news (researchers sharing their papers).
   */
  bsky?: { uri: string; name: string; forYou?: boolean }[]
  /** Mastodon hashtags, without the #. */
  mastodon?: string[]
  /** Status pages whose incidents belong here, by id from api/_lib/statuspages.ts; 'all' for every one. */
  status?: string[] | 'all'
}

const rss = (url: string, label: string): FeedRef => ({ kind: 'rss', url, label })

const TECH_TOPICS: Topic[] = [
  {
    id: 'ai',
    status: ['openai', 'claude'],
    lemmy: [{ community: 'technology@lemmy.world', check: true }, { community: 'artificial_intel@lemmy.ml' }],
    mastodon: ['ai', 'genai', 'machinelearning'],
    label: 'AI',
    hue: 28,
    cluster: 'intelligence',
    blurb: 'Frontier labs, products and the arguments about them',
    terms: [
      '=AI',
      'artificial intelligence',
      'openai',
      'anthropic',
      'deepmind',
      'chatgpt',
      'claude',
      'gemini',
      'copilot',
      'generative',
      'genai',
      'machine learning',
      '=ML',
      'neural net*',
      'diffusion',
      'midjourney',
      'sora',
      'agi',
    ],
    related: ['llms', 'agents', 'ml-research', 'ai-infra'],
    hnQuery: 'AI OpenAI Anthropic LLM Claude Gemini DeepMind',
    feeds: [
      { kind: 'lobsters', path: 't/ai' },
      { kind: 'devto', tag: 'ai' },
      rss('https://simonwillison.net/atom/everything/', 'Simon Willison'),
      rss('https://openai.com/news/rss.xml', 'OpenAI'),
      rss('https://deepmind.google/blog/rss.xml', 'Google DeepMind'),
      rss('https://www.interconnects.ai/feed', 'Interconnects'),
      rss('https://importai.substack.com/feed', 'Import AI'),
      rss('https://magazine.sebastianraschka.com/feed', 'Ahead of AI'),
      rss('https://www.aisnakeoil.com/feed', 'AI Snake Oil'),
      rss('https://epoch.ai/atom.xml', 'Epoch AI'),
      rss('https://lastweekin.ai/feed', 'Last Week in AI'),
      rss('https://karpathy.bearblog.dev/feed/', 'Andrej Karpathy'),
    ],
  },
  {
    id: 'llms',
    status: ['openai', 'claude'],
    lemmy: [{ community: 'localllama@sh.itjust.works' }],
    mastodon: ['llm', 'llms', 'localllama', 'ollama'],
    label: 'LLMs',
    hue: 48,
    cluster: 'intelligence',
    blurb: 'Language models, open weights, prompting and evals',
    terms: [
      'llm*',
      'large language model*',
      'gpt-*',
      'gpt',
      'claude',
      'gemini',
      'llama',
      'qwen',
      'deepseek',
      'mistral',
      'gemma',
      'phi-*',
      'open weights',
      'open-weight',
      'prompt*',
      'context window',
      'fine-tun*',
      'rlhf',
      'tokeniz*',
      'eval*',
      'hallucinat*',
      'rag',
      'embedding*',
      'reasoning model*',
    ],
    related: ['ai', 'agents', 'ai-infra', 'ml-research'],
    repos: ['ollama/ollama', 'huggingface/transformers'],
    hnQuery: 'LLM GPT Claude Llama Qwen DeepSeek Mistral prompt fine-tuning',
    feeds: [
      { kind: 'devto', tag: 'llm' },
      rss('https://www.latent.space/feed', 'Latent Space'),
      rss('https://huggingface.co/blog/feed.xml', 'Hugging Face'),
      rss('https://hamel.dev/index.xml', 'Hamel Husain'),
    ],
  },
  {
    id: 'agents',
    lemmy: [{ community: 'technology@lemmy.world', check: true }, { community: 'aicoding@programming.dev' }],
    mastodon: ['aiagents', 'agenticai', 'aicoding'],
    label: 'Agents',
    hue: 12,
    cluster: 'intelligence',
    blurb: 'Coding agents, tool use, MCP and autonomous workflows',
    terms: [
      'agents?',
      'agentic',
      '=MCP',
      'model context protocol',
      'tool use',
      'tool calling',
      'function calling',
      'claude code',
      '=Cursor',
      '=Codex',
      'copilot',
      'aider',
      'devin',
      'vibe coding',
      'computer use',
      'browser use',
    ],
    related: ['llms', 'ai', 'programming'],
    repos: ['anthropics/claude-code', 'openai/codex', 'langchain-ai/langgraph', 'modelcontextprotocol/typescript-sdk'],
    hnQuery: 'agent agents agentic MCP "coding agent" "Claude Code" Codex Cursor',
    feeds: [
      { kind: 'lobsters', path: 't/vibecoding' },
      { kind: 'devto', tag: 'agents' },
      rss('https://simonwillison.net/atom/everything/', 'Simon Willison'),
      rss('https://www.latent.space/feed', 'Latent Space'),
      { kind: 'github', q: 'topic:ai-agents' },
    ],
  },
  {
    id: 'ml-research',
    mastodon: ['machinelearning', 'deeplearning'],
    label: 'Papers',
    hue: 290,
    cluster: 'intelligence',
    blurb: 'Fresh research and white papers, ranked by the people who read them',
    terms: ['arxiv', 'paper', 'preprint', 'neurips', 'icml', 'iclr', 'benchmark*', 'dataset*', 'reinforcement learning', 'transformer*', 'interpretability', 'scaling law*', 'white ?paper'],
    related: ['ai', 'llms', 'distributed'],
    feeds: [
      { kind: 'hf' },
      { kind: 'arxiv', q: 'cat:cs.AI OR cat:cs.LG OR cat:cs.CL' },
      rss('https://bair.berkeley.edu/blog/feed.xml', 'BAIR'),
      rss('https://lilianweng.github.io/index.xml', 'Lil’Log'),
      rss('https://research.google/blog/rss/', 'Google Research'),
    ],
  },
  {
    id: 'ai-infra',
    mastodon: ['cuda', 'vllm', 'mlops'],
    label: 'AI Infra',
    hue: 64,
    cluster: 'intelligence',
    blurb: 'GPUs, inference engines, serving and local models',
    terms: [
      'gpu*',
      'cuda',
      'nvidia',
      'tpu*',
      'inference',
      'vllm',
      'sglang',
      'triton',
      'quantiz*',
      'llama.cpp',
      'ollama',
      'gguf',
      'h100',
      'h200',
      'b200',
      'blackwell',
      'onnx',
      'mlx',
      'tensorrt',
      'training run*',
    ],
    related: ['llms', 'hardware', 'cloud-native'],
    repos: ['vllm-project/vllm', 'sgl-project/sglang', 'NVIDIA/TensorRT-LLM'],
    hnQuery: 'GPU CUDA inference vLLM llama.cpp Ollama quantization Nvidia',
    feeds: [rss('https://newsletter.semianalysis.com/feed', 'SemiAnalysis'), rss('https://developer.nvidia.com/blog/feed', 'NVIDIA Technical Blog'), { kind: 'github', q: 'topic:llm-inference' }],
  },
  {
    id: 'observability',
    status: ['datadog', 'grafana', 'honeycomb', 'sentry', 'newrelic', 'elastic', 'incidentio'],
    lemmy: [{ community: 'devops@programming.dev', check: true }],
    mastodon: ['observability', 'opentelemetry', 'otel', 'o11y', 'prometheus', 'grafana'],
    label: 'Observability',
    hue: 168,
    cluster: 'systems',
    blurb: 'Traces, metrics, logs, profiles and the tools that make sense of them',
    terms: [
      'observab*',
      'opentelemetry',
      'otel',
      'tracing',
      'traces',
      'distributed tracing',
      'telemetry',
      'prometheus',
      'grafana',
      'datadog',
      'honeycomb',
      'new relic',
      'splunk',
      'dynatrace',
      'jaeger',
      'tempo',
      'loki',
      'mimir',
      'thanos',
      'victoriametrics',
      'signoz',
      'pyroscope',
      'profiling',
      'ebpf',
      'metrics',
      'logging',
      'structured logs',
      'apm',
      'cardinality',
      'dashboards',
      'alerting',
      'monitoring',
    ],
    related: ['sre', 'cloud-native', 'distributed', 'databases'],
    repos: ['open-telemetry/opentelemetry-collector-releases', 'prometheus/prometheus', 'grafana/grafana', 'grafana/loki', 'grafana/tempo', 'jaegertracing/jaeger', 'vectordotdev/vector'],
    hnQuery: 'observability OpenTelemetry tracing Prometheus Grafana Datadog Honeycomb eBPF monitoring',
    feeds: [
      { kind: 'devto', tag: 'observability' },
      { kind: 'devto', tag: 'opentelemetry' },
      rss('https://opentelemetry.io/blog/index.xml', 'OpenTelemetry'),
      rss('https://grafana.com/blog/index.xml', 'Grafana Labs'),
      rss('https://www.honeycomb.io/feed', 'Honeycomb'),
      rss('https://charity.wtf/feed/', 'charity.wtf'),
      rss('https://www.datadoghq.com/blog/index.xml', 'Datadog'),
      rss('https://prometheus.io/blog/feed.xml', 'Prometheus'),
      { kind: 'github', q: 'topic:observability' },
      { kind: 'arxiv', q: 'abs:observability OR abs:"distributed tracing"' },
    ],
  },
  {
    id: 'sre',
    status: 'all',
    lemmy: [{ community: 'devops@programming.dev' }, { community: 'sysadmin@lemmy.world' }],
    mastodon: ['sre', 'oncall', 'incidentresponse', 'postmortem'],
    label: 'SRE & Incidents',
    hue: 352,
    cluster: 'systems',
    blurb: 'Reliability practice, on-call, postmortems and outages',
    terms: [
      '=SRE',
      'site reliability',
      'incident*',
      'postmortem*',
      'post-mortem*',
      'outage*',
      'on-call',
      'oncall',
      '=SLO*',
      'error budget*',
      'resilien*',
      'chaos engineering',
      'downtime',
      'root cause',
      'reliability',
    ],
    related: ['observability', 'cloud-native', 'distributed'],
    hnQuery: 'outage postmortem incident SRE on-call reliability downtime',
    feeds: [{ kind: 'devto', tag: 'sre' }, rss('https://sreweekly.com/feed/', 'SRE Weekly'), rss('https://incident.io/blog.xml', 'incident.io')],
  },
  {
    id: 'cloud-native',
    status: ['cloudflare', 'vercel', 'netlify', 'fly', 'supabase', 'digitalocean', 'render', 'hashicorp', 'docker'],
    lemmy: [{ community: 'kubernetes@programming.dev' }, { community: 'docker@programming.dev' }],
    mastodon: ['kubernetes', 'k8s', 'cloudnative'],
    label: 'Cloud & Kubernetes',
    hue: 210,
    cluster: 'systems',
    blurb: 'Containers, platforms, IaC and the hyperscalers',
    terms: [
      'kubernetes',
      'k8s',
      'helm',
      'docker',
      'container*',
      'cncf',
      'service mesh',
      'istio',
      'envoy',
      'cilium',
      '=AWS',
      'gcp',
      'azure',
      'serverless',
      'terraform',
      'opentofu',
      'pulumi',
      'argo*',
      'gitops',
      'platform engineering',
      'cloudflare',
      'devops',
      'nix*',
    ],
    related: ['observability', 'sre', 'distributed', 'security'],
    repos: ['kubernetes/kubernetes', 'cilium/cilium', 'istio/istio', 'helm/helm', 'argoproj/argo-cd'],
    hnQuery: 'Kubernetes k8s Docker AWS Terraform serverless Cloudflare DevOps',
    feeds: [
      { kind: 'lobsters', path: 't/devops' },
      { kind: 'devto', tag: 'kubernetes' },
      rss('https://www.cncf.io/feed/', 'CNCF'),
      rss('https://blog.cloudflare.com/rss/', 'Cloudflare'),
      rss('https://thenewstack.io/feed/', 'The New Stack'),
      rss('https://fly.io/blog/feed.xml', 'Fly.io'),
      rss('https://tailscale.com/blog/index.xml', 'Tailscale'),
      rss('https://www.lastweekinaws.com/feed/', 'Last Week in AWS'),
    ],
  },
  {
    id: 'distributed',
    mastodon: ['distributedsystems'],
    label: 'Distributed Systems',
    hue: 236,
    cluster: 'systems',
    blurb: 'Consensus, replication, queues and consistency',
    terms: [
      'distributed',
      'consensus',
      'raft',
      'paxos',
      'replication',
      'kafka',
      'redpanda',
      'nats',
      'message queue*',
      'crdt*',
      'consistency',
      'linearizab*',
      'jepsen',
      'sharding',
      'scalab*',
      'event sourcing',
      'actor model',
    ],
    related: ['databases', 'observability', 'cloud-native'],
    repos: ['etcd-io/etcd', 'nats-io/nats-server'],
    hnQuery: 'distributed systems consensus Raft Kafka replication CRDT Jepsen',
    feeds: [
      { kind: 'lobsters', path: 't/distributed' },
      { kind: 'arxiv', q: 'cat:cs.DC' },
      rss('https://martinfowler.com/feed.atom', 'Martin Fowler'),
      rss('https://brooker.co.za/blog/rss.xml', 'Marc Brooker'),
      rss('https://muratbuffalo.blogspot.com/feeds/posts/default?max-results=25', 'Murat Demirbas'),
      rss('https://blog.bytebytego.com/feed', 'ByteByteGo'),
    ],
  },
  {
    id: 'databases',
    lemmy: [{ community: 'postgresql@programming.dev' }],
    mastodon: ['postgresql', 'postgres', 'databases', 'sqlite', 'duckdb'],
    label: 'Databases',
    hue: 190,
    cluster: 'systems',
    blurb: 'Postgres, SQLite, analytics engines and storage internals',
    terms: [
      'database*',
      'postgres*',
      'sqlite',
      'mysql',
      'duckdb',
      'clickhouse',
      'redis',
      'valkey',
      '=SQL',
      'query planner',
      'b-tree',
      'lsm',
      'vector database*',
      'pgvector',
      'timescale*',
      'olap',
      'oltp',
      'mongodb',
      'cockroach*',
      'tigerbeetle',
    ],
    related: ['distributed', 'observability', 'programming'],
    repos: ['duckdb/duckdb', 'ClickHouse/ClickHouse', 'valkey-io/valkey', 'pgvector/pgvector'],
    hnQuery: 'Postgres SQLite DuckDB ClickHouse database SQL',
    feeds: [
      { kind: 'lobsters', path: 't/databases' },
      { kind: 'devto', tag: 'database' },
      rss('https://notes.eatonphil.com/rss.xml', 'Phil Eaton'),
      rss('https://duckdb.org/feed.xml', 'DuckDB'),
      rss('https://planetscale.com/blog/feed.atom', 'PlanetScale'),
      rss('https://postgresweekly.com/rss/', 'Postgres Weekly'),
    ],
  },
  {
    id: 'programming',
    lemmy: [{ community: 'programming@programming.dev' }, { community: 'experienced_devs@programming.dev' }],
    mastodon: ['programming', 'softwareengineering'],
    label: 'Programming',
    hue: 100,
    cluster: 'code',
    blurb: 'The craft: design, debugging, tooling and essays',
    terms: [
      'programming',
      'programmer*',
      'software engineer*',
      'developer*',
      'refactor*',
      'debugg*',
      'compiler*',
      'type system*',
      'testing',
      'code review',
      'api design',
      'git',
      'vim',
      'emacs',
      'vscode',
    ],
    related: ['languages', 'web', 'open-source', 'agents'],
    feeds: [
      { kind: 'lobsters', path: 't/programming' },
      { kind: 'devto', tag: 'programming' },
      rss('https://jvns.ca/atom.xml', 'Julia Evans'),
      rss('https://danluu.com/atom.xml', 'Dan Luu'),
      rss('https://github.blog/feed/', 'GitHub Blog'),
      rss('https://lwn.net/headlines/rss', 'LWN'),
      rss('https://netflixtechblog.com/feed', 'Netflix Tech Blog'),
      rss('https://stripe.com/blog/feed.rss', 'Stripe'),
      rss('https://buttondown.com/hillelwayne/rss', 'Hillel Wayne'),
      rss('https://mitchellh.com/feed.xml', 'Mitchell Hashimoto'),
      rss('https://lucumr.pocoo.org/feed.atom', 'Armin Ronacher'),
      rss('https://registerspill.thorstenball.com/feed', 'Thorsten Ball'),
      rss('https://xeiaso.net/blog.rss', 'Xe Iaso'),
      rss('https://eli.thegreenplace.net/feeds/all.atom.xml', 'Eli Bendersky'),
    ],
  },
  {
    id: 'languages',
    lemmy: [{ community: 'rust@programming.dev' }, { community: 'golang@programming.dev' }, { community: 'python@programming.dev' }, { community: 'cpp@programming.dev' }],
    mastodon: ['rust', 'rustlang', 'golang', 'python', 'zig'],
    label: 'Languages',
    hue: 136,
    cluster: 'code',
    blurb: 'Rust, Go, Zig, Python, TypeScript and friends',
    terms: [
      'rust',
      'rustc',
      'cargo',
      'golang',
      '=Go 1.*',
      'zig',
      'python',
      'typescript',
      'javascript',
      'kotlin',
      'swift',
      'haskell',
      'ocaml',
      'elixir',
      'erlang',
      'c\\+\\+',
      'gleam',
      'wasm',
      'webassembly',
      'jvm',
      'java',
    ],
    related: ['programming', 'web', 'open-source'],
    repos: ['rust-lang/rust', 'nodejs/node', 'denoland/deno', 'oven-sh/bun', 'ziglang/zig', 'astral-sh/uv', 'microsoft/TypeScript'],
    hnQuery: 'Rust Golang Zig Python TypeScript Kotlin Elixir WebAssembly',
    feeds: [
      { kind: 'lobsters', path: 't/rust,go,python,zig,plt' },
      rss('https://this-week-in-rust.org/rss.xml', 'This Week in Rust'),
      rss('https://blog.rust-lang.org/feed.xml', 'Rust Blog'),
      rss('https://go.dev/blog/feed.atom', 'Go Blog'),
      rss('https://matklad.github.io/feed.xml', 'matklad'),
    ],
  },
  {
    id: 'web',
    lemmy: [{ community: 'webdev@programming.dev' }, { community: 'javascript@programming.dev' }],
    mastodon: ['webdev', 'javascript', 'typescript', 'css'],
    label: 'Web',
    hue: 76,
    cluster: 'code',
    blurb: 'Browsers, frontend frameworks, CSS and the open web',
    terms: [
      'javascript',
      'typescript',
      'react',
      'vue',
      'svelte',
      'solid',
      'next.js',
      'nextjs',
      'css',
      'html',
      'browser*',
      'chrome',
      'firefox',
      'safari',
      'webkit',
      'frontend',
      'front-end',
      'web components',
      'node.js',
      'deno',
      'bun',
      'vite',
    ],
    related: ['languages', 'programming', 'security'],
    repos: ['vitejs/vite', 'vercel/next.js', 'facebook/react', 'sveltejs/svelte', 'withastro/astro'],
    hnQuery: 'JavaScript React CSS browser Chrome Firefox frontend Node.js',
    feeds: [
      { kind: 'lobsters', path: 't/web,javascript,browsers' },
      { kind: 'devto', tag: 'webdev' },
      rss('https://webkit.org/feed/', 'WebKit'),
      rss('https://www.joshwcomeau.com/rss.xml', 'Josh Comeau'),
      rss('https://jakearchibald.com/posts.rss', 'Jake Archibald'),
      rss('https://developer.chrome.com/static/blog/feed.xml', 'Chrome for Developers'),
    ],
  },
  {
    id: 'open-source',
    lemmy: [{ community: 'opensource@lemmy.ml' }, { community: 'selfhosted@lemmy.world' }],
    mastodon: ['opensource', 'foss', 'selfhosted'],
    label: 'Projects',
    hue: 150,
    cluster: 'code',
    blurb: 'New repos, launches and Show HN',
    terms: ['open source', 'open-source', '=OSS', 'show hn', 'maintainer*', 'license', 'released?', 'launch*', 'github'],
    related: ['programming', 'languages', 'agents'],
    feeds: [
      { kind: 'hn', list: 'show' },
      { kind: 'github', q: 'stars:>40' },
      { kind: 'lobsters', path: 't/release,show' },
    ],
  },
  {
    id: 'security',
    lemmy: [{ community: 'cybersecurity@sh.itjust.works' }, { community: 'cybersecurity@infosec.pub' }],
    mastodon: ['infosec', 'cybersecurity'],
    label: 'Security',
    hue: 0,
    cluster: 'world',
    blurb: 'Vulnerabilities, breaches, supply chain and crypto',
    terms: [
      'security',
      'vulnerab*',
      '=CVE*',
      'exploit*',
      'malware',
      'ransomware',
      'breach*',
      'zero-day',
      '0day',
      'xss',
      '=RCE',
      'supply chain',
      'phishing',
      'encryption',
      'cryptograph*',
      'backdoor',
      'privacy',
      'hacked',
      'hackers',
      'passkey*',
    ],
    related: ['web', 'cloud-native', 'industry'],
    hnQuery: 'security vulnerability CVE exploit breach malware ransomware',
    feeds: [
      { kind: 'lobsters', path: 't/security' },
      rss('https://krebsonsecurity.com/feed/', 'Krebs on Security'),
      rss('https://www.schneier.com/feed/atom/', 'Schneier on Security'),
      rss('https://blog.trailofbits.com/feed/', 'Trail of Bits'),
      rss('https://googleprojectzero.blogspot.com/feeds/posts/default?max-results=15', 'Project Zero'),
      rss('https://www.bleepingcomputer.com/feed/', 'BleepingComputer'),
      rss('https://feeds.feedburner.com/TheHackersNews', 'The Hacker News'),
      rss('https://www.troyhunt.com/rss/', 'Troy Hunt'),
      rss('https://therecord.media/feed', 'The Record'),
    ],
  },
  {
    id: 'hardware',
    lemmy: [{ community: 'hardware@lemmy.world' }],
    mastodon: ['hardware', 'riscv', 'semiconductors'],
    label: 'Hardware',
    hue: 260,
    cluster: 'world',
    blurb: 'Chips, fabs, devices and the physical layer',
    terms: ['chip*', '=CPU*', 'semiconductor*', 'risc-v', '=ARM', 'apple silicon', 'tsmc', 'intel', '=AMD', 'fpga', 'asic', 'raspberry pi', 'hardware'],
    related: ['ai-infra', 'languages', 'industry'],
    hnQuery: 'chip CPU semiconductor RISC-V TSMC Intel AMD hardware',
    feeds: [
      { kind: 'lobsters', path: 't/hardware' },
      rss('https://feeds.arstechnica.com/arstechnica/technology-lab', 'Ars Technica'),
      rss('https://chipsandcheese.com/feed', 'Chips and Cheese'),
      rss('https://www.servethehome.com/feed/', 'ServeTheHome'),
    ],
  },
  {
    id: 'industry',
    lemmy: [{ community: 'technology@lemmy.world' }, { community: 'technology@beehaw.org' }],
    mastodon: ['tech', 'technews', 'bigtech'],
    label: 'Industry',
    hue: 320,
    cluster: 'world',
    blurb: 'Companies, money, policy and careers',
    terms: ['startup*', 'layoff*', 'acquisition', 'acquires', 'funding', 'raises', '=IPO', 'regulat*', 'antitrust', '=FTC', '=EU', '=DOJ', 'lawsuit', '=CEO', 'valuation'],
    related: ['ai', 'security', 'leadership'],
    hnQuery: 'startup layoffs acquisition funding antitrust regulation lawsuit',
    feeds: [
      rss('https://www.theverge.com/rss/index.xml', 'The Verge'),
      rss('https://www.techmeme.com/feed.xml', 'Techmeme'),
      rss('https://www.theregister.com/headlines.atom', 'The Register'),
      rss('https://www.404media.co/rss/', '404 Media'),
      rss('https://stratechery.com/feed/', 'Stratechery'),
      rss('https://newsletter.pragmaticengineer.com/feed', 'The Pragmatic Engineer'),
      rss('https://www.platformer.news/rss/', 'Platformer'),
    ],
  },
  {
    id: 'leadership',
    lemmy: [{ community: 'experienced_devs@programming.dev' }, { community: 'ask_experienced_devs@programming.dev' }],
    mastodon: ['engineeringmanagement', 'techleadership'],
    label: 'Eng Leadership',
    hue: 305,
    cluster: 'world',
    blurb: 'Managing engineers, staff+ work, teams, hiring and careers',
    // Bare "manager" and "management" are left out on purpose: package managers, memory management.
    terms: [
      'engineering manag*',
      'people manag*',
      '=EMs?',
      'leadership',
      'tech leads?',
      'staff engineer*',
      'staff\\+',
      'principal engineer*',
      '=CTOs?',
      'vp of engineering',
      'directors? of engineering',
      'one-on-ones?',
      '1:1 meeting*',
      '1:1s',
      'one-on-one*',
      'hiring',
      'technical interview*',
      'interviewing',
      'onboarding',
      'performance reviews?',
      'promotion packets?',
      'career ladders?',
      'career development',
      'careers?',
      'burnout',
      'team culture',
      'psychological safety',
      'developer productivity',
      'developer experience',
      '=DevEx',
      '=DORA',
      'org design',
      'reorgs?',
      'remote work',
      'return to office',
      '=RTO',
      'mentor*',
      'layoff*',
    ],
    related: ['industry', 'programming', 'agents', 'sre'],
    hnQuery: 'engineering manager leadership "staff engineer" "tech lead" hiring "developer productivity" burnout career',
    feeds: [
      rss('https://leaddev.com/feed', 'LeadDev'),
      rss('https://lethain.com/feeds/', 'Will Larson'),
      rss('https://randsinrepose.com/feed/', 'Rands in Repose'),
      rss('https://refactoring.fm/feed', 'Refactoring'),
      rss('https://jacobian.org/index.xml', 'Jacob Kaplan-Moss'),
      rss('https://newsletter.pragmaticengineer.com/feed', 'The Pragmatic Engineer'),
      // Gergely's blog, separate from the newsletter: free long-form posts.
      rss('https://blog.pragmaticengineer.com/feed/', 'The Pragmatic Engineer Blog'),
    ],
  },
]

export const TOPICS: Topic[] = [...TECH_TOPICS, ...GENERAL_TOPICS]
export const TOPIC_BY_ID = new Map(TOPICS.map((t) => [t.id, t]))

/** Whether a topic belongs to the tech pack: a free-text interest counts as neither. */
export const isTechTopic = (id: string) => {
  const t = TOPIC_BY_ID.get(id)
  return !!t && CLUSTERS[t.cluster].pack === 'tech'
}

/* -------------------------------------------------------------- matching */

// `?` is left alone so terms like "released?" can mark an optional character.
const escape = (s: string) => s.replace(/[.^${}()|[\]\\/+]/g, '\\$&')

/** Compiles one match term (see Topic.terms for the syntax) into a whole-word regex. */
export function compileTerm(term: string): RegExp {
  return termPattern(term).re
}

function termPattern(term: string): { re: RegExp; body: string; caseSensitive: boolean } {
  const caseSensitive = term.startsWith('=')
  let body = caseSensitive ? term.slice(1) : term
  const prefix = body.endsWith('*')
  if (prefix) body = body.slice(0, -1)
  // Terms containing a backslash are treated as pre-escaped regex.
  const src = `${(body.includes('\\') ? body : escape(body)).replace(/ /g, '[\\s-]+')}${prefix ? '[\\w-]*' : ''}`
  return { re: new RegExp(`(?<![\\w])${src}(?![\\w])`, caseSensitive ? '' : 'i'), body: src, caseSensitive }
}

// One regex per topic (two when some terms are case-sensitive) rather than one per term: a topic
// has a dozen or more terms and every story is checked against every topic, so this is the
// difference between a few hundred regex scans per story and a few dozen.
const compiled = new Map<string, RegExp[]>()
function patternsFor(topic: Pick<Topic, 'id' | 'terms'>): RegExp[] {
  const key = `${topic.id}\u0000${topic.terms.join('\u0000')}`
  let list = compiled.get(key)
  if (!list) {
    const groups: [string[], string[]] = [[], []]
    for (const term of topic.terms) {
      const { body, caseSensitive } = termPattern(term)
      groups[caseSensitive ? 1 : 0].push(`(?:${body})`)
    }
    list = groups.flatMap((alts, i) => (alts.length ? [new RegExp(`(?<![\\w])(?:${alts.join('|')})(?![\\w])`, i === 0 ? 'i' : '')] : []))
    compiled.set(key, list)
  }
  return list
}

/** Topics a source is dedicated to: anything from r/sre is SRE even if the title doesn't say so. */
const DEDICATED = new Map<string, string[]>()
for (const t of TOPICS) {
  for (const f of t.feeds) {
    const labels =
      f.kind === 'rss'
        ? [f.label.toLowerCase()]
        : f.kind === 'devto'
          ? [`dev.to #${f.tag}`]
          : f.kind === 'lobsters' && f.path.startsWith('t/')
            ? []
            : f.kind === 'hf'
              ? ['hf papers']
              : f.kind === 'arxiv' && t.id === 'ml-research'
                ? ['arxiv']
                : []
    for (const l of labels) DEDICATED.set(l, [...(DEDICATED.get(l) ?? []), t.id])
  }
  // A dedicated Lemmy community's posts belong to the topic whatever they say (c/localllama is LLMs).
  for (const l of t.lemmy ?? []) {
    if (l.check) continue
    const label = `c/${l.community.split('@')[0].toLowerCase()}`
    DEDICATED.set(label, [...(DEDICATED.get(label) ?? []), t.id])
  }
}

const hosts = new Map<string, string>()
function hostOf(url: string | null | undefined): string {
  if (!url) return ''
  let host = hosts.get(url)
  if (host === undefined) {
    try {
      host = new URL(url).hostname
    } catch {
      host = ''
    }
    if (hosts.size > 5000) hosts.clear()
    hosts.set(url, host)
  }
  return host
}

export function storyText(s: Pick<Story, 'title' | 'tags' | 'url'>): string {
  return `${s.title} ${(s.tags ?? []).join(' ')} ${hostOf(s.url)}`
}

export function matchesTopic(topic: Pick<Topic, 'id' | 'terms'>, text: string): string | undefined {
  for (const re of patternsFor(topic)) {
    const m = text.match(re)
    if (m) return m[0]
  }
  return undefined
}

// The same stories are ranked again on every sort change, refresh and feed arrival, and their
// topics never change, so they're worked out once per story.
const storyTopics = new Map<string, string[]>()

export function topicsForStory(s: Story, extra: Topic[] = []): string[] {
  const text = storyText(s)
  const key = `${s.sourceLabel}\u0000${text}\u0000${extra.map((t) => `${t.id}=${t.terms.join(',')}`).join(';')}`
  const cached = storyTopics.get(key)
  // A copy: callers add to it (a cluster's leader takes its members' topics).
  if (cached) return [...cached]
  const found = new Set(DEDICATED.get(s.sourceLabel.toLowerCase()) ?? [])
  for (const t of [...TOPICS, ...extra]) if (!found.has(t.id) && matchesTopic(t, text)) found.add(t.id)
  const topics = [...found]
  if (storyTopics.size > 5000) storyTopics.clear()
  storyTopics.set(key, topics)
  return [...topics]
}

/* --------------------------------------------------------------- search */

export interface TopicHit {
  topic: Topic
  score: number
  /** Why it matched, e.g. the keyword "tracing". */
  via?: string
}

/** Finds topics for a free-text query: labels first, then keywords, then descriptions. */
export function searchTopics(query: string, topics: Topic[] = TOPICS): TopicHit[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const hits: TopicHit[] = []
  for (const topic of topics) {
    const label = topic.label.toLowerCase()
    let score = 0
    let via: string | undefined
    if (label === q || topic.id === q) score = 10
    else if (label.startsWith(q)) score = 8
    else if (label.includes(q)) score = 6
    if (score < 6) {
      for (const term of topic.terms) {
        const plain = term.replace(/^=/, '').replace(/\*$/, '').replace(/\\/g, '').toLowerCase()
        if (plain === q) {
          score = Math.max(score, 7)
          via = plain
          break
        }
        if (q.length >= 2 && plain.startsWith(q)) {
          score = Math.max(score, 5)
          via ??= plain
        } else if (q.length >= 3 && q.startsWith(plain) && plain.length >= 3) {
          score = Math.max(score, 4)
          via ??= plain
        }
      }
    }
    if (!score && q.length >= 3 && matchesTopic(topic, query)) {
      score = 4
      via = q
    }
    if (!score && q.length >= 4 && topic.blurb.toLowerCase().includes(q)) score = 2
    if (score) hits.push({ topic, score, via })
  }
  return hits.sort((a, b) => b.score - a.score)
}

export function relatedTopics(ids: string[], exclude: string[] = ids): Topic[] {
  const out = new Map<string, Topic>()
  for (const id of ids) for (const r of TOPIC_BY_ID.get(id)?.related ?? []) if (!exclude.includes(r)) out.set(r, TOPIC_BY_ID.get(r)!)
  return [...out.values()]
}

/** Two topics that keep showing up together are probably related, even if not hand-linked. */
export function cooccurringTopics(stories: { topics: string[] }[], focus: string, limit = 4): string[] {
  const counts = new Map<string, number>()
  for (const s of stories) if (s.topics.includes(focus)) for (const t of s.topics) if (t !== focus) counts.set(t, (counts.get(t) ?? 0) + 1)
  return [...counts.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([t]) => t)
}
