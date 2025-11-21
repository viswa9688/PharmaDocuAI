import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { FileText, Loader2 } from "lucide-react";
import type { Document } from "@shared/schema";

export default function Processing() {
  const { data: documents = [] } = useQuery<Document[]>({
    queryKey: ["/api/documents"],
  });

  const processingDocs = documents.filter((doc) => 
    doc.status === "pending" || doc.status === "processing"
  );

  const getStatusVariant = (status: string) => {
    return status === "processing" ? "default" : "secondary";
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold mb-2">Processing Queue</h1>
        <p className="text-muted-foreground">
          Monitor document processing status in real-time
        </p>
      </div>

      {processingDocs.length === 0 ? (
        <Card className="p-12">
          <div className="text-center text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-4" />
            <p>No documents currently processing</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          {processingDocs.map((doc) => (
            <Card key={doc.id} data-testid={`card-processing-${doc.id}`}>
              <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-2">
                <CardTitle className="text-base font-medium truncate">
                  {doc.filename}
                </CardTitle>
                <Badge variant={getStatusVariant(doc.status)} className="gap-1">
                  {doc.status === "processing" && (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  )}
                  <span className="capitalize">{doc.status}</span>
                </Badge>
              </CardHeader>
              <CardContent className="space-y-3">
                {doc.status === "processing" && doc.totalPages && (
                  <>
                    <Progress
                      value={(doc.processedPages! / doc.totalPages) * 100}
                      className="h-2"
                      data-testid="progress-document"
                    />
                    <p className="text-sm text-muted-foreground" data-testid="text-progress">
                      Processing page {doc.processedPages} of {doc.totalPages}
                    </p>
                  </>
                )}
                {doc.errorMessage && (
                  <p className="text-sm text-destructive" data-testid="text-error">
                    {doc.errorMessage}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
