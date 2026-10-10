import { Boxes, LogOut } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import {
  DashboardNavigation,
  type DashboardSection,
} from "@/features/dashboard/components/dashboard-navigation";
import { DashboardPanel } from "@/features/dashboard/components/dashboard-panel";
import { WarehouseMap } from "@/features/dashboard/components/warehouse-map";
import { dashboardDataService } from "@/features/dashboard/services/dashboard-data-service";
import type { InventoryEvent } from "@/features/dashboard/types/inventory-event";
import type { InventoryItem } from "@/features/dashboard/types/inventory";
import type { Warehouse } from "@/features/dashboard/types/warehouse";
import type { DemoUser } from "@/features/auth/services/auth-service";
import "@/features/dashboard/dashboard.css";

type HomePageProps = {
  user: DemoUser;
  onLogout: () => void;
};

type SheetState = "closed" | "peek" | "expanded";
type NavigationTarget = "home" | DashboardSection;

export function HomePage({ user, onLogout }: HomePageProps) {
  const navigate = useNavigate();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [events, setEvents] = useState<InventoryEvent[]>([]);
  const [activeSection, setActiveSection] = useState<DashboardSection | null>(null);
  const [sheetState, setSheetState] = useState<SheetState>("closed");
  const [activeWarehouseId, setActiveWarehouseId] = useState<number | null>(null);
  const [resetKey, setResetKey] = useState(0);

  useEffect(() => {
    let mounted = true;
    Promise.all([
      dashboardDataService.getWarehouses(),
      dashboardDataService.getInventoryItems(),
      dashboardDataService.getEvents(),
    ]).then(([nextWarehouses, nextInventoryItems, nextEvents]) => {
      if (!mounted) return;
      setWarehouses(nextWarehouses);
      setInventoryItems(nextInventoryItems);
      setEvents(nextEvents);
    });

    return () => {
      mounted = false;
    };
  }, []);

  const handleNavigation = useCallback((target: NavigationTarget) => {
    setActiveWarehouseId(null);
    if (target === "home") {
      setActiveSection(null);
      setSheetState("closed");
      return;
    }

    if (activeSection === target) {
      setActiveSection(null);
      setSheetState("closed");
      return;
    }

    if (activeSection === null) setSheetState("peek");
    setActiveSection(target);
  }, [activeSection]);

  const closePanel = useCallback(() => {
    setActiveSection(null);
    setSheetState("closed");
  }, []);

  const handleSheetStateChange = useCallback((state: SheetState) => {
    setSheetState(state);
    if (state === "closed") setActiveSection(null);
  }, []);

  return (
    <main className="dashboard-shell">
      <WarehouseMap
        activeWarehouseId={activeWarehouseId}
        layoutKey={`${activeSection ?? "closed"}-${sheetState}`}
        onActiveWarehouseChange={setActiveWarehouseId}
        onOpenWarehouse={(warehouseId) => navigate(`/warehouses/${warehouseId}`)}
        onResetBounds={() => setResetKey((key) => key + 1)}
        resetKey={resetKey}
        warehouses={warehouses}
      />

      <header className="dashboard-topbar">
        <div aria-label="Склад — управление инвентарём" className="dashboard-brand">
          <span aria-hidden="true" className="dashboard-brand__icon">
            <Boxes size={19} strokeWidth={1.8} />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold leading-5">Склад</span>
            <span className="block truncate text-xs leading-4 text-muted-foreground">
              Москва · {warehouses.length} склада
            </span>
          </span>
        </div>

        <div className="dashboard-user">
          <span className="dashboard-user__email" title={user.email}>{user.email}</span>
          <Button
            aria-label="Выйти из системы"
            className="size-9 rounded-lg"
            onClick={onLogout}
            size="icon"
            title="Выйти"
            type="button"
            variant="ghost"
          >
            <LogOut aria-hidden="true" size={17} />
          </Button>
        </div>
      </header>

      <DashboardNavigation activeSection={activeSection} onNavigate={handleNavigation} />
      <DashboardPanel
        activeSection={activeSection}
        events={events}
        inventoryItems={inventoryItems}
        onClose={closePanel}
        onSheetStateChange={handleSheetStateChange}
        sheetState={sheetState}
      />
      <a
        aria-label="Лицензия OpenStreetMap и авторы картографических данных"
        className="dashboard-map-credit"
        href="https://www.openstreetmap.org/copyright"
        rel="noreferrer"
        target="_blank"
      >
        © OpenStreetMap contributors
      </a>
    </main>
  );
}
