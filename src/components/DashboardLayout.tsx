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

  // Auto-import new RMP onboarding requests once per browser session.
  // Runs server-side with the signed-in user's B2C token; silent on failure.
  useEffect(() => {
    if (!isAuthorized) return
    maybeAutoSyncRmp(instance).then((result) => {
      if (result && result.imported && result.imported > 0) {
        const parts = []
        if (result.roadmapCount) parts.push(`${result.roadmapCount} roadmap`)
        if (result.tttCount) parts.push(`${result.tttCount} TTT`)
        if (result.customCount) parts.push(`${result.customCount} custom lab`)
        toast({
          title: "RMP onboarding requests imported",
          description: `${result.imported} new request${result.imported === 1 ? "" : "s"} added${parts.length ? ` (${parts.join(", ")})` : ""}.`,
        })
      }
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