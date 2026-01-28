import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { 
  Upload, 
  FileCheck, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  Clock,
  FileText,
  Loader2,
  Trash2,
  ChevronRight
} from "lucide-react";
import type { BMRVerification, BMRDiscrepancy } from "@shared/schema";

type VerificationResult = {
  verification: BMRVerification;
  discrepancies: BMRDiscrepancy[];
  matchedFields: string[];
  totalFieldsCompared: number;
};

export default function BMRVerificationPage() {
  const { toast } = useToast();
  const [selectedVerificationId, setSelectedVerificationId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const { data: verifications = [], isLoading: loadingVerifications } = useQuery<BMRVerification[]>({
    queryKey: ["/api/bmr-verification"],
    refetchInterval: 3000,
  });

  const { data: selectedResult, isLoading: loadingResult } = useQuery<VerificationResult>({
    queryKey: ["/api/bmr-verification", selectedVerificationId, "result"],
    enabled: !!selectedVerificationId,
    staleTime: 0,
    refetchInterval: (query) => {
      const status = query.state.data?.verification?.status;
      return status === "processing" || status === "pending" ? 2000 : false;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/bmr-verification/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bmr-verification"] });
      if (selectedVerificationId) {
        setSelectedVerificationId(null);
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
    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("/api/bmr-verification/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Upload failed");
      }

      const verification = await response.json();
      queryClient.invalidateQueries({ queryKey: ["/api/bmr-verification"] });
      setSelectedVerificationId(verification.id);
      toast({ title: "Upload successful", description: "Verification in progress..." });
    } catch (error: any) {
      toast({ title: "Upload failed", description: error.message, variant: "destructive" });
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

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case "critical":
        return <Badge variant="destructive">Critical</Badge>;
      case "major":
        return <Badge className="bg-orange-500">Major</Badge>;
      case "minor":
        return <Badge variant="secondary">Minor</Badge>;
      default:
        return <Badge variant="outline">{severity}</Badge>;
    }
  };

  const formatFieldName = (fieldName: string) => {
    return fieldName.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">BMR Verification</h1>
          <p className="text-muted-foreground">
            Verify Batch Manufacturing Records against Master Product Cards
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
            <CardDescription>Previously uploaded documents</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingVerifications ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : verifications.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No verifications yet</p>
                <p className="text-sm">Upload a PDF to start</p>
              </div>
            ) : (
              <ScrollArea className="h-[400px]">
                <div className="space-y-2">
                  {verifications.map((v) => (
                    <div
                      key={v.id}
                      className={`p-3 rounded-lg border cursor-pointer transition-colors hover-elevate ${
                        selectedVerificationId === v.id ? "border-primary bg-muted" : ""
                      }`}
                      onClick={() => setSelectedVerificationId(v.id)}
                      data-testid={`verification-item-${v.id}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate text-sm">{v.filename}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(v.uploadedAt).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {getStatusBadge(v.status)}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteMutation.mutate(v.id);
                            }}
                            data-testid={`button-delete-${v.id}`}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      {v.status === "completed" && (
                        <div className="mt-2 flex items-center gap-2 text-xs">
                          {v.totalDiscrepancies === 0 ? (
                            <span className="text-green-600 flex items-center gap-1">
                              <CheckCircle2 className="h-3 w-3" /> All fields match
                            </span>
                          ) : (
                            <span className="text-orange-600 flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3" /> {v.totalDiscrepancies} discrepancies
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <FileCheck className="h-5 w-5" />
              Verification Results
            </CardTitle>
            <CardDescription>
              Comparison between Master Product Card and Batch Manufacturing Record
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!selectedVerificationId ? (
              <div className="text-center py-12 text-muted-foreground">
                <FileCheck className="h-16 w-16 mx-auto mb-4 opacity-30" />
                <p>Select a verification to view results</p>
                <p className="text-sm">or upload a new PDF to begin</p>
              </div>
            ) : loadingResult ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : selectedResult ? (
              <div className="space-y-6">
                {selectedResult.verification.status === "processing" && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Processing document...
                    </div>
                    <Progress value={50} className="h-2" />
                  </div>
                )}

                {selectedResult.verification.status === "failed" && (
                  <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20">
                    <div className="flex items-center gap-2 text-destructive">
                      <XCircle className="h-5 w-5" />
                      <span className="font-medium">Verification Failed</span>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {selectedResult.verification.errorMessage || "An unknown error occurred"}
                    </p>
                  </div>
                )}

                {selectedResult.verification.status === "completed" && (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <Card>
                        <CardContent className="pt-4">
                          <div className="text-center">
                            <div className="text-3xl font-bold text-green-600">
                              {selectedResult.matchedFields.length}
                            </div>
                            <div className="text-sm text-muted-foreground">Fields Matched</div>
                          </div>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="pt-4">
                          <div className="text-center">
                            <div className="text-3xl font-bold text-orange-600">
                              {selectedResult.discrepancies.length}
                            </div>
                            <div className="text-sm text-muted-foreground">Discrepancies Found</div>
                          </div>
                        </CardContent>
                      </Card>
                    </div>

                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <FileText className="h-4 w-4" />
                        MPC Page: {selectedResult.verification.masterProductCardPage || "N/A"}
                      </div>
                      <div className="flex items-center gap-1">
                        <FileText className="h-4 w-4" />
                        BMR Page: {selectedResult.verification.bmrPage || "N/A"}
                      </div>
                    </div>

                    <Separator />

                    {selectedResult.discrepancies.length > 0 && (
                      <div className="space-y-3">
                        <h3 className="font-semibold flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4 text-orange-500" />
                          Discrepancies
                        </h3>
                        <div className="space-y-2">
                          {selectedResult.discrepancies.map((d, idx) => (
                            <div key={d.id || idx} className={`p-3 rounded-lg border ${
                              d.severity === "critical" 
                                ? "border-red-500 bg-red-100 dark:bg-red-950/50" 
                                : d.severity === "major"
                                ? "border-orange-500 bg-orange-100 dark:bg-orange-950/50"
                                : "border-yellow-500 bg-yellow-50 dark:bg-yellow-950/30"
                            }`}>
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="font-medium">{formatFieldName(d.fieldName)}</span>
                                    {getSeverityBadge(d.severity)}
                                  </div>
                                  <p className="text-sm text-muted-foreground">{d.description}</p>
                                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                                    <div className="p-2 rounded bg-muted">
                                      <span className="text-muted-foreground">MPC: </span>
                                      <span className="font-mono">{d.mpcValue || "—"}</span>
                                    </div>
                                    <div className="p-2 rounded bg-muted">
                                      <span className="text-muted-foreground">BMR: </span>
                                      <span className="font-mono">{d.bmrValue || "—"}</span>
                                    </div>
                                  </div>
                                </div>
                                <ChevronRight className="h-4 w-4 text-muted-foreground mt-1" />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {selectedResult.matchedFields.length > 0 && (
                      <div className="space-y-3">
                        <h3 className="font-semibold flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                          Matched Fields
                        </h3>
                        <div className="flex flex-wrap gap-2">
                          {selectedResult.matchedFields.map((field) => (
                            <Badge key={field} variant="outline" className="gap-1">
                              <CheckCircle2 className="h-3 w-3 text-green-500" />
                              {formatFieldName(field)}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
