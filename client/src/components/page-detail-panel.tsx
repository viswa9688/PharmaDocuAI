import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ClassificationBadge } from "./classification-badge";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import type { Page } from "@shared/schema";

interface PageDetailPanelProps {
  page: Page | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PageDetailPanel({ page, open, onOpenChange }: PageDetailPanelProps) {
  if (!page) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl">
        <SheetHeader>
          <SheetTitle data-testid="text-page-title">
            Page {page.pageNumber} Details
          </SheetTitle>
          <SheetDescription>
            Classification results and extracted content
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-8rem)] mt-6 pr-4">
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-medium mb-2">Classification</h3>
              <ClassificationBadge
                classification={page.classification as any}
                confidence={page.confidence}
              />
            </div>

            <Separator />

            <div>
              <h3 className="text-sm font-medium mb-2">Confidence Score</h3>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${page.confidence}%` }}
                  />
                </div>
                <span className="text-sm font-mono font-medium" data-testid="text-confidence-score">
                  {page.confidence}%
                </span>
              </div>
            </div>

            {page.issues && page.issues.length > 0 && (
              <>
                <Separator />
                <div>
                  <h3 className="text-sm font-medium mb-2">Issues Detected</h3>
                  <div className="space-y-2">
                    {page.issues.map((issue, idx) => (
                      <Badge
                        key={idx}
                        variant="destructive"
                        className="block w-full text-left"
                        data-testid={`badge-issue-${idx}`}
                      >
                        {issue}
                      </Badge>
                    ))}
                  </div>
                </div>
              </>
            )}

            {page.extractedText && (
              <>
                <Separator />
                <div>
                  <h3 className="text-sm font-medium mb-2">Extracted Text</h3>
                  <div className="bg-muted p-4 rounded-md">
                    <pre className="text-xs whitespace-pre-wrap font-mono" data-testid="text-extracted">
                      {page.extractedText}
                    </pre>
                  </div>
                </div>
              </>
            )}

            {page.metadata && Object.keys(page.metadata).length > 0 && (
              <>
                <Separator />
                <div>
                  <h3 className="text-sm font-medium mb-2">Metadata</h3>
                  <div className="space-y-2">
                    {Object.entries(page.metadata).map(([key, value]) => (
                      <div key={key} className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{key}:</span>
                        <span className="font-mono">{String(value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
