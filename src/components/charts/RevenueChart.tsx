import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"

const data = [
  { month: "Jan", revenue: 4000, target: 4500 },
  { month: "Feb", revenue: 4500, target: 4800 },
  { month: "Mar", revenue: 5200, target: 5000 },
  { month: "Apr", revenue: 4800, target: 5200 },
  { month: "May", revenue: 6100, target: 5500 },
  { month: "Jun", revenue: 5900, target: 5800 },
  { month: "Jul", revenue: 7200, target: 6200 },
  { month: "Aug", revenue: 6800, target: 6500 },
  { month: "Sep", revenue: 7800, target: 7000 },
  { month: "Oct", revenue: 8200, target: 7500 },
  { month: "Nov", revenue: 8600, target: 8000 },
  { month: "Dec", revenue: 9200, target: 8500 },
]

export function RevenueChart() {
  return (
    <Card className="dashboard-card shadow-card border-border/50 bg-card/50 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="text-lg font-semibold text-foreground">Revenue Trends</CardTitle>
        <CardDescription className="text-muted-foreground">
          Monthly revenue vs targets for the current year
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis 
              dataKey="month" 
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
              tickFormatter={(value) => `$${value}`}
            />
            <Tooltip 
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "8px",
                color: "hsl(var(--foreground))"
              }}
              formatter={(value, name) => [`$${value}`, name === "revenue" ? "Actual" : "Target"]}
            />
            <Line 
              type="monotone" 
              dataKey="revenue" 
              stroke="hsl(var(--primary))" 
              strokeWidth={3}
              dot={{ fill: "hsl(var(--primary))", strokeWidth: 2, r: 4 }}
              activeDot={{ r: 6, stroke: "hsl(var(--primary))", strokeWidth: 2 }}
            />
            <Line 
              type="monotone" 
              dataKey="target" 
              stroke="hsl(var(--secondary))" 
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={{ fill: "hsl(var(--secondary))", strokeWidth: 2, r: 3 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}