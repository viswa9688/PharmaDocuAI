import { useState } from "react";
import { UploadZone } from "@/components/upload-zone";
import { ProcessingStatus } from "@/components/processing-status";
import { DocumentStats } from "@/components/document-stats";
import { useToast } from "@/hooks/use-toast";
import type { ProcessingStatus as ProcessingStatusType } from "@shared/schema";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export default function Upload() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [currentProcessing, setCurrentProcessing] = useState<ProcessingStatusType | null>(null);

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

  const handleUpload = async (file: File) => {
    await uploadMutation.mutateAsync(file);
  };

  return (
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
  );
}
