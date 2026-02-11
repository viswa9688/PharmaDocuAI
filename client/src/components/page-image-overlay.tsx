import { useState, useRef } from "react";
import { ImageOff } from "lucide-react";
import type { Page } from "@shared/schema";

interface PageImageOverlayProps {
  page: Page;
  imageUrl: string;
}

export function PageImageOverlay({ page, imageUrl }: PageImageOverlayProps) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);

  if (imageError) {
    return (
      <div className="flex flex-col items-center justify-center h-96 text-muted-foreground gap-3">
        <ImageOff className="h-12 w-12" />
        <p className="text-sm">Image not available for Page {page.pageNumber}</p>
        <p className="text-xs">The page image may not have been generated during upload.</p>
      </div>
    );
  }

  return (
    <div className="relative w-full">
      <img
        ref={imageRef}
        src={imageUrl}
        alt={`Page ${page.pageNumber}`}
        className="w-full h-auto"
        onLoad={() => setImageLoaded(true)}
        onError={() => setImageError(true)}
        data-testid="img-page-scan"
      />
    </div>
  );
}
