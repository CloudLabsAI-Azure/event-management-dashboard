export interface ContentReleaseRange {
  from: string
  to: string
}

export interface RmpCatalogueItem {
  id: string
  title: string
  description: string
  kind: 'new-release' | 'catalogue-release' | 'retired'
  highlights: string[]
  level: string
  eventType: string
  topic: string
  registrationLanguages: string
  labLanguages: string
  releaseDate: string | null
  retirementDate: string | null
  lastContentModifiedDate: string | null
  releaseNotesUrl: string | null
  detailsUrl: string
  detailAvailable: boolean
}

export interface RmpCatalogueState {
  range: ContentReleaseRange | null
  items: RmpCatalogueItem[]
  lastSyncedAt: string | null
  totalTracks: number | null
  detailErrors: number
  refreshing: boolean
  stale: boolean
  error: string | null
  tokenAvailable: boolean
  sourceUrl: string
}