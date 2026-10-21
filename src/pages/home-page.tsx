import { Boxes, LogOut, Plus, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/api/client";
import {
  DashboardNavigation,
  type DashboardSection,
} from "@/features/dashboard/components/dashboard-navigation";
import { DashboardPanel } from "@/features/dashboard/components/dashboard-panel";
import { EventCreateDialog } from "@/features/dashboard/components/event-create-dialog";
import { InventoryCreateDialog } from "@/features/dashboard/components/inventory-create-dialog";
import { WarehouseMap } from "@/features/dashboard/components/warehouse-map";
import { dashboardDataService } from "@/features/dashboard/services/dashboard-data-service";
import type { InventoryEvent, InventoryEventDetail } from "@/features/dashboard/types/inventory-event";
import type { InventoryItem } from "@/features/dashboard/types/inventory";
import type { Warehouse } from "@/features/dashboard/types/warehouse";
import type { AuthenticatedUser } from "@/features/auth/api/auth";
import { WarehouseCreationWizard } from "@/features/warehouse-creation/components/warehouse-creation-wizard";
import "@/features/dashboard/dashboard.css";

type HomePageProps = {
  user: AuthenticatedUser;
  onLogout: () => Promise<void>;
};

type SheetState = "closed" | "peek" | "expanded";
type NavigationTarget = "home" | DashboardSection;

function getInventoryLoadError(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 401) return "Сеанс завершён. Войдите в систему снова.";
    if (error.status === 419) return "Сеанс истёк. Обновите страницу и попробуйте снова.";
    if (error.status === 403) return "У вас нет доступа к списку инвентаря.";
    if (error.kind === "network") return "Не удалось подключиться к серверу. Проверьте соединение и повторите попытку.";
    if (error.kind === "response") return "Не удалось обработать список инвентаря. Попробуйте обновить его.";
  }
  return "Не удалось загрузить инвентарь. Попробуйте ещё раз.";
}

function getEventsLoadError(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 401) return "Сеанс завершён. Войдите в систему снова.";
    if (error.status === 419) return "Сеанс истёк. Обновите страницу и попробуйте снова.";
    if (error.status === 403) return "У вас нет доступа к событиям.";
    if (error.kind === "network") return "Не удалось подключиться к серверу. Проверьте соединение и повторите попытку.";
    if (error.kind === "response") return "Не удалось обработать список событий. Попробуйте обновить его.";
  }
  return "Не удалось загрузить события. Попробуйте ещё раз.";
}

export function HomePage({ user, onLogout }: HomePageProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [inventoryLoading, setInventoryLoading] = useState(true);
  const [inventoryLoadError, setInventoryLoadError] = useState<string | null>(null);
  const [inventoryNotice, setInventoryNotice] = useState<string | null>(null);
  const [inventoryCreateOpen, setInventoryCreateOpen] = useState(false);
  const [events, setEvents] = useState<InventoryEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [eventCreateOpen, setEventCreateOpen] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<InventoryEventDetail | null>(null);
  const [eventDetailLoading, setEventDetailLoading] = useState(false);
  const [eventDetailError, setEventDetailError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<DashboardSection | null>(null);
  const [sheetState, setSheetState] = useState<SheetState>("closed");
  const [activeWarehouseId, setActiveWarehouseId] = useState<number | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [logoutError, setLogoutError] = useState(false);
  const [warehouseLoadError, setWarehouseLoadError] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [setupWarehouseId, setSetupWarehouseId] = useState<number | null>(null);
  const [wizardInitialWarehouseId, setWizardInitialWarehouseId] = useState<number | null>(null);
  const inventoryRequestId = useRef(0);
  const eventsRequestId = useRef(0);
  const eventDetailRequestId = useRef(0);

  const loadInventory = useCallback(async () => {
    const requestId = ++inventoryRequestId.current;
    setInventoryLoading(true);
    setInventoryLoadError(null);
    try {
      const items = await dashboardDataService.getInventoryItems();
      if (requestId !== inventoryRequestId.current) return false;
      setInventoryItems(items);
      return true;
    } catch (error) {
      if (requestId === inventoryRequestId.current) {
        setInventoryLoadError(getInventoryLoadError(error));
      }
      return false;
    } finally {
      if (requestId === inventoryRequestId.current) setInventoryLoading(false);
    }
  }, []);

  const loadEvents = useCallback(async () => {
    const requestId = ++eventsRequestId.current;
    setEventsLoading(true);
    setEventsError(null);
    try {
      const nextEvents = await dashboardDataService.getEvents();
      if (requestId !== eventsRequestId.current) return false;
      setEvents(nextEvents);
      return true;
    } catch (error) {
      if (requestId === eventsRequestId.current) setEventsError(getEventsLoadError(error));
      return false;
    } finally {
      if (requestId === eventsRequestId.current) setEventsLoading(false);
    }
  }, []);

  const loadEvent = useCallback(async (eventId: number) => {
    const requestId = ++eventDetailRequestId.current;
    setSelectedEventId(eventId);
    setSelectedEvent(null);
    setEventDetailLoading(true);
    setEventDetailError(null);
    try {
      const detail = await dashboardDataService.getEvent(eventId);
      if (requestId !== eventDetailRequestId.current) return false;
      setSelectedEvent(detail);
      return true;
    } catch (error) {
      if (requestId === eventDetailRequestId.current) setEventDetailError(getEventsLoadError(error));
      return false;
    } finally {
      if (requestId === eventDetailRequestId.current) setEventDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    void dashboardDataService.getWarehouses()
      .then((nextWarehouses) => {
        if (mounted) {
          setWarehouses(nextWarehouses);
          setWarehouseLoadError(false);
        }
      })
      .catch(() => {
        if (mounted) setWarehouseLoadError(true);
      });
    void loadInventory();
    void loadEvents();

    return () => {
      mounted = false;
      inventoryRequestId.current += 1;
      eventsRequestId.current += 1;
      eventDetailRequestId.current += 1;
    };
  }, [loadEvents, loadInventory]);

  useEffect(() => {
    const routeState = location.state as { openWarehouseSetupId?: number } | null;
    if (!routeState?.openWarehouseSetupId) return;
    setSetupWarehouseId(routeState.openWarehouseSetupId);
    setWizardInitialWarehouseId(routeState.openWarehouseSetupId);
    setWizardOpen(true);
    navigate("/", { replace: true, state: null });
  }, [location.state, navigate]);

  const handleNavigation = useCallback((target: NavigationTarget) => {
    setActiveWarehouseId(null);
    if (target === "home") {
      setSelectedEventId(null);
      setSelectedEvent(null);
      setActiveSection(null);
      setSheetState("closed");
      return;
    }

    if (activeSection === target) {
      setSelectedEventId(null);
      setSelectedEvent(null);
      setActiveSection(null);
      setSheetState("closed");
      return;
    }

    if (activeSection === null) setSheetState("peek");
    if (target !== "events") {
      setSelectedEventId(null);
      setSelectedEvent(null);
    }
    setActiveSection(target);
  }, [activeSection]);

  const closePanel = useCallback(() => {
    setSelectedEventId(null);
    setSelectedEvent(null);
    setActiveSection(null);
    setSheetState("closed");
  }, []);

  const openWarehouseWizard = useCallback((warehouseId: number | null = null) => {
    setSetupWarehouseId(warehouseId);
    setWizardInitialWarehouseId(warehouseId);
    setWizardOpen(true);
  }, []);

  const closeWarehouseWizard = useCallback(() => {
    setWizardOpen(false);
    setWizardInitialWarehouseId(null);
  }, []);

  const handleWarehouseCreated = useCallback((warehouse: Warehouse) => {
    setWarehouses((current) => [
      ...current.filter((item) => item.id !== warehouse.id),
      warehouse,
    ]);
    setWarehouseLoadError(false);
    setSetupWarehouseId(warehouse.id);
  }, []);

  const handleSheetStateChange = useCallback((state: SheetState) => {
    setSheetState(state);
    if (state === "closed") setActiveSection(null);
  }, []);

  const handleInventoryCreated = useCallback(async () => {
    const refreshed = await loadInventory();
    setInventoryNotice(refreshed
      ? "Инвентарь успешно добавлен."
      : "Позиция добавлена, но список не удалось обновить. Попробуйте загрузить его ещё раз.");
  }, [loadInventory]);

  const handleEventCreated = useCallback((eventId: number) => {
    setActiveSection("events");
    setSheetState("peek");
    void loadEvents();
    void loadEvent(eventId);
  }, [loadEvent, loadEvents]);

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
              Ставрополь, Россия · {warehouses.length} склада
            </span>
          </span>
        </div>

        <div className="dashboard-topbar__actions">
          <div className="dashboard-create-actions">
            <Button
              aria-label="Создать склад"
              className="dashboard-create-actions__main"
              onClick={() => openWarehouseWizard(null)}
              title="Создать склад"
              type="button"
              variant="outline"
            >
              <Plus aria-hidden="true" size={16} />
              <span>Создать склад</span>
            </Button>
            {setupWarehouseId && (
              <Button
                aria-label={`Продолжить настройку склада ${warehouses.find((item) => item.id === setupWarehouseId)?.name ?? ""}`}
                className="dashboard-create-actions__resume"
                onClick={() => openWarehouseWizard(setupWarehouseId)}
                size="icon"
                title="Продолжить настройку склада"
                type="button"
                variant="outline"
              >
                <RotateCcw aria-hidden="true" size={15} />
              </Button>
            )}
          </div>
          <div className="dashboard-user">
            <span className="dashboard-user__email" title={user.email}>{user.email}</span>
            <Button
              aria-label="Выйти из системы"
              className="size-9 rounded-lg"
              onClick={() => {
                setLogoutError(false);
                void onLogout().catch(() => setLogoutError(true));
              }}
              size="icon"
              title="Выйти"
              type="button"
              variant="ghost"
            >
              <LogOut aria-hidden="true" size={17} />
            </Button>
          </div>
        </div>
        {logoutError && (
          <p className="dashboard-logout-error" role="alert">
            Не удалось завершить сеанс. Попробуйте ещё раз.
          </p>
        )}
      </header>

      {warehouseLoadError && (
        <div className="dashboard-warehouse-error" role="alert">
          Не удалось загрузить список складов. Проверьте соединение с сервером.
        </div>
      )}

      <DashboardNavigation activeSection={activeSection} onNavigate={handleNavigation} />
      <DashboardPanel
        activeSection={activeSection}
        events={events}
        eventsLoading={eventsLoading}
        eventsError={eventsError}
        eventDetailOpen={selectedEventId !== null}
        eventDetail={selectedEvent}
        eventDetailLoading={eventDetailLoading}
        eventDetailError={eventDetailError}
        inventoryError={inventoryLoadError}
        inventoryLoading={inventoryLoading}
        inventoryNotice={inventoryNotice}
        inventoryItems={inventoryItems}
        onAddInventory={() => {
          setInventoryNotice(null);
          setInventoryCreateOpen(true);
        }}
        onClose={closePanel}
        onRetryInventory={() => void loadInventory()}
        onRetryEvents={() => void loadEvents()}
        onRetryEventDetail={() => {
          if (selectedEventId !== null) void loadEvent(selectedEventId);
        }}
        onCreateEvent={() => setEventCreateOpen(true)}
        onOpenEvent={(eventId) => void loadEvent(eventId)}
        onBackToEvents={() => {
          eventDetailRequestId.current += 1;
          setSelectedEventId(null);
          setSelectedEvent(null);
          setEventDetailLoading(false);
          setEventDetailError(null);
        }}
        onOpenPlacement={(warehouseId, cellId) => {
          navigate(`/warehouses/${warehouseId}?cellId=${encodeURIComponent(cellId)}`);
        }}
        onSheetStateChange={handleSheetStateChange}
        sheetState={sheetState}
      />
      <InventoryCreateDialog
        onClose={() => setInventoryCreateOpen(false)}
        onCreated={handleInventoryCreated}
        open={inventoryCreateOpen}
      />
      <EventCreateDialog
        onClose={() => setEventCreateOpen(false)}
        onCreated={handleEventCreated}
        open={eventCreateOpen}
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
      <WarehouseCreationWizard
        initialWarehouseId={wizardInitialWarehouseId}
        onClose={closeWarehouseWizard}
        onOpenWarehouse={(warehouseId) => {
          setSetupWarehouseId(null);
          navigate(`/warehouses/${warehouseId}`);
        }}
        onWarehouseCreated={handleWarehouseCreated}
        open={wizardOpen}
      />
    </main>
  );
}
