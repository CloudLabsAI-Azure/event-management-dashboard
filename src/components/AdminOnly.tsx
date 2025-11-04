import React from 'react'
import { useAuth } from './AuthProvider'

export function AdminOnly({ children }: { children: React.ReactNode }) {
  const { userRole } = useAuth()
  if (userRole !== 'admin') return null
  return <>{children}</>
}

export default AdminOnly
