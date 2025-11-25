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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Page } from "@shared/schema";
import { useParams } from "wouter";
import { CheckSquare, Square, FileText, PenLine, FileSignature, LayoutGrid } from "lucide-react";

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

  // Extract rich data from metadata
  const extraction = page.metadata?.extraction || null;
  const hasRichData = extraction && (
    extraction.tables?.length > 0 ||
    extraction.formFields?.length > 0 ||
    extraction.checkboxes?.length > 0 ||
    extraction.handwrittenRegions?.length > 0 ||
    extraction.signatures?.length > 0
  );

  // Extract layout analysis from metadata
  const layout = page.metadata?.layout || null;
  const hasSections = layout && layout.sections && layout.sections.length > 0;

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

            {/* Rich Extraction Data */}
            {hasRichData && (
              <>
                <Separator />
                <div className="space-y-4">
                  <h3 className="text-sm font-medium flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Structured Data Extraction
                  </h3>

                  {/* Tables */}
                  {extraction.tables && extraction.tables.length > 0 && (
                    <div className="space-y-3">
                      <h4 className="text-xs font-medium text-muted-foreground">
                        Tables ({extraction.tables.length})
                      </h4>
                      {extraction.tables.map((table: any, tableIdx: number) => {
                        // Group cells by row
                        const rows: any[][] = [];
                        for (const cell of table.cells) {
                          if (!rows[cell.rowIndex]) rows[cell.rowIndex] = [];
                          rows[cell.rowIndex][cell.colIndex] = cell;
                        }

                        return (
                          <Card key={tableIdx} className="p-3">
                            <div className="text-xs text-muted-foreground mb-2">
                              Table {tableIdx + 1} - {table.rowCount} rows × {table.columnCount} columns 
                              {table.confidence && ` (${Math.round(table.confidence)}% confidence)`}
                            </div>
                            <div className="overflow-x-auto">
                              <Table>
                                {rows.some((row: any[]) => row.some((cell: any) => cell?.isHeader)) && (
                                  <TableHeader>
                                    <TableRow>
                                      {rows[0]?.map((cell: any, colIdx: number) => (
                                        cell ? (
                                          <TableHead 
                                            key={colIdx} 
                                            className="text-xs"
                                            colSpan={cell.colSpan || 1}
                                            rowSpan={cell.rowSpan || 1}
                                          >
                                            {cell.text}
                                          </TableHead>
                                        ) : (
                                          <TableHead key={colIdx} className="text-xs" />
                                        )
                                      ))}
                                    </TableRow>
                                  </TableHeader>
                                )}
                                <TableBody>
                                  {rows.slice(rows.some((row: any[]) => row.some((cell: any) => cell?.isHeader)) ? 1 : 0).map((row: any[], rowIdx: number) => (
                                    <TableRow key={rowIdx}>
                                      {row.map((cell: any, colIdx: number) => (
                                        cell ? (
                                          <TableCell 
                                            key={colIdx} 
                                            className="text-xs"
                                            colSpan={cell.colSpan || 1}
                                            rowSpan={cell.rowSpan || 1}
                                          >
                                            {cell.text}
                                          </TableCell>
                                        ) : (
                                          <TableCell key={colIdx} className="text-xs" />
                                        )
                                      ))}
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          </Card>
                        );
                      })}
                    </div>
                  )}

                  {/* Form Fields */}
                  {extraction.formFields && extraction.formFields.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-medium text-muted-foreground">
                        Form Fields ({extraction.formFields.length})
                      </h4>
                      <div className="space-y-2">
                        {extraction.formFields.map((field: any, idx: number) => (
                          <div key={idx} className="flex items-start gap-2 p-2 bg-muted rounded-md" data-testid={`form-field-${idx}`}>
                            <div className="flex-1 space-y-1">
                              <div className="text-xs font-medium text-muted-foreground">{field.fieldName}</div>
                              <div className="text-sm font-mono">{field.fieldValue}</div>
                              {field.confidence && (
                                <div className="text-xs text-muted-foreground">
                                  {Math.round(field.confidence)}% confidence
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Checkboxes */}
                  {extraction.checkboxes && extraction.checkboxes.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-medium text-muted-foreground">
                        Checkboxes ({extraction.checkboxes.length})
                      </h4>
                      <div className="space-y-2">
                        {extraction.checkboxes.map((checkbox: any, idx: number) => (
                          <div key={idx} className="flex items-center gap-2 p-2 bg-muted rounded-md" data-testid={`checkbox-${idx}`}>
                            {checkbox.state === 'checked' ? (
                              <CheckSquare className="h-4 w-4 text-primary" />
                            ) : (
                              <Square className="h-4 w-4 text-muted-foreground" />
                            )}
                            <div className="flex-1">
                              <div className="text-sm">{checkbox.associatedText || 'Unlabeled checkbox'}</div>
                              {checkbox.confidence && (
                                <div className="text-xs text-muted-foreground">
                                  {Math.round(checkbox.confidence)}% confidence
                                </div>
                              )}
                            </div>
                            <Badge variant={checkbox.state === 'checked' ? 'default' : 'secondary'}>
                              {checkbox.state}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Handwritten Regions */}
                  {extraction.handwrittenRegions && extraction.handwrittenRegions.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                        <PenLine className="h-3 w-3" />
                        Handwritten Text ({extraction.handwrittenRegions.length})
                      </h4>
                      <div className="space-y-2">
                        {extraction.handwrittenRegions.map((region: any, idx: number) => (
                          <div key={idx} className="p-2 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-md" data-testid={`handwritten-${idx}`}>
                            <div className="text-sm font-mono italic">{region.text}</div>
                            {region.confidence && (
                              <div className="text-xs text-muted-foreground mt-1">
                                {Math.round(region.confidence)}% confidence
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Signatures */}
                  {extraction.signatures && extraction.signatures.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                        <FileSignature className="h-3 w-3" />
                        Signature Blocks ({extraction.signatures.length})
                      </h4>
                      <div className="space-y-2">
                        {extraction.signatures.map((signature: any, idx: number) => (
                          <div key={idx} className="p-2 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-md" data-testid={`signature-${idx}`}>
                            <div className="text-sm">{signature.associatedLabel || 'Signature detected'}</div>
                            {signature.confidence && (
                              <div className="text-xs text-muted-foreground mt-1">
                                {Math.round(signature.confidence)}% confidence
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Structured Layout Analysis */}
            {hasSections && (
              <>
                <Separator />
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-medium flex items-center gap-2 mb-2">
                      <LayoutGrid className="h-4 w-4" />
                      Page Structure & Field Recognition
                    </h3>
                    <div className="text-xs text-muted-foreground">
                      Layout: {layout.layoutStyle?.replace(/_/g, ' ')} • {layout.sections.length} section{layout.sections.length !== 1 ? 's' : ''} detected
                    </div>
                  </div>

                  {/* Display each recognized section */}
                  {layout.sections.map((section: any, sectionIdx: number) => (
                    <Card key={sectionIdx} className="p-4" data-testid={`section-${sectionIdx}`}>
                      <div className="space-y-3">
                        {/* Section Header */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="font-mono text-xs">
                                {section.sectionType.replace(/_/g, ' ')}
                              </Badge>
                              {section.confidence && (
                                <span className="text-xs text-muted-foreground">
                                  {Math.round(section.confidence)}% confidence
                                </span>
                              )}
                            </div>
                            {section.sectionTitle && (
                              <div className="text-sm font-medium mt-1">
                                {section.sectionTitle}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Extracted Fields */}
                        {section.fields && Object.keys(section.fields).length > 0 && (
                          <div className="space-y-2">
                            <h4 className="text-xs font-medium text-muted-foreground">
                              Extracted Fields ({Object.keys(section.fields).length})
                            </h4>
                            <div className="grid grid-cols-1 gap-2">
                              {Object.entries(section.fields).map(([fieldName, fieldValue]: [string, any]) => (
                                <div
                                  key={fieldName}
                                  className="flex items-start justify-between gap-2 p-2 bg-muted/50 rounded"
                                  data-testid={`field-${fieldName}`}
                                >
                                  <span className="text-xs font-medium text-muted-foreground capitalize">
                                    {fieldName.replace(/_/g, ' ')}:
                                  </span>
                                  <div className="flex-1 text-right">
                                    <span className="text-xs font-mono">
                                      {typeof fieldValue.value === 'boolean' 
                                        ? (fieldValue.value ? '✓' : '✗')
                                        : String(fieldValue.value)}
                                    </span>
                                    {fieldValue.confidence && (
                                      <span className="text-xs text-muted-foreground ml-2">
                                        ({Math.round(fieldValue.confidence)}%)
                                      </span>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Section Content Summary */}
                        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                          {section.tables && section.tables.length > 0 && (
                            <Badge variant="secondary" className="text-xs">
                              {section.tables.length} table{section.tables.length !== 1 ? 's' : ''}
                            </Badge>
                          )}
                          {section.checkboxes && section.checkboxes.length > 0 && (
                            <Badge variant="secondary" className="text-xs">
                              {section.checkboxes.length} checkbox{section.checkboxes.length !== 1 ? 'es' : ''}
                            </Badge>
                          )}
                          {section.handwrittenNotes && section.handwrittenNotes.length > 0 && (
                            <Badge variant="secondary" className="text-xs">
                              {section.handwrittenNotes.length} handwritten note{section.handwrittenNotes.length !== 1 ? 's' : ''}
                            </Badge>
                          )}
                          {section.signatures && section.signatures.length > 0 && (
                            <Badge variant="secondary" className="text-xs">
                              {section.signatures.length} signature{section.signatures.length !== 1 ? 's' : ''}
                            </Badge>
                          )}
                          {section.textBlocks && section.textBlocks.length > 0 && (
                            <Badge variant="secondary" className="text-xs">
                              {section.textBlocks.length} text block{section.textBlocks.length !== 1 ? 's' : ''}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </>
            )}

            {page.extractedText && (
              <>
                <Separator />
                <div>
                  <h3 className="text-sm font-medium mb-2">Raw Extracted Text</h3>
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
