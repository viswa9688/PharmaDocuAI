import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { 
  Upload, 
  Scale, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  Clock,
  FileText,
  Loader2,
  Trash2,
  ChevronRight
} from "lucide-react";
import type { RawMaterialVerification, RawMaterialResult } from "@shared/schema";

type VerificationWithResults = {
  verification: RawMaterialVerification;
  results: RawMaterialResult[];
};

type UploadResult = {
  verificationId: string;
  status: string;
  limitsPage: number;
  verificationPage: number;
  limitsExtracted: number;
  actualsExtracted: number;
  totalMaterials: number;
  materialsWithinLimits: number;
  materialsOutOfLimits: number;
  results: Array<{
    materialCode: string;
    materialName: string;
    limitRange: string;
    minValue: number | null;
    maxValue: number | null;
    actualValue: number | null;
    actualDisplay: string;
    withinLimits: boolean | null;
    notes: string | null;
  }>;
  pageClassifications: Array<{
    pageNumber: number;
    pageType: string;
    confidence: number;
    keywords: string[];
  }>;
};

export default function RawMaterialVerificationPage() {
  const { toast } = useToast();
  const [isUploading, setIsUploading] = useState(false);
  const [selectedVerificationId, setSelectedVerificationId] = useState<string | null>(null);
  const [latestResult, setLatestResult] = useState<UploadResult | null>(null);

  const { data: verifications = [], isLoading: loadingVerifications } = useQuery<RawMaterialVerification[]>({
    queryKey: ["/api/raw-material/verifications"],
    refetchInterval: 3000,
  });

  const { data: selectedResult, isLoading: loadingResult } = useQuery<VerificationWithResults>({
    queryKey: ["/api/raw-material/verifications", selectedVerificationId],
    enabled: !!selectedVerificationId && !latestResult,
  });

  const deleteVerificationMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/raw-material/verifications/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/raw-material/verifications"] });
      if (selectedVerificationId) {
        setSelectedVerificationId(null);
        setLatestResult(null);
      }
      toast({ title: "Verification deleted" });
    },
    onError: (error: Error) => {
      toast({ title: "Error deleting verification", description: error.message, variant: "destructive" });
    },
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== "application/pdf") {
      toast({ title: "Invalid file type", description: "Please upload a PDF file", variant: "destructive" });
      return;
    }

    setIsUploading(true);
    setLatestResult(null);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("/api/raw-material/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Upload failed");
      }

      const result: UploadResult = await response.json();
      queryClient.invalidateQueries({ queryKey: ["/api/raw-material/verifications"] });
      setSelectedVerificationId(result.verificationId);
      setLatestResult(result);
      toast({ 
        title: "Verification complete", 
        description: `${result.materialsWithinLimits} within limits, ${result.materialsOutOfLimits} out of limits`
      });
    } catch (error: any) {
      toast({ title: "Verification failed", description: error.message, variant: "destructive" });
    } finally {
      setIsUploading(false);
      e.target.value = "";
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" /> Pending</Badge>;
      case "processing":
        return <Badge variant="secondary" className="gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Processing</Badge>;
      case "completed":
        return <Badge variant="default" className="gap-1 bg-green-600"><CheckCircle2 className="h-3 w-3" /> Completed</Badge>;
      case "failed":
        return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" /> Failed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getResultBadge = (withinLimits: boolean | null) => {
    if (withinLimits === null) {
      return <Badge variant="outline">Unknown</Badge>;
    }
    if (withinLimits) {
      return <Badge variant="default" className="bg-green-600">Within Limits</Badge>;
    }
    return <Badge variant="destructive">Out of Limits</Badge>;
  };

  const currentResults = latestResult?.results || selectedResult?.results;
  const currentVerification = latestResult ? {
    ...selectedResult?.verification,
    totalMaterials: latestResult.totalMaterials,
    materialsWithinLimits: latestResult.materialsWithinLimits,
    materialsOutOfLimits: latestResult.materialsOutOfLimits,
  } : selectedResult?.verification;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Raw Material Verification</h1>
          <p className="text-muted-foreground">
            Upload a PDF with limits page and verification page to compare values
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="file"
            id="pdf-upload"
            accept=".pdf"
            className="hidden"
            onChange={handleFileUpload}
            disabled={isUploading}
            data-testid="input-pdf-upload"
          />
          <Button 
            onClick={() => document.getElementById("pdf-upload")?.click()}
            disabled={isUploading}
            data-testid="button-upload-pdf"
          >
            {isUploading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Upload className="h-4 w-4 mr-2" />
            )}
            Upload PDF
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-lg">Verification History</CardTitle>
            <CardDescription>Previously verified documents</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingVerifications ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : verifications.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Scale className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No verifications yet</p>
                <p className="text-sm">Upload a PDF to get started</p>
              </div>
            ) : (
              <ScrollArea className="h-80">
                <div className="space-y-2">
                  {verifications.map((v) => (
                    <div
                      key={v.id}
                      className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                        selectedVerificationId === v.id ? "border-primary bg-accent" : "hover:bg-accent/50"
                      }`}
                      onClick={() => {
                        setSelectedVerificationId(v.id);
                        setLatestResult(null);
                      }}
                      data-testid={`verification-${v.id}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm truncate flex-1">{v.filename}</span>
                        <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        {getStatusBadge(v.status)}
                        {v.status === "completed" && (
                          <span className="text-xs text-muted-foreground">
                            {v.materialsWithinLimits}/{v.totalMaterials} OK
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">Verification Results</CardTitle>
                <CardDescription>
                  {currentVerification
                    ? `Comparing limits vs actual values`
                    : "Upload a PDF to see results"}
                </CardDescription>
              </div>
              {selectedVerificationId && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => deleteVerificationMutation.mutate(selectedVerificationId)}
                  disabled={deleteVerificationMutation.isPending}
                  data-testid="button-delete-verification"
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {!selectedVerificationId ? (
              <div className="text-center py-12 text-muted-foreground">
                <Scale className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Select a verification from the history</p>
                <p className="text-sm">or upload a new PDF to verify</p>
              </div>
            ) : loadingResult && !latestResult ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : selectedResult?.verification?.status === "failed" ? (
              <div className="text-center py-12 text-destructive">
                <XCircle className="h-12 w-12 mx-auto mb-4" />
                <p className="font-medium">Verification Failed</p>
                <p className="text-sm">{selectedResult.verification.errorMessage || "Unknown error"}</p>
              </div>
            ) : (
              <>
                {latestResult?.pageClassifications && (
                  <div className="mb-4 p-3 bg-muted/50 rounded-lg">
                    <div className="text-sm text-muted-foreground mb-2">Page Detection</div>
                    <div className="flex gap-4 text-sm">
                      <span>Limits Page: <strong>{latestResult.limitsPage}</strong></span>
                      <span>Verification Page: <strong>{latestResult.verificationPage}</strong></span>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-4 mb-6">
                  <Card className="bg-muted/50">
                    <CardContent className="pt-4 text-center">
                      <div className="text-2xl font-bold">{currentVerification?.totalMaterials || 0}</div>
                      <div className="text-sm text-muted-foreground">Total Materials</div>
                    </CardContent>
                  </Card>
                  <Card className="bg-green-500/10 border-green-500/30">
                    <CardContent className="pt-4 text-center">
                      <div className="text-2xl font-bold text-green-600">
                        {currentVerification?.materialsWithinLimits || 0}
                      </div>
                      <div className="text-sm text-muted-foreground">Within Limits</div>
                    </CardContent>
                  </Card>
                  <Card className="bg-destructive/10 border-destructive/30">
                    <CardContent className="pt-4 text-center">
                      <div className="text-2xl font-bold text-destructive">
                        {currentVerification?.materialsOutOfLimits || 0}
                      </div>
                      <div className="text-sm text-muted-foreground">Out of Limits</div>
                    </CardContent>
                  </Card>
                </div>

                <ScrollArea className="h-80">
                  <div className="space-y-2">
                    {currentResults?.map((result: any, index: number) => (
                      <div
                        key={result.id || index}
                        className={`p-4 rounded-lg border ${
                          result.withinLimits === false
                            ? "border-red-500 bg-red-100 dark:bg-red-950/50"
                            : result.withinLimits === true
                            ? "border-green-500/30 bg-green-500/5"
                            : "bg-muted/30"
                        }`}
                        data-testid={`result-${result.materialCode}`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex-1 min-w-0">
                            <div className="font-medium">{result.materialCode}</div>
                            <div className="text-sm text-muted-foreground">{result.materialName}</div>
                          </div>
                          {getResultBadge(result.withinLimits)}
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="text-muted-foreground">Limit Range:</span>{" "}
                            <span className="font-medium">{result.limitRange || result.bomQuantity || "-"}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Actual:</span>{" "}
                            <span className="font-medium">{result.actualDisplay || result.actualQuantity || "-"}</span>
                          </div>
                        </div>
                        {result.notes && (
                          <div className="mt-2 text-sm text-muted-foreground flex items-start gap-1">
                            <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                            {result.notes}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">How It Works</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
            <li>Upload a PDF containing <strong>two pages</strong>: one with material limits (ranges) and one with actual values</li>
            <li>The system automatically identifies which page contains limits and which contains verification data</li>
            <li>Material limits are extracted (min/max ranges or target values with tolerance)</li>
            <li>Actual values are matched to materials and compared against the limits</li>
            <li>Results show which materials are within or outside their approved ranges</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
