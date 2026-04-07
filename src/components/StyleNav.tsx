import { useNavigate } from "react-router-dom";
import { useTheme } from "next-themes";
import { Sun, Moon, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useRef, useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface StyleNavItem {
  to: string;
  emoji: string;
  label: string;
  category?: string;
}

const navItems: StyleNavItem[] = [
  { to: "/", emoji: "🏯", label: "Ukiyo-e", category: "Classic" },
  { to: "/popart", emoji: "🎯", label: "Pop Art", category: "Classic" },
  { to: "/lineart", emoji: "✒️", label: "Line Art", category: "Classic" },
  { to: "/minimalism", emoji: "◻", label: "Minimalism", category: "Classic" },
  { to: "/graffiti", emoji: "🎨", label: "Graffiti", category: "Classic" },
  { to: "/botanical", emoji: "🌿", label: "Botanical", category: "Classic" },
  { to: "/urbannoir", emoji: "🖤", label: "Urban Noir", category: "Print" },
  { to: "/screenprint", emoji: "🖨️", label: "Screen Print", category: "Print" },
  { to: "/risograph", emoji: "📠", label: "Risograph", category: "Print" },
  { to: "/retrocomic", emoji: "💥", label: "Retro Comic", category: "Print" },
  { to: "/pulpmagazine", emoji: "📕", label: "Pulp Magazine", category: "Print" },
  { to: "/tattooflash", emoji: "🔥", label: "Tattoo Flash", category: "Print" },
  { to: "/brutalistposter", emoji: "⬛", label: "Brutalist", category: "Print" },
  { to: "/xeroxzine", emoji: "📋", label: "Xerox Zine", category: "Print" },
  { to: "/blend", emoji: "✨", label: "Blend", category: "Tools" },
  { to: "/compare", emoji: "🔀", label: "Compare", category: "Tools" },
  { to: "/batch", emoji: "⚡", label: "Batch", category: "Tools" },
];

interface StyleNavProps {
  activePath: string;
}

// Persist scroll position across route changes
let savedScrollLeft = 0;

const StyleNav = ({ activePath }: StyleNavProps) => {
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const navRef = useRef<HTMLElement>(null);
  const activeRef = useRef<HTMLElement>(null);
  const [showLeftFade, setShowLeftFade] = useState(false);
  const [showRightFade, setShowRightFade] = useState(false);
  const [selectorOpen, setSelectorOpen] = useState(false);

  const activeItem = navItems.find((item) => item.to === activePath);

  // Check overflow and update fade indicators
  const updateFades = useCallback(() => {
    const el = navRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setShowLeftFade(scrollLeft > 4);
    setShowRightFade(scrollLeft + clientWidth < scrollWidth - 4);
  }, []);

  // Restore saved scroll position and scroll active into view
  useEffect(() => {
    const el = navRef.current;
    if (!el) return;

    // Restore saved position first
    el.scrollLeft = savedScrollLeft;

    // Scroll active item into view if needed
    requestAnimationFrame(() => {
      if (activeRef.current && el) {
        const itemRect = activeRef.current.getBoundingClientRect();
        const navRect = el.getBoundingClientRect();
        if (itemRect.left < navRect.left || itemRect.right > navRect.right) {
          activeRef.current.scrollIntoView({
            behavior: "smooth",
            block: "nearest",
            inline: "center",
          });
        }
      }
      updateFades();
    });
  }, [activePath, updateFades]);

  // Listen for scroll to update fades
  useEffect(() => {
    const el = navRef.current;
    if (!el) return;
    el.addEventListener("scroll", updateFades, { passive: true });
    window.addEventListener("resize", updateFades);
    updateFades();
    return () => {
      el.removeEventListener("scroll", updateFades);
      window.removeEventListener("resize", updateFades);
    };
  }, [updateFades]);

  const handleNavClick = useCallback(
    (to: string) => {
      if (navRef.current) {
        savedScrollLeft = navRef.current.scrollLeft;
      }
      navigate(to);
    },
    [navigate],
  );

  const handleSelectorSelect = useCallback(
    (to: string) => {
      setSelectorOpen(false);
      navigate(to);
    },
    [navigate],
  );

  // Group items by category for the dropdown
  const categories = navItems.reduce<Record<string, StyleNavItem[]>>(
    (acc, item) => {
      const cat = item.category || "Other";
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(item);
      return acc;
    },
    {},
  );

  return (
    <div className="sticky top-0 z-30 bg-background/90 backdrop-blur-sm border-b border-border">
      <div className="flex items-center px-2 relative">
        {/* Left fade indicator */}
        {showLeftFade && (
          <div className="absolute left-2 top-0 bottom-0 w-8 bg-gradient-to-r from-background/90 to-transparent z-10 pointer-events-none" />
        )}

        {/* Scrollable pill nav */}
        <nav
          ref={navRef}
          className="flex-1 flex items-center gap-1 overflow-x-auto scrollbar-hide py-2 px-1"
        >
          {navItems.map((item) => {
            const isActive = item.to === activePath;
            const refProp = isActive
              ? { ref: activeRef as React.Ref<HTMLSpanElement> }
              : {};

            if (isActive) {
              return (
                <span
                  key={item.to}
                  {...refProp}
                  className="font-display text-xs font-medium whitespace-nowrap px-3 py-1.5 rounded-full bg-primary text-primary-foreground flex-shrink-0"
                >
                  {item.emoji} {item.label}
                </span>
              );
            }
            return (
              <button
                key={item.to}
                onClick={() => handleNavClick(item.to)}
                className="font-display text-xs font-medium whitespace-nowrap px-3 py-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex-shrink-0"
              >
                {item.emoji} {item.label}
              </button>
            );
          })}
        </nav>

        {/* Right fade indicator */}
        {showRightFade && (
          <div className="absolute right-[5.5rem] top-0 bottom-0 w-8 bg-gradient-to-l from-background/90 to-transparent z-10 pointer-events-none" />
        )}

        {/* Style selector dropdown */}
        <Popover open={selectorOpen} onOpenChange={setSelectorOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 flex-shrink-0 text-muted-foreground hover:text-foreground ml-1 gap-1"
              title="All styles"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            className="w-56 p-2 max-h-[70vh] overflow-y-auto"
          >
            {Object.entries(categories).map(([category, items]) => (
              <div key={category} className="mb-2 last:mb-0">
                <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground px-2 py-1">
                  {category}
                </div>
                {items.map((item) => {
                  const isActive = item.to === activePath;
                  return (
                    <button
                      key={item.to}
                      onClick={() => handleSelectorSelect(item.to)}
                      className={cn(
                        "w-full text-left flex items-center gap-2 px-2 py-1.5 rounded text-sm transition-colors",
                        isActive
                          ? "bg-primary text-primary-foreground font-medium"
                          : "text-foreground hover:bg-muted",
                      )}
                    >
                      <span className="text-base leading-none">{item.emoji}</span>
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </PopoverContent>
        </Popover>

        {/* Dark mode toggle */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="h-8 w-8 p-0 flex-shrink-0 text-muted-foreground hover:text-foreground ml-1"
          title="Toggle dark mode"
        >
          {theme === "dark" ? (
            <Sun className="h-4 w-4" />
          ) : (
            <Moon className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  );
};

export default StyleNav;
