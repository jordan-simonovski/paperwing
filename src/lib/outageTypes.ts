/** One provider people may be reporting as down, shared by /api/outages and the app. */
export interface ProviderReport {
  id: string
  name: string
  /** Distinct people in the last 30 minutes. */
  recent: number
  /** Distinct people per 30 minutes over the 90 before that. */
  baseline: number
  level: 'spike' | 'chatter' | 'quiet'
  samples: { text: string; url: string; at: number }[]
  /** What the provider's own status page says, when it has one. */
  status?: { indicator: string; description: string; url: string }
}

export interface OutageReport {
  checkedAt: number
  scanned: number
  providers: ProviderReport[]
}
