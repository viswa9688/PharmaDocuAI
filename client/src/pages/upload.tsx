import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { UploadZone } from "@/components/upload-zone";
import { ProcessingStatus } from "@/components/processing-status";
import { DocumentStats } from "@/components/document-stats";
import { useToast } from "@/hooks/use-toast";
import type { ProcessingStatus as ProcessingStatusType, Document } from "@shared/schema";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CheckCircle } from "lucide-react";

export default function Upload() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [currentProcessing, setCurrentProcessing] = useState<ProcessingStatusType | null>(null);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [completedDocId, setCompletedDocId] = useState<string | null>(null);

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      
      const response = await fetch("/api/documents/upload", {
        method: "POST",
        body: formData,
      });
      
      if (!response.ok) {
        throw new Error("Upload failed");
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Upload successful",
        description: "Your document is being processed",
      });
      
      setCurrentProcessing({
        documentId: data.id,
        status: "processing",
        currentPage: 0,
        totalPages: data.totalPages || 0,
        message: "Processing started...",
      });
      
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Upload failed",
        description: "There was an error uploading your document",
      });
    },
  });

  // Poll for document status updates
  const { data: documentData } = useQuery<Document>({
    queryKey: ["/api/documents", currentProcessing?.documentId],
    enabled: !!currentProcessing?.documentId && currentProcessing?.status === "processing",
    refetchInterval: 2000, // Poll every 2 seconds
  });

  // Watch for completion
  useEffect(() => {
    if (documentData && currentProcessing) {
      if (documentData.status === "completed") {
        setCurrentProcessing({
          ...currentProcessing,
          status: "completed",
          currentPage: documentData.processedPages || 0,
          message: "Processing completed!",
        });
        setCompletedDocId(documentData.id);
        setShowSuccessDialog(true);
      } else if (documentData.status === "failed") {
        setCurrentProcessing({
          ...currentProcessing,
          status: "failed",
          message: documentData.errorMessage || "Processing failed",
        });
        toast({
          variant: "destructive",
          title: "Processing failed",
          description: documentData.errorMessage || "An error occurred during processing",
        });
      } else if (documentData.status === "processing") {
        setCurrentProcessing({
          ...currentProcessing,
          status: "processing",
          currentPage: documentData.processedPages || 0,
          totalPages: documentData.totalPages || 0,
        });
      }
    }
  }, [documentData, currentProcessing, toast]);

  const handleUpload = async (file: File) => {
    await uploadMutation.mutateAsync(file);
  };

  const handleViewDocument = () => {
    if (completedDocId) {
      setLocation(`/documents/${completedDocId}`);
    }
  };

  const handleGoToLibrary = () => {
    setLocation("/documents");
  };

  return (
    <>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold mb-2">Upload Batch Record</h1>
          <p className="text-muted-foreground">
            Upload scanned batch record PDFs for automated processing and classification
          </p>
        </div>

        <UploadZone onUpload={handleUpload} />

        {currentProcessing && (
          <ProcessingStatus status={currentProcessing} />
        )}

        <div>
          <h2 className="text-lg font-medium mb-4">Recent Activity</h2>
          <DocumentStats
            totalPages={0}
            classifiedPages={0}
            issueCount={0}
            avgConfidence={0}
          />
        </div>
      </div>

      <AlertDialog open={showSuccessDialog} onOpenChange={setShowSuccessDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="flex items-center justify-center mb-4">
              <div className="rounded-full bg-primary/10 p-3">
                <CheckCircle className="h-8 w-8 text-primary" />
              </div>
            </div>
            <AlertDialogTitle className="text-center">
              Processing Complete!
            </AlertDialogTitle>
            <AlertDialogDescription className="text-center">
              Your batch record has been successfully processed and classified.
              {documentData?.totalPages && (
                <span className="block mt-2 font-medium">
                  {documentData.totalPages} pages analyzed
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2 sm:justify-center">
            <AlertDialogAction
              onClick={handleViewDocument}
              data-testid="button-view-document"
            >
              View Document
            </AlertDialogAction>
            <AlertDialogCancel
              onClick={handleGoToLibrary}
              data-testid="button-go-to-library"
              className="mt-0"
            >
              Go to Document Library
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
