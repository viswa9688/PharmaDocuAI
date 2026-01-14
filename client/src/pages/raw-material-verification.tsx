import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  ChevronRight,
  Database,
  BarChart3
} from "lucide-react";
import type { RawMaterialVerification, RawMaterialLimit, RawMaterialResult } from "@shared/schema";

type VerificationWithResults = {
  verification: RawMaterialVerification;
  results: RawMaterialResult[];
};

export default function RawMaterialVerificationPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"limits" | "verify">("limits");
  const [mpcNumber, setMpcNumber] = useState("");
  const [productName, setProductName] = useState("");
  const [bmrNumber, setBmrNumber] = useState("");
  const [selectedMpc, setSelectedMpc] = useState("");
  const [isUploadingLimits, setIsUploadingLimits] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [selectedVerificationId, setSelectedVerificationId] = useState<string | null>(null);

  const { data: allLimits = [], isLoading: loadingLimits } = useQuery<RawMaterialLimit[]>({
    queryKey: ["/api/raw-material/limits"],
  });

  const { data: verifications = [], isLoading: loadingVerifications } = useQuery<RawMaterialVerification[]>({
    queryKey: ["/api/raw-material/verifications"],
    refetchInterval: 3000,
  });

  const { data: selectedResult, isLoading: loadingResult } = useQuery<VerificationWithResults>({
    queryKey: ["/api/raw-material/verifications", selectedVerificationId],
    enabled: !!selectedVerificationId,
    staleTime: 0,
    refetchInterval: (query) => {
      const status = query.state.data?.verification?.status;
      return status === "processing" || status === "pending" ? 2000 : false;
    },
  });

  const uniqueMpcNumbers = Array.from(new Set(allLimits.map(l => l.mpcNumber)));
  const mpcLimits = selectedMpc ? allLimits.filter(l => l.mpcNumber === selectedMpc) : [];

  const deleteLimitsMutation = useMutation({
    mutationFn: async (mpcNum: string) => {
      await apiRequest("DELETE", `/api/raw-material/limits/${encodeURIComponent(mpcNum)}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/raw-material/limits"] });
      setSelectedMpc("");
      toast({ title: "Limits deleted successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error deleting limits", description: error.message, variant: "destructive" });
    },
  });

  const deleteVerificationMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/raw-material/verifications/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/raw-material/verifications"] });
      if (selectedVerificationId) {
        setSelectedVerificationId(null);
      }
      toast({ title: "Verification deleted" });
    },
    onError: (error: Error) => {
      toast({ title: "Error deleting verification", description: error.message, variant: "destructive" });
    },
  });

  const handleLimitsUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!mpcNumber.trim()) {
      toast({ title: "MPC Number required", description: "Please enter an MPC number", variant: "destructive" });
      return;
    }

    if (file.type !== "application/pdf") {
      toast({ title: "Invalid file type", description: "Please upload a PDF file", variant: "destructive" });
      return;
    }

    setIsUploadingLimits(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("mpcNumber", mpcNumber.trim());
    if (productName.trim()) {
      formData.append("productName", productName.trim());
    }

    try {
      const response = await fetch("/api/raw-material/limits/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Upload failed");
      }

      const result = await response.json();
      queryClient.invalidateQueries({ queryKey: ["/api/raw-material/limits"] });
      setSelectedMpc(mpcNumber.trim());
      setMpcNumber("");
      setProductName("");
      toast({ 
        title: "Limits extracted successfully", 
        description: `${result.materialsExtracted} materials extracted from document`
      });
    } catch (error: any) {
      toast({ title: "Upload failed", description: error.message, variant: "destructive" });
    } finally {
      setIsUploadingLimits(false);
      e.target.value = "";
    }
  };

  const handleVerification = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!selectedMpc) {
      toast({ title: "MPC required", description: "Please select an MPC to verify against", variant: "destructive" });
      return;
    }

    if (file.type !== "application/pdf") {
      toast({ title: "Invalid file type", description: "Please upload a PDF file", variant: "destructive" });
      return;
    }

    setIsVerifying(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("mpcNumber", selectedMpc);
    if (bmrNumber.trim()) {
      formData.append("bmrNumber", bmrNumber.trim());
    }

    try {
      const response = await fetch("/api/raw-material/verify", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Verification failed");
      }

      const result = await response.json();
      queryClient.invalidateQueries({ queryKey: ["/api/raw-material/verifications"] });
      setSelectedVerificationId(result.verificationId);
      setBmrNumber("");
      toast({ 
        title: "Verification complete", 
        description: `${result.materialsWithinLimits} within limits, ${result.materialsOutOfLimits} out of limits`
      });
    } catch (error: any) {
      toast({ title: "Verification failed", description: error.message, variant: "destructive" });
    } finally {
      setIsVerifying(false);
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

  const getResultBadge = (withinLimits: boolean | null, criticality: string | null) => {
    if (withinLimits === null) {
      return <Badge variant="outline">Unknown</Badge>;
    }
    if (withinLimits) {
      return <Badge variant="default" className="bg-green-600">Within Limits</Badge>;
    }
    if (criticality === "critical") {
      return <Badge variant="destructive">Out of Limits (Critical)</Badge>;
    }
    return <Badge className="bg-orange-500">Out of Limits</Badge>;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Raw Material Verification</h1>
          <p className="text-muted-foreground">
            Verify batch record quantities against Bill of Materials limits
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "limits" | "verify")}>
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="limits" className="gap-2" data-testid="tab-limits">
            <Database className="h-4 w-4" />
            BoM Limits
          </TabsTrigger>
          <TabsTrigger value="verify" className="gap-2" data-testid="tab-verify">
            <BarChart3 className="h-4 w-4" />
            Verify Batch
          </TabsTrigger>
        </TabsList>

        <TabsContent value="limits" className="space-y-6 mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle className="text-lg">Upload BoM Document</CardTitle>
                <CardDescription>Extract material limits from MPC or BoM</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="mpc-number">MPC Number *</Label>
                  <Input
                    id="mpc-number"
                    value={mpcNumber}
                    onChange={(e) => setMpcNumber(e.target.value)}
                    placeholder="e.g., MPC-2024-001"
                    data-testid="input-mpc-number"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="product-name">Product Name</Label>
                  <Input
                    id="product-name"
                    value={productName}
                    onChange={(e) => setProductName(e.target.value)}
                    placeholder="e.g., Paracetamol 500mg"
                    data-testid="input-product-name"
                  />
                </div>
                <input
                  type="file"
                  id="limits-upload"
                  accept=".pdf"
                  className="hidden"
                  onChange={handleLimitsUpload}
                  disabled={isUploadingLimits}
                  data-testid="input-limits-upload"
                />
                <Button 
                  onClick={() => document.getElementById("limits-upload")?.click()}
                  disabled={isUploadingLimits || !mpcNumber.trim()}
                  className="w-full"
                  data-testid="button-upload-limits"
                >
                  {isUploadingLimits ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4 mr-2" />
                  )}
                  Upload BoM PDF
                </Button>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-lg">Stored Material Limits</CardTitle>
                <CardDescription>
                  {uniqueMpcNumbers.length} MPC records with limits
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loadingLimits ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : uniqueMpcNumbers.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Database className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No material limits stored yet</p>
                    <p className="text-sm">Upload a BoM document to get started</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex flex-wrap gap-2">
                      {uniqueMpcNumbers.map((mpc) => (
                        <Button
                          key={mpc}
                          variant={selectedMpc === mpc ? "default" : "outline"}
                          size="sm"
                          onClick={() => setSelectedMpc(mpc)}
                          data-testid={`button-mpc-${mpc}`}
                        >
                          {mpc}
                          <Badge variant="secondary" className="ml-2">
                            {allLimits.filter(l => l.mpcNumber === mpc).length}
                          </Badge>
                        </Button>
                      ))}
                    </div>

                    {selectedMpc && (
                      <>
                        <div className="flex items-center justify-between">
                          <h3 className="font-medium">{selectedMpc} - Materials</h3>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteLimitsMutation.mutate(selectedMpc)}
                            disabled={deleteLimitsMutation.isPending}
                            data-testid="button-delete-limits"
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                        <ScrollArea className="h-64">
                          <div className="space-y-2">
                            {mpcLimits.map((limit) => (
                              <div
                                key={limit.id}
                                className="flex items-center justify-between p-3 rounded-lg border bg-card"
                                data-testid={`limit-${limit.materialCode}`}
                              >
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium truncate">{limit.materialCode}</div>
                                  <div className="text-sm text-muted-foreground truncate">
                                    {limit.materialName}
                                  </div>
                                </div>
                                <div className="text-right ml-4">
                                  <div className="font-medium">
                                    {limit.bomQuantity || "-"}
                                  </div>
                                  <div className="text-sm text-muted-foreground">
                                    {limit.toleranceDisplay || (limit.tolerancePercent ? `±${limit.tolerancePercent}%` : "No tolerance")}
                                  </div>
                                </div>
                                <Badge 
                                  variant={limit.criticality === "critical" ? "destructive" : "secondary"}
                                  className="ml-2"
                                >
                                  {limit.criticality}
                                </Badge>
                              </div>
                            ))}
                          </div>
                        </ScrollArea>
                      </>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="verify" className="space-y-6 mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle className="text-lg">Verify Batch Record</CardTitle>
                <CardDescription>Compare against stored BoM limits</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Select MPC *</Label>
                  {uniqueMpcNumbers.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No limits stored. Upload a BoM first.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {uniqueMpcNumbers.map((mpc) => (
                        <Button
                          key={mpc}
                          variant={selectedMpc === mpc ? "default" : "outline"}
                          size="sm"
                          onClick={() => setSelectedMpc(mpc)}
                          data-testid={`button-select-mpc-${mpc}`}
                        >
                          {mpc}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bmr-number">BMR Number (optional)</Label>
                  <Input
                    id="bmr-number"
                    value={bmrNumber}
                    onChange={(e) => setBmrNumber(e.target.value)}
                    placeholder="e.g., BMR-2024-001"
                    data-testid="input-bmr-number"
                  />
                </div>
                <input
                  type="file"
                  id="verify-upload"
                  accept=".pdf"
                  className="hidden"
                  onChange={handleVerification}
                  disabled={isVerifying || !selectedMpc}
                  data-testid="input-verify-upload"
                />
                <Button 
                  onClick={() => document.getElementById("verify-upload")?.click()}
                  disabled={isVerifying || !selectedMpc}
                  className="w-full"
                  data-testid="button-verify-batch"
                >
                  {isVerifying ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Scale className="h-4 w-4 mr-2" />
                  )}
                  Verify Batch Record
                </Button>

                <Separator className="my-4" />

                <div>
                  <h3 className="font-medium mb-2">Verification History</h3>
                  {loadingVerifications ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : verifications.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No verifications yet</p>
                  ) : (
                    <ScrollArea className="h-48">
                      <div className="space-y-2">
                        {verifications.map((v) => (
                          <div
                            key={v.id}
                            className={`p-2 rounded-lg border cursor-pointer transition-colors ${
                              selectedVerificationId === v.id ? "border-primary bg-accent" : "hover:bg-accent/50"
                            }`}
                            onClick={() => setSelectedVerificationId(v.id)}
                            data-testid={`verification-${v.id}`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-medium text-sm truncate">{v.filename}</span>
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            </div>
                            <div className="flex items-center gap-2 mt-1">
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
                </div>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">Verification Results</CardTitle>
                    <CardDescription>
                      {selectedResult?.verification
                        ? `${selectedResult.verification.filename} - ${selectedResult.verification.mpcNumber}`
                        : "Select a verification to view results"}
                    </CardDescription>
                  </div>
                  {selectedResult?.verification && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteVerificationMutation.mutate(selectedResult.verification.id)}
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
                    <p className="text-sm">or upload a batch record to verify</p>
                  </div>
                ) : loadingResult ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : selectedResult?.verification.status === "processing" ? (
                  <div className="text-center py-12">
                    <Loader2 className="h-12 w-12 mx-auto mb-4 animate-spin text-primary" />
                    <p className="font-medium">Processing batch record...</p>
                    <p className="text-sm text-muted-foreground">This may take a moment</p>
                  </div>
                ) : selectedResult?.verification.status === "failed" ? (
                  <div className="text-center py-12 text-destructive">
                    <XCircle className="h-12 w-12 mx-auto mb-4" />
                    <p className="font-medium">Verification Failed</p>
                    <p className="text-sm">{selectedResult.verification.errorMessage || "Unknown error"}</p>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-3 gap-4 mb-6">
                      <Card className="bg-muted/50">
                        <CardContent className="pt-4 text-center">
                          <div className="text-2xl font-bold">{selectedResult?.verification.totalMaterials || 0}</div>
                          <div className="text-sm text-muted-foreground">Total Materials</div>
                        </CardContent>
                      </Card>
                      <Card className="bg-green-500/10 border-green-500/30">
                        <CardContent className="pt-4 text-center">
                          <div className="text-2xl font-bold text-green-600">
                            {selectedResult?.verification.materialsWithinLimits || 0}
                          </div>
                          <div className="text-sm text-muted-foreground">Within Limits</div>
                        </CardContent>
                      </Card>
                      <Card className="bg-destructive/10 border-destructive/30">
                        <CardContent className="pt-4 text-center">
                          <div className="text-2xl font-bold text-destructive">
                            {selectedResult?.verification.materialsOutOfLimits || 0}
                          </div>
                          <div className="text-sm text-muted-foreground">Out of Limits</div>
                        </CardContent>
                      </Card>
                    </div>

                    <ScrollArea className="h-80">
                      <div className="space-y-2">
                        {selectedResult?.results.map((result) => (
                          <div
                            key={result.id}
                            className={`p-3 rounded-lg border ${
                              result.withinLimits === false
                                ? result.criticality === "critical"
                                  ? "border-destructive/50 bg-destructive/5"
                                  : "border-orange-500/50 bg-orange-500/5"
                                : result.withinLimits === true
                                ? "border-green-500/30 bg-green-500/5"
                                : "bg-muted/30"
                            }`}
                            data-testid={`result-${result.materialCode}`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex-1 min-w-0">
                                <div className="font-medium">{result.materialCode}</div>
                                <div className="text-sm text-muted-foreground">{result.materialName}</div>
                              </div>
                              {getResultBadge(result.withinLimits, result.criticality)}
                            </div>
                            <div className="grid grid-cols-3 gap-4 mt-2 text-sm">
                              <div>
                                <span className="text-muted-foreground">BoM Qty:</span>{" "}
                                <span className="font-medium">{result.bomQuantity || "-"}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Actual:</span>{" "}
                                <span className="font-medium">{result.actualQuantity || "-"}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Deviation:</span>{" "}
                                <span className={`font-medium ${
                                  result.deviationPercent && Math.abs(Number(result.deviationPercent)) > 5
                                    ? "text-destructive"
                                    : ""
                                }`}>
                                  {result.deviationPercent !== null ? `${result.deviationPercent}%` : "-"}
                                </span>
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
        </TabsContent>
      </Tabs>
    </div>
  );
}
