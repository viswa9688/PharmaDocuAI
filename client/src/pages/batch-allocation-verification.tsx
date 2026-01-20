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
  Calendar, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  Clock,
  FileText,
  Loader2,
  Trash2,
  ChevronRight,
  Package,
  Timer
} from "lucide-react";
import type { BatchAllocationVerification } from "@shared/schema";

type UploadResult = {
  verificationId: string;
  status: string;
  batchNumber: string | null;
  mpcNumber: string | null;
  bmrNumber: string | null;
  manufacturingDate: string | null;
  expiryDate: string | null;
  shelfLifeMonths: number | null;
  shelfLifeCalculated: number | null;
  isCompliant: boolean | null;
  datesMatch: boolean | null;
  qaOfficer: string | null;
  verificationDate: string | null;
  rawMaterials: Array<{
    materialCode: string;
    materialName: string;
    bomQuantity: string;
    approvedLimits: string;
  }>;
  totalPages: number;
};

export default function BatchAllocationVerificationPage() {
  const { toast } = useToast();
  const [isUploading, setIsUploading] = useState(false);
  const [selectedVerificationId, setSelectedVerificationId] = useState<string | null>(null);
  const [latestResult, setLatestResult] = useState<UploadResult | null>(null);

  const { data: verifications = [], isLoading: loadingVerifications } = useQuery<BatchAllocationVerification[]>({
    queryKey: ["/api/batch-allocation/verifications"],
    refetchInterval: 3000,
  });

  const { data: selectedVerification, isLoading: loadingVerification } = useQuery<BatchAllocationVerification>({
    queryKey: ["/api/batch-allocation/verifications", selectedVerificationId],
    enabled: !!selectedVerificationId && !latestResult,
  });

  const deleteVerificationMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/batch-allocation/verifications/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/batch-allocation/verifications"] });
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
      const response = await fetch("/api/batch-allocation/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Upload failed");
      }

      const result: UploadResult = await response.json();
      queryClient.invalidateQueries({ queryKey: ["/api/batch-allocation/verifications"] });
      setSelectedVerificationId(result.verificationId);
      setLatestResult(result);
      toast({ 
        title: "Verification complete", 
        description: result.isCompliant 
          ? "Batch allocation is compliant" 
          : "Issues found in batch allocation"
      });
    } catch (error: any) {
      toast({ title: "Verification failed", description: error.message, variant: "destructive" });
    } finally {
      setIsUploading(false);
      e.target.value = "";
    }
  };

  const displayData = latestResult || (selectedVerification ? {
    verificationId: selectedVerification.id,
    status: selectedVerification.status,
    batchNumber: selectedVerification.batchNumber,
    mpcNumber: selectedVerification.mpcNumber,
    bmrNumber: selectedVerification.bmrNumber,
    manufacturingDate: selectedVerification.manufacturingDate,
    expiryDate: selectedVerification.expiryDate,
    shelfLifeMonths: selectedVerification.shelfLifeMonths,
    shelfLifeCalculated: selectedVerification.shelfLifeCalculated,
    isCompliant: selectedVerification.isCompliant,
    datesMatch: selectedVerification.datesMatch,
    qaOfficer: selectedVerification.qaOfficer,
    verificationDate: selectedVerification.verificationDate,
    rawMaterials: (selectedVerification.extractedData as any)?.rawMaterials || [],
    totalPages: (selectedVerification.extractedData as any)?.totalPages || 0,
  } : null);

  const formatDate = (date: Date | string | null) => {
    if (!date) return "-";
    const d = new Date(date);
    return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="flex gap-6 h-full" data-testid="batch-allocation-verification-page">
      <div className="w-80 flex-shrink-0">
        <Card className="h-full flex flex-col">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Batch Allocation
            </CardTitle>
            <CardDescription>
              Verify Mfg/Exp dates and shelf life
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col gap-4 overflow-hidden">
            <div>
              <input
                type="file"
                accept=".pdf"
                onChange={handleFileUpload}
                className="hidden"
                id="batch-allocation-upload"
                disabled={isUploading}
                data-testid="input-batch-allocation-upload"
              />
              <label htmlFor="batch-allocation-upload">
                <Button asChild disabled={isUploading} className="w-full" data-testid="button-upload-batch-allocation">
                  <span>
                    {isUploading ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Processing...</>
                    ) : (
                      <><Upload className="h-4 w-4 mr-2" /> Upload PDF</>
                    )}
                  </span>
                </Button>
              </label>
            </div>

            <Separator />

            <div className="flex-1 overflow-hidden">
              <h4 className="text-sm font-medium mb-2">Previous Verifications</h4>
              {loadingVerifications ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : verifications.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No verifications yet
                </p>
              ) : (
                <ScrollArea className="h-[calc(100vh-400px)]">
                  <div className="space-y-2 pr-4">
                    {verifications.map((v) => (
                      <div
                        key={v.id}
                        className={`p-3 border rounded-lg cursor-pointer transition-colors hover-elevate ${
                          selectedVerificationId === v.id ? "border-primary bg-accent/50" : ""
                        }`}
                        onClick={() => {
                          setSelectedVerificationId(v.id);
                          setLatestResult(null);
                        }}
                        data-testid={`card-verification-${v.id}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{v.filename}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatDate(v.uploadedAt)}
                            </p>
                            {v.batchNumber && (
                              <p className="text-xs text-muted-foreground">
                                Batch: {v.batchNumber}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            {v.status === "completed" && (
                              v.isCompliant === true ? (
                                <Badge variant="default" className="bg-green-600">
                                  <CheckCircle2 className="h-3 w-3 mr-1" />
                                  Compliant
                                </Badge>
                              ) : v.isCompliant === false ? (
                                <Badge variant="destructive">
                                  <XCircle className="h-3 w-3 mr-1" />
                                  Non-Compliant
                                </Badge>
                              ) : (
                                <Badge variant="secondary">Unknown</Badge>
                              )
                            )}
                            {v.status === "processing" && (
                              <Badge variant="secondary">
                                <Clock className="h-3 w-3 mr-1" />
                                Processing
                              </Badge>
                            )}
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteVerificationMutation.mutate(v.id);
                              }}
                              data-testid={`button-delete-${v.id}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="flex-1 overflow-hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Verification Results
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-auto h-[calc(100%-80px)]">
          {loadingVerification ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : displayData ? (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 border rounded-lg">
                  <h4 className="text-sm font-medium text-muted-foreground mb-1">Batch Number</h4>
                  <p className="text-lg font-semibold">{displayData.batchNumber || "-"}</p>
                </div>
                <div className="p-4 border rounded-lg">
                  <h4 className="text-sm font-medium text-muted-foreground mb-1">BMR Number</h4>
                  <p className="text-lg font-semibold">{displayData.bmrNumber || "-"}</p>
                </div>
              </div>

              <Separator />

              <div>
                <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Date Verification
                </h4>
                <div className="grid grid-cols-3 gap-4">
                  <div className="p-4 border rounded-lg">
                    <h5 className="text-xs font-medium text-muted-foreground mb-1">Manufacturing Date</h5>
                    <p className="text-base font-semibold">{displayData.manufacturingDate || "Not Found"}</p>
                  </div>
                  <div className="p-4 border rounded-lg">
                    <h5 className="text-xs font-medium text-muted-foreground mb-1">Expiry Date</h5>
                    <p className="text-base font-semibold">{displayData.expiryDate || "Not Found"}</p>
                  </div>
                  <div className="p-4 border rounded-lg">
                    <h5 className="text-xs font-medium text-muted-foreground mb-1">Calculated Shelf Life</h5>
                    <p className="text-base font-semibold flex items-center gap-2">
                      <Timer className="h-4 w-4" />
                      {displayData.shelfLifeCalculated 
                        ? `${displayData.shelfLifeCalculated} months` 
                        : "Unable to calculate"}
                    </p>
                  </div>
                </div>
              </div>

              <Separator />

              <div>
                <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  Compliance Status
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className={`p-4 border rounded-lg ${
                    displayData.isCompliant === true ? "bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800" :
                    displayData.isCompliant === false ? "bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-800" :
                    ""
                  }`}>
                    <h5 className="text-xs font-medium text-muted-foreground mb-1">Overall Compliance</h5>
                    <div className="flex items-center gap-2">
                      {displayData.isCompliant === true ? (
                        <>
                          <CheckCircle2 className="h-5 w-5 text-green-600" />
                          <span className="text-base font-semibold text-green-700 dark:text-green-400">Compliant</span>
                        </>
                      ) : displayData.isCompliant === false ? (
                        <>
                          <XCircle className="h-5 w-5 text-red-600" />
                          <span className="text-base font-semibold text-red-700 dark:text-red-400">Non-Compliant</span>
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="h-5 w-5 text-yellow-600" />
                          <span className="text-base font-semibold text-yellow-700 dark:text-yellow-400">Not Determined</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className={`p-4 border rounded-lg ${
                    displayData.datesMatch === true ? "bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800" :
                    displayData.datesMatch === false ? "bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-800" :
                    ""
                  }`}>
                    <h5 className="text-xs font-medium text-muted-foreground mb-1">Dates Match</h5>
                    <div className="flex items-center gap-2">
                      {displayData.datesMatch === true ? (
                        <>
                          <CheckCircle2 className="h-5 w-5 text-green-600" />
                          <span className="text-base font-semibold text-green-700 dark:text-green-400">Valid Shelf Life</span>
                        </>
                      ) : displayData.datesMatch === false ? (
                        <>
                          <XCircle className="h-5 w-5 text-red-600" />
                          <span className="text-base font-semibold text-red-700 dark:text-red-400">Dates Mismatch</span>
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="h-5 w-5 text-yellow-600" />
                          <span className="text-base font-semibold text-yellow-700 dark:text-yellow-400">Not Verified</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {displayData.qaOfficer && (
                <>
                  <Separator />
                  <div className="p-4 border rounded-lg">
                    <h4 className="text-sm font-medium text-muted-foreground mb-1">Verified By</h4>
                    <p className="text-base">{displayData.qaOfficer}</p>
                    {displayData.verificationDate && (
                      <p className="text-sm text-muted-foreground mt-1">Date: {displayData.verificationDate}</p>
                    )}
                  </div>
                </>
              )}

              {displayData.rawMaterials && displayData.rawMaterials.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <h4 className="text-sm font-medium mb-3">Extracted Materials ({displayData.rawMaterials.length})</h4>
                    <div className="space-y-2">
                      {displayData.rawMaterials.map((material: { materialCode: string; materialName: string; bomQuantity: string; approvedLimits: string }, idx: number) => (
                        <div key={idx} className="p-3 border rounded-lg flex items-center gap-4">
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          <div className="flex-1 grid grid-cols-4 gap-4">
                            <div>
                              <span className="text-xs text-muted-foreground">Code</span>
                              <p className="text-sm font-medium">{material.materialCode}</p>
                            </div>
                            <div>
                              <span className="text-xs text-muted-foreground">Name</span>
                              <p className="text-sm">{material.materialName || "-"}</p>
                            </div>
                            <div>
                              <span className="text-xs text-muted-foreground">BOM Qty</span>
                              <p className="text-sm">{material.bomQuantity || "-"}</p>
                            </div>
                            <div>
                              <span className="text-xs text-muted-foreground">Limits</span>
                              <p className="text-sm">{material.approvedLimits || "-"}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No Verification Selected</h3>
              <p className="text-sm text-muted-foreground max-w-md">
                Upload a Batch Allocation Log PDF to verify manufacturing and expiry dates, 
                calculate shelf life, and check compliance status.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
