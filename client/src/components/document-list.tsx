import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FileText, Eye, Download, Trash2, ClipboardList, ThumbsUp, ThumbsDown, Loader2, AlertTriangle, CheckCircle2, ChevronDown, User } from "lucide-react";
import type { Document, AlertReview } from "@shared/schema";
import { formatDistance, format } from "date-fns";
import { useLocation } from "wouter";

interface AlertReviewWithUser extends AlertReview {
  reviewer: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
  } | null;
}

interface DocumentListProps {
  documents: Document[];
  onView?: (doc: Document) => void;
  onDownload?: (doc: Document) => void;
  onDelete?: (doc: Document) => void;
}

function ReviewEntryExpandable({ review, documentId }: { review: AlertReviewWithUser; documentId: string }) {
  const [expanded, setExpanded] = useState(false);
  const [, setLocation] = useLocation();

  const isApproved = review.decision === "approved";

  const colorClass = isApproved
    ? "text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/50 border-green-200 dark:border-green-800"
    : "text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/50 border-red-200 dark:border-red-800";

  const reviewerName = review.reviewer
    ? `${review.reviewer.firstName || ""} ${review.reviewer.lastName || ""}`.trim() || review.reviewer.email || "Unknown"
    : "Unknown reviewer";

  return (
    <div 
      className={`rounded-md border ${colorClass} overflow-visible`}
      data-testid={`review-log-entry-${review.id}`}
    >
      <div 
        className="flex items-center gap-2 p-3 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        {isApproved ? (
          <CheckCircle2 className="h-4 w-4 shrink-0" />
        ) : (
          <AlertTriangle className="h-4 w-4 shrink-0" />
        )}
        <span className="text-sm font-medium flex-1 truncate">
          {review.alertTitle || "Alert Review"}
        </span>
        {isApproved ? (
          <Badge variant="default" className="text-xs">
            Approved
          </Badge>
        ) : (
          <Badge variant="destructive" className="text-xs">
            Disapproved
          </Badge>
        )}
        {review.alertSeverity && (
          <Badge variant="outline" className="text-xs">
            {review.alertSeverity}
          </Badge>
        )}
        {review.pageNumber && (
          <Badge variant="outline" className="text-xs">
            Page {review.pageNumber}
          </Badge>
        )}
        <ChevronDown className={`h-4 w-4 shrink-0 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`} />
      </div>

      {expanded && (
        <div className="px-3 pb-3 space-y-3 border-t border-inherit">
          <div className="pt-3">
            <p className="text-xs font-medium opacity-90">
              {isApproved ? "Approval" : "Disapproval"} Comment:
            </p>
            <p className="text-xs italic opacity-80 mt-1">"{review.comment}"</p>
          </div>

          {review.alertCategory && (
            <div className="text-xs opacity-70">
              Category: <span className="font-medium">{review.alertCategory}</span>
            </div>
          )}

          <Separator className="opacity-30" />

          <div className="flex items-center justify-between gap-2 text-xs opacity-70 flex-wrap">
            <span className="flex items-center gap-1">
              <User className="h-3 w-3" />
              {reviewerName}
              {review.reviewer?.id && (
                <span className="opacity-60">({review.reviewer.id})</span>
              )}
            </span>
            <span>{format(new Date(review.createdAt), "MMM d, yyyy h:mm a")}</span>
          </div>

          {review.pageNumber && (
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                setLocation(`/documents/${documentId}?page=${review.pageNumber}`);
              }}
              data-testid={`button-review-view-page-${review.id}`}
            >
              <Eye className="h-3 w-3 mr-1" />
              View Page {review.pageNumber}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function ReviewLogDialog({ documentId, documentName }: { documentId: string; documentName: string }) {
  const [open, setOpen] = useState(false);

  const { data: reviews = [], isLoading } = useQuery<AlertReviewWithUser[]>({
    queryKey: ["/api/documents", documentId, "alert-reviews"],
    enabled: open,
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          data-testid={`button-review-log-${documentId}`}
        >
          <ClipboardList className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle data-testid="text-review-log-title">Alert Review Log</DialogTitle>
          <DialogDescription>{documentName}</DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center h-24">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : reviews.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            <ClipboardList className="h-8 w-8 mx-auto mb-2" />
            <p className="text-sm">No alert reviews yet</p>
          </div>
        ) : (
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-2 pr-3">
              {reviews.map((review) => (
                <ReviewEntryExpandable 
                  key={review.id} 
                  review={review} 
                  documentId={documentId}
                />
              ))}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function DocumentList({ documents, onView, onDownload, onDelete }: DocumentListProps) {
  const getStatusVariant = (status: string) => {
    switch (status) {
      case "completed":
        return "default";
      case "processing":
        return "default";
      case "failed":
        return "destructive";
      default:
        return "secondary";
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (documents.length === 0) {
    return (
      <Card className="p-12">
        <div className="text-center text-muted-foreground">
          <FileText className="h-12 w-12 mx-auto mb-4" />
          <p>No documents uploaded yet</p>
          <p className="text-sm mt-2">Upload your first batch record to get started</p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {documents.map((doc) => (
        <Card key={doc.id} className="p-4 hover-elevate" data-testid={`card-document-${doc.id}`}>
          <div className="flex items-center gap-4">
            <FileText className="h-8 w-8 text-primary flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-medium truncate" data-testid="text-document-name">
                  {doc.filename}
                </h3>
                <Badge variant={getStatusVariant(doc.status)} data-testid={`badge-status-${doc.status}`}>
                  {doc.status}
                </Badge>
              </div>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span>{formatFileSize(doc.fileSize)}</span>
                {doc.totalPages && <span>{doc.totalPages} pages</span>}
                <span>
                  {formatDistance(new Date(doc.uploadedAt), new Date(), { addSuffix: true })}
                </span>
              </div>
              {doc.status === "processing" && doc.totalPages && (
                <div className="mt-2 text-sm">
                  <span className="text-muted-foreground">
                    Progress: {doc.processedPages}/{doc.totalPages} pages
                  </span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {doc.status === "completed" && (
                <>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => onView?.(doc)}
                    data-testid="button-view"
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                  <ReviewLogDialog documentId={doc.id} documentName={doc.filename} />
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => onDownload?.(doc)}
                    data-testid="button-download"
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                </>
              )}
              <Button
                size="icon"
                variant="ghost"
                onClick={() => onDelete?.(doc)}
                data-testid="button-delete"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
