import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  AlertTriangle, 
  AlertCircle, 
  Info, 
  CheckCircle2, 
  XCircle,
  Calculator,
  FileWarning,
  Activity,
  Clock,
  ArrowRight,
  ChevronRight
} from "lucide-react";
import type { 
  ValidationAlert, 
  AlertSeverity, 
  AlertCategory,
  DocumentValidationSummary,
  PageValidationResult 
} from "@shared/schema";

interface ValidationAlertsProps {
  documentId: string;
  onPageClick?: (pageNumber: number) => void;
}

const severityConfig: Record<AlertSeverity, { color: string; icon: typeof AlertCircle; label: string }> = {
  critical: { color: "destructive", icon: XCircle, label: "Critical" },
  high: { color: "destructive", icon: AlertTriangle, label: "High" },
  medium: { color: "warning", icon: AlertCircle, label: "Medium" },
  low: { color: "secondary", icon: Info, label: "Low" },
  info: { color: "outline", icon: Info, label: "Info" }
};

const categoryConfig: Record<AlertCategory, { icon: typeof Calculator; label: string }> = {
  calculation_error: { icon: Calculator, label: "Calculation Error" },
  missing_value: { icon: FileWarning, label: "Missing Value" },
  range_violation: { icon: Activity, label: "Range Violation" },
  sequence_error: { icon: Clock, label: "Sequence Error" },
  unit_mismatch: { icon: AlertCircle, label: "Unit Mismatch" },
  trend_anomaly: { icon: Activity, label: "Trend Anomaly" },
  consistency_error: { icon: AlertTriangle, label: "Consistency Error" },
  format_error: { icon: FileWarning, label: "Format Error" },
  sop_violation: { icon: AlertTriangle, label: "SOP Violation" }
};

export function ValidationAlerts({ documentId, onPageClick }: ValidationAlertsProps) {
  const { data, isLoading, error } = useQuery<{
    summary: DocumentValidationSummary;
    pageResults: PageValidationResult[];
  }>({
    queryKey: ['/api/documents', documentId, 'validation'],
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 animate-pulse" />
            Running Validation...
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-32 text-muted-foreground">
            Analyzing document for issues...
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <XCircle className="h-5 w-5" />
            Validation Error
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Failed to load validation results</p>
        </CardContent>
      </Card>
    );
  }

  const { summary, pageResults } = data;
  const allAlerts = pageResults.flatMap(p => p.alerts);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2" data-testid="text-validation-title">
          <Activity className="h-5 w-5" />
          Validation Results
        </CardTitle>
        <CardDescription>
          {summary.totalAlerts === 0 
            ? "No issues detected"
            : `${summary.totalAlerts} issue${summary.totalAlerts !== 1 ? 's' : ''} found across ${summary.pagesValidated} pages`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="text-center p-3 bg-muted rounded-lg" data-testid="stat-critical-alerts">
            <div className="text-2xl font-bold text-destructive">
              {summary.alertsBySeverity.critical + summary.alertsBySeverity.high}
            </div>
            <div className="text-xs text-muted-foreground">Critical/High</div>
          </div>
          <div className="text-center p-3 bg-muted rounded-lg" data-testid="stat-medium-alerts">
            <div className="text-2xl font-bold text-yellow-600">
              {summary.alertsBySeverity.medium}
            </div>
            <div className="text-xs text-muted-foreground">Medium</div>
          </div>
          <div className="text-center p-3 bg-muted rounded-lg" data-testid="stat-formulas-checked">
            <div className="text-2xl font-bold">
              {summary.formulasChecked}
            </div>
            <div className="text-xs text-muted-foreground">Formulas Checked</div>
          </div>
          <div className="text-center p-3 bg-muted rounded-lg" data-testid="stat-formula-discrepancies">
            <div className="text-2xl font-bold text-destructive">
              {summary.formulaDiscrepancies}
            </div>
            <div className="text-xs text-muted-foreground">Discrepancies</div>
          </div>
        </div>

        {summary.totalAlerts === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <CheckCircle2 className="h-12 w-12 text-green-500 mb-3" />
            <h3 className="font-medium text-lg">All Validations Passed</h3>
            <p className="text-muted-foreground text-sm">
              No calculation errors, missing values, or SOP violations detected
            </p>
          </div>
        ) : (
          <Tabs defaultValue="all" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="all" data-testid="tab-all-alerts">
                All ({summary.totalAlerts})
              </TabsTrigger>
              <TabsTrigger value="calculations" data-testid="tab-calculation-alerts">
                Calculations ({summary.alertsByCategory.calculation_error})
              </TabsTrigger>
              <TabsTrigger value="missing" data-testid="tab-missing-alerts">
                Missing ({summary.alertsByCategory.missing_value})
              </TabsTrigger>
              <TabsTrigger value="violations" data-testid="tab-violation-alerts">
                Violations ({summary.alertsByCategory.range_violation + summary.alertsByCategory.sop_violation})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="all" className="mt-4">
              <ScrollArea className="h-[400px]">
                <AlertList 
                  alerts={allAlerts} 
                  onPageClick={onPageClick}
                />
              </ScrollArea>
            </TabsContent>

            <TabsContent value="calculations" className="mt-4">
              <ScrollArea className="h-[400px]">
                <AlertList 
                  alerts={allAlerts.filter(a => a.category === 'calculation_error')} 
                  onPageClick={onPageClick}
                />
              </ScrollArea>
            </TabsContent>

            <TabsContent value="missing" className="mt-4">
              <ScrollArea className="h-[400px]">
                <AlertList 
                  alerts={allAlerts.filter(a => a.category === 'missing_value')} 
                  onPageClick={onPageClick}
                />
              </ScrollArea>
            </TabsContent>

            <TabsContent value="violations" className="mt-4">
              <ScrollArea className="h-[400px]">
                <AlertList 
                  alerts={allAlerts.filter(a => 
                    a.category === 'range_violation' || a.category === 'sop_violation'
                  )} 
                  onPageClick={onPageClick}
                />
              </ScrollArea>
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}

function AlertList({ 
  alerts, 
  onPageClick 
}: { 
  alerts: ValidationAlert[]; 
  onPageClick?: (pageNumber: number) => void;
}) {
  if (alerts.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground">
        No alerts in this category
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {alerts.map((alert, index) => (
        <AlertCard 
          key={alert.id || index} 
          alert={alert} 
          onPageClick={onPageClick}
        />
      ))}
    </div>
  );
}

function AlertCard({ 
  alert, 
  onPageClick 
}: { 
  alert: ValidationAlert; 
  onPageClick?: (pageNumber: number) => void;
}) {
  const severity = severityConfig[alert.severity];
  const category = categoryConfig[alert.category];
  const SeverityIcon = severity.icon;
  const CategoryIcon = category.icon;

  return (
    <Card 
      className="p-4 hover:bg-muted/50 transition-colors cursor-pointer"
      onClick={() => onPageClick?.(alert.source.pageNumber)}
      data-testid={`alert-card-${alert.id}`}
    >
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 ${alert.severity === 'critical' || alert.severity === 'high' ? 'text-destructive' : 'text-yellow-600'}`}>
          <SeverityIcon className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-medium text-sm" data-testid="text-alert-title">
              {alert.title}
            </span>
            <Badge variant="outline" className="text-xs">
              <CategoryIcon className="h-3 w-3 mr-1" />
              {category.label}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mb-2" data-testid="text-alert-message">
            {alert.message}
          </p>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <ArrowRight className="h-3 w-3" />
              Page {alert.source.pageNumber}
            </span>
            {alert.source.fieldLabel && (
              <span>Field: {alert.source.fieldLabel}</span>
            )}
            {alert.source.sectionType && (
              <span>Section: {alert.source.sectionType.replace(/_/g, ' ')}</span>
            )}
          </div>
          {alert.details && (
            <div className="mt-2 p-2 bg-muted rounded text-xs font-mono" data-testid="text-alert-details">
              {alert.details}
            </div>
          )}
          {alert.suggestedAction && (
            <div className="mt-2 flex items-center gap-1 text-xs text-primary">
              <ChevronRight className="h-3 w-3" />
              <span>{alert.suggestedAction}</span>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

interface PageValidationBadgeProps {
  documentId: string;
  pageNumber: number;
}

export function PageValidationBadge({ documentId, pageNumber }: PageValidationBadgeProps) {
  const { data } = useQuery<PageValidationResult>({
    queryKey: ['/api/documents', documentId, 'pages', pageNumber, 'validation'],
  });

  if (!data || data.alerts.length === 0) {
    return null;
  }

  const criticalCount = data.alerts.filter(a => 
    a.severity === 'critical' || a.severity === 'high'
  ).length;

  return (
    <Badge 
      variant={criticalCount > 0 ? "destructive" : "secondary"}
      className="text-xs"
      data-testid={`badge-page-validation-${pageNumber}`}
    >
      {data.alerts.length} {data.alerts.length === 1 ? 'issue' : 'issues'}
    </Badge>
  );
}
