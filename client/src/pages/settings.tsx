import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { useState } from "react";

export default function Settings() {
  const [autoClassify, setAutoClassify] = useState(true);
  const [detectIssues, setDetectIssues] = useState(true);
  const [notifications, setNotifications] = useState(false);

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold mb-2">Settings</h1>
        <p className="text-muted-foreground">
          Configure processing preferences and system behavior
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Processing Options</CardTitle>
          <CardDescription>
            Control how documents are processed and analyzed
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label htmlFor="auto-classify">Automatic Classification</Label>
              <p className="text-sm text-muted-foreground">
                Automatically classify pages using AI
              </p>
            </div>
            <Switch
              id="auto-classify"
              checked={autoClassify}
              onCheckedChange={setAutoClassify}
              data-testid="switch-auto-classify"
            />
          </div>
          
          <Separator />
          
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label htmlFor="detect-issues">Quality Control</Label>
              <p className="text-sm text-muted-foreground">
                Detect missing, duplicate, and corrupted pages
              </p>
            </div>
            <Switch
              id="detect-issues"
              checked={detectIssues}
              onCheckedChange={setDetectIssues}
              data-testid="switch-detect-issues"
            />
          </div>
          
          <Separator />
          
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label htmlFor="notifications">Processing Notifications</Label>
              <p className="text-sm text-muted-foreground">
                Get notified when processing completes
              </p>
            </div>
            <Switch
              id="notifications"
              checked={notifications}
              onCheckedChange={setNotifications}
              data-testid="switch-notifications"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Classification Types</CardTitle>
          <CardDescription>
            Supported batch record page classifications
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3">
            {[
              "Materials Log",
              "Equipment Log",
              "CIP/SIP Record",
              "Filtration Step",
              "Filling Log",
              "Inspection Sheet",
              "Reconciliation Page",
            ].map((type) => (
              <div
                key={type}
                className="p-3 bg-muted rounded-md text-sm"
                data-testid={`classification-type-${type.toLowerCase().replace(/\s+/g, '-')}`}
              >
                {type}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
