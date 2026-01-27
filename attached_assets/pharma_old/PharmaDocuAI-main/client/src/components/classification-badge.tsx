import { Badge } from "@/components/ui/badge";
import type { PageType } from "@shared/schema";

interface ClassificationBadgeProps {
  classification: PageType;
  confidence?: number;
}

const classificationLabels: Record<PageType, string> = {
  materials_log: "Materials Log",
  equipment_log: "Equipment Log",
  cip_sip_record: "CIP/SIP Record",
  filtration_step: "Filtration Step",
  filling_log: "Filling Log",
  inspection_sheet: "Inspection Sheet",
  reconciliation_page: "Reconciliation",
  unknown: "Unknown",
};

const classificationColors: Record<PageType, string> = {
  materials_log: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  equipment_log: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  cip_sip_record: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  filtration_step: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  filling_log: "bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300",
  inspection_sheet: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300",
  reconciliation_page: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300",
  unknown: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300",
};

export function ClassificationBadge({ classification, confidence }: ClassificationBadgeProps) {
  return (
    <Badge
      className={`${classificationColors[classification]} border-0`}
      data-testid={`badge-classification-${classification}`}
    >
      {classificationLabels[classification]}
      {confidence !== undefined && ` (${confidence}%)`}
    </Badge>
  );
}
