import { useState, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DocumentStats } from "@/components/document-stats";
import { PageGrid } from "@/components/page-grid";
import { PageDetailPanel } from "@/components/page-detail-panel";
import { QualityAlert } from "@/components/quality-alert";
import { ValidationAlerts } from "@/components/validation-alerts";
import { ValidationSummary, ValidationSummaryLoading, ValidationOverview, ValidationCategories } from "@/components/validation-summary";
import { ArrowLeft, Download, ChevronDown, ChevronUp } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { Document, Page, QualityIssue, DocumentSummary } from "@shared/schema";

type DocumentValidationSummary = {
  overview: ValidationOverview;
  categories: ValidationCategories;
};

// Map category keys from ValidationSummary to ValidationAlerts tab values
const categoryToTabMap: Record<string, string> = {
  signatures: "all",
  dataIntegrity: "integrity",
  calculations: "calculations",
  dates: "all", // sequence_error category doesn't have dedicated tab
  batchNumbers: "missing", // batch issues are typically missing_value alerts
  pageCompleteness: "missing", // page completeness issues appear as missing_value
};

export default function DocumentViewer() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const documentId = params.id as string;
  const [selectedPage, setSelectedPage] = useState<Page | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const [activeValidationTab, setActiveValidationTab] = useState("all");
  
  const validationAlertsRef = useRef<HTMLDivElement>(null);
  const pageGridRef = useRef<HTMLDivElement>(null);

  const { data: summary, isLoading } = useQuery<DocumentSummary>({
    queryKey: ["/api/documents", documentId, "summary"],
  });

  const { data: validationSummary, isLoading: validationLoading } = useQuery<DocumentValidationSummary>({
    queryKey: ["/api/documents", documentId, "validation-summary"],
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

  const handleCategoryClick = (category: string) => {
    // Map the category to the corresponding tab
    const targetTab = categoryToTabMap[category] || "all";
    setActiveValidationTab(targetTab);
    setDetailsExpanded(true);
    setTimeout(() => {
      if (validationAlertsRef.current) {
        validationAlertsRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 100);
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
      <div className="flex items-center justify-between gap-4 flex-wrap">
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

      {/* Validation Summary Dashboard */}
      {validationLoading ? (
        <ValidationSummaryLoading />
      ) : validationSummary ? (
        <ValidationSummary
          overview={validationSummary.overview}
          categories={validationSummary.categories}
          title="Document Validation"
          subtitle={`${validationSummary.overview.totalPages} pages validated`}
          onCategoryClick={handleCategoryClick}
          compact
        />
      ) : null}

      {/* Collapsible Detailed View */}
      <Collapsible open={detailsExpanded} onOpenChange={setDetailsExpanded}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover-elevate">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Detailed Validation Results</CardTitle>
                {detailsExpanded ? (
                  <ChevronUp className="h-5 w-5 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-6 pt-0">
              {/* Document Statistics */}
              <DocumentStats
                totalPages={summary.pageCount}
                classifiedPages={pages.length}
                issueCount={summary.issueCount}
                avgConfidence={summary.avgConfidence}
              />

              {/* Validation Alerts Section */}
              <div ref={validationAlertsRef}>
                <ValidationAlerts 
                  documentId={documentId}
                  activeTab={activeValidationTab}
                  onTabChange={setActiveValidationTab}
                  onPageClick={(pageNumber) => {
                    const page = pages.find(p => p.pageNumber === pageNumber);
                    if (page) {
                      handlePageClick(page);
                    }
                  }}
                />
              </div>

              {issues.length > 0 && (
                <div className="space-y-4">
                  <h3 className="text-lg font-medium">Quality Control Issues</h3>
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

              <div ref={pageGridRef}>
                <h3 className="text-lg font-medium mb-4">Page Classifications</h3>
                <PageGrid
                  pages={pages}
                  onPageClick={handlePageClick}
                  selectedPageId={selectedPage?.id}
                />
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      <PageDetailPanel
        page={selectedPage}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
    </div>
  );
}
