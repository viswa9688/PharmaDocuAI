import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, Eye, Download, Trash2, User } from "lucide-react";
import type { Document } from "@shared/schema";
import { formatDistance } from "date-fns";

interface DocumentWithUploader extends Document {
  uploaderName?: string | null;
}

interface DocumentListProps {
  documents: DocumentWithUploader[];
  onView?: (doc: DocumentWithUploader) => void;
  onDownload?: (doc: DocumentWithUploader) => void;
  onDelete?: (doc: DocumentWithUploader) => void;
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
              <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                <span>{formatFileSize(doc.fileSize)}</span>
                {doc.totalPages && <span>{doc.totalPages} pages</span>}
                <span>
                  {formatDistance(new Date(doc.uploadedAt), new Date(), { addSuffix: true })}
                </span>
                {doc.uploaderName && (
                  <span className="flex items-center gap-1" data-testid="text-uploader">
                    <User className="h-3 w-3" />
                    {doc.uploaderName}
                  </span>
                )}
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
