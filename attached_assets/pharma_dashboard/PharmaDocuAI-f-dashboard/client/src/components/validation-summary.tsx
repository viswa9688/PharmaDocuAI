import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  FileCheck,
  PenTool,
  Shield,
  Calculator,
  Calendar,
  Hash,
  FileText,
} from "lucide-react";

export type CategoryMetrics = {
  passed: number;
  failed: number;
  total: number;
};

export type ValidationCategories = {
  signatures: CategoryMetrics;
  dataIntegrity: CategoryMetrics;
  calculations: CategoryMetrics;
  dates: CategoryMetrics;
  batchNumbers: CategoryMetrics;
  pageCompleteness: CategoryMetrics;
};

export type ValidationOverview = {
  totalPages: number;
  totalAlerts: number;
  passRate: number;
  overallStatus: "compliant" | "review_required" | "non_compliant";
};

function StatusBadge({ status }: { status: string }) {
  if (status === "compliant") {
    return (
      <Badge className="bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20">
        <CheckCircle2 className="w-3 h-3 mr-1" />
        Compliant
      </Badge>
    );
  }
  if (status === "review_required") {
    return (
      <Badge className="bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20">
        <AlertTriangle className="w-3 h-3 mr-1" />
        Review Required
      </Badge>
    );
  }
  return (
    <Badge className="bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20">
      <XCircle className="w-3 h-3 mr-1" />
      Non-Compliant
    </Badge>
  );
}

function CategoryCard({
  title,
  icon: Icon,
  passed,
  failed,
  total,
  onClick,
  categoryKey,
}: {
  title: string;
  icon: any;
  passed: number;
  failed: number;
  total: number;
  onClick?: (category: string) => void;
  categoryKey: string;
}) {
  const passRate = total > 0 ? Math.round((passed / total) * 100) : 100;
  const hasIssues = failed > 0;

  return (
    <Card 
      className="hover-elevate cursor-pointer transition-all" 
      data-testid={`card-category-${title.toLowerCase().replace(/\s/g, '-')}`}
      onClick={() => onClick?.(categoryKey)}
    >
      <CardContent className="pt-6">
        <div className="flex items-start justify-between mb-4">
          <div className="p-2 rounded-lg bg-primary/10">
            <Icon className="w-5 h-5 text-primary" />
          </div>
          {hasIssues ? (
            <Badge variant="destructive" className="text-xs">
              {failed} issue{failed !== 1 ? 's' : ''}
            </Badge>
          ) : total > 0 ? (
            <Badge className="bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20 text-xs">
              <CheckCircle2 className="w-3 h-3 mr-1" />
              Pass
            </Badge>
          ) : (
            <Badge variant="secondary" className="text-xs">
              N/A
            </Badge>
          )}
        </div>
        <h3 className="font-semibold text-foreground mb-2">{title}</h3>
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Pass Rate</span>
            <span className={hasIssues ? "text-destructive" : "text-green-600 dark:text-green-400"}>
              {total > 0 ? `${passRate}%` : '-'}
            </span>
          </div>
          <Progress 
            value={total > 0 ? passRate : 0} 
            className={`h-2 ${hasIssues ? "[&>div]:bg-destructive" : "[&>div]:bg-green-500"}`}
          />
          <div className="flex justify-between text-xs text-muted-foreground pt-1">
            <span>{passed} passed</span>
            <span>{failed} failed</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function ValidationSummaryLoading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-32 w-full" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[...Array(6)].map((_, i) => (
          <Skeleton key={i} className="h-40" />
        ))}
      </div>
    </div>
  );
}

type Props = {
  overview: ValidationOverview;
  categories: ValidationCategories;
  title?: string;
  subtitle?: string;
  onCategoryClick?: (category: string) => void;
  compact?: boolean;
};

export function ValidationSummary({ 
  overview, 
  categories, 
  title,
  subtitle,
  onCategoryClick,
  compact = false,
}: Props) {
  return (
    <div className="space-y-6">
      {/* Hero Summary Card */}
      <Card className="bg-gradient-to-r from-primary/5 via-primary/10 to-primary/5 border-primary/20" data-testid="card-validation-summary">
        <CardContent className={compact ? "py-4" : "py-6"}>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className={`rounded-full bg-primary/10 ${compact ? "p-2" : "p-3"}`}>
                <FileCheck className={`text-primary ${compact ? "w-6 h-6" : "w-8 h-8"}`} />
              </div>
              <div>
                <div className="flex items-center gap-3 mb-1 flex-wrap">
                  <h2 className={`font-semibold ${compact ? "text-lg" : "text-xl"}`}>
                    {title || "Validation Summary"}
                  </h2>
                  <StatusBadge status={overview.overallStatus} />
                </div>
                <p className="text-muted-foreground text-sm">
                  {subtitle || `${overview.totalPages} pages validated`}
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-6">
              <div className="text-center">
                <div className={`font-bold text-primary ${compact ? "text-2xl" : "text-3xl"}`}>
                  {overview.passRate}%
                </div>
                <div className="text-sm text-muted-foreground">Pass Rate</div>
              </div>
              <div className="w-20">
                <Progress 
                  value={overview.passRate} 
                  className={`h-2 ${overview.passRate >= 95 ? "[&>div]:bg-green-500" : overview.passRate >= 80 ? "[&>div]:bg-yellow-500" : "[&>div]:bg-destructive"}`}
                />
              </div>
              <div className="text-center">
                <div className={`font-bold ${compact ? "text-2xl" : "text-3xl"} ${overview.totalAlerts > 0 ? 'text-destructive' : 'text-green-600 dark:text-green-400'}`}>
                  {overview.totalAlerts}
                </div>
                <div className="text-sm text-muted-foreground">Alerts</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Category Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <CategoryCard
          title="Signatures"
          icon={PenTool}
          passed={categories.signatures.passed}
          failed={categories.signatures.failed}
          total={categories.signatures.total}
          onClick={onCategoryClick}
          categoryKey="signatures"
        />
        <CategoryCard
          title="Data Integrity"
          icon={Shield}
          passed={categories.dataIntegrity.passed}
          failed={categories.dataIntegrity.failed}
          total={categories.dataIntegrity.total}
          onClick={onCategoryClick}
          categoryKey="dataIntegrity"
        />
        <CategoryCard
          title="Calculations"
          icon={Calculator}
          passed={categories.calculations.passed}
          failed={categories.calculations.failed}
          total={categories.calculations.total}
          onClick={onCategoryClick}
          categoryKey="calculations"
        />
        <CategoryCard
          title="Date Sequence"
          icon={Calendar}
          passed={categories.dates.passed}
          failed={categories.dates.failed}
          total={categories.dates.total}
          onClick={onCategoryClick}
          categoryKey="dates"
        />
        <CategoryCard
          title="Batch Numbers"
          icon={Hash}
          passed={categories.batchNumbers.passed}
          failed={categories.batchNumbers.failed}
          total={categories.batchNumbers.total}
          onClick={onCategoryClick}
          categoryKey="batchNumbers"
        />
        <CategoryCard
          title="Page Completeness"
          icon={FileText}
          passed={categories.pageCompleteness.passed}
          failed={categories.pageCompleteness.failed}
          total={categories.pageCompleteness.total}
          onClick={onCategoryClick}
          categoryKey="pageCompleteness"
        />
      </div>
    </div>
  );
}
