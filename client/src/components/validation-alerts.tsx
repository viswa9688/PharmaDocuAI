import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
  ChevronRight,
  FileX2,
  Eye,
  PenLine,
  ImageOff
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
  sop_violation: { icon: AlertTriangle, label: "SOP Violation" },
  data_quality: { icon: AlertCircle, label: "Data Quality" },
  data_integrity: { icon: PenLine, label: "Data Integrity" }
};

interface MissingPagesData {
  missingPages: string;
  foundCount: number;
  expectedCount: number;
  missingCount: number;
}

function MissingPagesBanner({ alert }: { alert: ValidationAlert }) {
  let data: MissingPagesData | null = null;
  
  try {
    if (alert.details) {
      data = JSON.parse(alert.details) as MissingPagesData;
    }
  } catch {
    data = null;
  }
  
  const missingPages = data?.missingPages || "Unable to determine";
  const foundCount = data?.foundCount ?? "?";
  const expectedCount = data?.expectedCount ?? "?";
  
  return (
    <Alert variant="destructive" className="mb-6" data-testid="banner-missing-pages">
      <FileX2 className="h-5 w-5" />
      <AlertTitle className="text-lg font-semibold flex items-center gap-2">
        Missing Pages Detected
      </AlertTitle>
      <AlertDescription className="mt-2">
        <p className="text-sm mb-3">
          This document is incomplete. Only <strong>{foundCount}</strong> of <strong>{expectedCount}</strong> expected pages were found.
        </p>
        <div className="p-3 bg-background/50 rounded border border-destructive/30">
          <div className="text-sm font-medium mb-1 text-foreground">Missing Pages:</div>
          <div className="text-base font-mono font-bold" data-testid="text-missing-pages-list">
            {missingPages}
          </div>
        </div>
        <p className="text-xs mt-3 opacity-80">
          {alert.suggestedAction}
        </p>
      </AlertDescription>
    </Alert>
  );
}

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
  // Combine page-level alerts with cross-page issues (batch/lot consistency, reconciliation, etc.)
  const allAlerts = [
    ...pageResults.flatMap(p => p.alerts),
    ...(summary.crossPageIssues || [])
  ];

  // Extract missing pages alert for prominent display using stable ruleId
  const missingPagesAlert = allAlerts.find(a => a.ruleId === "page_completeness_missing");
  // Filter out the missing pages alert from regular display (it will be shown in banner)
  const filteredAlerts = allAlerts.filter(a => a.ruleId !== "page_completeness_missing");

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
        {/* Prominent Missing Pages Banner */}
        {missingPagesAlert && (
          <MissingPagesBanner alert={missingPagesAlert} />
        )}

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
            <TabsList className="grid w-full grid-cols-5">
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
              <TabsTrigger value="integrity" data-testid="tab-integrity-alerts">
                Integrity ({summary.alertsByCategory.data_integrity})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="all" className="mt-4">
              <ScrollArea className="h-[400px]">
                <AlertList 
                  alerts={filteredAlerts} 
                  onPageClick={onPageClick}
                />
              </ScrollArea>
            </TabsContent>

            <TabsContent value="calculations" className="mt-4">
              <ScrollArea className="h-[400px]">
                <AlertList 
                  alerts={filteredAlerts.filter(a => a.category === 'calculation_error')} 
                  onPageClick={onPageClick}
                />
              </ScrollArea>
            </TabsContent>

            <TabsContent value="missing" className="mt-4">
              <ScrollArea className="h-[400px]">
                <AlertList 
                  alerts={filteredAlerts.filter(a => a.category === 'missing_value')} 
                  onPageClick={onPageClick}
                />
              </ScrollArea>
            </TabsContent>

            <TabsContent value="violations" className="mt-4">
              <ScrollArea className="h-[400px]">
                <AlertList 
                  alerts={filteredAlerts.filter(a => 
                    a.category === 'range_violation' || a.category === 'sop_violation'
                  )} 
                  onPageClick={onPageClick}
                />
              </ScrollArea>
            </TabsContent>

            <TabsContent value="integrity" className="mt-4">
              <ScrollArea className="h-[400px]">
                <DataIntegrityAlertList 
                  alerts={filteredAlerts.filter(a => a.category === 'data_integrity')} 
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

interface DataIntegrityDetails {
  anomalyType: string;
  confidence: number;
  detectionMethod: string;
  affectedText?: string;
  thumbnailPath?: string;
  boundingBox?: { x: number; y: number; width: number; height: number };
  description?: string;
}

function DataIntegrityAlertList({ 
  alerts, 
  onPageClick 
}: { 
  alerts: ValidationAlert[]; 
  onPageClick?: (pageNumber: number) => void;
}) {
  if (alerts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
        <Eye className="h-8 w-8 mb-2 opacity-50" />
        <p>No data integrity issues detected</p>
        <p className="text-xs mt-1">Strike-offs, corrections, and overwrites will appear here</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {alerts.map((alert, index) => (
        <DataIntegrityAlertCard 
          key={alert.id || index} 
          alert={alert} 
          onPageClick={onPageClick}
        />
      ))}
    </div>
  );
}

function DataIntegrityAlertCard({ 
  alert, 
  onPageClick 
}: { 
  alert: ValidationAlert; 
  onPageClick?: (pageNumber: number) => void;
}) {
  const severity = severityConfig[alert.severity];
  const SeverityIcon = severity.icon;

  let details: DataIntegrityDetails | null = null;
  try {
    if (alert.details) {
      details = JSON.parse(alert.details) as DataIntegrityDetails;
    }
  } catch {
    details = null;
  }

  const anomalyTypeIcons: Record<string, typeof PenLine> = {
    strike_through: PenLine,
    red_mark: AlertCircle,
    overwrite: FileWarning,
    erasure: ImageOff,
    correction_fluid: ImageOff,
    scribble: PenLine
  };

  const AnomalyIcon = details?.anomalyType ? (anomalyTypeIcons[details.anomalyType] || Eye) : Eye;

  return (
    <Card 
      className="p-4 hover:bg-muted/50 transition-colors cursor-pointer border-l-4 border-l-orange-500"
      onClick={() => onPageClick?.(alert.source.pageNumber)}
      data-testid={`integrity-alert-card-${alert.id}`}
    >
      <div className="flex items-start gap-4">
        {/* Thumbnail Section */}
        <div className="flex-shrink-0">
          {details?.thumbnailPath ? (
            <div className="relative w-24 h-24 bg-muted rounded-md overflow-hidden border border-border">
              <img 
                src={`/api/thumbnails/${details.thumbnailPath.split('/').pop()}`}
                alt="Visual anomaly"
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                  (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                }}
              />
              <div className="hidden absolute inset-0 flex items-center justify-center bg-muted">
                <AnomalyIcon className="h-8 w-8 text-muted-foreground" />
              </div>
              {/* Bounding box overlay indicator */}
              {details?.boundingBox && (
                <div className="absolute inset-0 border-2 border-orange-500 pointer-events-none opacity-50" />
              )}
            </div>
          ) : (
            <div className="w-24 h-24 bg-muted rounded-md flex items-center justify-center border border-border">
              <AnomalyIcon className="h-8 w-8 text-muted-foreground" />
            </div>
          )}
        </div>

        {/* Content Section */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <SeverityIcon className={`h-4 w-4 ${alert.severity === 'critical' || alert.severity === 'high' ? 'text-destructive' : 'text-orange-500'}`} />
            <span className="font-medium text-sm" data-testid="text-integrity-title">
              {alert.title}
            </span>
            <Badge variant="outline" className="text-xs bg-orange-50 dark:bg-orange-950 border-orange-200 dark:border-orange-800 text-orange-700 dark:text-orange-300">
              <PenLine className="h-3 w-3 mr-1" />
              Data Integrity
            </Badge>
          </div>

          <p className="text-sm text-muted-foreground mb-2" data-testid="text-integrity-message">
            {alert.message}
          </p>

          {/* Detection Details */}
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground mb-2">
            <span className="flex items-center gap-1">
              <ArrowRight className="h-3 w-3" />
              Page {alert.source.pageNumber}
            </span>
            {details?.anomalyType && (
              <Badge variant="secondary" className="text-xs">
                {details.anomalyType.replace(/_/g, ' ')}
              </Badge>
            )}
            {details?.confidence && (
              <span className="text-xs">
                Confidence: {Math.round(details.confidence * 100)}%
              </span>
            )}
            {details?.detectionMethod && (
              <span className="text-xs opacity-70">
                via {details.detectionMethod}
              </span>
            )}
          </div>

          {/* Affected Text */}
          {details?.affectedText && (
            <div className="mt-2 p-2 bg-orange-50 dark:bg-orange-950 rounded text-xs border border-orange-200 dark:border-orange-800">
              <span className="font-medium text-orange-800 dark:text-orange-200">Affected text: </span>
              <span className="font-mono text-orange-900 dark:text-orange-100">{details.affectedText}</span>
            </div>
          )}

          {/* Suggested Action */}
          {alert.suggestedAction && (
            <div className="mt-2 flex items-start gap-1 text-xs text-primary">
              <ChevronRight className="h-3 w-3 mt-0.5 flex-shrink-0" />
              <span>{alert.suggestedAction}</span>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
