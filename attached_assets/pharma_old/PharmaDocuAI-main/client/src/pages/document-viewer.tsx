import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { DocumentStats } from "@/components/document-stats";
import { PageGrid } from "@/components/page-grid";
import { PageDetailPanel } from "@/components/page-detail-panel";
import { QualityAlert } from "@/components/quality-alert";
import { ValidationAlerts } from "@/components/validation-alerts";
import { ArrowLeft, Download } from "lucide-react";
import type { Document, Page, QualityIssue, DocumentSummary } from "@shared/schema";

export default function DocumentViewer() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const documentId = params.id as string;
  const [selectedPage, setSelectedPage] = useState<Page | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const { data: summary, isLoading } = useQuery<DocumentSummary>({
    queryKey: ["/api/documents", documentId, "summary"],
  });

  const { data: pages = [] } = useQuery<Page[]>({
    queryKey: ["/api/documents", documentId, "pages"],
  });

  const { data: issues = [] } = useQuery<QualityIssue[]>({
    queryKey: ["/api/documents", documentId, "issues"],
  });

  const handlePageClick = (page: Page) => {
    setSelectedPage(page);
    setDetailOpen(true);
  };

  const handleExport = async () => {
    const response = await fetch(`/api/documents/${documentId}/export`);
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${summary?.document.filename || "document"}-export.json`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Loading document...</p>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Document not found</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation("/documents")}
            data-testid="button-back"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-semibold" data-testid="text-document-title">
              {summary.document.filename}
            </h1>
            <p className="text-sm text-muted-foreground">
              {summary.pageCount} pages • {summary.issueCount} issues
            </p>
          </div>
        </div>
        <Button onClick={handleExport} data-testid="button-export">
          <Download className="h-4 w-4 mr-2" />
          Export Results
        </Button>
      </div>

      <DocumentStats
        totalPages={summary.pageCount}
        classifiedPages={pages.length}
        issueCount={summary.issueCount}
        avgConfidence={summary.avgConfidence}
      />

      {/* Validation Alerts Section */}
      <ValidationAlerts 
        documentId={documentId}
        onPageClick={(pageNumber) => {
          const page = pages.find(p => p.pageNumber === pageNumber);
          if (page) {
            handlePageClick(page);
          }
        }}
      />

      {issues.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-medium">Quality Control Issues</h2>
          <div className="space-y-3">
            {issues.map((issue) => (
              <QualityAlert
                key={issue.id}
                type={issue.issueType as any}
                description={issue.description}
                pageNumbers={issue.pageNumbers as number[]}
              />
            ))}
          </div>
        </div>
      )}

      <div>
        <h2 className="text-lg font-medium mb-4">Page Classifications</h2>
        <PageGrid
          pages={pages}
          onPageClick={handlePageClick}
          selectedPageId={selectedPage?.id}
        />
      </div>

      <PageDetailPanel
        page={selectedPage}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
    </div>
  );
}
