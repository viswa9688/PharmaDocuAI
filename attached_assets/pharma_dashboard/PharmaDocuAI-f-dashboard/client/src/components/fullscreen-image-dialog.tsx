import { useState, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Maximize2, X, ZoomIn, ZoomOut, RotateCw } from "lucide-react";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";

export interface HighlightOverlay {
  xPct: number;      // X position as percentage of image width (0-100)
  yPct: number;      // Y position as percentage of image height (0-100)
  widthPct: number;  // Width as percentage of image width
  heightPct: number; // Height as percentage of image height
  color?: string;    // Optional custom color (default: red)
}

interface FullScreenImageDialogProps {
  src: string;
  alt: string;
  title?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  testIdPrefix?: string;
  overlays?: HighlightOverlay[];
}

export function FullScreenImageDialog({
  src,
  alt,
  title,
  open: controlledOpen,
  onOpenChange,
  testIdPrefix = "",
  overlays = [],
}: FullScreenImageDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const imgRef = useRef<HTMLImageElement>(null);

  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = isControlled ? (onOpenChange || (() => {})) : setInternalOpen;

  const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.25, 3));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.25, 0.5));
  const handleRotate = () => setRotation(prev => (prev + 90) % 360);
  const handleReset = () => {
    setZoom(1);
    setRotation(0);
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) handleReset();
    setOpen(newOpen);
  };

  const prefix = testIdPrefix ? `${testIdPrefix}-` : "";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent 
        className="max-w-[95vw] max-h-[95vh] w-[95vw] h-[95vh] p-0 overflow-hidden"
        data-testid={`${prefix}dialog-fullscreen`}
      >
        <VisuallyHidden>
          <DialogTitle>{title || alt || "Full screen image"}</DialogTitle>
        </VisuallyHidden>
        
        <div className="absolute top-2 right-2 z-50 flex items-center gap-2">
          <Button
            variant="secondary"
            size="icon"
            onClick={handleZoomOut}
            disabled={zoom <= 0.5}
            data-testid={`${prefix}button-zoom-out`}
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium px-2 py-1 bg-secondary rounded">
            {Math.round(zoom * 100)}%
          </span>
          <Button
            variant="secondary"
            size="icon"
            onClick={handleZoomIn}
            disabled={zoom >= 3}
            data-testid={`${prefix}button-zoom-in`}
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button
            variant="secondary"
            size="icon"
            onClick={handleRotate}
            data-testid={`${prefix}button-rotate`}
          >
            <RotateCw className="h-4 w-4" />
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleReset}
            data-testid={`${prefix}button-reset-view`}
          >
            Reset
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setOpen(false)}
            data-testid={`${prefix}button-close-fullscreen`}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div 
          className="w-full h-full overflow-auto flex items-center justify-center bg-muted/50"
          onDoubleClick={handleReset}
        >
          <div 
            className="relative transition-transform duration-200"
            style={{
              transform: `scale(${zoom}) rotate(${rotation}deg)`,
              transformOrigin: 'center center',
            }}
          >
            <img
              ref={imgRef}
              src={src}
              alt={alt}
              className="max-w-none"
              data-testid={`${prefix}img-fullscreen`}
            />
            {overlays.map((overlay, index) => {
              // Clamp values to 0-100 range to prevent overflow
              const x = Math.max(0, Math.min(100, overlay.xPct));
              const y = Math.max(0, Math.min(100, overlay.yPct));
              const w = Math.max(0, Math.min(100 - x, overlay.widthPct));
              const h = Math.max(0, Math.min(100 - y, overlay.heightPct));
              
              return (
                <div
                  key={index}
                  className="absolute pointer-events-none"
                  style={{
                    left: `${x}%`,
                    top: `${y}%`,
                    width: `${w}%`,
                    height: `${h}%`,
                    border: `3px solid ${overlay.color || '#ef4444'}`,
                    backgroundColor: `${overlay.color || '#ef4444'}20`,
                    borderRadius: '4px',
                  }}
                  data-testid={`${prefix}overlay-${index}`}
                />
              );
            })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface FullScreenButtonProps {
  onClick: () => void;
  className?: string;
  testId?: string;
}

export function FullScreenButton({ onClick, className = "", testId = "button-fullscreen" }: FullScreenButtonProps) {
  return (
    <Button
      variant="outline"
      size="icon"
      onClick={onClick}
      className={className}
      data-testid={testId}
    >
      <Maximize2 className="h-4 w-4" />
    </Button>
  );
}

interface ImageWithOverlaysProps {
  src: string;
  alt: string;
  overlays?: HighlightOverlay[];
  className?: string;
  testIdPrefix?: string;
}

export function ImageWithOverlays({
  src,
  alt,
  overlays = [],
  className = "",
  testIdPrefix = "",
}: ImageWithOverlaysProps) {
  const prefix = testIdPrefix ? `${testIdPrefix}-` : "";

  return (
    <div className={`relative ${className}`}>
      <img
        src={src}
        alt={alt}
        className="w-full h-auto"
        data-testid={`${prefix}img`}
      />
      {overlays.map((overlay, index) => {
        // Clamp values to 0-100 range to prevent overflow
        const x = Math.max(0, Math.min(100, overlay.xPct));
        const y = Math.max(0, Math.min(100, overlay.yPct));
        const w = Math.max(0, Math.min(100 - x, overlay.widthPct));
        const h = Math.max(0, Math.min(100 - y, overlay.heightPct));
        
        return (
          <div
            key={index}
            className="absolute pointer-events-none"
            style={{
              left: `${x}%`,
              top: `${y}%`,
              width: `${w}%`,
              height: `${h}%`,
              border: `3px solid ${overlay.color || '#ef4444'}`,
              backgroundColor: `${overlay.color || '#ef4444'}20`,
              borderRadius: '4px',
            }}
            data-testid={`${prefix}overlay-${index}`}
          />
        );
      })}
    </div>
  );
}
