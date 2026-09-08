import { useEffect } from "react"
import { useMsal } from "@azure/msal-react"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/AppSidebar"
import { DashboardHeader } from "@/components/DashboardHeader"
import { useAuth } from "@/components/AuthProvider"
import { maybeAutoSyncRmp } from "@/lib/rmpSync"
import { toast } from "@/hooks/use-toast"

interface DashboardLayoutProps {
  children: React.ReactNode
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const { instance } = useMsal()
  const { isAuthorized } = useAuth()

  // Keep catalogue releases connected after sign-in. Request imports only run
  // if explicitly enabled server-side; their temporary pause is respected.
  useEffect(() => {
    if (!isAuthorized) return
    maybeAutoSyncRmp(instance).then((result) => {
      if (!result) return
      const imported = result.imported || 0
      const updated = result.updated || 0
      if (imported === 0 && updated === 0) return
      const parts = []
      if (result.roadmapCount) parts.push(`${result.roadmapCount} roadmap`)
      if (result.tttCount) parts.push(`${result.tttCount} TTT`)
      if (result.customCount) parts.push(`${result.customCount} custom lab`)
      if (result.localizedCount) parts.push(`${result.localizedCount} localized`)
      const bits = []
      if (imported > 0) bits.push(`${imported} imported${parts.length ? ` (${parts.join(", ")})` : ""}`)
      if (updated > 0) bits.push(`${updated} updated from RMP changes`)
      toast({ title: "RMP sync", description: bits.join(" · ") })
    })
  }, [isAuthorized, instance])

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="flex flex-col">
        <DashboardHeader />
        <main className="flex-1 overflow-y-auto p-6 bg-background">
          <div className="max-w-none mx-auto">
            {children}
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}