import { useState, useEffect, useCallback } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from "recharts";
import {
  AlertTriangle, CheckCircle2, RefreshCw, BrainCircuit, Loader2,
  ExternalLink, CircleDot, ArrowUpDown
} from "lucide-react";
import api from "@/lib/api";
import { useAuth } from "@/components/AuthProvider";

interface Issue {
  id: string;
  workItemId: number;
  title: string;
  eventId: string;
  eventDate: string | null;
  state: string;
  tags: string;
  assignedTo: string;
  areaPath: string;
  feedbackText: string;
  trackName: string;
  fetchedAt: string;
  completed: boolean;
  completedAt: string | null;
  aiAnalysis: any;
}

interface TrackBreakdown {
  trackName: string;
  issueCount: number;
  severity: string;
  description: string;
  recommendation: string;
}

interface AiAnalysis {
  summary: string;
  trackBreakdown: TrackBreakdown[];
  chartData: { name: string; open: number; resolved: number; total: number }[];
  topPriorities: { workItemId: number; title: string; reason: string }[];
  overallHealth: string;
}

const SEVERITY_COLORS: Record<string, string> = {
  high: "hsl(0 84.2% 60.2%)",
  medium: "hsl(38 92% 50%)",
  low: "hsl(142 76% 36%)",
};

const CHART_COLORS = [
  "hsl(221 83% 53%)",
  "hsl(262 83% 58%)",
  "hsl(142 76% 36%)",
  "hsl(38 92% 50%)",
  "hsl(0 84.2% 60.2%)",
  "hsl(199 89% 48%)",
  "hsl(330 81% 60%)",
  "hsl(25 95% 53%)",
];

const HEALTH_CONFIG: Record<string, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  good: { label: "Healthy", color: "text-green-500", icon: CheckCircle2 },
  warning: { label: "Needs Attention", color: "text-yellow-500", icon: AlertTriangle },
  critical: { label: "Critical", color: "text-red-500", icon: AlertTriangle },
};

export default function DevOpsIssuesPage() {
  const { userRole, user } = useAuth();
  const isAdmin = userRole === "admin";
  const userEmail = (user?.email || '').toLowerCase();
  const userDomain = userEmail.split('@')[1] || '';
  const hasAccess = userDomain === 'spektrasystems.com';

  const [issues, setIssues] = useState<Issue[]>([]);
  const [lastFetched, setLastFetched] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AiAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [sortByCompleted, setSortByCompleted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get("/api/devops/issues");
      const data = res.data;
      setIssues(data.issues || []);
      setLastFetched(data.lastFetched);
      // Load latest AI analysis if available
      if (data.aiAnalyses?.length > 0) {
        setAnalysis(data.aiAnalyses[data.aiAnalyses.length - 1].analysis);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || "Failed to load issues");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const fetchFromDevOps = async () => {
    try {
      setFetching(true);
      setError(null);
      const res = await api.post("/api/devops/issues/fetch");
      await loadData();
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.error || "Failed to fetch from DevOps");
    } finally {
      setFetching(false);
    }
  };

  const runAiAnalysis = async () => {
    try {
      setAnalyzing(true);
      setError(null);
      const res = await api.post("/api/devops/issues/analyze");
      if (res.data.analysis) {
        setAnalysis(res.data.analysis);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || "AI analysis failed");
    } finally {
      setAnalyzing(false);
    }
  };

  const toggleComplete = async (issueId: string) => {
    try {
      await api.patch(`/api/devops/issues/${issueId}/complete`);
      setIssues(prev =>
        prev.map(i => i.id === issueId
          ? { ...i, completed: !i.completed, completedAt: !i.completed ? new Date().toISOString() : null }
          : i
        )
      );
    } catch (err: any) {
      setError("Failed to update issue");
    }
  };

  const openIssues = issues.filter(i => !i.completed);
  const completedIssues = issues.filter(i => i.completed);

  // Build chart data from issues (grouped by track)
  const trackMap = new Map<string, { open: number; completed: number }>();
  issues.forEach(issue => {
    const track = issue.trackName || "Unknown";
    const entry = trackMap.get(track) || { open: 0, completed: 0 };
    if (issue.completed) entry.completed++;
    else entry.open++;
    trackMap.set(track, entry);
  });
  const localChartData = Array.from(trackMap.entries()).map(([name, counts]) => ({
    name: name.length > 25 ? name.substring(0, 22) + "..." : name,
    fullName: name,
    open: counts.open,
    resolved: counts.completed,
    total: counts.open + counts.completed,
  }));

  // Pie data for status distribution
  const pieData = [
    { name: "Open", value: openIssues.length },
    { name: "Completed", value: completedIssues.length },
  ].filter(d => d.value > 0);

  const sortedIssues = [...issues].sort((a, b) => {
    if (sortByCompleted) {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
    }
    return new Date(b.fetchedAt).getTime() - new Date(a.fetchedAt).getTime();
  });

  const healthInfo = analysis ? HEALTH_CONFIG[analysis.overallHealth] || HEALTH_CONFIG.warning : null;

  if (!hasAccess) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <AlertTriangle className="h-16 w-16 text-muted-foreground/40 mb-4" />
          <h2 className="text-2xl font-bold mb-2">Access Restricted</h2>
          <p className="text-muted-foreground">This page is only available to authorized domain users.</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">DevOps Issue Tracker</h1>
            <p className="text-muted-foreground">
              Work items with reported issues &mdash; AI-powered analysis &amp; tracking
              {lastFetched && (
                <span className="ml-2 text-xs">
                  Last fetched: {new Date(lastFetched).toLocaleString()}
                </span>
              )}
            </p>
          </div>
          {isAdmin && (
            <div className="flex gap-2">
              <Button onClick={fetchFromDevOps} disabled={fetching} variant="outline" size="sm">
                {fetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                {fetching ? "Fetching..." : "Fetch from DevOps"}
              </Button>
              <Button onClick={runAiAnalysis} disabled={analyzing || openIssues.length === 0} size="sm">
                {analyzing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <BrainCircuit className="mr-2 h-4 w-4" />}
                {analyzing ? "Analyzing..." : "AI Analysis"}
              </Button>
            </div>
          )}
        </div>

        {error && (
          <Card className="border-red-500/50 bg-red-500/10">
            <CardContent className="py-3">
              <p className="text-sm text-red-500">{error}</p>
            </CardContent>
          </Card>
        )}

        {/* KPI Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="glass-card">
            <CardHeader className="pb-2">
              <CardDescription>Total Issues</CardDescription>
              <CardTitle className="text-2xl">{issues.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="glass-card">
            <CardHeader className="pb-2">
              <CardDescription>Open</CardDescription>
              <CardTitle className="text-2xl text-yellow-500">{openIssues.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="glass-card">
            <CardHeader className="pb-2">
              <CardDescription>Completed</CardDescription>
              <CardTitle className="text-2xl text-green-500">{completedIssues.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="glass-card">
            <CardHeader className="pb-2">
              <CardDescription>Overall Health</CardDescription>
              {healthInfo ? (
                <CardTitle className={`text-2xl flex items-center gap-2 ${healthInfo.color}`}>
                  <healthInfo.icon className="h-5 w-5" />
                  {healthInfo.label}
                </CardTitle>
              ) : (
                <CardTitle className="text-2xl text-muted-foreground">—</CardTitle>
              )}
            </CardHeader>
          </Card>
        </div>

        {/* Charts Row */}
        {issues.length > 0 && (
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Bar Chart — Issues by Track */}
            <Card className="glass-card lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <CircleDot className="h-5 w-5 text-primary" />
                  Issues by Track
                </CardTitle>
                <CardDescription>Open vs resolved issues grouped by track/category</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={analysis?.chartData?.length ? analysis.chartData : localChartData}
                    margin={{ top: 10, right: 30, left: 0, bottom: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11}
                      angle={-35} textAnchor="end" interval={0} height={80} />
                    <YAxis stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                      }}
                    />
                    <Bar dataKey="open" name="Open" fill="hsl(38 92% 50%)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="resolved" name="Resolved" fill="hsl(142 76% 36%)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Pie Chart — Status Distribution */}
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="text-lg">Status Distribution</CardTitle>
                <CardDescription>Open vs completed overview</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={320}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={100}
                      paddingAngle={4} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                      <Cell fill="hsl(38 92% 50%)" />
                      <Cell fill="hsl(142 76% 36%)" />
                    </Pie>
                    <Legend />
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        )}

        {/* AI Analysis Results */}
        {analysis && (
          <div className="space-y-4">
            <Card className="glass-card border-primary/30">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <BrainCircuit className="h-5 w-5 text-primary" />
                  AI Analysis Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground leading-relaxed">{analysis.summary}</p>

                {/* Top Priorities */}
                {analysis.topPriorities?.length > 0 && (
                  <div>
                    <h4 className="font-semibold mb-2 text-sm">Top Priorities</h4>
                    <div className="space-y-2">
                      {analysis.topPriorities.map((p, idx) => (
                        <div key={idx} className="flex items-start gap-2 rounded-md border p-3 bg-card/50">
                          <Badge variant="outline" className="mt-0.5 shrink-0">WI-{p.workItemId}</Badge>
                          <div>
                            <p className="text-sm font-medium">{p.title}</p>
                            <p className="text-xs text-muted-foreground">{p.reason}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Track Breakdown */}
                {analysis.trackBreakdown?.length > 0 && (
                  <div>
                    <h4 className="font-semibold mb-2 text-sm">Track Breakdown</h4>
                    <div className="grid gap-3 md:grid-cols-2">
                      {analysis.trackBreakdown.map((track, idx) => (
                        <div key={idx} className="rounded-lg border p-3 bg-card/50">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium text-sm">{track.trackName}</span>
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" className="text-xs">{track.issueCount} issues</Badge>
                              <Badge
                                style={{ backgroundColor: SEVERITY_COLORS[track.severity] || SEVERITY_COLORS.medium }}
                                className="text-xs text-white"
                              >
                                {track.severity}
                              </Badge>
                            </div>
                          </div>
                          <p className="text-xs text-muted-foreground mb-1">{track.description}</p>
                          <p className="text-xs"><span className="font-medium">Recommendation:</span> {track.recommendation}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Issues List */}
        <Card className="glass-card">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">Work Items</CardTitle>
                <CardDescription>{issues.length} items tracked</CardDescription>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSortByCompleted(!sortByCompleted)}>
                <ArrowUpDown className="mr-2 h-4 w-4" />
                {sortByCompleted ? "Sort by date" : "Sort by status"}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : issues.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <AlertTriangle className="h-12 w-12 mx-auto mb-3 opacity-40" />
                <p className="text-lg font-medium">No issues fetched yet</p>
                <p className="text-sm">Click "Fetch from DevOps" to import work items</p>
              </div>
            ) : (
              <div className="space-y-2">
                {sortedIssues.map(issue => (
                  <div
                    key={issue.id}
                    className={`flex items-start gap-3 rounded-lg border p-3 transition-colors ${
                      issue.completed ? "bg-green-500/5 border-green-500/20 opacity-70" : "bg-card/50 hover:bg-accent/30"
                    }`}
                  >
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0 mt-0.5 h-7 w-7"
                      onClick={() => toggleComplete(issue.id)}
                      title={issue.completed ? "Mark as open" : "Mark as completed"}
                    >
                      {issue.completed
                        ? <CheckCircle2 className="h-5 w-5 text-green-500" />
                        : <CircleDot className="h-5 w-5 text-yellow-500" />
                      }
                    </Button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`font-medium text-sm ${issue.completed ? "line-through text-muted-foreground" : ""}`}>
                          {issue.title}
                        </span>
                        <Badge variant="outline" className="text-xs shrink-0">WI-{issue.workItemId}</Badge>
                        {issue.state && <Badge variant="secondary" className="text-xs">{issue.state}</Badge>}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                        {issue.trackName && <span>Track: {issue.trackName}</span>}
                        {issue.eventId && <span>Event: {issue.eventId}</span>}
                        {issue.eventDate && <span>Date: {new Date(issue.eventDate).toLocaleDateString()}</span>}
                        {issue.assignedTo && <span>Assigned: {issue.assignedTo}</span>}
                      </div>
                      {issue.feedbackText && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{issue.feedbackText}</p>
                      )}
                      {issue.completedAt && (
                        <p className="text-xs text-green-500 mt-1">
                          Completed: {new Date(issue.completedAt).toLocaleString()}
                        </p>
                      )}
                    </div>
                    <a
                      href={`https://dev.azure.com/_workitems/edit/${issue.workItemId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 text-muted-foreground hover:text-primary"
                      title="Open in Azure DevOps"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
