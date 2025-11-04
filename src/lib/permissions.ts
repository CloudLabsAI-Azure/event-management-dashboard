// Centralized permission helpers
// Extend this if more granular permissions are needed later.

export type Role = 'admin' | 'user'

export interface PermissionContext {
  role: Role
}

export const isAdmin = (ctx: PermissionContext) => ctx.role === 'admin'

export const canEditTrending = (ctx: PermissionContext) => isAdmin(ctx)
export const canEditMetrics = (ctx: PermissionContext) => isAdmin(ctx)
export const canSeeUsersPage = (ctx: PermissionContext) => isAdmin(ctx)

// Future: attach fine-grained feature flags per role
