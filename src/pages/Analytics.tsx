import { DashboardLayout } from "@/components/DashboardLayout"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { MetricCard } from "@/components/MetricCard"
import { TrendingUp, Users, Eye, MousePointer, Clock, Target, BookOpen, Calendar, Globe, Award } from "lucide-react"
import { UserAnalyticsChart } from "@/components/charts/UserAnalyticsChart"
import { PerformanceChart } from "@/components/charts/PerformanceChart"
import InlineMetric from '@/components/InlineMetric'

export default function Analytics() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Analytics Dashboard</h1>
          <p className="text-muted-foreground">
            Comprehensive analytics and training delivery insights
          </p>
        </div>

        {/* Summary KPIs */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            title="Tracks Delivered"
            value={<InlineMetric metricKey="analytics.tracksDelivered" value={58} />}
            change="Total training tracks completed"
            changeType="neutral"
            icon={BookOpen}
          />
          <MetricCard
            title="Tech Events"
            value={<InlineMetric metricKey="analytics.techEvents" value={52} />}
            change="Technology-focused sessions"
            changeType="neutral"
            icon={Target}
          />
          <MetricCard
            title="Non-Tech Events"
            value={<InlineMetric metricKey="analytics.nonTechEvents" value={6} />}
            change="Non-technical training sessions"
            changeType="neutral"
            icon={Calendar}
          />
          <MetricCard
            title="Languages Covered"
            value={<InlineMetric metricKey="analytics.languagesCovered" value={2} />}
            change="English and Spanish support"
            changeType="neutral"
            icon={Globe}
          />
        </div>

        {/* Language Breakdown */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-primary" />
              Language Breakdown
            </CardTitle>
            <CardDescription>
              Distribution of training sessions by language
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-3 h-3 rounded-full bg-green-500"></div>
                  <span className="font-medium">English</span>
                </div>
                <div className="flex items-center space-x-4">
                  <div className="w-full bg-secondary rounded-full h-2 max-w-[200px]">
                    <div className="bg-green-500 h-2 rounded-full" style={{width: '94.8%'}}></div>
                  </div>
                  <span className="font-medium text-primary min-w-[2rem]">55</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-3 h-3 rounded-full bg-orange-500"></div>
                  <span className="font-medium">Spanish</span>
                </div>
                <div className="flex items-center space-x-4">
                  <div className="w-full bg-secondary rounded-full h-2 max-w-[200px]">
                    <div className="bg-orange-500 h-2 rounded-full" style={{width: '5.2%'}}></div>
                  </div>
                  <span className="font-medium text-primary min-w-[2rem]">3</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Top Delivered Track */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Award className="h-5 w-5 text-primary" />
              Top Delivered Track
            </CardTitle>
            <CardDescription>
              Most popular training tracks by session count
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="p-4 bg-purple-600 rounded-lg text-white">
                <h3 className="font-semibold text-lg mb-1">Hands-on with Azure AI Foundry and Agent frameworks</h3>
                <p className="text-purple-100">7 Sessions</p>
              </div>
              <div className="p-4 bg-purple-600 rounded-lg text-white">
                <h3 className="font-semibold text-lg mb-1">GitHub Copilot Innovation Workshop</h3>
                <p className="text-purple-100">7 Sessions</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  )
}