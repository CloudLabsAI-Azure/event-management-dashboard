import { DashboardLayout } from "@/components/DashboardLayout"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { FileText, TrendingUp, ChevronLeft, ChevronRight } from "lucide-react"
import { useState } from "react"

const tracksData = [
  { sr: 1, trackName: "Activate GenAI With Azure", testingStatus: "Completed", releaseNotes: "Release Notes" },
  { sr: 2, trackName: "Automate Document Processing using Azure OpenAI", testingStatus: "Completed", releaseNotes: "Release Notes" },
  { sr: 3, trackName: "Azure API Management", testingStatus: "Completed", releaseNotes: "Release Notes" },
  { sr: 4, trackName: "Build Intelligent Apps With Microsoft's Copilot Stack & Azure OpenAI", testingStatus: "Completed", releaseNotes: "Release Notes" },
  { sr: 5, trackName: "Build Prompt Engineering With Azure OpenAI Service", testingStatus: "Completed", releaseNotes: "Release Notes" },
  { sr: 6, trackName: "Business Automation with Azure OpenAI and Document Intelligence", testingStatus: "Completed", releaseNotes: "Release Notes" },
  { sr: 7, trackName: "Cloud Native Applications", testingStatus: "Completed", releaseNotes: "Release Notes" },
  { sr: 8, trackName: "Cloud Scale Analytics With Microsoft Fabric", testingStatus: "Completed", releaseNotes: "Release Notes" },
  { sr: 9, trackName: "Create And Publish PowerBI Dashboards & Reports", testingStatus: "Completed", releaseNotes: "Release Notes" },
  { sr: 10, trackName: "Develop Generative AI Solutions With Azure OpenAI Service", testingStatus: "In-progress", releaseNotes: "Release Notes" },
  { sr: 11, trackName: "Developing AI Applications with Azure AI Foundry", testingStatus: "Completed", releaseNotes: "Release Notes" },
  { sr: 12, trackName: "DevOps With GitHub", testingStatus: "Completed", releaseNotes: "Release Notes" },
  { sr: 13, trackName: "Fabric – Analyst In a Day", testingStatus: "In-progress", releaseNotes: "Release Notes" },
  { sr: 14, trackName: "Get Started With OpenAI And Build Natural Language Solution", testingStatus: "Completed", releaseNotes: "Release Notes" },
  { sr: 15, trackName: "GitHub Copilot – Hackathon", testingStatus: "Completed", releaseNotes: "Release Notes" },
  { sr: 16, trackName: "GitHub Copilot Innovation Workshop", testingStatus: "Completed", releaseNotes: "Release Notes" },
  { sr: 17, trackName: "Implement CI/CD with GitHub Actions", testingStatus: "In-progress", releaseNotes: "Release Notes" },
  { sr: 18, trackName: "Innovate With AI", testingStatus: "Completed", releaseNotes: "Release Notes" },
  { sr: 19, trackName: "Intelligent App Development With Microsoft Copilot Stack", testingStatus: "Completed", releaseNotes: "Release Notes" },
  { sr: 20, trackName: "Introduction To Building AI Apps", testingStatus: "Completed", releaseNotes: "Release Notes" },
  { sr: 21, trackName: "Low-Code for Pro-Dev in a Day", testingStatus: "Completed", releaseNotes: "Release Notes" },
  { sr: 22, trackName: "Microsoft Azure AI Agents: Hands-on Lab", testingStatus: "Completed", releaseNotes: "Release Notes" },
  { sr: 23, trackName: "MS Fabric Foundation For Enterprise Analytics", testingStatus: "In-progress", releaseNotes: "Release Notes" },
  { sr: 24, trackName: "Securing Repositories with GitHub Advanced Security", testingStatus: "Completed", releaseNotes: "Release Notes" },
  { sr: 25, trackName: "Use Azure OpenAI Like A Pro To Build Powerful AI Applications", testingStatus: "Completed", releaseNotes: "Release Notes" }
]

const getStatusBadge = (status: string) => {
  if (status === "Completed") {
    return <Badge variant="default" className="bg-green-500 hover:bg-green-600">Completed</Badge>
  } else if (status === "In-progress") {
    return <Badge variant="secondary" className="bg-yellow-500 hover:bg-yellow-600 text-white">In-progress</Badge>
  }
  return <Badge variant="outline">{status}</Badge>
}

export default function Reports() {
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 10
  const totalPages = Math.ceil(tracksData.length / itemsPerPage)
  
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const currentData = tracksData.slice(startIndex, endIndex)
  
  const goToPage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)))
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Top 25 Tracks</h1>
          <p className="text-muted-foreground">
            As of 1st August 2025 - Look for tag titled "Trending" for these in the Request Management Portal – CloudEvents Admin Center
          </p>
        </div>

        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Top 25 Tracks Report
            </CardTitle>
            <CardDescription>
              Trending tracks from the Request Management Portal with testing status and release information
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Scrollable Table Container */}
              <ScrollArea className="h-[600px] w-full rounded-md border">
                <Table>
                  <TableHeader className="sticky top-0 bg-background z-10">
                    <TableRow>
                      <TableHead className="w-16">Sr.</TableHead>
                      <TableHead className="min-w-[300px]">Track Name</TableHead>
                      <TableHead className="w-32">Testing Status</TableHead>
                      <TableHead className="w-32">Release Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {currentData.map((track) => (
                      <TableRow key={track.sr}>
                        <TableCell className="font-medium">{track.sr}</TableCell>
                        <TableCell className="font-medium">{track.trackName}</TableCell>
                        <TableCell>{getStatusBadge(track.testingStatus)}</TableCell>
                        <TableCell>
                          <button className="text-primary hover:text-primary/80 underline flex items-center gap-1">
                            <FileText className="h-4 w-4" />
                            {track.releaseNotes}
                          </button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
              
              {/* Pagination Controls */}
              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                  Showing {startIndex + 1} to {Math.min(endIndex, tracksData.length)} of {tracksData.length} entries
                </div>
                <div className="flex items-center space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => goToPage(currentPage - 1)}
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </Button>
                  
                  <div className="flex items-center space-x-1">
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                      <Button
                        key={page}
                        variant={currentPage === page ? "default" : "outline"}
                        size="sm"
                        onClick={() => goToPage(page)}
                        className="w-8 h-8 p-0"
                      >
                        {page}
                      </Button>
                    ))}
                  </div>
                  
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => goToPage(currentPage + 1)}
                    disabled={currentPage === totalPages}
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  )
}