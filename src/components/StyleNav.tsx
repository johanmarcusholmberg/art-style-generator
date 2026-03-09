import { Link } from "react-router-dom";
import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface StyleNavItem {
  to: string;
  emoji: string;
  label: string;
}

const navItems: StyleNavItem[] = [
  { to: "/", emoji: "🏯", label: "Ukiyo-e" },
  { to: "/popart", emoji: "🎯", label: "Pop Art" },
  { to: "/lineart", emoji: "✒️", label: "Line Art" },
  { to: "/minimalism", emoji: "◻", label: "Minimalism" },
  { to: "/graffiti", emoji: "🎨", label: "Graffiti" },
  { to: "/botanical", emoji: "🌿", label: "Botanical" },
  { to: "/blend", emoji: "✨", label: "Blend" },
];

interface StyleNavProps {
  activePath: string;
  activeClass?: string;
  inactiveClass?: string;
  activeBorderClass?: string;
}

const StyleNav = ({ activePath }: StyleNavProps) => {
  const { theme, setTheme } = useTheme();

  return (
    <div className="sticky top-0 z-30 bg-background/90 backdrop-blur-sm border-b border-border">
      <div className="flex items-center px-2">
        {/* Scrollable pill nav */}
        <nav className="flex-1 flex items-center gap-1 overflow-x-auto scrollbar-hide py-2 px-1">
          {navItems.map((item) => {
            const isActive = item.to === activePath;
            if (isActive) {
              return (
                <span
                  key={item.to}
                  className="font-display text-xs font-medium whitespace-nowrap px-3 py-1.5 rounded-full bg-primary text-primary-foreground flex-shrink-0"
                >
                  {item.emoji} {item.label}
                </span>
              );
            }
            return (
              <Link
                key={item.to}
                to={item.to}
                className="font-display text-xs font-medium whitespace-nowrap px-3 py-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex-shrink-0"
              >
                {item.emoji} {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Dark mode toggle */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="h-8 w-8 p-0 flex-shrink-0 text-muted-foreground hover:text-foreground ml-1"
          title="Toggle dark mode"
        >
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
};

export default StyleNav;
