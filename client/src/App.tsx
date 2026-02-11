import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { RouteGuard } from "@/components/route-guard";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/landing";
import Upload from "@/pages/upload";
import Documents from "@/pages/documents";
import DocumentViewer from "@/pages/document-viewer";
import Processing from "@/pages/processing";
import Settings from "@/pages/settings";
import BMRVerification from "@/pages/bmr-verification";
import RawMaterialVerification from "@/pages/raw-material-verification";
import BatchAllocationVerification from "@/pages/batch-allocation-verification";
import Dashboard from "@/pages/dashboard";
import AuditTrail from "@/pages/audit-trail";
import Approved from "@/pages/approved";
import UserManagement from "@/pages/user-management";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/upload">
        <RouteGuard requireAuth requiredRoles={["admin", "reviewer", "operator"]}>
          <Upload />
        </RouteGuard>
      </Route>
      <Route path="/documents" component={Documents} />
      <Route path="/documents/:id" component={DocumentViewer} />
      <Route path="/processing" component={Processing} />
      <Route path="/settings">
        <RouteGuard requireAuth requiredRoles={["admin"]}>
          <Settings />
        </RouteGuard>
      </Route>
      <Route path="/bmr-verification">
        <RouteGuard requireAuth requiredRoles={["admin", "reviewer", "operator"]}>
          <BMRVerification />
        </RouteGuard>
      </Route>
      <Route path="/raw-material">
        <RouteGuard requireAuth requiredRoles={["admin", "reviewer", "operator"]}>
          <RawMaterialVerification />
        </RouteGuard>
      </Route>
      <Route path="/batch-allocation">
        <RouteGuard requireAuth requiredRoles={["admin", "reviewer", "operator"]}>
          <BatchAllocationVerification />
        </RouteGuard>
      </Route>
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/audit-trail" component={AuditTrail} />
      <Route path="/approved">
        <RouteGuard requireAuth requiredRoles={["admin", "reviewer"]}>
          <Approved />
        </RouteGuard>
      </Route>
      <Route path="/user-management">
        <RouteGuard requireAuth requiredRoles={["admin"]}>
          <UserManagement />
        </RouteGuard>
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

export default function App() {
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <SidebarProvider style={style as React.CSSProperties}>
          <div className="flex h-screen w-full">
            <AppSidebar />
            <div className="flex flex-col flex-1 min-w-0">
              <header className="flex items-center justify-between p-4 border-b border-border">
                <SidebarTrigger data-testid="button-sidebar-toggle" />
                <ThemeToggle />
              </header>
              <main className="flex-1 overflow-auto p-6">
                <Router />
              </main>
            </div>
          </div>
        </SidebarProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
