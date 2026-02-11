import { useState, useRef } from "react";
import type { Page } from "@shared/schema";

interface PageImageOverlayProps {
  page: Page;
  imageUrl: string;
}

export function PageImageOverlay({ page, imageUrl }: PageImageOverlayProps) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);

  return (
    <div className="relative w-full">
      <img
        ref={imageRef}
        src={imageUrl}
        alt={`Page ${page.pageNumber}`}
        className="w-full h-auto"
        onLoad={() => setImageLoaded(true)}
        onError={(e) => {
          e.currentTarget.style.display = 'none';
          const errorDiv = e.currentTarget.parentElement?.querySelector('.image-error');
          if (errorDiv) errorDiv.classList.remove('hidden');
        }}
        data-testid="img-page-scan"
      />
      <div className="hidden image-error flex items-center justify-center h-96 text-muted-foreground">
        Failed to load image
      </div>
    </div>
  );
}
