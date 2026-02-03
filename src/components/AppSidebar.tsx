import { useState } from "react"
import { 
  BarChart3, 
  PieChart, 
  TrendingUp, 
  Users, 
  DollarSign, 
  Calendar,
  FileText,
  MapPin,
  Globe,
  MessageSquare,
  Shield,
  Megaphone,
  GraduationCap,
  History,
  Clock,
  Plus,
  ChevronDown,
  ChevronRight,
} from "lucide-react"
import { NavLink, useLocation } from "react-router-dom"
import { useAuth } from "./AuthProvider"

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  SidebarHeader,
  useSidebar,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"

interface MenuItem {
  title: string;
  url: string;
  icon: any;
  children?: { title: string; url: string; icon: any }[];
}

const reportItems: MenuItem[] = [
  { title: "Overview", url: "/dashboard", icon: BarChart3 },
  { title: "Catalog Health", url: "/dashboard/catalog-health", icon: Calendar },
  { title: "Trending Tracks", url: "/dashboard/top25-tracks", icon: FileText },
  { 
    title: "Roadmap", 
    url: "/dashboard/roadmap", 
    icon: MapPin,
    children: [
      { title: "Lab Development", url: "/dashboard/roadmap", icon: TrendingUp },
      // { title: "Lab Maintenance", url: "/dashboard/lab-maintenance", icon: Clock }, // Hidden for now
      { title: "Custom Lab Request", url: "/dashboard/custom-lab-request", icon: Plus },
    ]
  },
  { title: "Localized Tracks", url: "/dashboard/localized-tracks", icon: Globe },
  { title: "Train the Trainer", url: "/dashboard/ttt", icon: GraduationCap },
  { title: "Announcements", url: "/dashboard/announcements", icon: Megaphone },
  { title: "Participant Feedback", url: "/dashboard/participant-feedback", icon: MessageSquare },
]

const settingsItems = [
  { title: "Users", url: "/dashboard/users", icon: Users, adminOnly: true },
  { title: "Audit Log", url: "/dashboard/audit-log", icon: History, adminOnly: true },
]

export function AppSidebar() {
  const { state } = useSidebar()
  const location = useLocation()
  const currentPath = location.pathname
  const collapsed = state === "collapsed"
  const { userRole } = useAuth()
  const visibleSettings = settingsItems.filter((item) => !item.adminOnly || userRole === 'admin')

  const isActive = (path: string) => {
    if (path === "/dashboard") return currentPath === "/dashboard" || currentPath === "/dashboard/"
    return currentPath.startsWith(path)
  }

  const getNavCls = (path: string) => {
    const baseClasses = "transition-all duration-200 relative overflow-hidden group"
    return isActive(path) 
      ? `${baseClasses} bg-primary text-primary-foreground shadow-sm` 
      : `${baseClasses} hover:bg-accent/50 hover:text-accent-foreground`
  }

  return (
    <Sidebar
      collapsible="icon"
      className="border-r border-border/50 bg-card/50 backdrop-blur-sm"
      style={{
        "--sidebar-width-icon": "4rem"
      } as React.CSSProperties}
    >
      <SidebarHeader className="h-16 px-4 border-b border-border/50 flex items-center group-data-[collapsible=icon]:justify-center bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/90 dark:bg-zinc-900/95 dark:supports-[backdrop-filter]:bg-zinc-900/90">
        <div className="flex items-center gap-2 group-data-[collapsible=icon]:gap-0 w-full group-data-[collapsible=icon]:justify-center">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
            <img src="/logo.png" alt="CloudLabs" className="w-4 h-4" />
          </div>
          <div className="flex flex-col group-data-[collapsible=icon]:hidden flex-1 min-w-0">
            <h2 className="text-lg font-semibold text-foreground truncate">MS Innovation</h2>
            <p className="text-xs text-muted-foreground truncate">Catalogue Management</p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="p-2">
        <SidebarGroup>
          <SidebarGroupLabel className="text-muted-foreground uppercase tracking-wider text-xs font-medium group-data-[collapsible=icon]:hidden">
            Reports
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {reportItems.map((item) => (
                item.children ? (
                  <Collapsible key={item.title} defaultOpen={item.children.some(child => isActive(child.url))} className="group/collapsible">
                    <SidebarMenuItem>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton tooltip={item.title} className="transition-all duration-200 hover:bg-accent/50 hover:text-accent-foreground">
                          <item.icon className="w-4 h-4 shrink-0" />
                          <span className="font-medium group-data-[collapsible=icon]:hidden">{item.title}</span>
                          <ChevronRight className="ml-auto w-4 h-4 transition-transform group-data-[state=open]/collapsible:rotate-90 group-data-[collapsible=icon]:hidden" />
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <SidebarMenuSub>
                          {item.children.map((child) => (
                            <SidebarMenuSubItem key={child.title}>
                              <SidebarMenuSubButton asChild>
                                <NavLink to={child.url} className={getNavCls(child.url)}>
                                  <child.icon className="w-4 h-4 shrink-0" />
                                  <span>{child.title}</span>
                                </NavLink>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          ))}
                        </SidebarMenuSub>
                      </CollapsibleContent>
                    </SidebarMenuItem>
                  </Collapsible>
                ) : (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild tooltip={item.title}>
                    <NavLink to={item.url} className={getNavCls(item.url)}>
                      <item.icon className="w-4 h-4 shrink-0" />
                      <span className="font-medium group-data-[collapsible=icon]:hidden">{item.title}</span>
                      {isActive(item.url) && (
                        <div className="absolute inset-0 bg-gradient-to-r from-primary/20 to-transparent rounded-lg" />
                      )}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                )
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {visibleSettings.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-muted-foreground uppercase tracking-wider text-xs font-medium group-data-[collapsible=icon]:hidden">
              System
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {visibleSettings.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild tooltip={item.title}>
                      <NavLink to={item.url} className={getNavCls(item.url)}>
                        <item.icon className="w-4 h-4 shrink-0" />
                        <span className="font-medium group-data-[collapsible=icon]:hidden">{item.title}</span>
                        {isActive(item.url) && (
                          <div className="absolute inset-0 bg-gradient-to-r from-primary/20 to-transparent rounded-lg" />
                        )}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
    </Sidebar>
  )
}