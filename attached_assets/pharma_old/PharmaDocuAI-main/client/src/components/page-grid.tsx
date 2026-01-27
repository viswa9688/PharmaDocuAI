import { Card } from "@/components/ui/card";
import { ClassificationBadge } from "./classification-badge";
import { FileQuestion } from "lucide-react";
import type { Page } from "@shared/schema";

interface PageGridProps {
  pages: Page[];
  onPageClick?: (page: Page) => void;
  selectedPageId?: string;
}

export function PageGrid({ pages, onPageClick, selectedPageId }: PageGridProps) {
  if (pages.length === 0) {
    return (
      <Card className="p-12">
        <div className="text-center text-muted-foreground">
          <FileQuestion className="h-12 w-12 mx-auto mb-4" />
          <p>No pages to display</p>
        </div>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
      {pages.map((page) => (
        <Card
          key={page.id}
          className={`p-3 cursor-pointer transition-all hover-elevate ${
            selectedPageId === page.id ? "ring-2 ring-primary" : ""
          }`}
          onClick={() => onPageClick?.(page)}
          data-testid={`card-page-${page.pageNumber}`}
        >
          <div className="aspect-[8.5/11] bg-muted rounded mb-2 flex items-center justify-center">
            <FileText className="h-8 w-8 text-muted-foreground" />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-medium" data-testid={`text-page-number-${page.pageNumber}`}>
                Page {page.pageNumber}
              </span>
              <span className="text-xs text-muted-foreground" data-testid={`text-confidence-${page.pageNumber}`}>
                {page.confidence}%
              </span>
            </div>
            <ClassificationBadge
              classification={page.classification as any}
            />
            {page.issues && page.issues.length > 0 && (
              <div className="text-xs text-destructive flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                {page.issues.length} issue{page.issues.length > 1 ? "s" : ""}
              </div>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}

import { FileText, AlertTriangle } from "lucide-react";
