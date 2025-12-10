import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  History,
  Search,
  Upload,
  Trash2,
  FileText,
  CheckCircle,
  XCircle,
  Clock,
  Eye,
  AlertTriangle,
  Cpu,
  Image,
  FileCheck,
  Shield,
  Signature,
  ThumbsUp,
  ThumbsDown,
  ChevronDown,
  ChevronRight,
  Info,
} from "lucide-react";
import { formatDistance, format } from "date-fns";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { ProcessingEvent, User } from "@shared/schema";

function generateEventDescription(eventType: string, metadata: Record<string, any> | null, status: string): string {
  const m = metadata || {};
  
  switch (eventType) {
    case "document_upload":
      const filename = m.filename || "a document";
      const pageCount = m.totalPages || m.pageCount;
      if (pageCount) {
        return `Uploaded "${filename}" with ${pageCount} page${pageCount !== 1 ? 's' : ''}`;
      }
      return `Uploaded "${filename}"`;
      
    case "document_delete":
      const deletedFilename = m.filename || m.deletedDocumentId?.slice(0, 8) || "document";
      return `Deleted document "${deletedFilename}"`;
      
    case "image_conversion":
      const convertedPages = m.pagesConverted || m.totalPages;
      if (convertedPages) {
        return `Converted ${convertedPages} page${convertedPages !== 1 ? 's' : ''} to images for viewing`;
      }
      return "Converted PDF pages to images";
      
    case "document_ai_extraction":
      if (status === "failed") {
        return "AI extraction failed - document could not be processed";
      }
      const extractedPages = m.pagesProcessed || m.totalPages;
      if (extractedPages) {
        return `AI extracted text and data from ${extractedPages} page${extractedPages !== 1 ? 's' : ''}`;
      }
      return "AI extracted text and structured data from document";
      
    case "page_classification":
      const classifiedPages = m.pagesClassified || m.totalPages;
      const sectionTypes = m.sectionTypes;
      if (sectionTypes && Array.isArray(sectionTypes)) {
        return `Classified ${classifiedPages || 'pages'} into sections: ${sectionTypes.slice(0, 3).join(', ')}${sectionTypes.length > 3 ? '...' : ''}`;
      }
      if (classifiedPages) {
        return `Classified ${classifiedPages} page${classifiedPages !== 1 ? 's' : ''} into document sections`;
      }
      return "Classified pages into document sections";
      
    case "validation":
      const issueCount = m.issuesFound || m.alertCount || m.totalAlerts;
      if (issueCount !== undefined) {
        if (issueCount === 0) {
          return "Validation completed - no issues detected";
        }
        return `Validation found ${issueCount} issue${issueCount !== 1 ? 's' : ''} requiring review`;
      }
      return "Ran validation checks on document";
      
    case "signature_analysis":
      const sigCount = m.signaturesFound || m.signatureCount;
      const missingSigs = m.missingSignatures;
      if (missingSigs) {
        return `Found ${missingSigs} missing signature${missingSigs !== 1 ? 's' : ''} requiring attention`;
      }
      if (sigCount !== undefined) {
        return `Analyzed ${sigCount} signature field${sigCount !== 1 ? 's' : ''}`;
      }
      return "Analyzed signature fields on document";
      
    case "visual_analysis":
      const anomalyCount = m.anomaliesFound || m.anomalyCount;
      if (anomalyCount !== undefined) {
        if (anomalyCount === 0) {
          return "Visual analysis completed - no data integrity issues detected";
        }
        return `Detected ${anomalyCount} visual anomal${anomalyCount !== 1 ? 'ies' : 'y'} (strike-throughs, corrections, etc.)`;
      }
      return "Analyzed document for visual anomalies and corrections";
      
    case "processing_complete":
      const processedPages = m.pagesProcessed || m.totalPages;
      const usedFallback = m.usedFallback;
      let desc = "Document processing completed successfully";
      if (processedPages) {
        desc = `Successfully processed ${processedPages} page${processedPages !== 1 ? 's' : ''}`;
      }
      if (usedFallback) {
        desc += " (used fallback processing)";
      }
      return desc;
      
    case "processing_failed":
      const errorReason = m.reason || m.error;
      if (errorReason) {
        return `Processing failed: ${errorReason}`;
      }
      return "Document processing failed";
      
    case "document_viewed":
      return "User viewed the document";
      
    case "document_approved":
      const approvalComment = m.comment;
      if (approvalComment) {
        return `Approved document with comment: "${approvalComment.slice(0, 50)}${approvalComment.length > 50 ? '...' : ''}"`;
      }
      return "Approved the document for release";
      
    case "document_unapproved":
      return "Removed approval status from document";
      
    case "issue_approved":
      const issueType = m.issueType || "issue";
      const issueDesc = m.issueDescription?.slice(0, 40) || "";
      const approveComment = m.comment;
      let approveMsg = `Approved ${issueType} issue`;
      if (issueDesc) {
        approveMsg += `: "${issueDesc}${m.issueDescription?.length > 40 ? '...' : ''}"`;
      }
      if (approveComment) {
        approveMsg += ` - "${approveComment.slice(0, 30)}${approveComment.length > 30 ? '...' : ''}"`;
      }
      return approveMsg;
      
    case "issue_rejected":
      const rejIssueType = m.issueType || "issue";
      const rejIssueDesc = m.issueDescription?.slice(0, 40) || "";
      const rejectComment = m.comment;
      let rejectMsg = `Rejected ${rejIssueType} issue`;
      if (rejIssueDesc) {
        rejectMsg += `: "${rejIssueDesc}${m.issueDescription?.length > 40 ? '...' : ''}"`;
      }
      if (rejectComment) {
        rejectMsg += ` - "${rejectComment.slice(0, 30)}${rejectComment.length > 30 ? '...' : ''}"`;
      }
      return rejectMsg;
      
    case "alert_acknowledged":
      const alertType = m.alertType || "alert";
      return `Acknowledged ${alertType}`;
      
    default:
      return `${eventType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())} event occurred`;
  }
}

interface EventWithUser extends ProcessingEvent {
  user?: User | null;
}

const eventTypeConfig: Record<string, { label: string; icon: any; color: string }> = {
  document_upload: { label: "Document Upload", icon: Upload, color: "bg-green-500" },
  document_delete: { label: "Document Delete", icon: Trash2, color: "bg-red-500" },
  image_conversion: { label: "Image Conversion", icon: Image, color: "bg-blue-500" },
  document_ai_extraction: { label: "AI Extraction", icon: Cpu, color: "bg-purple-500" },
  page_classification: { label: "Page Classification", icon: FileCheck, color: "bg-indigo-500" },
  validation: { label: "Validation", icon: Shield, color: "bg-amber-500" },
  signature_analysis: { label: "Signature Analysis", icon: Signature, color: "bg-cyan-500" },
  visual_analysis: { label: "Visual Analysis", icon: Eye, color: "bg-pink-500" },
  processing_complete: { label: "Processing Complete", icon: CheckCircle, color: "bg-emerald-500" },
  processing_failed: { label: "Processing Failed", icon: XCircle, color: "bg-red-600" },
  document_viewed: { label: "Document Viewed", icon: Eye, color: "bg-slate-500" },
  alert_acknowledged: { label: "Alert Acknowledged", icon: AlertTriangle, color: "bg-orange-500" },
  document_approved: { label: "Document Approved", icon: ThumbsUp, color: "bg-green-600" },
  document_unapproved: { label: "Document Unapproved", icon: ThumbsDown, color: "bg-yellow-500" },
  issue_approved: { label: "Issue Approved", icon: CheckCircle, color: "bg-teal-500" },
  issue_rejected: { label: "Issue Rejected", icon: XCircle, color: "bg-rose-500" },
};

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" }> = {
  success: { label: "Success", variant: "default" },
  pending: { label: "Pending", variant: "secondary" },
  failed: { label: "Failed", variant: "destructive" },
};

export default function AuditTrail() {
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [eventTypeFilter, setEventTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedEvent, setSelectedEvent] = useState<EventWithUser | null>(null);

  const { data: events = [], isLoading } = useQuery<EventWithUser[]>({
    queryKey: ["/api/events/recent?limit=500"],
    staleTime: 0, // Always fetch fresh data on navigation
    refetchInterval: 10000, // Auto-refresh every 10 seconds
  });

  const filteredEvents = events.filter((event) => {
    const matchesSearch =
      searchQuery === "" ||
      event.eventType.toLowerCase().includes(searchQuery.toLowerCase()) ||
      event.metadata?.filename?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      event.metadata?.deletedDocumentId?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      event.documentId?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesEventType =
      eventTypeFilter === "all" || event.eventType === eventTypeFilter;

    const matchesStatus = statusFilter === "all" || event.status === statusFilter;

    return matchesSearch && matchesEventType && matchesStatus;
  });

  const getEventConfig = (eventType: string) => {
    return eventTypeConfig[eventType] || { label: eventType, icon: FileText, color: "bg-gray-500" };
  };

  const getStatusConfig = (status: string) => {
    return statusConfig[status] || { label: status, variant: "secondary" as const };
  };

  const formatMetadata = (metadata: Record<string, any> | null) => {
    if (!metadata || Object.keys(metadata).length === 0) return null;
    return JSON.stringify(metadata, null, 2);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold mb-2">Audit Trail</h1>
        <p className="text-muted-foreground">
          Complete history of all system operations for compliance and tracking
        </p>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by filename, document ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                data-testid="input-search-audit"
              />
            </div>
            <Select value={eventTypeFilter} onValueChange={setEventTypeFilter}>
              <SelectTrigger className="w-[200px]" data-testid="select-event-type">
                <SelectValue placeholder="Event Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Event Types</SelectItem>
                {Object.entries(eventTypeConfig).map(([key, config]) => (
                  <SelectItem key={key} value={key}>
                    {config.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]" data-testid="select-status">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="success">Success</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground">
              Loading audit events...
            </div>
          ) : filteredEvents.length === 0 ? (
            <div className="text-center py-12">
              <History className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">No audit events found</p>
              <p className="text-sm text-muted-foreground mt-2">
                Events will appear here as documents are processed
              </p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[180px]">Timestamp</TableHead>
                    <TableHead className="w-[180px]">Event Type</TableHead>
                    <TableHead className="w-[100px]">Status</TableHead>
                    <TableHead className="w-[150px]">User</TableHead>
                    <TableHead>Details</TableHead>
                    <TableHead className="w-[80px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEvents.map((event) => {
                    const config = getEventConfig(event.eventType);
                    const statusCfg = getStatusConfig(event.status);
                    const IconComponent = config.icon;

                    return (
                      <TableRow key={event.id} data-testid={`row-event-${event.id}`}>
                        <TableCell className="font-mono text-sm">
                          <div className="flex flex-col">
                            <span>
                              {event.createdAt
                                ? format(new Date(event.createdAt), "MMM d, yyyy")
                                : "N/A"}
                            </span>
                            <span className="text-muted-foreground text-xs">
                              {event.createdAt
                                ? format(new Date(event.createdAt), "HH:mm:ss")
                                : ""}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className={`p-1.5 rounded ${config.color}`}>
                              <IconComponent className="h-3.5 w-3.5 text-white" />
                            </div>
                            <span className="text-sm font-medium">{config.label}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusCfg.variant}>{statusCfg.label}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm text-muted-foreground">
                            {event.user ? (
                              <span>
                                {[event.user.firstName, event.user.lastName]
                                  .filter(Boolean)
                                  .join(" ") || event.user.email || "Unknown"}
                              </span>
                            ) : event.userId ? (
                              <span className="font-mono text-xs">
                                {event.userId.slice(0, 8)}...
                              </span>
                            ) : (
                              <span className="italic">System</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm space-y-1">
                            {event.metadata?.filename && (
                              <button
                                className="font-medium text-left hover:underline text-primary"
                                onClick={() => event.documentId && setLocation(`/documents/${event.documentId}`)}
                                data-testid={`link-document-${event.id}`}
                              >
                                {event.metadata.filename}
                              </button>
                            )}
                            {event.documentId && !event.metadata?.filename && (
                              <button
                                className="font-mono text-xs text-muted-foreground hover:underline"
                                onClick={() => setLocation(`/documents/${event.documentId}`)}
                              >
                                Doc: {event.documentId.slice(0, 8)}...
                              </button>
                            )}
                            {event.metadata?.deletedDocumentId && (
                              <span className="text-muted-foreground">
                                {" "}
                                (Deleted: {event.metadata.deletedDocumentId.slice(0, 8)}...)
                              </span>
                            )}
                            {(event.eventType === "issue_approved" || event.eventType === "issue_rejected") && event.metadata?.issueType && (
                              <div className="flex items-center gap-2 flex-wrap">
                                <Badge variant="outline" className="text-xs">
                                  {event.metadata.issueType}
                                </Badge>
                                {event.metadata?.severity && (
                                  <Badge 
                                    variant="outline" 
                                    className={`text-xs ${
                                      event.metadata.severity === "high" ? "border-red-500 text-red-500" :
                                      event.metadata.severity === "medium" ? "border-yellow-500 text-yellow-500" :
                                      "border-blue-500 text-blue-500"
                                    }`}
                                  >
                                    {event.metadata.severity}
                                  </Badge>
                                )}
                              </div>
                            )}
                            {event.metadata?.comment && (
                              <p className="text-xs text-muted-foreground truncate max-w-[300px]">
                                "{event.metadata.comment}"
                              </p>
                            )}
                            {event.errorMessage && (
                              <span className="text-destructive block truncate max-w-[300px]">
                                {event.errorMessage}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => setSelectedEvent(event)}
                            data-testid={`button-view-event-${event.id}`}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
          <div className="mt-4 text-sm text-muted-foreground">
            Showing {filteredEvents.length} of {events.length} events
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!selectedEvent} onOpenChange={(open) => !open && setSelectedEvent(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedEvent && (
                <>
                  <div className={`p-2 rounded ${getEventConfig(selectedEvent.eventType).color}`}>
                    {(() => {
                      const Icon = getEventConfig(selectedEvent.eventType).icon;
                      return <Icon className="h-4 w-4 text-white" />;
                    })()}
                  </div>
                  <span>{getEventConfig(selectedEvent.eventType).label}</span>
                  <Badge variant={getStatusConfig(selectedEvent.status).variant}>
                    {getStatusConfig(selectedEvent.status).label}
                  </Badge>
                </>
              )}
            </DialogTitle>
          </DialogHeader>
          {selectedEvent && (
            <div className="space-y-4">
              <div className="bg-muted/50 p-4 rounded-lg border">
                <div className="flex items-start gap-3">
                  <Info className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-1">What happened</p>
                    <p className="text-base" data-testid="text-event-description">
                      {generateEventDescription(selectedEvent.eventType, selectedEvent.metadata, selectedEvent.status)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Event ID</label>
                  <p className="font-mono text-sm">{selectedEvent.id}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Timestamp</label>
                  <p className="text-sm">
                    {selectedEvent.createdAt
                      ? format(new Date(selectedEvent.createdAt), "PPpp")
                      : "N/A"}
                  </p>
                </div>
                {selectedEvent.documentId && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Document ID</label>
                    <p className="font-mono text-sm">{selectedEvent.documentId}</p>
                  </div>
                )}
                {selectedEvent.pageId && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Page ID</label>
                    <p className="font-mono text-sm">{selectedEvent.pageId}</p>
                  </div>
                )}
                {(selectedEvent.userId || selectedEvent.user) && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Performed By</label>
                    <p className="text-sm">
                      {selectedEvent.user ? (
                        <>
                          {[selectedEvent.user.firstName, selectedEvent.user.lastName]
                            .filter(Boolean)
                            .join(" ") || selectedEvent.user.email || "Unknown User"}
                          <span className="text-muted-foreground block text-xs font-mono">
                            {selectedEvent.userId}
                          </span>
                        </>
                      ) : (
                        <span className="font-mono text-xs">{selectedEvent.userId}</span>
                      )}
                    </p>
                  </div>
                )}
              </div>

              {selectedEvent.errorMessage && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Error Message</label>
                  <p className="text-sm text-destructive bg-destructive/10 p-3 rounded-md mt-1">
                    {selectedEvent.errorMessage}
                  </p>
                </div>
              )}

              {selectedEvent.metadata && Object.keys(selectedEvent.metadata).length > 0 && (
                <Collapsible>
                  <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors" data-testid="button-toggle-technical-details">
                    <ChevronRight className="h-4 w-4 transition-transform duration-200 [[data-state=open]>&]:rotate-90" />
                    Technical Details
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <ScrollArea className="h-[200px] mt-2">
                      <pre className="text-xs bg-muted p-3 rounded-md overflow-x-auto">
                        {formatMetadata(selectedEvent.metadata)}
                      </pre>
                    </ScrollArea>
                  </CollapsibleContent>
                </Collapsible>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
