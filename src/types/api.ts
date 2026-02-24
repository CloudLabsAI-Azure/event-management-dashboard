/**
 * TypeScript interfaces for API responses and data types
 * Centralized type definitions for better type safety across the application
 */

// =====================
// Base Types
// =====================

/** Common fields shared by all catalog items */
export interface BaseCatalogItem {
  id?: string
  sr: number
  type: CatalogItemType
  eventId?: string
  notes?: string
  createdAt?: string
  updatedAt?: string
}

/** All possible catalog item types */
export type CatalogItemType = 
  | 'catalog' 
  | 'tttSession' 
  | 'customLabRequest' 
  | 'roadmapItem' 
  | 'localizedTrack'
  | 'pdfCatalog'
  | 'trackChange'
  | 'generalAnnouncement'
  | 'labMaintenance'

// =====================
// Catalog Health Items
// =====================

export interface CatalogItem extends BaseCatalogItem {
  type: 'catalog'
  trackName: string
  eventDate: string | null
  status: CatalogStatus
  notesETA?: string
  lastTestDate?: string | null
  releaseNotesUrl?: string
}

export type CatalogStatus = 'Pending' | 'In-progress' | 'Completed' | string

// =====================
// TTT Sessions
// =====================

export interface TTTSession extends BaseCatalogItem {
  type: 'tttSession'
  trackName: string
  courseName?: string
  sessionDate: string | null
  status: TTTStatus
}

export type TTTStatus = 'Scheduled' | 'In Progress' | 'Completed' | string

// =====================
// Custom Lab Requests
// =====================

export interface CustomLabRequest extends BaseCatalogItem {
  type: 'customLabRequest'
  trackTitle: string
  eventDate: string | null
  status: CustomLabStatus
  sponsorDetails?: string
  requestedBy?: string
  activityLog?: ActivityLogEntry[]
}

export type CustomLabStatus = 'Pending' | 'Approved' | 'In Progress' | 'Completed' | 'Rejected' | string

// =====================
// Roadmap / Lab Development
// =====================

export interface RoadmapItem extends BaseCatalogItem {
  type: 'roadmapItem'
  trackTitle: string
  phase: RoadmapPhase
  eta: string
  programType?: string
  approvalDate?: string | null
  progressDeck?: string
  activityLog?: ActivityLogEntry[]
  isUpgrade?: boolean
  needsAttention?: boolean
}

export type RoadmapPhase = 
  | 'Under assessment'
  | 'Development'
  | 'Testing'
  | 'Release-ready'
  | 'Released'
  | 'Backlog'
  | 'On-Hold'
  | 'Blocked'
  | 'Completed'
  | string

export interface ActivityLogEntry {
  date: string
  text: string
  addedBy?: string
}

// =====================
// Trending Tracks
// =====================

export interface Track {
  id?: string
  sr: number
  eventId?: string
  trackName: string
  priority?: number
  lastTestDate?: string | null
  releaseNotesUrl?: string
  status?: string
  notes?: string
}

// =====================
// Localized Tracks
// =====================

export interface LocalizedTrack extends BaseCatalogItem {
  type: 'localizedTrack'
  trackTitle: string
  language: string
  status: string
  eta?: string
}

// =====================
// Users
// =====================

export interface User {
  id: string
  username: string
  role: UserRole
  email?: string
  mustReset?: boolean
  createdAt?: string
}

export type UserRole = 'admin' | 'developer' | 'viewer'

// =====================
// API Responses
// =====================

export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

export interface CreateItemResponse {
  success: boolean
  item: BaseCatalogItem
}

export interface DeleteItemResponse {
  success: boolean
}

export interface UpdateItemResponse {
  success: boolean
}

// =====================
// Audit Log
// =====================

export interface AuditEntry {
  id: string
  timestamp: string
  user: {
    id: string
    username: string
    role: UserRole
  }
  action: 'CREATE' | 'UPDATE' | 'DELETE'
  resource: string
  resourceId: string | number
  oldData?: any
  newData?: any
}

// =====================
// Metrics
// =====================

export interface Metrics {
  labsReady: number
  upcomingEvents: number
  avgTestCoverage: number
  trackMigrations: number
  lastUpdated?: string
}

// =====================
// Reviews / Feedback
// =====================

export interface Review {
  id: string
  eventName: string
  imagePath: string
  uploadedAt: string
  groupId?: string
  storedIn?: 'local' | 'blob'
}

// =====================
// Union Types
// =====================

/** All item types that can be stored in the catalog array */
export type AnyCatalogItem = 
  | CatalogItem 
  | TTTSession 
  | CustomLabRequest 
  | RoadmapItem 
  | LocalizedTrack

// =====================
// Helper Type Guards
// =====================

export const isCatalogItem = (item: BaseCatalogItem): item is CatalogItem => 
  item.type === 'catalog'

export const isTTTSession = (item: BaseCatalogItem): item is TTTSession => 
  item.type === 'tttSession'

export const isCustomLabRequest = (item: BaseCatalogItem): item is CustomLabRequest => 
  item.type === 'customLabRequest'

export const isRoadmapItem = (item: BaseCatalogItem): item is RoadmapItem => 
  item.type === 'roadmapItem'

export const isLocalizedTrack = (item: BaseCatalogItem): item is LocalizedTrack => 
  item.type === 'localizedTrack'
