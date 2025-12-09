import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { LogIn, LogOut, User } from "lucide-react";
import type { User as UserType } from "@shared/schema";

export function UserNav() {
  const { user, isLoading, isAuthenticated } = useAuth();
  const typedUser = user as UserType | null;

  if (isLoading) {
    return (
      <div className="w-8 h-8 rounded-full bg-muted animate-pulse" data-testid="user-nav-loading" />
    );
  }

  if (!isAuthenticated) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => window.location.href = "/api/login"}
        data-testid="button-login"
      >
        <LogIn className="mr-2 h-4 w-4" />
        Sign In
      </Button>
    );
  }

  const initials = typedUser 
    ? `${typedUser.firstName?.charAt(0) || ''}${typedUser.lastName?.charAt(0) || ''}`.toUpperCase() || 'U'
    : 'U';

  const displayName = typedUser
    ? `${typedUser.firstName || ''} ${typedUser.lastName || ''}`.trim() || typedUser.email || 'User'
    : 'User';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-8 w-8 rounded-full" data-testid="button-user-menu">
          <Avatar className="h-8 w-8">
            <AvatarImage src={typedUser?.profileImageUrl || undefined} alt={displayName} />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end" forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none" data-testid="text-user-name">{displayName}</p>
            {typedUser?.email && (
              <p className="text-xs leading-none text-muted-foreground" data-testid="text-user-email">
                {typedUser.email}
              </p>
            )}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <a href="/api/logout" className="cursor-pointer" data-testid="button-logout">
            <LogOut className="mr-2 h-4 w-4" />
            <span>Log out</span>
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
