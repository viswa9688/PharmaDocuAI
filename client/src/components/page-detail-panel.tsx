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
import { Card } from "@/components/ui/card";
import type { Page } from "@shared/schema";
import { useParams } from "wouter";

interface PageDetailPanelProps {
  page: Page | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PageDetailPanel({ page, open, onOpenChange }: PageDetailPanelProps) {
  const params = useParams();
  const documentId = params.id as string;

  if (!page) return null;

  // Use stored image path if available, otherwise construct URL
  const imageUrl = page.imagePath 
    ? `/api/documents/${documentId}/pages/${page.pageNumber}/image`
    : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-6xl p-0">
        <div className="p-6 border-b">
          <SheetHeader>
            <SheetTitle data-testid="text-page-title">
              Page {page.pageNumber} Details
            </SheetTitle>
            <SheetDescription>
              Original scan and extracted data side-by-side
            </SheetDescription>
          </SheetHeader>
        </div>

        <div className="grid grid-cols-2 gap-6 p-6 h-[calc(100vh-10rem)]">
          {/* Left: Page Image */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium">Scanned Page</h3>
            <Card className="overflow-hidden">
              <ScrollArea className="h-[calc(100vh-14rem)]">
                {imageUrl ? (
                  <img
                    src={imageUrl}
                    alt={`Page ${page.pageNumber}`}
                    className="w-full h-auto"
                    data-testid="img-page-scan"
                    onError={(e) => {
                      // Hide broken image and show error message
                      e.currentTarget.style.display = 'none';
                      const errorDiv = e.currentTarget.parentElement?.querySelector('.image-error');
                      if (errorDiv) errorDiv.classList.remove('hidden');
                    }}
                  />
                ) : null}
                <div className={`flex items-center justify-center h-96 text-muted-foreground ${imageUrl ? 'hidden image-error' : ''}`}>
                  {imageUrl ? 'Failed to load image' : 'No image available'}
                </div>
              </ScrollArea>
            </Card>
          </div>

          {/* Right: Extracted Data */}
          <ScrollArea className="h-[calc(100vh-14rem)]">
            <div className="space-y-6 pr-4">
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
        </div>
      </SheetContent>
    </Sheet>
  );
}
