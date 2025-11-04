import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"

const data = [
  { day: "Mon", active: 1400, new: 240 },
  { day: "Tue", active: 1680, new: 198 },
  { day: "Wed", active: 1890, new: 980 },
  { day: "Thu", active: 2200, new: 398 },
  { day: "Fri", active: 2500, new: 480 },
  { day: "Sat", active: 1800, new: 380 },
  { day: "Sun", active: 1600, new: 430 },
]

export function UserAnalyticsChart() {
  return (
    <Card className="dashboard-card shadow-card border-border/50 bg-card/50 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="text-lg font-semibold text-foreground">User Activity</CardTitle>
        <CardDescription className="text-muted-foreground">
          Daily active users and new registrations this week
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={data}>
            <defs>
              <linearGradient id="activeGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.8}/>
                <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.1}/>
              </linearGradient>
              <linearGradient id="newGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--secondary))" stopOpacity={0.8}/>
                <stop offset="95%" stopColor="hsl(var(--secondary))" stopOpacity={0.1}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis 
              dataKey="day" 
              stroke="hsl(var(--muted-foreground))"
              fontSize={12}
              tickLine={false}
              axisLine={false}
            />
            <YAxis 
              stroke="hsl(var(--muted-foreground))"
              fontSize={12}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip 
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "8px",
                color: "hsl(var(--foreground))"
              }}
              formatter={(value, name) => [value, name === "active" ? "Active Users" : "New Users"]}
            />
            <Area 
              type="monotone" 
              dataKey="active" 
              stroke="hsl(var(--primary))" 
              fillOpacity={1} 
              fill="url(#activeGradient)"
              strokeWidth={2}
            />
            <Area 
              type="monotone" 
              dataKey="new" 
              stroke="hsl(var(--secondary))" 
              fillOpacity={1} 
              fill="url(#newGradient)"
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}