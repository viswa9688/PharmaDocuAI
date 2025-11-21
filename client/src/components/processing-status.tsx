import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, AlertCircle, Loader2, Clock } from "lucide-react";
import type { ProcessingStatus as ProcessingStatusType } from "@shared/schema";

interface ProcessingStatusProps {
  status: ProcessingStatusType;
}

export function ProcessingStatus({ status }: ProcessingStatusProps) {
  const getStatusIcon = () => {
    switch (status.status) {
      case "pending":
        return <Clock className="h-5 w-5" />;
      case "processing":
        return <Loader2 className="h-5 w-5 animate-spin" />;
      case "completed":
        return <CheckCircle className="h-5 w-5" />;
      case "failed":
        return <AlertCircle className="h-5 w-5" />;
    }
  };

  const getStatusVariant = () => {
    switch (status.status) {
      case "pending":
        return "secondary";
      case "processing":
        return "default";
      case "completed":
        return "default";
      case "failed":
        return "destructive";
      default:
        return "secondary";
    }
  };

  const progress = status.totalPages > 0 
    ? (status.currentPage / status.totalPages) * 100 
    : 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Processing Status</CardTitle>
        <Badge variant={getStatusVariant()} className="gap-1" data-testid={`badge-status-${status.status}`}>
          {getStatusIcon()}
          <span className="capitalize">{status.status}</span>
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        {status.status === "processing" && (
          <>
            <Progress value={progress} className="h-2" data-testid="progress-processing" />
            <p className="text-sm text-muted-foreground" data-testid="text-progress">
              Processing page {status.currentPage} of {status.totalPages}
            </p>
          </>
        )}
        {status.message && (
          <p className="text-sm" data-testid="text-message">
            {status.message}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
