import { ShieldCheck, LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { ThemeToggle } from "@/components/ThemeToggle"
import { AuthButtons } from "@/components/AuthButtons"
import { useAuth } from "@/components/AuthProvider"
import { useMsal } from "@azure/msal-react"

export function DashboardHeader() {
  const { user, userRole, msalAuthenticated, isAuthorized, authError } = useAuth()
  const { instance } = useMsal()

  const displayName = user?.name || user?.displayName || user?.username || 'User'
  const userEmail = user?.username || user?.emails?.[0] || ''

  const handleLogout = () => {
    instance.logoutRedirect({ postLogoutRedirectUri: window.location.origin })
  }
  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/50 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/90 dark:bg-zinc-900/95 dark:supports-[backdrop-filter]:bg-zinc-900/90">
      <div className="flex h-16 items-center justify-between px-6 max-w-none">
        <div className="flex items-center gap-4 min-w-0">
          <SidebarTrigger className="h-7 w-7 shrink-0 opacity-60 hover:opacity-100 transition-opacity" />
          <div className="hidden md:flex min-w-0">
            <h1 className="text-xl font-semibold text-foreground truncate">
              MS Innovation Event Management
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-4 shrink-0">
          {msalAuthenticated && (
            <div className="hidden md:flex flex-col items-end leading-tight">
              <span className="text-sm font-medium text-foreground flex items-center gap-1">
                <ShieldCheck className="w-4 h-4 text-blue-500" /> {displayName}
              </span>
              <span className="text-[11px] text-muted-foreground">{userEmail}</span>
              <span className="text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 mt-0.5 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 w-fit">
                {isAuthorized ? userRole : 'PENDING'}
              </span>
            </div>
          )}
          {authError && msalAuthenticated && !isAuthorized && (
            <span className="text-xs text-red-500 max-w-[160px] line-clamp-2">{authError}</span>
          )}
          <ThemeToggle />
          {msalAuthenticated ? (
            <Button size="sm" variant="outline" onClick={handleLogout} className="flex items-center gap-1">
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          ) : (
            <AuthButtons />
          )}
        </div>
      </div>
    </header>
  )
}