import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, AlertCircle, Info } from "lucide-react";

interface QualityAlertProps {
  type: "missing" | "duplicate" | "out_of_order" | "corrupted";
  description: string;
  pageNumbers?: number[];
}

export function QualityAlert({ type, description, pageNumbers }: QualityAlertProps) {
  const getIcon = () => {
    switch (type) {
      case "missing":
      case "out_of_order":
        return <AlertTriangle className="h-4 w-4" />;
      case "duplicate":
        return <Info className="h-4 w-4" />;
      case "corrupted":
        return <AlertCircle className="h-4 w-4" />;
    }
  };

  const getTitle = () => {
    switch (type) {
      case "missing":
        return "Missing Pages";
      case "duplicate":
        return "Duplicate Pages";
      case "out_of_order":
        return "Out of Order";
      case "corrupted":
        return "Corrupted Pages";
    }
  };

  const getVariant = () => {
    if (type === "corrupted") return "destructive";
    return "default";
  };

  return (
    <Alert variant={getVariant()} data-testid={`alert-${type}`}>
      {getIcon()}
      <AlertTitle>{getTitle()}</AlertTitle>
      <AlertDescription>
        {description}
        {pageNumbers && pageNumbers.length > 0 && (
          <span className="block mt-1 font-mono text-xs">
            Pages: {pageNumbers.join(", ")}
          </span>
        )}
      </AlertDescription>
    </Alert>
  );
}
