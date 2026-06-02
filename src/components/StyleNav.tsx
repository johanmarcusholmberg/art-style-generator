/**
 * Top app header + (on generator routes) the prominent "currently selected
 * style" card. Keeping the filename/export as StyleNav so every existing
 * generator page picks up the new UX without changes.
 *
 * Top bar contains main navigation only (Generate, Gallery, Batch, Compare,
 * Admin) plus the dark-mode toggle. The floating UserMenu is rendered
 * globally in App.tsx and overlays the right side of this header.
 */
import { Link, useNavigate } from "react-router-dom";
import { Menu } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import UserMenu from "@/components/auth/UserMenu";
import SelectedStyleCard from "./SelectedStyleCard";
import { getStyleByRoute } from "@/lib/style-catalog";

interface NavLink {
  to: string;
  label: string;
  /** Active when the activePath equals `to` or starts with one of these prefixes. */
  matchPrefixes?: string[];
  adminOnly?: boolean;
  secondary?: boolean;
}

const BASE_LINKS: NavLink[] = [
  { to: "/", label: "Generate", matchPrefixes: ["/"] },
  { to: "/batch", label: "Batch", matchPrefixes: ["/batch"] },
  { to: "/style-lab", label: "Style Lab", matchPrefixes: ["/style-lab"] },
];

const SECONDARY_LINKS: NavLink[] = [
  { to: "/compare", label: "Compare", matchPrefixes: ["/compare"], secondary: true },
];

const ADMIN_LINKS: NavLink[] = [
  { to: "/admin/users", label: "Admin", matchPrefixes: ["/admin"], adminOnly: true },
];

interface StyleNavProps {
  activePath: string;
}

const isActive = (link: NavLink, activePath: string): boolean => {
  // "/" is special — only treat it as active when on a known generator route.
  if (link.to === "/") return !!getStyleByRoute(activePath);
  return (link.matchPrefixes ?? [link.to]).some(
    (p) => activePath === p || (p !== "/" && activePath.startsWith(p)),
  );
};

const StyleNav = ({ activePath }: StyleNavProps) => {
  const navigate = useNavigate();
  const { access } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const role = access.kind === "active" ? access.role : null;
  const isAdmin = role === "admin";

  const primaryLinks = BASE_LINKS;
  const secondaryLinks = SECONDARY_LINKS;
  const adminLinks = isAdmin ? ADMIN_LINKS : [];

  const renderLink = (link: NavLink) => {
    const active = isActive(link, activePath);
    return (
      <button
        key={link.to}
        onClick={() => navigate(link.to)}
        className={cn(
          "font-display text-sm font-medium px-3 py-1.5 rounded-md transition-colors whitespace-nowrap",
          active
            ? "text-foreground bg-muted"
            : link.secondary
              ? "text-muted-foreground/70 hover:text-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/60",
        )}
      >
        {link.label}
      </button>
    );
  };

  const renderMobileLink = (link: NavLink) => {
    const active = isActive(link, activePath);
    return (
      <button
        key={link.to}
        onClick={() => {
          setMobileOpen(false);
          navigate(link.to);
        }}
        className={cn(
          "w-full text-left font-display text-base font-medium px-3 py-2.5 rounded-md transition-colors",
          active
            ? "text-foreground bg-muted"
            : "text-muted-foreground hover:text-foreground hover:bg-muted/60",
        )}
      >
        {link.label}
      </button>
    );
  };

  const hasSelectedStyle = !!getStyleByRoute(activePath);

  return (
    <>
      <header className="sticky top-0 z-30 bg-background/90 backdrop-blur-sm border-b border-border">
        <div className="flex items-center gap-2 px-4 sm:px-6 h-14">
          {/* Logo */}
          <Link
            to="/"
            className="flex items-center gap-2 mr-2 shrink-0"
            aria-label="Home"
          >
            <span className="text-lg" aria-hidden>
              墨
            </span>
            <span className="hidden sm:inline font-display text-sm font-semibold tracking-wide text-foreground">
              Sumi Studio
            </span>
          </Link>

          {/* Desktop primary nav */}
          <nav className="hidden md:flex items-center gap-1">
            {primaryLinks.map(renderLink)}
            {adminLinks.map(renderLink)}
          </nav>

          <div className="flex-1" />

          {/* Desktop secondary nav (less prominent) */}
          <nav className="hidden md:flex items-center gap-1 mr-1">
            {secondaryLinks.map(renderLink)}
          </nav>

          {/* Dark mode toggle removed — light-only experience. */}

          {/* User / account menu (inline, not floating) */}
          <div className="ml-1 shrink-0">
            <UserMenu />
          </div>

          {/* Mobile hamburger */}
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="md:hidden h-8 w-8 p-0 shrink-0"
                aria-label="Open menu"
              >
                <Menu className="h-4 w-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72">
              <SheetHeader>
                <SheetTitle className="font-display">Sumi Studio</SheetTitle>
              </SheetHeader>
              <div className="mt-6 space-y-1">
                <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground px-3 py-1">
                  Main
                </div>
                {primaryLinks.map(renderMobileLink)}
                {adminLinks.map(renderMobileLink)}

                <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground px-3 py-1 mt-4">
                  More
                </div>
                {secondaryLinks.map(renderMobileLink)}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </header>

      {/* Selected-style card — only on routes that map to a known style */}
      {hasSelectedStyle && <SelectedStyleCard activePath={activePath} />}
    </>
  );
};

export default StyleNav;
