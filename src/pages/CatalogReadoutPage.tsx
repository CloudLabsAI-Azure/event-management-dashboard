import { useMemo, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  Lightbulb,
  Search,
  Trash2,
  Flag,
} from "lucide-react";
import {
  additionalLabs,
  closurePoints,
  newProposals,
  readoutMeta,
  retirements,
  retirementSummary,
  top25Updates,
  type DeckStatus,
  type LabUpdate,
  type Readiness,
} from "@/data/fy27Readout";

const statusBadge = (status: DeckStatus) =>
  status === "Done" ? (
    <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500 whitespace-nowrap">
      <CheckCircle2 className="h-3 w-3 mr-1" />
      Done
    </Badge>
  ) : (
    <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500 whitespace-nowrap">
      <Clock className="h-3 w-3 mr-1" />
      In progress
    </Badge>
  );

const readinessBadge = (readiness: Readiness) =>
  readiness === "LabGuide preview" ? (
    <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500 whitespace-nowrap">
      LabGuide preview
    </Badge>
  ) : (
    <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500 whitespace-nowrap">
      TOC provided
    </Badge>
  );

function LabUpdatesTable({ rows }: { rows: LabUpdate[] }) {
  return (
    <ScrollArea className="h-[520px] w-full rounded-md border">
      <Table>
        <TableHeader className="sticky top-0 bg-background z-10">
          <TableRow>
            <TableHead className="min-w-[280px]">Lab title</TableHead>
            <TableHead className="min-w-[420px]">Update completed post-build</TableHead>
            <TableHead className="w-32">Deck status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                No labs match your search.
              </TableCell>
            </TableRow>
          ) : (
            rows.map((lab, idx) => (
              <TableRow key={idx}>
                <TableCell className="font-medium align-top">{lab.title}</TableCell>
                <TableCell className="text-muted-foreground align-top text-sm">{lab.update}</TableCell>
                <TableCell className="align-top">{statusBadge(lab.status)}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </ScrollArea>
  );
}

export default function CatalogReadoutPage() {
  const [search, setSearch] = useState("");

  const q = search.trim().toLowerCase();
  const filterLabs = (rows: LabUpdate[]) =>
    !q
      ? rows
      : rows.filter(
          (r) =>
            r.title.toLowerCase().includes(q) || r.update.toLowerCase().includes(q),
        );

  const filteredTop25 = useMemo(() => filterLabs(top25Updates), [q]);
  const filteredAdditional = useMemo(() => filterLabs(additionalLabs), [q]);

  const top25Done = top25Updates.filter((l) => l.status === "Done").length;
  const additionalDone = additionalLabs.filter((l) => l.status === "Done").length;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-3xl font-bold text-foreground">{readoutMeta.title}</h1>
            <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-500 text-[10px]">
              {readoutMeta.classification}
            </Badge>
          </div>
          <p className="text-muted-foreground">{readoutMeta.subtitle}</p>
          <p className="text-xs text-muted-foreground mt-1">
            Version {readoutMeta.version} · {readoutMeta.date} · Owner: {readoutMeta.owner} ·
            Sponsor: {readoutMeta.sponsor}
          </p>
        </div>

        {/* Stat callouts */}
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          <Card className="glass-card">
            <CardHeader className="pb-2">
              <CardDescription>Top 25 refreshed</CardDescription>
              <CardTitle className="text-3xl">
                {top25Done}
                <span className="text-base text-muted-foreground">/{top25Updates.length}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">Decks updated post-build</CardContent>
          </Card>
          <Card className="glass-card">
            <CardHeader className="pb-2">
              <CardDescription>Additional labs</CardDescription>
              <CardTitle className="text-3xl">
                {additionalDone}
                <span className="text-base text-muted-foreground">/{additionalLabs.length}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">Reviewed & validated</CardContent>
          </Card>
          <Card className="glass-card">
            <CardHeader className="pb-2">
              <CardDescription>Retirements</CardDescription>
              <CardTitle className="text-3xl">{retirementSummary.totalRemoved}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              {retirementSummary.fy26Removed} FY26 · {retirementSummary.fy27Pending} FY27 pending
            </CardContent>
          </Card>
          <Card className="glass-card">
            <CardHeader className="pb-2">
              <CardDescription>New proposals</CardDescription>
              <CardTitle className="text-3xl">{newProposals.length}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">Proposed for FY27</CardContent>
          </Card>
        </div>

        {/* Search */}
        <div className="relative max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search labs by title or update..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>

        {/* Tabs */}
        <Tabs defaultValue="updates" className="w-full">
          <TabsList className="grid w-full grid-cols-2 lg:grid-cols-4">
            <TabsTrigger value="updates">Lab & Deck Updates</TabsTrigger>
            <TabsTrigger value="retirements">FY27 Retirements</TabsTrigger>
            <TabsTrigger value="proposals">New Proposals</TabsTrigger>
            <TabsTrigger value="summary">Summary</TabsTrigger>
          </TabsList>

          {/* Lab & Deck Updates */}
          <TabsContent value="updates" className="space-y-6">
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary" />
                  Top 25 — post-build updates
                </CardTitle>
                <CardDescription>
                  Post-build refreshes across the Top 25 workshop set · {filteredTop25.length} shown
                </CardDescription>
              </CardHeader>
              <CardContent>
                <LabUpdatesTable rows={filteredTop25} />
              </CardContent>
            </Card>

            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  Additional 15 labs — reviewed and validated
                </CardTitle>
                <CardDescription>
                  Reviewed and validated after Microsoft Build · {filteredAdditional.length} shown
                </CardDescription>
              </CardHeader>
              <CardContent>
                <LabUpdatesTable rows={filteredAdditional} />
              </CardContent>
            </Card>
          </TabsContent>

          {/* Retirements */}
          <TabsContent value="retirements" className="space-y-4">
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Trash2 className="h-5 w-5 text-orange-600" />
                  Retired and planned-to-retire tracks
                </CardTitle>
                <CardDescription>{retirementSummary.note}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[300px]">Track title</TableHead>
                        <TableHead className="min-w-[220px]">Reason</TableHead>
                        <TableHead className="w-44">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {retirements.map((track, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="font-medium align-top">{track.title}</TableCell>
                          <TableCell className="text-muted-foreground align-top text-sm">
                            {track.reason || <span className="text-gray-400">—</span>}
                          </TableCell>
                          <TableCell className="align-top">
                            <Badge
                              variant="outline"
                              className={
                                track.bucket === "FY27 — pending removal"
                                  ? "bg-orange-500/10 text-orange-600 border-orange-500 whitespace-nowrap"
                                  : "bg-gray-500/10 text-gray-500 border-gray-400 whitespace-nowrap"
                              }
                            >
                              <Flag className="h-3 w-3 mr-1" />
                              {track.bucket}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* New Proposals */}
          <TabsContent value="proposals" className="space-y-4">
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Lightbulb className="h-5 w-5 text-amber-500" />
                  New catalog items proposed for FY27
                </CardTitle>
                <CardDescription>
                  LabGuide preview = a working preview is ready to share. TOC provided = outline
                  ready; we build on confirmation.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[420px]">Proposed lab title</TableHead>
                        <TableHead className="w-44">Readiness</TableHead>
                        <TableHead className="w-28">Duration</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {newProposals.map((p, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="font-medium align-top">
                            {p.link ? (
                              <a
                                href={p.link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:underline inline-flex items-center gap-1"
                              >
                                {p.title}
                                <ExternalLink className="h-3 w-3 shrink-0" />
                              </a>
                            ) : (
                              p.title
                            )}
                          </TableCell>
                          <TableCell className="align-top">{readinessBadge(p.readiness)}</TableCell>
                          <TableCell className="text-muted-foreground align-top text-sm">
                            {p.duration}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Summary */}
          <TabsContent value="summary" className="space-y-4">
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                  Closure review and sign-off
                </CardTitle>
                <CardDescription>FY27 Catalog Readout</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2">
                  {closurePoints.map((point, idx) => (
                    <div
                      key={idx}
                      className="flex gap-3 p-4 rounded-lg border bg-muted/30"
                    >
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-semibold">
                        {idx + 1}
                      </div>
                      <div>
                        <h3 className="font-semibold text-foreground">{point.title}</h3>
                        <p className="text-sm text-muted-foreground mt-1">{point.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
