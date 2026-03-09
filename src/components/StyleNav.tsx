import { Link } from "react-router-dom";

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
];

interface StyleNavProps {
  activePath: string;
  activeClass: string;
  inactiveClass: string;
  activeBorderClass: string;
}

const StyleNav = ({ activePath, activeClass, inactiveClass, activeBorderClass }: StyleNavProps) => {
  return (
    <nav className="grid grid-cols-3 gap-3 pt-6 px-4 max-w-md mx-auto">
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
  );
};

export default StyleNav;
