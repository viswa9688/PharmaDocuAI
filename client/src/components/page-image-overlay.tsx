import { useState, useRef, useEffect } from "react";
import type { Page, VisualAnomaly, BoundingBox, DiscrepancyBoundingBox } from "@shared/schema";

// Discrepancy overlay data for BMR verification
export interface DiscrepancyOverlay {
  id: string;
  fieldName: string;
  severity: string;
  description: string;
  boundingBox: DiscrepancyBoundingBox;
}

interface PageImageOverlayProps {
  page: Page;
  imageUrl: string;
  discrepancyOverlays?: DiscrepancyOverlay[];
}

export function PageImageOverlay({ page, imageUrl, discrepancyOverlays = [] }: PageImageOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0, naturalWidth: 0, naturalHeight: 0 });

  const visualAnomalies: VisualAnomaly[] = (page.metadata?.visualAnomalies as VisualAnomaly[]) || [];

  useEffect(() => {
    const updateDimensions = () => {
      if (imageRef.current && imageLoaded) {
        const rect = imageRef.current.getBoundingClientRect();
        setImageDimensions({
          width: rect.width,
          height: rect.height,
          naturalWidth: imageRef.current.naturalWidth,
          naturalHeight: imageRef.current.naturalHeight,
        });
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, [imageLoaded]);

  const handleImageLoad = () => {
    setImageLoaded(true);
    if (imageRef.current) {
      const rect = imageRef.current.getBoundingClientRect();
      setImageDimensions({
        width: rect.width,
        height: rect.height,
        naturalWidth: imageRef.current.naturalWidth,
        naturalHeight: imageRef.current.naturalHeight,
      });
    }
  };

  const scaleBox = (box: BoundingBox): { left: string; top: string; width: string; height: string } => {
    if (!imageDimensions.naturalWidth || !imageDimensions.naturalHeight) {
      return { left: '0', top: '0', width: '0', height: '0' };
    }

    const scaleX = imageDimensions.width / imageDimensions.naturalWidth;
    const scaleY = imageDimensions.height / imageDimensions.naturalHeight;
    
    console.log(`[OVERLAY] Image: display=${imageDimensions.width.toFixed(0)}x${imageDimensions.height.toFixed(0)}, natural=${imageDimensions.naturalWidth}x${imageDimensions.naturalHeight}`);
    console.log(`[OVERLAY] Box input: x=${box.x.toFixed(1)}, y=${box.y.toFixed(1)}, w=${box.width.toFixed(1)}, h=${box.height.toFixed(1)}`);
    console.log(`[OVERLAY] Box output: left=${(box.x * scaleX).toFixed(1)}px, top=${(box.y * scaleY).toFixed(1)}px`);

    return {
      left: `${box.x * scaleX}px`,
      top: `${box.y * scaleY}px`,
      width: `${box.width * scaleX}px`,
      height: `${box.height * scaleY}px`,
    };
  };

  const getSeverityColor = (severity: string): string => {
    switch (severity) {
      case 'critical':
      case 'high':
      case 'major':
        return 'rgba(239, 68, 68, 0.3)';
      case 'medium':
        return 'rgba(249, 115, 22, 0.3)';
      case 'low':
      case 'info':
      case 'minor':
        return 'rgba(234, 179, 8, 0.3)';
      default:
        return 'rgba(239, 68, 68, 0.3)';
    }
  };

  const getSeverityBorder = (severity: string): string => {
    switch (severity) {
      case 'critical':
      case 'high':
      case 'major':
        return '2px solid rgb(239, 68, 68)';
      case 'medium':
        return '2px solid rgb(249, 115, 22)';
      case 'low':
      case 'info':
      case 'minor':
        return '2px solid rgb(234, 179, 8)';
      default:
        return '2px solid rgb(239, 68, 68)';
    }
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <img
        ref={imageRef}
        src={imageUrl}
        alt={`Page ${page.pageNumber}`}
        className="w-full h-auto"
        onLoad={handleImageLoad}
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

      {imageLoaded && imageDimensions.naturalWidth > 0 && visualAnomalies.map((anomaly, index) => {
        if (!anomaly.boundingBox) return null;
        const scaledBox = scaleBox(anomaly.boundingBox);
        
        return (
          <div
            key={`anomaly-${anomaly.id || index}`}
            className="absolute pointer-events-none"
            style={{
              ...scaledBox,
              backgroundColor: getSeverityColor(anomaly.severity),
              border: getSeverityBorder(anomaly.severity),
              borderRadius: '4px',
            }}
            title={anomaly.description || `${anomaly.type} detected`}
            data-testid={`overlay-anomaly-${index}`}
          />
        );
      })}

      {/* Discrepancy overlays for BMR verification */}
      {imageLoaded && imageDimensions.naturalWidth > 0 && discrepancyOverlays.map((discrepancy, index) => {
        const scaledBox = scaleBox(discrepancy.boundingBox);
        
        return (
          <div
            key={`discrepancy-${discrepancy.id || index}`}
            className="absolute pointer-events-none"
            style={{
              ...scaledBox,
              backgroundColor: getSeverityColor(discrepancy.severity),
              border: getSeverityBorder(discrepancy.severity),
              borderRadius: '4px',
            }}
            title={discrepancy.description || `${discrepancy.fieldName} discrepancy`}
            data-testid={`overlay-discrepancy-${index}`}
          />
        );
      })}
    </div>
  );
}
