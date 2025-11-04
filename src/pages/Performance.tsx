import { DashboardLayout } from "@/components/DashboardLayout"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { MetricCard } from "@/components/MetricCard"
import { Activity, Zap, Server, HardDrive, Cpu, Wifi } from "lucide-react"
import { PerformanceChart } from "@/components/charts/PerformanceChart"
import { Progress } from "@/components/ui/progress"
import InlineMetric from '@/components/InlineMetric'

export default function Performance() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Performance Monitor</h1>
          <p className="text-muted-foreground">
            System performance metrics and infrastructure monitoring
          </p>
        </div>

        {/* Performance Metrics */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            title="Response Time"
            value={<InlineMetric metricKey="performance.responseTimeMs" value={234} />}
            change="-12ms from last hour"
            changeType="positive"
            icon={Zap}
          />
          <MetricCard
            title="Uptime"
            value={<InlineMetric metricKey="performance.uptimePercent" value={99.97} />}
            change="+0.02% from last month"
            changeType="positive"
            icon={Activity}
          />
          <MetricCard
            title="Throughput"
            value={<InlineMetric metricKey="performance.throughputRps" value={1523} />}
            change="+8.3% from last hour"
            changeType="positive"
            icon={Server}
          />
          <MetricCard
            title="Error Rate"
            value={<InlineMetric metricKey="performance.errorRatePercent" value={0.12} />}
            change="-0.05% from last hour"
            changeType="positive"
            icon={Wifi}
          />
        </div>

        {/* Performance Chart */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              System Performance
            </CardTitle>
            <CardDescription>
              Real-time performance metrics over the last 24 hours
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PerformanceChart />
          </CardContent>
        </Card>

        {/* System Resources */}
        <div className="grid gap-6 md:grid-cols-2">
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Cpu className="h-5 w-5 text-primary" />
                System Resources
              </CardTitle>
              <CardDescription>
                Current system resource utilization
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">CPU Usage</span>
                    <span className="text-sm text-muted-foreground">68%</span>
                  </div>
                  <Progress value={68} className="h-2" />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Memory Usage</span>
                    <span className="text-sm text-muted-foreground">45%</span>
                  </div>
                  <Progress value={45} className="h-2" />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Disk Usage</span>
                    <span className="text-sm text-muted-foreground">72%</span>
                  </div>
                  <Progress value={72} className="h-2" />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Network I/O</span>
                    <span className="text-sm text-muted-foreground">34%</span>
                  </div>
                  <Progress value={34} className="h-2" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <HardDrive className="h-5 w-5 text-primary" />
                Database Performance
              </CardTitle>
              <CardDescription>
                Database metrics and query performance
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {[
                  { metric: "Query Response Time", value: "12ms", status: "good" },
                  { metric: "Active Connections", value: "247", status: "good" },
                  { metric: "Slow Queries", value: "3", status: "warning" },
                  { metric: "Cache Hit Rate", value: "94.5%", status: "good" },
                  { metric: "Deadlocks", value: "0", status: "good" },
                ].map((item) => (
                  <div key={item.metric} className="flex items-center justify-between">
                    <span className="font-medium">{item.metric}</span>
                    <div className="flex items-center space-x-2">
                      <span className="text-muted-foreground">{item.value}</span>
                      <div className={`w-2 h-2 rounded-full ${
                        item.status === 'good' ? 'bg-success' : 
                        item.status === 'warning' ? 'bg-warning' : 'bg-destructive'
                      }`}></div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Performance Alerts */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle>Performance Alerts</CardTitle>
            <CardDescription>
              Recent system alerts and notifications
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                { 
                  alert: "High CPU usage detected on server-02", 
                  severity: "warning", 
                  time: "5 minutes ago",
                  status: "Active"
                },
                { 
                  alert: "Database connection pool nearly full", 
                  severity: "warning", 
                  time: "12 minutes ago",
                  status: "Resolved"
                },
                { 
                  alert: "Disk space low on backup server", 
                  severity: "error", 
                  time: "1 hour ago",
                  status: "Active"
                },
                { 
                  alert: "Memory usage optimization completed", 
                  severity: "info", 
                  time: "2 hours ago",
                  status: "Resolved"
                },
              ].map((alert, index) => (
                <div key={index} className="flex items-center justify-between p-4 rounded-lg border border-border/50 interactive-hover">
                  <div className="flex items-center space-x-3">
                    <div className={`w-3 h-3 rounded-full ${
                      alert.severity === 'error' ? 'bg-destructive' :
                      alert.severity === 'warning' ? 'bg-warning' : 'bg-primary'
                    }`}></div>
                    <div>
                      <p className="font-medium">{alert.alert}</p>
                      <p className="text-sm text-muted-foreground">{alert.time}</p>
                    </div>
                  </div>
                  <span className={`text-sm font-medium ${
                    alert.status === 'Active' ? 'text-destructive' : 'text-success'
                  }`}>
                    {alert.status}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  )
}