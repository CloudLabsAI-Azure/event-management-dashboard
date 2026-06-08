import { useState, useEffect, useCallback, useMemo } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from "recharts";
import {
  AlertTriangle, CheckCircle2, RefreshCw, BrainCircuit, Loader2,
  ExternalLink, CircleDot, Eye, EyeOff, ThumbsUp, ShieldAlert, CircleCheck,
  Search, ChevronLeft, ChevronRight, Filter, Clock, TrendingUp
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
  category?: string;
  createdBy?: string;
  changedBy?: string;
  createdDate?: string;
  changedDate?: string;
  revisionCount?: number;
  isTracked?: boolean;
}

interface CategoryBreakdown {
  category: string;
  count: number;
  untrackedCount: number;
  severity: string;
  description: string;
  recommendation: string;
}

interface AiAnalysis {
  summary: string;
  categoryBreakdown?: CategoryBreakdown[];
  trackBreakdown?: { trackName: string; issueCount: number; severity: string; description: string; recommendation: string }[];
  topPriorities: { workItemId: number; title: string; reason: string }[];
  trackingInsight?: string;
  overallHealth: string;
}

const SEVERITY_COLORS: Record<string, string> = {
  high: "hsl(0 84.2% 60.2%)",
  medium: "hsl(38 92% 50%)",
  low: "hsl(142 76% 36%)",
};

const CHART_COLORS = [
  "hsl(142 76% 36%)",
  "hsl(221 83% 53%)",
  "hsl(0 84.2% 60.2%)",
  "hsl(38 92% 50%)",
];

const CATEGORY_CONFIG: Record<string, { label: string; badgeClass: string; icon: typeof CheckCircle2 }> = {
  'no-issue': { label: "No Issue", badgeClass: "bg-green-500/15 text-green-600 border-green-500/30", icon: CircleCheck },
  'good-feedback': { label: "Good Feedback", badgeClass: "bg-blue-500/15 text-blue-600 border-blue-500/30", icon: ThumbsUp },
  'major-issue': { label: "Major Issue", badgeClass: "bg-red-500/15 text-red-600 border-red-500/30", icon: ShieldAlert },
};

type CategoryFilter = 'all' | 'no-issue' | 'good-feedback' | 'major-issue';
type TrackingFilter = 'all' | 'tracked' | 'untracked';
type StatusFilter = 'all' | 'open' | 'completed';

const PAGE_SIZE = 25;

export default function DevOpsIssuesPage() {
  const { userRole, user } = useAuth();
  const isAdmin = userRole === "admin";
  const userEmail = (user?.email || '').toLowerCase();
  const userDomain = userEmail.split('@')[1] || '';
  const hasAccess = userDomain === 'spektrasystems.com' || userEmail === 'dev@localhost';

  const [issues, setIssues] = useState<Issue[]>([]);
  const [lastFetched, setLastFetched] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AiAnalysis | null>(null);
  const [devopsOrg, setDevopsOrg] = useState('');
  const [devopsProject, setDevopsProject] = useState('');
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [trackingFilter, setTrackingFilter] = useState<TrackingFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [page, setPage] = useState(1);

  const workItemUrl = (id: number) =>
    devopsOrg && devopsProject
      ? `https://dev.azure.com/${devopsOrg}/${encodeURIComponent(devopsProject)}/_workitems/edit/${id}`
      : `https://dev.azure.com/_workitems/edit/${id}`;

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get("/api/devops/issues");
      const data = res.data;
      setIssues(data.issues || []);
      setLastFetched(data.lastFetched);
      setDevopsOrg(data.devopsOrg || '');
      setDevopsProject(data.devopsProject || '');
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
      await api.post("/api/devops/issues/fetch");
      await loadData();
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

  // Counts
  const noIssueCount = issues.filter(i => (i.category || 'no-issue') === 'no-issue').length;
  const goodFeedbackCount = issues.filter(i => i.category === 'good-feedback').length;
  const majorIssueCount = issues.filter(i => i.category === 'major-issue').length;
  const untrackedCount = issues.filter(i => !i.isTracked && !i.completed).length;
  const openCount = issues.filter(i => !i.completed).length;

  // Recent activity (last 7 days)
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recentCount = issues.filter(i => new Date(i.fetchedAt).getTime() > sevenDaysAgo).length;

  // Pie data
  const pieData = [
    { name: "No Issue", value: noIssueCount },
    { name: "Good Feedback", value: goodFeedbackCount },
    { name: "Major Issues", value: majorIssueCount },
  ].filter(d => d.value > 0);

  // Bar chart
  const categoryChartData = [
    { name: "No Issue", open: issues.filter(i => (i.category || 'no-issue') === 'no-issue' && !i.completed).length, completed: issues.filter(i => (i.category || 'no-issue') === 'no-issue' && i.completed).length },
    { name: "Good Feedback", open: issues.filter(i => i.category === 'good-feedback' && !i.completed).length, completed: issues.filter(i => i.category === 'good-feedback' && i.completed).length },
    { name: "Major Issues", open: issues.filter(i => i.category === 'major-issue' && !i.completed).length, completed: issues.filter(i => i.category === 'major-issue' && i.completed).length },
  ];

  // Filtered + searched issues
  const filteredIssues = useMemo(() => {
    let result = [...issues];

    if (categoryFilter !== 'all') {
      result = result.filter(i => (i.category || 'no-issue') === categoryFilter);
    }
    if (trackingFilter === 'tracked') {
      result = result.filter(i => i.isTracked);
    } else if (trackingFilter === 'untracked') {
      result = result.filter(i => !i.isTracked);
    }
    if (statusFilter === 'open') {
      result = result.filter(i => !i.completed);
    } else if (statusFilter === 'completed') {
      result = result.filter(i => i.completed);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(i =>
        i.title.toLowerCase().includes(q) ||
        String(i.workItemId).includes(q) ||
        (i.eventId || '').toLowerCase().includes(q) ||
        (i.assignedTo || '').toLowerCase().includes(q) ||
        (i.feedbackText || '').toLowerCase().includes(q) ||
        (i.trackName || '').toLowerCase().includes(q)
      );
    }

    // Sort: major issues first, then by date
    result.sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      const catOrder: Record<string, number> = { 'major-issue': 0, 'good-feedback': 1, 'no-issue': 2 };
      const catA = catOrder[a.category || 'no-issue'] ?? 2;
      const catB = catOrder[b.category || 'no-issue'] ?? 2;
      if (catA !== catB) return catA - catB;
      return new Date(b.fetchedAt).getTime() - new Date(a.fetchedAt).getTime();
    });

    return result;
  }, [issues, categoryFilter, trackingFilter, statusFilter, searchQuery]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredIssues.length / PAGE_SIZE));
  const paginatedIssues = filteredIssues.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [categoryFilter, trackingFilter, statusFilter, searchQuery]);

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
              Event Summary Logs &mdash; AI-powered analysis &amp; tracking
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
              <Button onClick={runAiAnalysis} disabled={analyzing || openCount === 0} size="sm">
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
        <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-7">
          <Card className="glass-card">
            <CardHeader className="pb-2 pt-3 px-4">
              <CardDescription className="text-xs">Total</CardDescription>
              <CardTitle className="text-xl">{issues.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="glass-card">
            <CardHeader className="pb-2 pt-3 px-4">
              <CardDescription className="text-xs flex items-center gap-1"><CircleDot className="h-3 w-3 text-yellow-500" /> Open</CardDescription>
              <CardTitle className="text-xl text-yellow-500">{openCount}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="glass-card">
            <CardHeader className="pb-2 pt-3 px-4">
              <CardDescription className="text-xs flex items-center gap-1"><CircleCheck className="h-3 w-3 text-green-500" /> No Issue</CardDescription>
              <CardTitle className="text-xl text-green-500">{noIssueCount}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="glass-card">
            <CardHeader className="pb-2 pt-3 px-4">
              <CardDescription className="text-xs flex items-center gap-1"><ThumbsUp className="h-3 w-3 text-blue-500" /> Good</CardDescription>
              <CardTitle className="text-xl text-blue-500">{goodFeedbackCount}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="glass-card">
            <CardHeader className="pb-2 pt-3 px-4">
              <CardDescription className="text-xs flex items-center gap-1"><ShieldAlert className="h-3 w-3 text-red-500" /> Issues</CardDescription>
              <CardTitle className="text-xl text-red-500">{majorIssueCount}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="glass-card">
            <CardHeader className="pb-2 pt-3 px-4">
              <CardDescription className="text-xs flex items-center gap-1"><EyeOff className="h-3 w-3 text-yellow-500" /> Untracked</CardDescription>
              <CardTitle className="text-xl text-yellow-500">{untrackedCount}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="glass-card">
            <CardHeader className="pb-2 pt-3 px-4">
              <CardDescription className="text-xs flex items-center gap-1"><Clock className="h-3 w-3 text-purple-500" /> This Week</CardDescription>
              <CardTitle className="text-xl text-purple-500">{recentCount}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* Charts Row */}
        {issues.length > 0 && (
          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="glass-card lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <TrendingUp className="h-5 w-5 text-primary" />
                  Issues by Category
                </CardTitle>
                <CardDescription>Open vs completed items by feedback category</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={categoryChartData} margin={{ top: 10, right: 30, left: 0, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <YAxis stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
                    <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                    <Bar dataKey="open" name="Open" fill="hsl(38 92% 50%)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="completed" name="Completed" fill="hsl(142 76% 36%)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="text-lg">Category Distribution</CardTitle>
                <CardDescription>Feedback breakdown by type</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={95}
                      paddingAngle={4} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                      {pieData.map((_, idx) => (
                        <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                      ))}
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
          <Card className="glass-card border-primary/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <BrainCircuit className="h-5 w-5 text-primary" />
                AI Analysis Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground leading-relaxed">{analysis.summary}</p>

              {/* Tracking Insight */}
              {analysis.trackingInsight && (
                <div className="rounded-md border border-yellow-500/30 bg-yellow-500/5 p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <EyeOff className="h-4 w-4 text-yellow-500" />
                    <span className="font-semibold text-sm">Tracking Insight</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{analysis.trackingInsight}</p>
                </div>
              )}

              {/* Top Priorities with hyperlinks */}
              {analysis.topPriorities?.length > 0 && (
                <div>
                  <h4 className="font-semibold mb-2 text-sm">Top Priorities</h4>
                  <div className="space-y-2">
                    {analysis.topPriorities.map((p, idx) => (
                      <div key={idx} className="flex items-start gap-2 rounded-md border p-3 bg-card/50">
                        <a
                          href={workItemUrl(p.workItemId)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-0.5 shrink-0"
                        >
                          <Badge variant="outline" className="hover:bg-primary/10 hover:text-primary cursor-pointer">
                            <ExternalLink className="h-3 w-3 mr-1" />
                            WI-{p.workItemId}
                          </Badge>
                        </a>
                        <div className="flex-1">
                          <p className="text-sm font-medium">{p.title}</p>
                          <p className="text-xs text-muted-foreground">{p.reason}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Category Breakdown (new AI format) */}
              {analysis.categoryBreakdown?.length > 0 && (
                <div>
                  <h4 className="font-semibold mb-2 text-sm">Category Breakdown</h4>
                  <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                    {analysis.categoryBreakdown.map((cat, idx) => (
                      <div key={idx} className="rounded-lg border p-3 bg-card/50">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium text-sm">{CATEGORY_CONFIG[cat.category]?.label || cat.category}</span>
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="text-xs">{cat.count}</Badge>
                            {cat.untrackedCount > 0 && (
                              <Badge variant="outline" className="text-xs bg-yellow-500/10 text-yellow-600 border-yellow-500/30">
                                {cat.untrackedCount} untracked
                              </Badge>
                            )}
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground mb-1">{cat.description}</p>
                        <p className="text-xs"><span className="font-medium">Action:</span> {cat.recommendation}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Legacy Track Breakdown (backward compat) */}
              {!analysis.categoryBreakdown?.length && analysis.trackBreakdown?.length > 0 && (
                <div>
                  <h4 className="font-semibold mb-2 text-sm">Breakdown</h4>
                  <div className="grid gap-3 md:grid-cols-2">
                    {analysis.trackBreakdown.map((track, idx) => (
                      <div key={idx} className="rounded-lg border p-3 bg-card/50">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium text-sm">{track.trackName}</span>
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="text-xs">{track.issueCount} issues</Badge>
                            <Badge style={{ backgroundColor: SEVERITY_COLORS[track.severity] || SEVERITY_COLORS.medium }} className="text-xs text-white">
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
        )}

        {/* Filters + Search + Issues List */}
        <Card className="glass-card">
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">Work Items</CardTitle>
                  <CardDescription>
                    {filteredIssues.length === issues.length
                      ? `${issues.length} items`
                      : `${filteredIssues.length} of ${issues.length} items`
                    }
                  </CardDescription>
                </div>
              </div>

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by title, WI ID, event, assignee, feedback..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="pl-9 h-9"
                />
              </div>

              {/* Filter buttons */}
              <div className="flex flex-wrap gap-2">
                <div className="flex items-center gap-1 mr-2">
                  <Filter className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground font-medium">Category:</span>
                </div>
                {([['all', 'All'], ['major-issue', 'Major Issues'], ['good-feedback', 'Good Feedback'], ['no-issue', 'No Issue']] as const).map(([key, label]) => (
                  <Button
                    key={key}
                    variant={categoryFilter === key ? "default" : "outline"}
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setCategoryFilter(key)}
                  >
                    {label}
                    {key === 'major-issue' && majorIssueCount > 0 && <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">{majorIssueCount}</Badge>}
                  </Button>
                ))}

                <span className="border-l mx-1" />

                <div className="flex items-center gap-1 mr-1">
                  <span className="text-xs text-muted-foreground font-medium">Tracking:</span>
                </div>
                {([['all', 'All'], ['untracked', 'Untracked'], ['tracked', 'Tracked']] as const).map(([key, label]) => (
                  <Button
                    key={key}
                    variant={trackingFilter === key ? "default" : "outline"}
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setTrackingFilter(key)}
                  >
                    {label}
                    {key === 'untracked' && untrackedCount > 0 && <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">{untrackedCount}</Badge>}
                  </Button>
                ))}

                <span className="border-l mx-1" />

                <div className="flex items-center gap-1 mr-1">
                  <span className="text-xs text-muted-foreground font-medium">Status:</span>
                </div>
                {([['all', 'All'], ['open', 'Open'], ['completed', 'Done']] as const).map(([key, label]) => (
                  <Button
                    key={key}
                    variant={statusFilter === key ? "default" : "outline"}
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setStatusFilter(key)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
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
            ) : filteredIssues.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Search className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p className="font-medium">No items match your filters</p>
                <p className="text-sm">Try adjusting your search or filter criteria</p>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  {paginatedIssues.map(issue => {
                    const catConfig = CATEGORY_CONFIG[issue.category || 'no-issue'] || CATEGORY_CONFIG['no-issue'];
                    const CatIcon = catConfig.icon;
                    return (
                      <div
                        key={issue.id}
                        className={`flex items-start gap-3 rounded-lg border p-3 transition-colors ${
                          issue.completed ? "bg-green-500/5 border-green-500/20 opacity-70" : "bg-card/50 hover:bg-accent/30"
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <a
                              href={workItemUrl(issue.workItemId)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="shrink-0"
                            >
                              <Badge variant="outline" className="text-xs hover:bg-primary/10 hover:text-primary cursor-pointer">
                                <ExternalLink className="h-2.5 w-2.5 mr-1" />
                                WI-{issue.workItemId}
                              </Badge>
                            </a>
                            <span className={`font-medium text-sm ${issue.completed ? "line-through text-muted-foreground" : ""}`}>
                              {issue.title}
                            </span>
                            <Badge className={`text-xs border ${catConfig.badgeClass}`} variant="outline">
                              <CatIcon className="h-3 w-3 mr-1" />
                              {catConfig.label}
                            </Badge>
                            {issue.isTracked ? (
                              <Badge variant="outline" className="text-xs bg-green-500/10 text-green-600 border-green-500/30">
                                <Eye className="h-3 w-3 mr-1" /> Tracked
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-xs bg-yellow-500/10 text-yellow-600 border-yellow-500/30">
                                <EyeOff className="h-3 w-3 mr-1" /> Untracked
                              </Badge>
                            )}
                            {issue.state && <Badge variant="secondary" className="text-xs">{issue.state}</Badge>}
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                            {issue.eventId && <span>Event: {issue.eventId}</span>}
                            {issue.eventDate && <span>Date: {new Date(issue.eventDate).toLocaleDateString()}</span>}
                            {issue.assignedTo && <span>Assigned: {issue.assignedTo}</span>}
                            {issue.createdBy && <span>Created: {issue.createdBy}</span>}
                            {issue.changedBy && issue.changedBy !== issue.createdBy && (
                              <span className="text-primary font-medium">Updated by: {issue.changedBy}</span>
                            )}
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
                        <Button
                          variant={issue.completed ? "ghost" : "outline"}
                          size="sm"
                          className={`shrink-0 h-7 text-xs ${issue.completed ? "text-green-500" : ""}`}
                          onClick={() => toggleComplete(issue.id)}
                        >
                          {issue.completed
                            ? <><CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Done</>
                            : <><CircleDot className="h-3.5 w-3.5 mr-1" /> Mark Done</>
                          }
                        </Button>
                      </div>
                    );
                  })}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4 pt-4 border-t">
                    <p className="text-xs text-muted-foreground">
                      Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filteredIssues.length)} of {filteredIssues.length}
                    </p>
                    <div className="flex items-center gap-1">
                      <Button variant="outline" size="sm" className="h-7" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <span className="text-xs px-2">Page {page} of {totalPages}</span>
                      <Button variant="outline" size="sm" className="h-7" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
