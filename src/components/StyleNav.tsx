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
  activeClass: string;
  inactiveClass: string;
  activeBorderClass: string;
}

const StyleNav = ({ activePath, activeClass, inactiveClass, activeBorderClass }: StyleNavProps) => {
  const { theme, setTheme } = useTheme();

  return (
    <div className="pt-6 px-4 max-w-lg mx-auto">
      <nav className="grid grid-cols-4 gap-3">
        {navItems.map((item) => {
          const isActive = item.to === activePath;
          if (isActive) {
            return (
              <span
                key={item.to}
                className={`font-display text-sm font-bold text-center pb-1 border-b-2 ${activeBorderClass} ${activeClass}`}
              >
                {item.emoji} {item.label}
              </span>
            );
          }
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`font-display text-sm text-center pb-1 transition-colors hover:opacity-80 ${inactiveClass}`}
            >
              {item.emoji} {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Dark mode toggle */}
      <div className="flex justify-end mt-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
          title="Toggle dark mode"
        >
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
};

export default StyleNav;
