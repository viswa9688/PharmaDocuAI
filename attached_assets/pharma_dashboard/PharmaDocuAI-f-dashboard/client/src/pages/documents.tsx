import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { DocumentList } from "@/components/document-list";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Trash2 } from "lucide-react";
import type { Document } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
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

export default function Documents() {
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Delete confirmation state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [documentToDelete, setDocumentToDelete] = useState<Document | null>(null);
  
  // Delete all confirmation state
  const [deleteAllDialogOpen, setDeleteAllDialogOpen] = useState(false);
  const [deleteAllConfirmText, setDeleteAllConfirmText] = useState("");

  const { data: documents = [], isLoading } = useQuery<Document[]>({
    queryKey: ["/api/documents"],
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/documents/${id}`),
    onSuccess: () => {
      toast({
        title: "Document deleted",
        description: "The document has been removed",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to delete document",
      });
    },
  });

  const deleteAllMutation = useMutation({
    mutationFn: async () => {
      const totalCount = documents.length;
      let successCount = 0;
      let failedCount = 0;
      
      // Delete documents one by one, tracking success/failure
      for (const doc of documents) {
        try {
          await apiRequest("DELETE", `/api/documents/${doc.id}`);
          successCount++;
        } catch {
          failedCount++;
        }
      }
      
      // Refresh the document list to reflect what remains
      await queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      
      return { totalCount, successCount, failedCount };
    },
    onSuccess: (result) => {
      if (result.failedCount === 0) {
        toast({
          title: "All documents deleted",
          description: `${result.successCount} documents have been removed`,
        });
        setDeleteAllDialogOpen(false);
        setDeleteAllConfirmText("");
      } else if (result.successCount > 0) {
        toast({
          variant: "destructive",
          title: "Partial deletion",
          description: `Deleted ${result.successCount} documents. ${result.failedCount} failed to delete.`,
        });
        // Keep dialog open so user can retry
      } else {
        toast({
          variant: "destructive",
          title: "Deletion failed",
          description: `Failed to delete ${result.failedCount} documents`,
        });
        // Keep dialog open so user can retry
      }
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to delete documents",
      });
      // Keep dialog open so user can retry - don't clear confirmation text
    },
  });

  const downloadMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/documents/${id}/export`, {
        method: "GET",
      });
      
      if (!response.ok) {
        throw new Error("Export failed");
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `document-${id}-export.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    },
    onSuccess: () => {
      toast({
        title: "Export complete",
        description: "Document data has been downloaded",
      });
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Export failed",
        description: "There was an error exporting the document",
      });
    },
  });

  const filteredDocuments = documents.filter((doc) =>
    doc.filename.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleView = (doc: Document) => {
    setLocation(`/documents/${doc.id}`);
  };

  const handleDownload = (doc: Document) => {
    downloadMutation.mutate(doc.id);
  };

  const handleDelete = (doc: Document) => {
    setDocumentToDelete(doc);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (documentToDelete) {
      deleteMutation.mutate(documentToDelete.id);
    }
    setDeleteDialogOpen(false);
    setDocumentToDelete(null);
  };

  const handleDeleteAll = () => {
    if (deleteAllConfirmText === "DELETE ALL") {
      deleteAllMutation.mutate();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold mb-2">Document Library</h1>
          <p className="text-muted-foreground">
            Browse and manage your processed batch records
          </p>
        </div>
        {documents.length > 0 && (
          <Button
            variant="outline"
            className="text-destructive border-destructive hover:bg-destructive hover:text-destructive-foreground"
            onClick={() => setDeleteAllDialogOpen(true)}
            data-testid="button-delete-all"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete All ({documents.length})
          </Button>
        )}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search documents..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
          data-testid="input-search"
        />
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">
          Loading documents...
        </div>
      ) : (
        <DocumentList
          documents={filteredDocuments}
          onView={handleView}
          onDownload={handleDownload}
          onDelete={handleDelete}
        />
      )}

      {/* Individual Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Document</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{documentToDelete?.filename}"? 
              This will permanently remove the document and all associated data including 
              pages, quality issues, and processing events. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete All Confirmation Dialog */}
      <AlertDialog open={deleteAllDialogOpen} onOpenChange={(open) => {
        setDeleteAllDialogOpen(open);
        if (!open) setDeleteAllConfirmText("");
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">Delete All Documents</AlertDialogTitle>
            <AlertDialogDescription className="space-y-4">
              <p>
                This will permanently delete <strong>{documents.length} documents</strong> and 
                all associated data including pages, quality issues, and processing events.
              </p>
              <p className="font-semibold text-destructive">
                This action cannot be undone!
              </p>
              <div className="pt-2">
                <label className="text-sm text-muted-foreground block mb-2">
                  Type <span className="font-mono font-bold">DELETE ALL</span> to confirm:
                </label>
                <Input
                  value={deleteAllConfirmText}
                  onChange={(e) => setDeleteAllConfirmText(e.target.value)}
                  placeholder="DELETE ALL"
                  className="font-mono"
                  data-testid="input-confirm-delete-all"
                />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-all">Cancel</AlertDialogCancel>
            <Button
              onClick={handleDeleteAll}
              disabled={deleteAllConfirmText !== "DELETE ALL" || deleteAllMutation.isPending}
              variant="destructive"
              data-testid="button-confirm-delete-all"
            >
              {deleteAllMutation.isPending ? "Deleting..." : "Delete All Documents"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
