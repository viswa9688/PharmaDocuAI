import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Loader2, Shield, Users } from "lucide-react";
import type { User } from "@shared/schema";

const roleDescriptions: Record<string, string> = {
  admin: "Full access to all features including user management",
  reviewer: "Can review, approve/reject documents and manage issues",
  operator: "Can upload documents and run verifications",
  viewer: "Read-only access to documents and reports",
};

function getInitials(firstName?: string | null, lastName?: string | null, email?: string | null): string {
  if (firstName && lastName) return `${firstName[0]}${lastName[0]}`.toUpperCase();
  if (firstName) return firstName[0].toUpperCase();
  if (email) return email[0].toUpperCase();
  return "U";
}

export default function UserManagement() {
  const { toast } = useToast();
  const { user: currentUser } = useAuth();

  const { data: users, isLoading } = useQuery<User[]>({
    queryKey: ["/api/users"],
    enabled: currentUser?.role === "admin",
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const res = await apiRequest("PATCH", `/api/users/${userId}/role`, { role });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({ title: "Role updated successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update role", description: error.message, variant: "destructive" });
    },
  });

  if (currentUser?.role !== "admin") {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <Shield className="h-12 w-12 text-muted-foreground" />
        <h2 className="text-lg font-semibold">Access Denied</h2>
        <p className="text-sm text-muted-foreground">You need admin privileges to access this page.</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-page-title">User Management</h1>
        <p className="text-muted-foreground">Manage user roles and access permissions</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {(["admin", "reviewer", "operator", "viewer"] as const).map((role) => (
          <Card key={role}>
            <CardContent className="p-4">
              <p className="text-sm font-medium capitalize">{role}</p>
              <p className="text-xs text-muted-foreground mt-1">{roleDescriptions[role]}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            All Users
          </CardTitle>
          <CardDescription>
            {users?.length ?? 0} registered user{users?.length === 1 ? "" : "s"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !users?.length ? (
            <p className="text-sm text-muted-foreground text-center py-8">No users found</p>
          ) : (
            <div className="space-y-3">
              {users.map((u) => (
                <div
                  key={u.id}
                  className="flex items-center gap-4 p-3 rounded-md border"
                  data-testid={`row-user-${u.id}`}
                >
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={u.profileImageUrl || undefined} />
                    <AvatarFallback>{getInitials(u.firstName, u.lastName, u.email)}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {u.firstName && u.lastName ? `${u.firstName} ${u.lastName}` : u.email || u.id}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{u.email || "No email"}</p>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    {u.id === currentUser?.id && (
                      <Badge variant="outline" className="text-xs">You</Badge>
                    )}
                    <Select
                      value={u.role}
                      onValueChange={(role) => updateRoleMutation.mutate({ userId: u.id, role })}
                      disabled={u.id === currentUser?.id || updateRoleMutation.isPending}
                    >
                      <SelectTrigger className="w-[130px]" data-testid={`select-role-${u.id}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="reviewer">Reviewer</SelectItem>
                        <SelectItem value="operator">Operator</SelectItem>
                        <SelectItem value="viewer">Viewer</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
