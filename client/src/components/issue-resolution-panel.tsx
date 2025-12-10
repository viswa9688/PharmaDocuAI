import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { 
  CheckCircle2, 
  XCircle, 
  Clock, 
  AlertTriangle, 
  AlertCircle, 
  FileWarning,
  MessageSquare,
  User,
  Calendar,
  History,
  Image,
  Eye,
  Maximize2,
  RefreshCw
} from "lucide-react";
import { format } from "date-fns";
import type { QualityIssue, IssueResolution, IssueLocation } from "@shared/schema";
import { FullScreenImageDialog, ImageWithOverlays, type HighlightOverlay } from "./fullscreen-image-dialog";

type IssueWithResolutions = {
  issue: QualityIssue;
  resolutions: IssueResolution[];
};

type PageMapEntry = {
  id: string;
  pageNumber: number;
};

type DocumentIssuesResponse = {
  documentId: string;
  filename: string;
  issues: IssueWithResolutions[];
  counts: {
    total: number;
    pending: number;
    approved: number;
    rejected: number;
  };
  pageMap: Record<string, PageMapEntry>;
};

function getStatusBadge(status: string) {
  switch (status) {
    case "approved":
      return (
        <Badge variant="default" className="bg-green-600 hover:bg-green-700">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          Approved
        </Badge>
      );
    case "rejected":
      return (
        <Badge variant="destructive">
          <XCircle className="h-3 w-3 mr-1" />
          Rejected
        </Badge>
      );
    default:
      return (
        <Badge variant="secondary">
          <Clock className="h-3 w-3 mr-1" />
          Pending
        </Badge>
      );
  }
}

function getSeverityIcon(severity: string) {
  switch (severity) {
    case "high":
      return <AlertCircle className="h-4 w-4 text-red-500" />;
    case "medium":
      return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
    default:
      return <FileWarning className="h-4 w-4 text-blue-500" />;
  }
}

function ResolutionForm({ 
  issue, 
  onClose 
}: { 
  issue: QualityIssue; 
  onClose: () => void;
}) {
  const [status, setStatus] = useState<string>("");
  const [comment, setComment] = useState("");
  const { toast } = useToast();

  const resolveMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/issues/${issue.id}/resolve`, {
        status,
        comment,
      });
    },
    onSuccess: () => {
      toast({
        title: status === "approved" ? "Issue Approved" : "Issue Rejected",
        description: "Resolution has been recorded in the audit trail.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/documents", issue.documentId, "issues"] });
      queryClient.invalidateQueries({ queryKey: ["/api/events/recent"] });
      onClose();
    },
    onError: (error: any) => {
      toast({
        title: "Resolution Failed",
        description: error.message || "Failed to resolve issue",
        variant: "destructive",
      });
    },
  });

  const canSubmit = status && comment.trim().length > 0;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="resolution-status">Resolution Decision</Label>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger id="resolution-status" data-testid="select-resolution-status">
            <SelectValue placeholder="Select a decision..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="approved">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                Approve - Issue is acceptable
              </div>
            </SelectItem>
            <SelectItem value="rejected">
              <div className="flex items-center gap-2">
                <XCircle className="h-4 w-4 text-red-500" />
                Reject - Issue needs correction
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="resolution-comment">
          Comment <span className="text-red-500">*</span>
        </Label>
        <Textarea
          id="resolution-comment"
          placeholder="Provide a detailed explanation for your decision (required)..."
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          className="min-h-[100px]"
          data-testid="input-resolution-comment"
        />
        <p className="text-xs text-muted-foreground">
          Comment is mandatory for audit trail compliance
        </p>
      </div>

      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={onClose} data-testid="button-cancel-resolution">
          Cancel
        </Button>
        <Button
          onClick={() => resolveMutation.mutate()}
          disabled={!canSubmit || resolveMutation.isPending}
          data-testid="button-submit-resolution"
        >
          {resolveMutation.isPending ? "Submitting..." : "Submit Resolution"}
        </Button>
      </div>
    </div>
  );
}

function ResolutionTimeline({ resolutions }: { resolutions: IssueResolution[] }) {
  if (resolutions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground italic">No resolution history yet</p>
    );
  }

  return (
    <div className="space-y-3">
      {resolutions.map((resolution, idx) => (
        <div key={resolution.id} className="flex gap-3">
          <div className="flex flex-col items-center">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
              resolution.status === "approved" 
                ? "bg-green-100 text-green-600" 
                : "bg-red-100 text-red-600"
            }`}>
              {resolution.status === "approved" 
                ? <CheckCircle2 className="h-4 w-4" />
                : <XCircle className="h-4 w-4" />
              }
            </div>
            {idx < resolutions.length - 1 && (
              <div className="w-px h-full bg-border flex-1 mt-1" />
            )}
          </div>
          <div className="flex-1 pb-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant={resolution.status === "approved" ? "default" : "destructive"} className={resolution.status === "approved" ? "bg-green-600" : ""}>
                {resolution.status === "approved" ? "Approved" : "Rejected"}
              </Badge>
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <User className="h-3 w-3" />
                {resolution.resolverId}
              </span>
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {format(new Date(resolution.createdAt), "MMM d, yyyy h:mm a")}
              </span>
            </div>
            <div className="mt-2 bg-muted p-2 rounded-md">
              <div className="flex items-start gap-2">
                <MessageSquare className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                <p className="text-sm">{resolution.comment}</p>
              </div>
            </div>
            {resolution.previousStatus && (
              <p className="text-xs text-muted-foreground mt-1">
                Changed from: {resolution.previousStatus}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function IssueCard({ issueData, pageMap }: { issueData: IssueWithResolutions; pageMap: Record<string, PageMapEntry> }) {
  const [resolveOpen, setResolveOpen] = useState(false);
  const [imageOpen, setImageOpen] = useState(false);
  const [fullscreenOpen, setFullscreenOpen] = useState(false);
  const [unavailableOpen, setUnavailableOpen] = useState(false);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [selectedPageNumber, setSelectedPageNumber] = useState<number | null>(null);
  const { issue, resolutions } = issueData;

  // Reset state when dialogs close
  const handleImageDialogChange = (open: boolean) => {
    setImageOpen(open);
    if (!open) {
      // Reset selection when dialog closes to prevent stale overlays
      setSelectedPageId(null);
      setSelectedPageNumber(null);
    }
  };

  const handleFullscreenDialogChange = (open: boolean) => {
    setFullscreenOpen(open);
    if (!open) {
      // Reset selection when fullscreen closes
      setSelectedPageId(null);
      setSelectedPageNumber(null);
    }
  };

  const handleOpenFullscreen = () => {
    // Close preview without resetting state (we want to keep the same page selected for fullscreen)
    setImageOpen(false);
    setFullscreenOpen(true);
  };

  const pageNumbers = (issue.pageNumbers as number[]) || [];
  const hasPages = pageNumbers.length > 0;
  
  // Get highlight overlays for the selected page (recomputes when selectedPageNumber changes)
  const locations = (issue.locations as IssueLocation[]) || [];
  const overlaysForSelectedPage: HighlightOverlay[] = selectedPageNumber
    ? locations
        .filter(loc => loc.pageNumber === selectedPageNumber)
        .map(loc => ({
          xPct: loc.xPct,
          yPct: loc.yPct,
          widthPct: loc.widthPct,
          heightPct: loc.heightPct,
        }))
    : [];

  const handleViewImage = (pageNumber: number) => {
    const pageInfo = pageMap[String(pageNumber)];
    setSelectedPageNumber(pageNumber);
    if (pageInfo) {
      setSelectedPageId(pageInfo.id);
      setImageOpen(true);
    } else {
      // Fallback to first available page if the referenced page doesn't exist
      const firstAvailablePageKey = Object.keys(pageMap)[0];
      if (firstAvailablePageKey) {
        const fallbackPage = pageMap[firstAvailablePageKey];
        setSelectedPageId(fallbackPage.id);
        setSelectedPageNumber(fallbackPage.pageNumber);
        setImageOpen(true);
      } else {
        setSelectedPageId(null);
        setUnavailableOpen(true);
      }
    }
  };

  return (
    <AccordionItem value={issue.id} className="border rounded-lg px-4">
      <AccordionTrigger className="hover:no-underline py-4">
        <div className="flex items-start gap-3 text-left w-full pr-4">
          {getSeverityIcon(issue.severity)}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium">{issue.issueType}</span>
              {getStatusBadge(issue.resolutionStatus)}
              <Badge variant="outline" className="text-xs">
                {issue.severity}
              </Badge>
              {pageNumbers.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  Pages: {pageNumbers.join(", ")}
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
              {issue.description}
            </p>
          </div>
        </div>
      </AccordionTrigger>
      <AccordionContent className="pb-4">
        <div className="space-y-4">
          <div className="bg-muted/50 p-3 rounded-md">
            <h4 className="text-sm font-medium mb-1">Issue Details</h4>
            <p className="text-sm">{issue.description}</p>
            <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
              <span>Created: {format(new Date(issue.createdAt), "MMM d, yyyy h:mm a")}</span>
              {issue.resolvedAt && (
                <span>Resolved: {format(new Date(issue.resolvedAt), "MMM d, yyyy h:mm a")}</span>
              )}
            </div>
          </div>

          {issue.resolutionComment && (
            <div className="bg-muted/50 p-3 rounded-md">
              <h4 className="text-sm font-medium mb-1 flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Latest Resolution Comment
              </h4>
              <p className="text-sm">{issue.resolutionComment}</p>
            </div>
          )}

          <div className="flex items-center gap-2 flex-wrap">
            <Dialog open={resolveOpen} onOpenChange={setResolveOpen}>
              <DialogTrigger asChild>
                <Button data-testid={`button-resolve-issue-${issue.id}`}>
                  {issue.resolutionStatus === "pending" ? "Resolve Issue" : "Update Resolution"}
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Resolve Issue</DialogTitle>
                  <DialogDescription>
                    Approve or reject this issue with a mandatory comment for the audit trail.
                  </DialogDescription>
                </DialogHeader>
                <ResolutionForm issue={issue} onClose={() => setResolveOpen(false)} />
              </DialogContent>
            </Dialog>

            {hasPages && (
              <Button
                variant="outline"
                onClick={() => handleViewImage(pageNumbers[0])}
                data-testid={`button-see-image-${issue.id}`}
              >
                <Eye className="h-4 w-4 mr-1" />
                See Image
              </Button>
            )}

            {resolutions.length > 0 && (
              <Badge variant="outline" className="text-xs ml-auto">
                <History className="h-3 w-3 mr-1" />
                {resolutions.length} resolution{resolutions.length !== 1 ? "s" : ""}
              </Badge>
            )}
          </div>

          {resolutions.length > 0 && (
            <>
              <Separator />
              <div>
                <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                  <History className="h-4 w-4" />
                  Resolution History
                </h4>
                <ResolutionTimeline resolutions={resolutions} />
              </div>
            </>
          )}
        </div>
      </AccordionContent>

      <Dialog open={imageOpen} onOpenChange={handleImageDialogChange}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2">
                <Image className="h-5 w-5" />
                Page {selectedPageNumber} - {issue.issueType}
              </DialogTitle>
              <Button
                variant="outline"
                size="icon"
                onClick={handleOpenFullscreen}
                data-testid={`button-fullscreen-${issue.id}`}
              >
                <Maximize2 className="h-4 w-4" />
              </Button>
            </div>
            <DialogDescription>
              Scanned page image where this issue was detected
              {overlaysForSelectedPage.length > 0 && (
                <span className="text-red-600 ml-2">(issue area highlighted in red)</span>
              )}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[70vh]">
            {selectedPageId && (
              <ImageWithOverlays
                src={`/api/pages/${selectedPageId}/image`}
                alt={`Page ${selectedPageNumber}`}
                overlays={overlaysForSelectedPage}
                className="rounded-md border"
                testIdPrefix={`issue-page-${issue.id}`}
              />
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {selectedPageId && (
        <FullScreenImageDialog
          src={`/api/pages/${selectedPageId}/image`}
          alt={`Page ${selectedPageNumber}`}
          title={`Page ${selectedPageNumber} - ${issue.issueType}`}
          open={fullscreenOpen}
          onOpenChange={handleFullscreenDialogChange}
          testIdPrefix={`issue-${issue.id}`}
          overlays={overlaysForSelectedPage}
        />
      )}

      <Dialog open={unavailableOpen} onOpenChange={setUnavailableOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Page Image Not Available
            </DialogTitle>
            <DialogDescription>
              The image for page {selectedPageNumber} is not available. This may occur when:
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>• The page was not processed during document upload</p>
            <p>• The PDF-to-image conversion failed for this page</p>
            <p>• The page number referenced by this issue doesn't exist in the document</p>
          </div>
          <div className="flex justify-end mt-4">
            <Button 
              variant="outline" 
              onClick={() => setUnavailableOpen(false)}
              data-testid={`button-close-unavailable-${issue.id}`}
            >
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AccordionItem>
  );
}

export function IssueResolutionPanel({ documentId }: { documentId: string }) {
  const { toast } = useToast();
  const { data, isLoading, refetch } = useQuery<DocumentIssuesResponse>({
    queryKey: ["/api/documents", documentId, "issues"],
  });

  const regenerateMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/documents/${documentId}/issues/regenerate`);
      return response.json();
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents", documentId, "issues"] });
      toast({
        title: "Issues Refreshed",
        description: `Regenerated ${result.regeneratedCount} issues with updated location data.`,
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Refresh Failed",
        description: error.message || "Failed to regenerate issues",
      });
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Issues & Resolutions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Loading issues...</p>
        </CardContent>
      </Card>
    );
  }

  if (!data || !data.issues || !data.counts || data.issues.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Issues & Resolutions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <CheckCircle2 className="h-12 w-12 mx-auto text-green-500 mb-3" />
            <p className="text-lg font-medium">No Issues Found</p>
            <p className="text-sm text-muted-foreground">
              This document has no quality issues to review
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Issues & Resolutions
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => regenerateMutation.mutate()}
              disabled={regenerateMutation.isPending}
              data-testid="button-refresh-issues"
              title="Refresh issues to update location highlighting data"
            >
              <RefreshCw className={`h-4 w-4 mr-1 ${regenerateMutation.isPending ? 'animate-spin' : ''}`} />
              {regenerateMutation.isPending ? 'Refreshing...' : 'Refresh'}
            </Button>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Badge variant="secondary" data-testid="badge-issues-total">
              Total: {data.counts.total}
            </Badge>
            <Badge variant="secondary" className="bg-yellow-100 text-yellow-800" data-testid="badge-issues-pending">
              <Clock className="h-3 w-3 mr-1" />
              Pending: {data.counts.pending}
            </Badge>
            <Badge className="bg-green-600" data-testid="badge-issues-approved">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Approved: {data.counts.approved}
            </Badge>
            <Badge variant="destructive" data-testid="badge-issues-rejected">
              <XCircle className="h-3 w-3 mr-1" />
              Rejected: {data.counts.rejected}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="max-h-[600px]">
          <Accordion type="multiple" className="space-y-2">
            {data.issues.map((issueData) => (
              <IssueCard key={issueData.issue.id} issueData={issueData} pageMap={data.pageMap || {}} />
            ))}
          </Accordion>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
