import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import NotFound from "@/pages/not-found";
import Upload from "@/pages/upload";
import Documents from "@/pages/documents";
import DocumentViewer from "@/pages/document-viewer";
import Processing from "@/pages/processing";
import Settings from "@/pages/settings";
import BMRVerification from "@/pages/bmr-verification";
import RawMaterialVerification from "@/pages/raw-material-verification";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Upload} />
      <Route path="/documents" component={Documents} />
      <Route path="/documents/:id" component={DocumentViewer} />
      <Route path="/processing" component={Processing} />
      <Route path="/settings" component={Settings} />
      <Route path="/bmr-verification" component={BMRVerification} />
      <Route path="/raw-material" component={RawMaterialVerification} />
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
