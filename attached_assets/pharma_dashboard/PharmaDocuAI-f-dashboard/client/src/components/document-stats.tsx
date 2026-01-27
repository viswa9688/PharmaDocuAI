import { Card, CardContent } from "@/components/ui/card";
import { FileText, CheckCircle, AlertTriangle, TrendingUp } from "lucide-react";

interface DocumentStatsProps {
  totalPages: number;
  classifiedPages: number;
  issueCount: number;
  avgConfidence: number;
}

export function DocumentStats({
  totalPages,
  classifiedPages,
  issueCount,
  avgConfidence,
}: DocumentStatsProps) {
  const stats = [
    {
      label: "Total Pages",
      value: totalPages,
      icon: FileText,
      testId: "stat-total-pages",
    },
    {
      label: "Classified",
      value: classifiedPages,
      icon: CheckCircle,
      testId: "stat-classified",
    },
    {
      label: "Issues Found",
      value: issueCount,
      icon: AlertTriangle,
      testId: "stat-issues",
    },
    {
      label: "Avg Confidence",
      value: `${avgConfidence}%`,
      icon: TrendingUp,
      testId: "stat-confidence",
    },
  ];

  return (
    <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => (
        <Card key={stat.label}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">{stat.label}</p>
                <p className="text-3xl font-bold" data-testid={stat.testId}>
                  {stat.value}
                </p>
              </div>
              <stat.icon className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
