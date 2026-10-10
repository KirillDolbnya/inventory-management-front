import { CalendarDays, House, Package } from "lucide-react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import type { WarehousePanel } from "@/features/warehouse/types";

type WarehouseNavigationProps = {
  activePanel: WarehousePanel | null;
  onNavigate: (section: "overview" | "inventory" | "events") => void;
};

const sections = [
  { id: "overview", label: "Обзор", icon: House },
  { id: "inventory", label: "Инвентарь", icon: Package },
  { id: "events", label: "События", icon: CalendarDays },
] as const;

export function WarehouseNavigation({ activePanel, onNavigate }: WarehouseNavigationProps) {
  return (
    <>
      <aside aria-label="Навигация по складу" className="warehouse-navigation warehouse-navigation--desktop">
        <Link className="warehouse-back-link" to="/">
          <span aria-hidden="true">←</span>
          <span>Все склады</span>
        </Link>
        <nav aria-label="Разделы склада" className="warehouse-navigation__dock">
          {sections.map(({ id, label, icon: Icon }) => {
            const active = id === "inventory" || id === "events" ? activePanel === id : activePanel === null;
            return (
              <Button
                aria-label={label}
                aria-pressed={active}
                className={`warehouse-navigation__button${active ? " is-active" : ""}`}
                key={id}
                onClick={() => onNavigate(id)}
                size="icon"
                title={label}
                type="button"
                variant="ghost"
              >
                <Icon aria-hidden="true" size={19} strokeWidth={1.8} />
              </Button>
            );
          })}
        </nav>
      </aside>

      <Link aria-label="Вернуться к списку складов" className="warehouse-back-link warehouse-back-link--mobile" to="/">
        <span aria-hidden="true">←</span>
        <span>Все склады</span>
      </Link>

      <nav aria-label="Разделы склада" className="warehouse-navigation warehouse-navigation--mobile">
        {sections.map(({ id, label, icon: Icon }) => {
          const active = id === "inventory" || id === "events" ? activePanel === id : activePanel === null;
          return (
            <Button
              aria-pressed={active}
              className={`warehouse-navigation__mobile-button${active ? " is-active" : ""}`}
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
