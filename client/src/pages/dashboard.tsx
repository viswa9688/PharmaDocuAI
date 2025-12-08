import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  FileText,
  PenTool,
  Shield,
  Calculator,
  Calendar,
  Hash,
  FileCheck,
  ArrowRight,
} from "lucide-react";

type DashboardSummary = {
  overview: {
    totalDocuments: number;
    documentsWithIssues: number;
    totalPages: number;
    totalAlerts: number;
    passRate: number;
    overallStatus: "compliant" | "review_required" | "non_compliant";
  };
  categories: {
    signatures: { passed: number; failed: number; total: number };
    dataIntegrity: { passed: number; failed: number; total: number };
    calculations: { passed: number; failed: number; total: number };
    dates: { passed: number; failed: number; total: number };
    batchNumbers: { passed: number; failed: number; total: number };
    pageCompleteness: { passed: number; failed: number; total: number };
  };
  recentDocuments: Array<{
    id: string;
    filename: string;
    uploadedAt: string;
    totalPages: number;
    status: string;
  }>;
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
}: {
  title: string;
  icon: any;
  passed: number;
  failed: number;
  total: number;
}) {
  const passRate = total > 0 ? Math.round((passed / total) * 100) : 100;
  const hasIssues = failed > 0;

  return (
    <Card className="hover-elevate cursor-pointer transition-all" data-testid={`card-category-${title.toLowerCase().replace(/\s/g, '-')}`}>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between mb-4">
          <div className="p-2 rounded-lg bg-primary/10">
            <Icon className="w-5 h-5 text-primary" />
          </div>
          {hasIssues ? (
            <Badge variant="destructive" className="text-xs">
              {failed} issue{failed !== 1 ? 's' : ''}
            </Badge>
          ) : (
            <Badge className="bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20 text-xs">
              <CheckCircle2 className="w-3 h-3 mr-1" />
              Pass
            </Badge>
          )}
        </div>
        <h3 className="font-semibold text-foreground mb-2">{title}</h3>
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Pass Rate</span>
            <span className={hasIssues ? "text-destructive" : "text-green-600 dark:text-green-400"}>
              {passRate}%
            </span>
          </div>
          <Progress 
            value={passRate} 
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

function LoadingSkeleton() {
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

export default function Dashboard() {
  const { data, isLoading, error } = useQuery<DashboardSummary>({
    queryKey: ["/api/dashboard/summary"],
    refetchInterval: 30000,
  });

  if (isLoading) {
    return (
      <div className="space-y-6" data-testid="dashboard-loading">
        <h1 className="text-2xl font-bold">Validation Dashboard</h1>
        <LoadingSkeleton />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Validation Dashboard</h1>
        <Card>
          <CardContent className="py-8 text-center">
            <AlertTriangle className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">Unable to load dashboard data</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { overview, categories, recentDocuments } = data;

  return (
    <div className="space-y-6" data-testid="dashboard-page">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Validation Dashboard</h1>
        <Link href="/documents">
          <Badge variant="outline" className="cursor-pointer hover-elevate" data-testid="link-view-documents">
            View All Documents <ArrowRight className="w-3 h-3 ml-1" />
          </Badge>
        </Link>
      </div>

      {/* Hero Summary Card */}
      <Card className="bg-gradient-to-r from-primary/5 via-primary/10 to-primary/5 border-primary/20" data-testid="card-hero-summary">
        <CardContent className="py-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-primary/10">
                <FileCheck className="w-8 h-8 text-primary" />
              </div>
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <h2 className="text-xl font-semibold">Overall Status</h2>
                  <StatusBadge status={overview.overallStatus} />
                </div>
                <p className="text-muted-foreground">
                  {overview.totalDocuments} document{overview.totalDocuments !== 1 ? 's' : ''} processed, {overview.totalPages} pages validated
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-8">
              <div className="text-center">
                <div className="text-3xl font-bold text-primary">{overview.passRate}%</div>
                <div className="text-sm text-muted-foreground">Pass Rate</div>
              </div>
              <div className="w-24">
                <Progress 
                  value={overview.passRate} 
                  className={`h-3 ${overview.passRate >= 95 ? "[&>div]:bg-green-500" : overview.passRate >= 80 ? "[&>div]:bg-yellow-500" : "[&>div]:bg-destructive"}`}
                />
              </div>
              <div className="text-center">
                <div className={`text-3xl font-bold ${overview.totalAlerts > 0 ? 'text-destructive' : 'text-green-600 dark:text-green-400'}`}>
                  {overview.totalAlerts}
                </div>
                <div className="text-sm text-muted-foreground">Total Alerts</div>
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
        />
        <CategoryCard
          title="Data Integrity"
          icon={Shield}
          passed={categories.dataIntegrity.total - categories.dataIntegrity.failed}
          failed={categories.dataIntegrity.failed}
          total={categories.dataIntegrity.total || categories.dataIntegrity.passed + categories.dataIntegrity.failed}
        />
        <CategoryCard
          title="Calculations"
          icon={Calculator}
          passed={categories.calculations.total - categories.calculations.failed}
          failed={categories.calculations.failed}
          total={categories.calculations.total || categories.calculations.passed + categories.calculations.failed}
        />
        <CategoryCard
          title="Date Sequence"
          icon={Calendar}
          passed={categories.dates.total - categories.dates.failed}
          failed={categories.dates.failed}
          total={categories.dates.total || categories.dates.passed + categories.dates.failed}
        />
        <CategoryCard
          title="Batch Numbers"
          icon={Hash}
          passed={categories.batchNumbers.total - categories.batchNumbers.failed}
          failed={categories.batchNumbers.failed}
          total={categories.batchNumbers.total || categories.batchNumbers.passed + categories.batchNumbers.failed}
        />
        <CategoryCard
          title="Page Completeness"
          icon={FileText}
          passed={categories.pageCompleteness.total - categories.pageCompleteness.failed}
          failed={categories.pageCompleteness.failed}
          total={categories.pageCompleteness.total || categories.pageCompleteness.passed + categories.pageCompleteness.failed}
        />
      </div>

      {/* Recent Documents */}
      {recentDocuments.length > 0 && (
        <Card data-testid="card-recent-documents">
          <CardHeader>
            <CardTitle className="text-lg">Recent Documents</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentDocuments.map((doc) => (
                <Link key={doc.id} href={`/documents/${doc.id}`}>
                  <div className="flex items-center justify-between p-3 rounded-lg hover-elevate cursor-pointer border border-border" data-testid={`link-document-${doc.id}`}>
                    <div className="flex items-center gap-3">
                      <FileText className="w-5 h-5 text-muted-foreground" />
                      <div>
                        <p className="font-medium">{doc.filename}</p>
                        <p className="text-sm text-muted-foreground">
                          {doc.totalPages} pages
                        </p>
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {overview.totalDocuments === 0 && (
        <Card data-testid="card-no-documents">
          <CardContent className="py-12 text-center">
            <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="font-semibold mb-2">No Documents Yet</h3>
            <p className="text-muted-foreground mb-4">Upload your first batch record to get started</p>
            <Link href="/">
              <Badge variant="outline" className="cursor-pointer hover-elevate" data-testid="link-upload-first">
                Upload Document <ArrowRight className="w-3 h-3 ml-1" />
              </Badge>
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
