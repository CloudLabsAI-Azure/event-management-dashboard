import { LucideIcon } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

interface MetricCardProps {
  title: string
  value: React.ReactNode
  change: string
  changeType: "positive" | "negative" | "neutral"
  icon: LucideIcon
  trend?: React.ReactNode
  className?: string
}

export function MetricCard({ 
  title, 
  value, 
  change, 
  changeType, 
  icon: Icon,
  trend,
  className 
}: MetricCardProps) {
  const changeColor = {
    positive: "text-success",
    negative: "text-destructive", 
    neutral: "text-muted-foreground"
  }[changeType]

  return (
    <Card className={cn(
      "metric-card shadow-card border-border/50 bg-card/50 backdrop-blur-sm hover:bg-card/70",
      className
    )}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <Icon className="h-4 w-4 text-primary" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-foreground mb-1">{value}</div>
        <div className="flex items-center justify-between">
          <p className={cn("text-xs font-medium", changeColor)}>
            {change}
          </p>
          {trend && (
            <div className="h-8 w-16 opacity-60">
              {trend}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}