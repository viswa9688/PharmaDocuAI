import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Maximize2, X, ZoomIn, ZoomOut, RotateCw } from "lucide-react";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";

interface FullScreenImageDialogProps {
  src: string;
  alt: string;
  title?: string;
  trigger?: React.ReactNode;
  className?: string;
}

export function FullScreenImageDialog({
  src,
  alt,
  title,
  trigger,
  className = "",
}: FullScreenImageDialogProps) {
  const [open, setOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);

  const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.25, 3));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.25, 0.5));
  const handleRotate = () => setRotation(prev => (prev + 90) % 360);
  const handleReset = () => {
    setZoom(1);
    setRotation(0);
  };

  return (
    <>
      {trigger ? (
        <div onClick={() => setOpen(true)} className={className}>
          {trigger}
        </div>
      ) : (
        <Button
          variant="outline"
          size="icon"
          onClick={() => setOpen(true)}
          className={className}
          data-testid="button-fullscreen-image"
        >
          <Maximize2 className="h-4 w-4" />
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent 
          className="max-w-[95vw] max-h-[95vh] w-[95vw] h-[95vh] p-0 overflow-hidden"
          data-testid="dialog-fullscreen-image"
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
              data-testid="button-zoom-out"
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
              data-testid="button-zoom-in"
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button
              variant="secondary"
              size="icon"
              onClick={handleRotate}
              data-testid="button-rotate"
            >
              <RotateCw className="h-4 w-4" />
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleReset}
              data-testid="button-reset-view"
            >
              Reset
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setOpen(false)}
              data-testid="button-close-fullscreen"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          <div 
            className="w-full h-full overflow-auto flex items-center justify-center bg-muted/50"
            onDoubleClick={handleReset}
          >
            <img
              src={src}
              alt={alt}
              className="max-w-none transition-transform duration-200"
              style={{
                transform: `scale(${zoom}) rotate(${rotation}deg)`,
                transformOrigin: 'center center',
              }}
              data-testid="img-fullscreen"
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

interface FullScreenButtonProps {
  onClick: () => void;
  className?: string;
}

export function FullScreenButton({ onClick, className = "" }: FullScreenButtonProps) {
  return (
    <Button
      variant="outline"
      size="icon"
      onClick={onClick}
      className={className}
      data-testid="button-fullscreen"
    >
      <Maximize2 className="h-4 w-4" />
    </Button>
  );
}
