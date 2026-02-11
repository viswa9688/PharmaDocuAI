import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  CheckCircle2, 
  XCircle, 
  MinusCircle,
  ClipboardCheck,
  ArrowRight,
  AlertTriangle,
  Calculator,
  FileWarning,
  PenLine,
  Clock
} from "lucide-react";
import type { QAChecklist, QACheckItem } from "@shared/schema";

interface QAChecklistProps {
  documentId: string;
  onCategoryClick?: (category: string, alertCategory: string | null) => void;
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

const categoryTabMap: Record<string, string> = {
  discrepancies: "all",
  missing: "missing",
  calculations: "calculations",
  violations: "violations",
  integrity: "integrity",
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

export function QAChecklistCard({ documentId, onCategoryClick }: QAChecklistProps) {
  const { data: checklist, isLoading } = useQuery<QAChecklist>({
    queryKey: ["/api/documents", documentId, "qa-checklist"],
  });

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

  if (!checklist) {
    return null;
  }

  const passRate = checklist.totalChecks > 0 
    ? Math.round((checklist.passedChecks / checklist.totalChecks) * 100) 
    : 0;

  const overallStatus = checklist.failedChecks === 0 ? "compliant" : "review_required";

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
              {checklist.passedChecks}/{checklist.totalChecks} passed ({passRate}%)
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="text-center p-3 bg-green-50 dark:bg-green-950 rounded-md" data-testid="stat-qa-passed">
            <div className="text-xl font-bold text-green-600 dark:text-green-400">{checklist.passedChecks}</div>
            <div className="text-xs text-muted-foreground">Passed</div>
          </div>
          <div className="text-center p-3 bg-red-50 dark:bg-red-950 rounded-md" data-testid="stat-qa-failed">
            <div className="text-xl font-bold text-destructive">{checklist.failedChecks}</div>
            <div className="text-xs text-muted-foreground">Failed</div>
          </div>
          <div className="text-center p-3 bg-muted rounded-md" data-testid="stat-qa-na">
            <div className="text-xl font-bold text-muted-foreground">{checklist.naChecks}</div>
            <div className="text-xs text-muted-foreground">N/A</div>
          </div>
        </div>

        <Separator className="my-4" />

        <div className="space-y-1">
          {checklist.items.map((item) => (
            <QACheckRow 
              key={item.id} 
              item={item} 
              onCategoryClick={onCategoryClick}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function QACheckRow({ 
  item, 
  onCategoryClick 
}: { 
  item: QACheckItem; 
  onCategoryClick?: (category: string, alertCategory: string | null) => void;
}) {
  const CategoryIcon = categoryIcons[item.category] || AlertTriangle;
  const canClick = item.status === "fail" && onCategoryClick;

  return (
    <div 
      className={`flex items-start gap-3 p-3 rounded-md transition-colors ${
        canClick ? "cursor-pointer hover-elevate" : ""
      } ${item.status === "fail" ? "bg-red-50/50 dark:bg-red-950/30" : ""}`}
      onClick={() => canClick && onCategoryClick(categoryTabMap[item.category], item.alertCategory)}
      data-testid={`qa-check-item-${item.id}`}
    >
      <StatusIcon status={item.status} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-sm font-medium ${
            item.status === "fail" ? "text-foreground" : "text-foreground"
          }`} data-testid={`text-qa-check-title-${item.id}`}>
            {item.checkNumber}. {item.title}
          </span>
          <Badge variant="outline" className="text-xs">
            <CategoryIcon className="h-3 w-3 mr-1" />
            {categoryLabels[item.category]}
          </Badge>
          {item.relatedAlertCount > 0 && (
            <Badge variant="destructive" className="text-xs" data-testid={`badge-qa-alert-count-${item.id}`}>
              {item.relatedAlertCount} {item.relatedAlertCount === 1 ? "issue" : "issues"}
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-1">{item.description}</p>
        {item.details && (
          <p className={`text-xs mt-1 ${
            item.status === "fail" ? "text-destructive" : "text-green-600 dark:text-green-400"
          }`} data-testid={`text-qa-check-details-${item.id}`}>
            {item.details}
          </p>
        )}
      </div>
      {canClick && (
        <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
      )}
    </div>
  );
}
