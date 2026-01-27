import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
} from "@/components/ui/sidebar";
import { Upload, FileText, FolderOpen, Settings, FileCheck, Scale, Calendar, LayoutDashboard, History, CheckCircle } from "lucide-react";
import { Link, useLocation } from "wouter";

const mainMenuItems = [
  {
    title: "Dashboard",
    url: "/",
    icon: LayoutDashboard,
  },
  {
    title: "Upload",
    url: "/upload",
    icon: Upload,
  },
  {
    title: "Processing Queue",
    url: "/processing",
    icon: FileText,
  },
  {
    title: "Document Library",
    url: "/documents",
    icon: FolderOpen,
  },
];

const verificationMenuItems = [
  {
    title: "BMR Verification",
    url: "/bmr-verification",
    icon: FileCheck,
  },
  {
    title: "Raw Material Verification",
    url: "/raw-material",
    icon: Scale,
  },
  {
    title: "Batch Allocation",
    url: "/batch-allocation",
    icon: Calendar,
  },
];

const complianceMenuItems = [
  {
    title: "Approvals",
    url: "/approved",
    icon: CheckCircle,
  },
  {
    title: "Audit Trail",
    url: "/audit-trail",
    icon: History,
  },
  {
    title: "Settings",
    url: "/settings",
    icon: Settings,
  },
];

export function AppSidebar() {
  const [location] = useLocation();

  return (
    <Sidebar>
      <SidebarHeader className="border-b border-sidebar-border p-4">
        <div className="flex items-center gap-2">
          <FileText className="h-6 w-6 text-primary" />
          <div>
            <h2 className="text-sm font-semibold">Batch Record</h2>
            <p className="text-xs text-muted-foreground">Processing System</p>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Main</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainMenuItems.map((item) => {
                const isActive = location === item.url || (item.url === "/" && location === "/dashboard");
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild data-active={isActive}>
                      <Link href={item.url}>
                        <item.icon />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Verification</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {verificationMenuItems.map((item) => {
                const isActive = location === item.url;
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild data-active={isActive}>
                      <Link href={item.url}>
                        <item.icon />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Compliance</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {complianceMenuItems.map((item) => {
                const isActive = location === item.url;
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild data-active={isActive}>
                      <Link href={item.url}>
                        <item.icon />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
