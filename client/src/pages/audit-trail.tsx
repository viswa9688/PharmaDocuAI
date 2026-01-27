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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
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
  FileCheck,
  Shield,
  ThumbsUp,
  ThumbsDown,
} from "lucide-react";
import { formatDistance, format } from "date-fns";
import type { ProcessingEvent, User } from "@shared/schema";

type EventWithUser = ProcessingEvent & { user?: User | null };

function getEventIcon(eventType: string) {
  switch (eventType) {
    case "document_upload":
      return <Upload className="w-4 h-4" />;
    case "document_delete":
      return <Trash2 className="w-4 h-4" />;
    case "document_ai_extraction":
      return <Cpu className="w-4 h-4" />;
    case "page_classification":
      return <FileText className="w-4 h-4" />;
    case "validation":
      return <Shield className="w-4 h-4" />;
    case "processing_complete":
      return <FileCheck className="w-4 h-4" />;
    case "document_approved":
      return <ThumbsUp className="w-4 h-4" />;
    case "document_unapproved":
      return <ThumbsDown className="w-4 h-4" />;
    case "issue_approved":
      return <CheckCircle className="w-4 h-4" />;
    case "issue_rejected":
      return <XCircle className="w-4 h-4" />;
    case "document_viewed":
      return <Eye className="w-4 h-4" />;
    default:
      return <Clock className="w-4 h-4" />;
  }
}

function getStatusBadge(status: string) {
  switch (status) {
    case "success":
      return (
        <Badge className="bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20">
          <CheckCircle className="w-3 h-3 mr-1" />
          Success
        </Badge>
      );
    case "failed":
      return (
        <Badge variant="destructive">
          <XCircle className="w-3 h-3 mr-1" />
          Failed
        </Badge>
      );
    case "pending":
      return (
        <Badge variant="secondary">
          <Clock className="w-3 h-3 mr-1" />
          Pending
        </Badge>
      );
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

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
      const deletedFilename = m.filename || "document";
      return `Deleted document "${deletedFilename}"`;
      
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
      
    case "processing_complete":
      const processedPages = m.pagesProcessed || m.totalPages;
      if (processedPages) {
        return `Successfully processed ${processedPages} page${processedPages !== 1 ? 's' : ''}`;
      }
      return "Document processing completed successfully";
      
    case "processing_failed":
      const errorReason = m.reason || m.error;
      if (errorReason) {
        return `Processing failed: ${errorReason}`;
      }
      return "Document processing failed";
      
    case "document_viewed":
      return "User viewed the document";
      
    case "document_approved":
      return "Approved the document for release";
      
    case "document_unapproved":
      return "Removed approval status from document";
      
    case "issue_approved":
      const issueType = m.issueType || "issue";
      return `Approved ${issueType} issue`;
      
    case "issue_rejected":
      const rejIssueType = m.issueType || "issue";
      return `Rejected ${rejIssueType} issue`;
      
    default:
      return `${eventType.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())} event occurred`;
  }
}

export default function AuditTrail() {
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const { data: events = [], isLoading } = useQuery<EventWithUser[]>({
    queryKey: ["/api/events/recent"],
    refetchInterval: 30000,
  });

  const filteredEvents = events.filter((event) => {
    const matchesSearch =
      searchQuery === "" ||
      event.eventType.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (event.documentId && event.documentId.includes(searchQuery));

    const matchesStatus = statusFilter === "all" || event.status === statusFilter;
    const matchesType = typeFilter === "all" || event.eventType === typeFilter;

    return matchesSearch && matchesStatus && matchesType;
  });

  const eventTypes = Array.from(new Set(events.map((e) => e.eventType)));
  const successCount = events.filter((e) => e.status === "success").length;
  const failedCount = events.filter((e) => e.status === "failed").length;

  return (
    <div className="space-y-6" data-testid="audit-trail-page">
      <div>
        <h1 className="text-2xl font-semibold mb-2">Audit Trail</h1>
        <p className="text-muted-foreground">
          Complete history of document processing events for compliance tracking
        </p>
      </div>

      <div className="flex flex-wrap gap-4">
        <Card className="flex-1 min-w-[200px]">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Events</CardTitle>
            <History className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="count-total">{events.length}</div>
            <p className="text-xs text-muted-foreground">Recorded actions</p>
          </CardContent>
        </Card>

        <Card className="flex-1 min-w-[200px]">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Successful</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600 dark:text-green-400" data-testid="count-success">
              {successCount}
            </div>
            <p className="text-xs text-muted-foreground">Completed events</p>
          </CardContent>
        </Card>

        <Card className="flex-1 min-w-[200px]">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Failed</CardTitle>
            <XCircle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive" data-testid="count-failed">
              {failedCount}
            </div>
            <p className="text-xs text-muted-foreground">Errors encountered</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search events..."
                className="pl-8"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                data-testid="input-search"
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px]" data-testid="select-status">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="success">Success</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                </SelectContent>
              </Select>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-[180px]" data-testid="select-type">
                  <SelectValue placeholder="Event Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {eventTypes.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : filteredEvents.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No events found matching your filters</p>
            </div>
          ) : (
            <ScrollArea className="h-[500px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]">Type</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEvents.map((event) => (
                    <TableRow key={event.id} data-testid={`row-event-${event.id}`}>
                      <TableCell>
                        <div className="p-2 rounded-lg bg-muted w-fit">
                          {getEventIcon(event.eventType)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">
                            {generateEventDescription(event.eventType, event.metadata, event.status)}
                          </div>
                          {event.errorMessage && (
                            <div className="text-xs text-destructive mt-1">
                              <AlertTriangle className="w-3 h-3 inline mr-1" />
                              {event.errorMessage}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {event.user ? (
                          <div className="text-sm">
                            {[event.user.firstName, event.user.lastName].filter(Boolean).join(" ") ||
                              event.user.email ||
                              "Unknown"}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">System</span>
                        )}
                      </TableCell>
                      <TableCell>{getStatusBadge(event.status)}</TableCell>
                      <TableCell>
                        <div className="text-sm text-muted-foreground">
                          {formatDistance(new Date(event.createdAt), new Date(), {
                            addSuffix: true,
                          })}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {format(new Date(event.createdAt), "MMM d, HH:mm")}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {event.documentId && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setLocation(`/documents/${event.documentId}`)}
                            data-testid={`button-view-${event.id}`}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            View
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
