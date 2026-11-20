import { CalendarDays, House, Package } from "lucide-react";
import { Button } from "@/components/ui/button";

export type DashboardSection = "inventory" | "events";
type NavigationTarget = "home" | DashboardSection;

type DashboardNavigationProps = {
  activeSection: DashboardSection | null;
  onNavigate: (target: NavigationTarget) => void;
};

const navigationItems = [
  { id: "home", label: "Главная", icon: House },
  { id: "inventory", label: "Инвентарь", icon: Package },
  { id: "events", label: "События", icon: CalendarDays },
] as const;

export function DashboardNavigation({ activeSection, onNavigate }: DashboardNavigationProps) {
  return (
    <>
      <nav aria-label="Основная навигация" className="dashboard-navigation desktop-navigation">
        {navigationItems.map(({ id, label, icon: Icon }) => {
          const active = id === "home" ? activeSection === null : activeSection === id;
          return (
            <Button
              aria-label={label}
              aria-pressed={active}
              className={`navigation-button navigation-button--desktop${active ? " is-active" : ""}`}
              key={id}
              onClick={() => onNavigate(id)}
              size="icon"
              title={label}
              type="button"
              variant="ghost"
            >
              <Icon aria-hidden="true" size={19} strokeWidth={1.8} />
              <span>{label}</span>
            </Button>
          );
        })}
      </nav>

      <nav aria-label="Основная навигация" className="dashboard-navigation mobile-navigation">
        {navigationItems.map(({ id, label, icon: Icon }) => {
          const active = id === "home" ? activeSection === null : activeSection === id;
          return (
            <Button
              aria-label={label}
              aria-pressed={active}
              className={`navigation-button navigation-button--mobile${active ? " is-active" : ""}`}
              key={id}
              onClick={() => onNavigate(id)}
              type="button"
              variant="ghost"
            >
              <Icon aria-hidden="true" size={19} strokeWidth={1.8} />
              <span>{label}</span>
            </Button>
          );
        })}
      </nav>
    </>
  );
}
