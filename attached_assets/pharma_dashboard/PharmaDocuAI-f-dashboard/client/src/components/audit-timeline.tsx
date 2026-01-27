import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Upload, 
  Image as ImageIcon, 
  FileSearch, 
  Tag, 
  CheckCircle, 
  XCircle,
  ShieldCheck,
  Clock,
  User
} from "lucide-react";
import { formatDistance } from "date-fns";
import type { ProcessingEvent } from "@shared/schema";

interface AuditTimelineProps {
  documentId: string;
}

const eventTypeConfig: Record<string, { 
  icon: typeof Upload; 
  label: string; 
  color: string;
}> = {
  document_upload: { 
    icon: Upload, 
    label: "Document Uploaded", 
    color: "text-blue-500" 
  },
  image_conversion: { 
    icon: ImageIcon, 
    label: "Image Conversion", 
    color: "text-purple-500" 
  },
  document_ai_extraction: { 
    icon: FileSearch, 
    label: "Document AI Extraction", 
    color: "text-amber-500" 
  },
  page_classification: { 
    icon: Tag, 
    label: "Page Classification", 
    color: "text-cyan-500" 
  },
  validation: { 
    icon: ShieldCheck, 
    label: "Validation", 
    color: "text-green-500" 
  },
  signature_analysis: { 
    icon: User, 
    label: "Signature Analysis", 
    color: "text-indigo-500" 
  },
  visual_analysis: { 
    icon: FileSearch, 
    label: "Visual Analysis", 
    color: "text-orange-500" 
  },
  processing_complete: { 
    icon: CheckCircle, 
    label: "Processing Complete", 
    color: "text-green-600" 
  },
  processing_failed: { 
    icon: XCircle, 
    label: "Processing Failed", 
    color: "text-red-500" 
  },
};

export function AuditTimeline({ documentId }: AuditTimelineProps) {
  const { data: events = [], isLoading } = useQuery<ProcessingEvent[]>({
    queryKey: ["/api/documents", documentId, "events"],
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Audit Trail
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-muted-foreground text-sm">Loading audit trail...</div>
        </CardContent>
      </Card>
    );
  }

  if (events.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Audit Trail
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-muted-foreground text-sm">No audit events recorded</div>
        </CardContent>
      </Card>
    );
  }

  const sortedEvents = [...events].sort((a, b) => 
    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Clock className="h-4 w-4" />
          Audit Trail ({events.length} events)
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <ScrollArea className="h-64">
          <div className="space-y-3">
            {sortedEvents.map((event, index) => {
              const config = eventTypeConfig[event.eventType] || {
                icon: Clock,
                label: event.eventType.replace(/_/g, ' '),
                color: "text-muted-foreground"
              };
              const Icon = config.icon;
              
              return (
                <div 
                  key={event.id || index} 
                  className="flex gap-3 items-start"
                  data-testid={`audit-event-${event.eventType}`}
                >
                  <div className={`mt-0.5 ${config.color}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{config.label}</span>
                      <Badge 
                        variant={event.status === "success" ? "default" : event.status === "failed" ? "destructive" : "secondary"}
                        className="text-xs"
                      >
                        {event.status}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {formatDistance(new Date(event.createdAt), new Date(), { addSuffix: true })}
                    </div>
                    {event.errorMessage && (
                      <div className="text-xs text-destructive mt-1 truncate">
                        {event.errorMessage}
                      </div>
                    )}
                    {event.metadata && Object.keys(event.metadata).length > 0 && (
                      <div className="text-xs text-muted-foreground mt-1">
                        {Object.entries(event.metadata).slice(0, 3).map(([key, value]) => (
                          <span key={key} className="mr-2">
                            {key}: {typeof value === 'object' ? JSON.stringify(value).slice(0, 30) : String(value)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
