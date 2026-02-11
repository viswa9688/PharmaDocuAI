import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { 
  CheckCircle2, 
  XCircle, 
  MinusCircle,
  ClipboardCheck,
  AlertTriangle,
  Calculator,
  FileWarning,
  PenLine,
  Clock,
  ThumbsUp,
  ThumbsDown,
  Eye,
  ChevronDown,
  Loader2,
  User
} from "lucide-react";
import type { QAChecklist, QACheckItem, ValidationAlert, AlertReview } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface AlertReviewWithUser extends AlertReview {
  reviewer: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
  } | null;
}

interface QAChecklistProps {
  documentId: string;
  onCategoryClick?: (category: string, alertCategory: string | null) => void;
  onViewPage?: (pageNumber: number) => void;
}

const categoryIcons: Record<string, typeof Calculator> = {
  discrepancies: AlertTriangle,
  missing: FileWarning,
  calculations: Calculator,
  violations: Clock,
  integrity: PenLine,
};

const categoryLabels: Record<string, string> = {
  discrepancies: "Discrepancies",
  missing: "Missing",
  calculations: "Calculations",
  violations: "Violations",
  integrity: "Integrity",
};

const severityColors: Record<string, string> = {
  critical: "text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/50 border-red-200 dark:border-red-800",
  high: "text-orange-700 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/50 border-orange-200 dark:border-orange-800",
  medium: "text-yellow-700 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-950/50 border-yellow-200 dark:border-yellow-800",
  low: "text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/50 border-blue-200 dark:border-blue-800",
  info: "text-muted-foreground bg-muted/50 border-border",
};

const approvedColors = "text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/50 border-green-200 dark:border-green-800";

const severityBadgeVariant: Record<string, "destructive" | "default" | "secondary" | "outline"> = {
  critical: "destructive",
  high: "destructive",
  medium: "default",
  low: "secondary",
  info: "outline",
};

function StatusIcon({ status }: { status: QACheckItem["status"] }) {
  if (status === "pass") {
    return <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 shrink-0" />;
  }
  if (status === "fail") {
    return <XCircle className="h-5 w-5 text-destructive shrink-0" />;
  }
  return <MinusCircle className="h-5 w-5 text-muted-foreground shrink-0" />;
}

function InferenceCell({ status }: { status: QACheckItem["status"] }) {
  if (status === "pass") {
    return (
      <span className="inline-flex items-center gap-1 text-sm font-semibold text-green-600 dark:text-green-400" data-testid="text-inference-yes">
        <CheckCircle2 className="h-4 w-4" />
        Yes
      </span>
    );
  }
  if (status === "fail") {
    return (
      <span className="inline-flex items-center gap-1 text-sm font-semibold text-destructive" data-testid="text-inference-no">
        <XCircle className="h-4 w-4" />
        No
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground" data-testid="text-inference-na">
      <MinusCircle className="h-4 w-4" />
      N/A
    </span>
  );
}

function AlertRowExpandable({ 
  alert, 
  documentId,
  onViewPage,
  approvalReview,
}: { 
  alert: ValidationAlert; 
  documentId: string;
  onViewPage?: (pageNumber: number) => void;
  approvalReview?: AlertReviewWithUser | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const [comment, setComment] = useState("");
  const [showCommentBox, setShowCommentBox] = useState<"approved" | "disapproved" | null>(null);
  const { toast } = useToast();

  const isApproved = approvalReview?.decision === "approved";
  const colorClass = isApproved ? approvedColors : (severityColors[alert.severity] || severityColors.info);
  const badgeVariant = severityBadgeVariant[alert.severity] || "outline";

  const reviewMutation = useMutation({
    mutationFn: async ({ decision, comment }: { decision: string; comment: string }) => {
      const res = await apiRequest("POST", `/api/documents/${documentId}/alert-reviews`, {
        alertId: alert.id,
        decision,
        comment,
        alertTitle: alert.title,
        alertSeverity: alert.severity,
        alertCategory: alert.category,
        pageNumber: alert.source?.pageNumber || null,
      });
      return res.json();
    },
    onSuccess: (_data, variables) => {
      toast({
        title: variables.decision === "approved" ? "Alert Approved" : "Alert Disapproved",
        description: `Review recorded for "${alert.title}"`,
      });
      setComment("");
      setShowCommentBox(null);
      queryClient.invalidateQueries({ queryKey: ["/api/documents", documentId, "alert-reviews"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to submit review. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSubmitReview = (decision: "approved" | "disapproved") => {
    if (!comment.trim()) {
      toast({
        title: "Comment Required",
        description: "Please provide a comment for your review decision.",
        variant: "destructive",
      });
      return;
    }
    reviewMutation.mutate({ decision, comment: comment.trim() });
  };

  const pageNumber = alert.source?.pageNumber;

  const reviewerName = approvalReview?.reviewer
    ? `${approvalReview.reviewer.firstName || ""} ${approvalReview.reviewer.lastName || ""}`.trim() || approvalReview.reviewer.email || "Unknown"
    : null;

  return (
    <div 
      className={`rounded-md border ${colorClass} overflow-visible`}
      data-testid={`qa-alert-${alert.id}`}
    >
      <div 
        className="flex items-center gap-2 p-3 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
        data-testid={`qa-alert-trigger-${alert.id}`}
      >
        {isApproved ? (
          <CheckCircle2 className="h-4 w-4 shrink-0" />
        ) : (
          <AlertTriangle className="h-4 w-4 shrink-0" />
        )}
        <span className="text-sm font-medium flex-1">
          {alert.title}
          {isApproved && <span className="text-xs ml-2 opacity-70">(Approved)</span>}
        </span>
        {isApproved ? (
          <Badge variant="default" className="text-xs">
            Approved
          </Badge>
        ) : (
          <Badge variant={badgeVariant} className="text-xs">
            {alert.severity}
          </Badge>
        )}
        {pageNumber && (
          <Badge variant="outline" className="text-xs">
            Page {pageNumber}
          </Badge>
        )}
        <ChevronDown className={`h-4 w-4 shrink-0 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`} />
      </div>

      {expanded && (
        <div className="px-3 pb-3 space-y-3 border-t border-inherit">
          <div className="pt-3">
            <p className="text-xs opacity-80">{alert.message}</p>
            {alert.suggestedAction && (
              <p className="text-xs mt-1 italic opacity-70">
                Suggested: {alert.suggestedAction}
              </p>
            )}
          </div>

          {isApproved && approvalReview && (
            <div className="rounded-md border border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/30 p-3 space-y-2">
              <div className="flex items-center gap-2 text-xs text-green-700 dark:text-green-400">
                <ThumbsUp className="h-3 w-3" />
                <span className="font-medium">Approved</span>
              </div>
              <p className="text-xs italic opacity-80">"{approvalReview.comment}"</p>
              <div className="flex items-center justify-between gap-2 text-xs opacity-70 flex-wrap">
                <span className="flex items-center gap-1">
                  <User className="h-3 w-3" />
                  {reviewerName}
                  {approvalReview.reviewer?.id && (
                    <span className="opacity-60">({approvalReview.reviewer.id})</span>
                  )}
                </span>
                <span>{format(new Date(approvalReview.createdAt), "MMM d, yyyy h:mm a")}</span>
              </div>
            </div>
          )}

          {pageNumber && onViewPage && (
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onViewPage(pageNumber);
              }}
              data-testid={`button-view-page-${alert.id}`}
            >
              <Eye className="h-3 w-3 mr-1" />
              View Page {pageNumber}
            </Button>
          )}

          {!isApproved && (
            <>
              <Separator />
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant={showCommentBox === "approved" ? "default" : "outline"}
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowCommentBox(showCommentBox === "approved" ? null : "approved");
                    }}
                    data-testid={`button-approve-alert-${alert.id}`}
                  >
                    <ThumbsUp className="h-3 w-3 mr-1" />
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant={showCommentBox === "disapproved" ? "destructive" : "outline"}
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowCommentBox(showCommentBox === "disapproved" ? null : "disapproved");
                    }}
                    data-testid={`button-disapprove-alert-${alert.id}`}
                  >
                    <ThumbsDown className="h-3 w-3 mr-1" />
                    Disapprove
                  </Button>
                </div>

                {showCommentBox && (
                  <div className="space-y-2">
                    <Textarea
                      placeholder={`Add your comment for ${showCommentBox === "approved" ? "approval" : "disapproval"}...`}
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      className="text-xs min-h-[60px] bg-background"
                      onClick={(e) => e.stopPropagation()}
                      data-testid={`textarea-review-comment-${alert.id}`}
                    />
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant={showCommentBox === "approved" ? "default" : "destructive"}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSubmitReview(showCommentBox);
                        }}
                        disabled={reviewMutation.isPending}
                        data-testid={`button-submit-review-${alert.id}`}
                      >
                        {reviewMutation.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                        Submit {showCommentBox === "approved" ? "Approval" : "Disapproval"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowCommentBox(null);
                          setComment("");
                        }}
                        data-testid={`button-cancel-review-${alert.id}`}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function QAChecklistCard({ documentId, onCategoryClick, onViewPage }: QAChecklistProps) {
  const { data: checklist, isLoading } = useQuery<QAChecklist>({
    queryKey: ["/api/documents", documentId, "qa-checklist"],
  });

  const { data: reviews = [] } = useQuery<AlertReviewWithUser[]>({
    queryKey: ["/api/documents", documentId, "alert-reviews"],
  });

  const reviewsByAlertId = useMemo(() => {
    const map = new Map<string, AlertReviewWithUser>();
    const sorted = [...reviews].sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    for (const review of sorted) {
      if (!map.has(review.alertId)) {
        map.set(review.alertId, review);
      }
    }
    return map;
  }, [reviews]);

  const adjustedCounts = useMemo(() => {
    if (!checklist) return null;

    let checkpointsFlipped = 0;

    for (const item of checklist.items) {
      if (item.status === "fail" && item.relatedAlerts && item.relatedAlerts.length > 0) {
        const allApproved = item.relatedAlerts.every(alert => {
          const review = reviewsByAlertId.get(alert.id);
          return review?.decision === "approved";
        });
        if (allApproved) {
          checkpointsFlipped++;
        }
      }
    }

    return {
      passedChecks: checklist.passedChecks + checkpointsFlipped,
      failedChecks: checklist.failedChecks - checkpointsFlipped,
      naChecks: checklist.naChecks,
      totalChecks: checklist.totalChecks,
    };
  }, [checklist, reviewsByAlertId]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 animate-pulse" />
            Evaluating QA Checklist...
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-24 text-muted-foreground">
            Running compliance checks...
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!checklist || !adjustedCounts) {
    return null;
  }

  const passRate = adjustedCounts.totalChecks > 0 
    ? Math.round((adjustedCounts.passedChecks / adjustedCounts.totalChecks) * 100) 
    : 0;

  const overallStatus = adjustedCounts.failedChecks === 0 ? "compliant" : "review_required";

  return (
    <Card data-testid="card-qa-checklist">
      <CardHeader>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <CardTitle className="flex items-center gap-2" data-testid="text-qa-checklist-title">
            <ClipboardCheck className="h-5 w-5" />
            QA Review Checklist
          </CardTitle>
          <div className="flex items-center gap-3">
            <Badge 
              variant={overallStatus === "compliant" ? "default" : "destructive"}
              data-testid="badge-qa-status"
            >
              {overallStatus === "compliant" ? "Compliant" : "Review Required"}
            </Badge>
            <span className="text-sm text-muted-foreground" data-testid="text-qa-score">
              {adjustedCounts.passedChecks}/{adjustedCounts.totalChecks} passed ({passRate}%)
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="text-center p-3 bg-green-50 dark:bg-green-950 rounded-md" data-testid="stat-qa-passed">
            <div className="text-xl font-bold text-green-600 dark:text-green-400">{adjustedCounts.passedChecks}</div>
            <div className="text-xs text-muted-foreground">Passed</div>
          </div>
          <div className="text-center p-3 bg-red-50 dark:bg-red-950 rounded-md" data-testid="stat-qa-failed">
            <div className="text-xl font-bold text-destructive">{adjustedCounts.failedChecks}</div>
            <div className="text-xs text-muted-foreground">Failed</div>
          </div>
          <div className="text-center p-3 bg-muted rounded-md" data-testid="stat-qa-na">
            <div className="text-xl font-bold text-muted-foreground">{adjustedCounts.naChecks}</div>
            <div className="text-xs text-muted-foreground">N/A</div>
          </div>
        </div>

        <Separator className="my-4" />

        <div className="border rounded-md overflow-visible">
          <div className="grid grid-cols-[1fr_120px_1fr] border-b bg-muted/50">
            <div className="p-3 text-sm font-semibold">Checkpoints</div>
            <div className="p-3 text-sm font-semibold text-center border-l">Inference of AI Reviewer</div>
            <div className="p-3 text-sm font-semibold border-l">Remarks</div>
          </div>

          <Accordion type="multiple">
            {checklist.items.map((item, index) => (
              <QACheckTableRow
                key={item.id}
                item={item}
                documentId={documentId}
                onViewPage={onViewPage}
                reviewsByAlertId={reviewsByAlertId}
                isLast={index === checklist.items.length - 1}
              />
            ))}
          </Accordion>
        </div>
      </CardContent>
    </Card>
  );
}

function QACheckTableRow({ 
  item, 
  documentId,
  onViewPage,
  reviewsByAlertId,
  isLast,
}: { 
  item: QACheckItem; 
  documentId: string;
  onViewPage?: (pageNumber: number) => void;
  reviewsByAlertId: Map<string, AlertReviewWithUser>;
  isLast: boolean;
}) {
  const CategoryIcon = categoryIcons[item.category] || AlertTriangle;
  const hasAlerts = item.status === "fail" && item.relatedAlerts && item.relatedAlerts.length > 0;

  const allAlertsApproved = hasAlerts && item.relatedAlerts!.every(alert => {
    const review = reviewsByAlertId.get(alert.id);
    return review?.decision === "approved";
  });

  const unapprovedCount = hasAlerts 
    ? item.relatedAlerts!.filter(alert => {
        const review = reviewsByAlertId.get(alert.id);
        return !review || review.decision !== "approved";
      }).length
    : 0;

  const effectiveStatus = allAlertsApproved ? "pass" : item.status;
  const borderClass = isLast ? "" : "border-b";

  if (!hasAlerts) {
    return (
      <div 
        className={`grid grid-cols-[1fr_120px_1fr] ${borderClass} ${
          item.status === "fail" ? "bg-red-50/30 dark:bg-red-950/20" : ""
        }`}
        data-testid={`qa-check-item-${item.id}`}
      >
        <div className="p-3">
          <div className="flex items-start gap-2">
            <StatusIcon status={item.status} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium" data-testid={`text-qa-check-title-${item.id}`}>
                  {item.checkNumber}. {item.title}
                </span>
                <Badge variant="outline" className="text-xs">
                  <CategoryIcon className="h-3 w-3 mr-1" />
                  {categoryLabels[item.category]}
                </Badge>
              </div>
            </div>
          </div>
        </div>
        <div className="p-3 flex items-start justify-center border-l">
          <InferenceCell status={item.status} />
        </div>
        <div className="p-3 border-l">
          <p className="text-xs text-muted-foreground">{item.description}</p>
          {item.details && (
            <p className={`text-xs mt-1 ${
              item.status === "fail" ? "text-destructive" : "text-green-600 dark:text-green-400"
            }`} data-testid={`text-qa-check-details-${item.id}`}>
              {item.details}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <AccordionItem value={item.id} className={`border-0 ${borderClass}`} data-testid={`qa-check-item-${item.id}`}>
      <div className={`grid grid-cols-[1fr_120px_1fr] ${
        allAlertsApproved 
          ? "bg-green-50/30 dark:bg-green-950/20" 
          : "bg-red-50/30 dark:bg-red-950/20"
      }`}>
        <div className="p-3">
          <AccordionTrigger className="group p-0 hover:no-underline [&>svg]:hidden">
            <div className="flex items-start gap-2 flex-1 text-left">
              <StatusIcon status={effectiveStatus} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium" data-testid={`text-qa-check-title-${item.id}`}>
                    {item.checkNumber}. {item.title}
                  </span>
                  <Badge variant="outline" className="text-xs">
                    <CategoryIcon className="h-3 w-3 mr-1" />
                    {categoryLabels[item.category]}
                  </Badge>
                  {allAlertsApproved ? (
                    <Badge variant="default" className="text-xs" data-testid={`badge-qa-approved-${item.id}`}>
                      All Approved
                    </Badge>
                  ) : (
                    unapprovedCount > 0 && (
                      <Badge variant="destructive" className="text-xs" data-testid={`badge-qa-alert-count-${item.id}`}>
                        {unapprovedCount} {unapprovedCount === 1 ? "issue" : "issues"} remaining
                      </Badge>
                    )
                  )}
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
                </div>
              </div>
            </div>
          </AccordionTrigger>
        </div>
        <div className="p-3 flex items-start justify-center border-l">
          <InferenceCell status={effectiveStatus} />
        </div>
        <div className="p-3 border-l">
          <p className="text-xs text-muted-foreground">{item.description}</p>
          {item.details && (
            <p className={`text-xs mt-1 ${allAlertsApproved ? "text-green-600 dark:text-green-400" : "text-destructive"}`} data-testid={`text-qa-check-details-${item.id}`}>
              {allAlertsApproved ? "All issues reviewed and approved" : item.details}
            </p>
          )}
        </div>
      </div>
      <AccordionContent className={`${allAlertsApproved ? "bg-green-50/20 dark:bg-green-950/10" : "bg-red-50/20 dark:bg-red-950/10"} px-3 pb-3 pt-0`}>
        <div className="space-y-2 pl-7">
          {item.relatedAlerts!.map((alert) => (
            <AlertRowExpandable 
              key={alert.id} 
              alert={alert} 
              documentId={documentId}
              onViewPage={onViewPage}
              approvalReview={reviewsByAlertId.get(alert.id) || null}
            />
          ))}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}
