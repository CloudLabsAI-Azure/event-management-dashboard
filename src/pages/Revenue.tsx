import { DashboardLayout } from "@/components/DashboardLayout"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { MetricCard } from "@/components/MetricCard"
import { DollarSign, TrendingUp, CreditCard, Banknote, PiggyBank, Calculator, Calendar } from "lucide-react"
import { RevenueChart } from "@/components/charts/RevenueChart"

export default function Revenue() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Upcoming Events (Until 31st August)</h1>
          <p className="text-muted-foreground">
            Upcoming events and language coverage
          </p>
        </div>

        {/* Upcoming Events Section */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              Upcoming Events (Until 31st August)
            </CardTitle>
            <CardDescription>
              Track upcoming events and language coverage
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {/* Upcoming Events Counter */}
              <div className="text-center p-6 bg-muted/50 rounded-lg border-l-4 border-primary">
                <h3 className="text-lg font-semibold text-primary mb-2">Upcoming Events</h3>
                <div className="text-4xl font-bold text-foreground mb-1">20</div>
                <p className="text-sm text-muted-foreground">Tracks Upcoming</p>
              </div>
              
              {/* Language Coverage */}
              <div>
                <h4 className="text-lg font-semibold text-primary mb-4">Upcoming Language Coverage</h4>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">English</span>
                    <div className="flex items-center space-x-3">
                      <div className="w-32 h-2 bg-muted rounded-full overflow-hidden">
                        <div className="w-full h-full bg-green-500 rounded-full"></div>
                      </div>
                      <span className="font-bold text-foreground">20</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>


      </div>
    </DashboardLayout>
  )
}