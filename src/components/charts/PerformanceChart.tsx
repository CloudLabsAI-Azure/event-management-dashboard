import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"

const data = [
  { category: "API", success: 95, warning: 3, error: 2 },
  { category: "Database", success: 98, warning: 1, error: 1 },
  { category: "Frontend", success: 92, warning: 5, error: 3 },
  { category: "Payment", success: 99, warning: 0.5, error: 0.5 },
  { category: "Auth", success: 97, warning: 2, error: 1 },
  { category: "Storage", success: 96, warning: 3, error: 1 },
]

export function PerformanceChart() {
  return (
    <Card className="dashboard-card shadow-card border-border/50 bg-card/50 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="text-lg font-semibold text-foreground">System Performance</CardTitle>
        <CardDescription className="text-muted-foreground">
          Service reliability metrics across different components
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis 
              dataKey="category" 
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
              domain={[0, 100]}
            />
            <Tooltip 
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "8px",
                color: "hsl(var(--foreground))"
              }}
              formatter={(value, name) => [`${value}%`, name === "success" ? "Success" : name === "warning" ? "Warning" : "Error"]}
            />
            <Bar 
              dataKey="success" 
              stackId="a" 
              fill="hsl(142 76% 36%)"
              radius={[0, 0, 0, 0]}
            />
            <Bar 
              dataKey="warning" 
              stackId="a" 
              fill="hsl(38 92% 50%)"
              radius={[0, 0, 0, 0]}
            />
            <Bar 
              dataKey="error" 
              stackId="a" 
              fill="hsl(0 84.2% 60.2%)"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}