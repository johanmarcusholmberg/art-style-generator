/**
 * Small floating user-menu shown in the top-right of every protected page.
 * Lives outside the existing per-page layouts so we don't touch generator code.
 */
import { Link } from "react-router-dom";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LogOut, Shield, User as UserIcon, Users } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

export default function UserMenu() {
  const { access, signOut } = useAuth();
  if (access.kind !== "active") return null;

  const { profile, role } = access;
  const initials = (profile.display_name ?? profile.email)
    .split(/\s|@/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");

  return (
    <div className="fixed top-3 right-3 z-50">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="gap-2 bg-background/80 backdrop-blur-sm"
          >
            <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold">
              {initials || "?"}
            </span>
            <span className="hidden sm:inline text-xs">
              {profile.display_name ?? profile.email}
            </span>
            {role === "admin" && (
              <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4">
                Admin
              </Badge>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
            {profile.email}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link to="/account" className="cursor-pointer">
              <UserIcon className="h-4 w-4 mr-2" /> Account
            </Link>
          </DropdownMenuItem>
          {role === "admin" && (
            <DropdownMenuItem asChild>
              <Link to="/admin/users" className="cursor-pointer">
                <Users className="h-4 w-4 mr-2" /> User management
              </Link>
            </DropdownMenuItem>
          )}
          {role === "admin" && (
            <DropdownMenuItem asChild>
              <Link to="/style-control-panel" className="cursor-pointer">
                <Shield className="h-4 w-4 mr-2" /> Studio settings
              </Link>
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={signOut} className="cursor-pointer">
            <LogOut className="h-4 w-4 mr-2" /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
