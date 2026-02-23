import { DashboardLayout } from "@/components/DashboardLayout"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ExternalLink, ShieldCheck, BarChart3, ClipboardList, ArrowRight, MonitorCheck, LogIn, PanelLeft } from "lucide-react"

const ADMIN_URL = "https://admin.cloudevents.ai"

export default function CatalogHealth() {
  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-foreground">Catalog Health</h1>
          <p className="text-muted-foreground mt-1">
            Catalog health reports have moved to the CloudEvents Admin Center for a unified reporting experience.
          </p>
        </div>

        {/* Main CTA Card */}
        <Card className="border-2 border-primary/20 bg-gradient-to-br from-primary/5 via-background to-primary/5">
          <CardContent className="pt-8 pb-8">
            <div className="flex flex-col items-center text-center space-y-6">
              <div className="flex items-center justify-center w-20 h-20 rounded-2xl bg-primary/10 border border-primary/20">
                <MonitorCheck className="h-10 w-10 text-primary" />
              </div>
              <div className="space-y-2 max-w-xl">
                <h2 className="text-2xl font-semibold text-foreground">Access Catalog Health Report</h2>
                <p className="text-muted-foreground leading-relaxed">
                  The catalog health report is now available in the <strong>CloudEvents Admin Center</strong>. 
                  It provides comprehensive track update statuses, testing schedules, ETAs, and release notes 
                  for upcoming events — all in one place.
                </p>
              </div>
              <Button size="lg" className="gap-2 text-base px-8" asChild>
                <a href={ADMIN_URL} target="_blank" rel="noopener noreferrer">
                  Open Admin Center
                  <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Step-by-step instructions */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ClipboardList className="h-5 w-5 text-primary" />
              How to Access Catalog Health Report
            </CardTitle>
            <CardDescription>
              Follow these steps to view catalog health data in the Admin Center
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 md:grid-cols-3">
              {/* Step 1 */}
              <div className="relative flex flex-col items-center text-center p-6 rounded-xl border bg-card hover:shadow-md transition-shadow">
                <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary text-primary-foreground font-bold text-lg mb-4">
                  1
                </div>
                <div className="flex items-center justify-center w-14 h-14 rounded-xl bg-blue-500/10 mb-4">
                  <LogIn className="h-7 w-7 text-blue-600 dark:text-blue-400" />
                </div>
                <h3 className="font-semibold text-foreground mb-2">Navigate & Sign In</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Go to{" "}
                  <a
                    href={ADMIN_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary font-medium hover:underline"
                  >
                    admin.cloudevents.ai
                  </a>{" "}
                  and sign in with your <strong>work account</strong> (Microsoft Entra ID / organizational credentials).
                </p>
                <div className="hidden md:block absolute -right-3 top-1/2 -translate-y-1/2 z-10">
                  <ArrowRight className="h-6 w-6 text-muted-foreground/40" />
                </div>
              </div>

              {/* Step 2 */}
              <div className="relative flex flex-col items-center text-center p-6 rounded-xl border bg-card hover:shadow-md transition-shadow">
                <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary text-primary-foreground font-bold text-lg mb-4">
                  2
                </div>
                <div className="flex items-center justify-center w-14 h-14 rounded-xl bg-purple-500/10 mb-4">
                  <PanelLeft className="h-7 w-7 text-purple-600 dark:text-purple-400" />
                </div>
                <h3 className="font-semibold text-foreground mb-2">Go to Reports</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  In the left sidebar navigation, locate the <strong>Reports</strong> section. 
                  Expand it to see the list of available reports.
                </p>
                <div className="hidden md:block absolute -right-3 top-1/2 -translate-y-1/2 z-10">
                  <ArrowRight className="h-6 w-6 text-muted-foreground/40" />
                </div>
              </div>

              {/* Step 3 */}
              <div className="flex flex-col items-center text-center p-6 rounded-xl border bg-card hover:shadow-md transition-shadow">
                <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary text-primary-foreground font-bold text-lg mb-4">
                  3
                </div>
                <div className="flex items-center justify-center w-14 h-14 rounded-xl bg-green-500/10 mb-4">
                  <BarChart3 className="h-7 w-7 text-green-600 dark:text-green-400" />
                </div>
                <h3 className="font-semibold text-foreground mb-2">Open Catalog Mgmt Report</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Click on <strong>Catalog Mgmt Report</strong> to view catalog health details including
                  track statuses, testing dates, release notes, and upcoming event schedules.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Info cards */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="glass-card">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="h-5 w-5 text-green-600 dark:text-green-400" />
                What You'll Find
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2.5 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <Badge variant="secondary" className="mt-0.5 shrink-0 text-xs">1</Badge>
                  <span>Track update statuses (Completed, In-progress, Pending)</span>
                </li>
                <li className="flex items-start gap-2">
                  <Badge variant="secondary" className="mt-0.5 shrink-0 text-xs">2</Badge>
                  <span>Event dates and testing schedules for upcoming 2 weeks</span>
                </li>
                <li className="flex items-start gap-2">
                  <Badge variant="secondary" className="mt-0.5 shrink-0 text-xs">3</Badge>
                  <span>Last test dates and release notes links</span>
                </li>
                <li className="flex items-start gap-2">
                  <Badge variant="secondary" className="mt-0.5 shrink-0 text-xs">4</Badge>
                  <span>Event IDs and track source types (TTT, Custom Lab, Standard)</span>
                </li>
                <li className="flex items-start gap-2">
                  <Badge variant="secondary" className="mt-0.5 shrink-0 text-xs">5</Badge>
                  <span>Filter, search, and sort capabilities for all catalog items</span>
                </li>
              </ul>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <ExternalLink className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                Quick Access
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground leading-relaxed">
                The Admin Center provides a centralized view for all catalog management operations, 
                including bulk actions, CSV exports, and real-time status tracking.
              </p>
              <div className="flex flex-col gap-2">
                <Button variant="outline" className="justify-between" asChild>
                  <a href={ADMIN_URL} target="_blank" rel="noopener noreferrer">
                    <span className="flex items-center gap-2">
                      <BarChart3 className="h-4 w-4" />
                      Catalog Mgmt Report
                    </span>
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </Button>
                <Button variant="outline" className="justify-between" asChild>
                  <a href={ADMIN_URL} target="_blank" rel="noopener noreferrer">
                    <span className="flex items-center gap-2">
                      <MonitorCheck className="h-4 w-4" />
                      Admin Center Home
                    </span>
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  )
}

