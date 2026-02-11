import { useAuth } from "@/hooks/use-auth";
import { Redirect } from "wouter";
import { Loader2, Shield, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { UserRole } from "@shared/schema";

interface RouteGuardProps {
  children: React.ReactNode;
  requiredRoles?: UserRole[];
  requireAuth?: boolean;
}

export function RouteGuard({ children, requiredRoles, requireAuth = true }: RouteGuardProps) {
  const { user, isAuthenticated, isLoading, login } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (requireAuth && !isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <LogIn className="h-12 w-12 text-muted-foreground" />
        <h2 className="text-lg font-semibold">Sign In Required</h2>
        <p className="text-sm text-muted-foreground">Please sign in to access this page.</p>
        <Button onClick={login} data-testid="button-login-prompt">Sign In</Button>
      </div>
    );
  }

  if (requiredRoles && requiredRoles.length > 0 && user) {
    const userRole = user.role as UserRole;
    if (!requiredRoles.includes(userRole)) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-4">
          <Shield className="h-12 w-12 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Access Denied</h2>
          <p className="text-sm text-muted-foreground">
            You don't have permission to access this page.
          </p>
        </div>
      );
    }
  }

  return <>{children}</>;
}
