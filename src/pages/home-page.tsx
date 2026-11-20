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
import { EventManagementDialog } from "@/features/dashboard/components/event-management-dialog";
import { InventoryCreateDialog } from "@/features/dashboard/components/inventory-create-dialog";
import { InventoryManagementDialog } from "@/features/dashboard/components/inventory-management-dialog";
import { ReservationManagementDialog } from "@/features/dashboard/components/reservation-management-dialog";
import { WarehouseMap } from "@/features/dashboard/components/warehouse-map";
import { dashboardDataService } from "@/features/dashboard/services/dashboard-data-service";
import type { EventReservation, InventoryEvent, InventoryEventDetail } from "@/features/dashboard/types/inventory-event";
import type { InventoryItem } from "@/features/dashboard/types/inventory";
import type { Warehouse } from "@/features/dashboard/types/warehouse";
import type { AuthenticatedUser } from "@/features/auth/api/auth";
import { WarehouseCreationWizard } from "@/features/warehouse-creation/components/warehouse-creation-wizard";
import { WarehouseManagementDialog, type WarehouseManagementMode } from "@/features/warehouse/components/warehouse-management-dialog";
import "@/features/dashboard/dashboard.css";

type HomePageProps = {
  user: AuthenticatedUser;
  onLogout: () => Promise<void>;
};

type SheetState = "closed" | "peek" | "expanded";
type NavigationTarget = "home" | DashboardSection;
type InventoryManagementMode = "edit" | "delete";
type EventManagementMode = "edit" | "delete";
type ReservationManagementMode = "create" | "edit" | "delete";

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

function getInventoryDetailLoadError(error: unknown) {
  if (error instanceof ApiError && error.status === 404) {
    return "Эта позиция больше не найдена. Обновите список или выберите другой инвентарь.";
  }
  return getInventoryLoadError(error);
}

function getEventsLoadError(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 401) return "Сеанс завершён. Войдите в систему снова.";
    if (error.status === 419) return "Сеанс истёк. Обновите страницу и попробуйте снова.";
    if (error.status === 403) return "У вас нет доступа к событиям.";
    if (error.status === 404) return "Событие больше не найдено. Обновите список событий.";
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
  const [selectedInventoryId, setSelectedInventoryId] = useState<number | null>(null);
  const [selectedInventory, setSelectedInventory] = useState<InventoryItem | null>(null);
  const [inventoryDetailLoading, setInventoryDetailLoading] = useState(false);
  const [inventoryDetailError, setInventoryDetailError] = useState<string | null>(null);
  const [inventoryManagement, setInventoryManagement] = useState<{ item: InventoryItem; mode: InventoryManagementMode } | null>(null);
  const [events, setEvents] = useState<InventoryEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [eventCreateOpen, setEventCreateOpen] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<InventoryEventDetail | null>(null);
  const [eventDetailLoading, setEventDetailLoading] = useState(false);
  const [eventDetailError, setEventDetailError] = useState<string | null>(null);
  const [eventManagement, setEventManagement] = useState<{ event: InventoryEventDetail; mode: EventManagementMode } | null>(null);
  const [reservationManagement, setReservationManagement] = useState<{
    event: InventoryEventDetail;
    mode: ReservationManagementMode;
    reservation?: EventReservation;
  } | null>(null);
  const [activeSection, setActiveSection] = useState<DashboardSection | null>(null);
  const [sheetState, setSheetState] = useState<SheetState>("closed");
  const [activeWarehouseId, setActiveWarehouseId] = useState<number | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [logoutError, setLogoutError] = useState(false);
  const [warehouseLoadError, setWarehouseLoadError] = useState(false);
  const [warehouseLoading, setWarehouseLoading] = useState(true);
  const [warehouseNotice, setWarehouseNotice] = useState<string | null>(null);
  const [warehouseManagement, setWarehouseManagement] = useState<{ warehouse: Warehouse; mode: WarehouseManagementMode } | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [setupWarehouseId, setSetupWarehouseId] = useState<number | null>(null);
  const [wizardInitialWarehouseId, setWizardInitialWarehouseId] = useState<number | null>(null);
  const inventoryRequestId = useRef(0);
  const inventoryDetailRequestId = useRef(0);
  const eventsRequestId = useRef(0);
  const eventDetailRequestId = useRef(0);
  const warehouseRequestId = useRef(0);
  const inventoryCreateCloseRequestRef = useRef<(() => boolean) | null>(null);
  const inventoryManagementCloseRequestRef = useRef<(() => boolean) | null>(null);
  const eventCreateCloseRequestRef = useRef<(() => boolean) | null>(null);
  const eventManagementCloseRequestRef = useRef<(() => boolean) | null>(null);
  const reservationCloseRequestRef = useRef<(() => boolean) | null>(null);
  const wizardNavigationCloseRequestRef = useRef<(() => boolean) | null>(null);

  const closeDashboardEditors = useCallback(() => {
    const openRequests = [
      { open: inventoryCreateOpen, request: inventoryCreateCloseRequestRef.current },
      { open: Boolean(inventoryManagement), request: inventoryManagementCloseRequestRef.current },
      { open: eventCreateOpen, request: eventCreateCloseRequestRef.current },
      { open: Boolean(eventManagement), request: eventManagementCloseRequestRef.current },
      { open: Boolean(reservationManagement), request: reservationCloseRequestRef.current },
    ].filter((item) => item.open);
    if (openRequests.some((item) => item.request === null)) return false;

    for (const { request } of openRequests) {
      if (request && !request()) return false;
    }

    setInventoryCreateOpen(false);
    setInventoryManagement(null);
    setEventCreateOpen(false);
    setEventManagement(null);
    setReservationManagement(null);
    return true;
  }, [eventCreateOpen, eventManagement, inventoryCreateOpen, inventoryManagement, reservationManagement]);

  const loadWarehouses = useCallback(async () => {
    const requestId = ++warehouseRequestId.current;
    setWarehouseLoading(true);
    setWarehouseLoadError(false);
    try {
      const nextWarehouses = await dashboardDataService.getWarehouses();
      if (requestId !== warehouseRequestId.current) return false;
      setWarehouses(nextWarehouses);
      return true;
    } catch {
      if (requestId === warehouseRequestId.current) setWarehouseLoadError(true);
      return false;
    } finally {
      if (requestId === warehouseRequestId.current) setWarehouseLoading(false);
    }
  }, []);

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

  const loadInventoryDetail = useCallback(async (inventoryId: number) => {
    const requestId = ++inventoryDetailRequestId.current;
    setSelectedInventoryId(inventoryId);
    setSelectedInventory(null);
    setInventoryDetailLoading(true);
    setInventoryDetailError(null);
    try {
      const result = await dashboardDataService.getInventoryDetail(inventoryId);
      if (requestId !== inventoryDetailRequestId.current) return false;
      setInventoryItems(result.items);
      setInventoryLoadError(null);
      setSelectedInventory(result.item);
      return true;
    } catch (error) {
      if (requestId === inventoryDetailRequestId.current) {
        setInventoryDetailError(getInventoryDetailLoadError(error));
        if (error instanceof ApiError && error.status === 404) void loadInventory();
      }
      return false;
    } finally {
      if (requestId === inventoryDetailRequestId.current) setInventoryDetailLoading(false);
    }
  }, [loadInventory]);

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
    void loadWarehouses();
    void loadInventory();
    void loadEvents();

    return () => {
      warehouseRequestId.current += 1;
      inventoryRequestId.current += 1;
      inventoryDetailRequestId.current += 1;
      eventsRequestId.current += 1;
      eventDetailRequestId.current += 1;
    };
  }, [loadEvents, loadInventory, loadWarehouses]);

  useEffect(() => {
    const routeState = location.state as { openWarehouseSetupId?: number } | null;
    if (!routeState?.openWarehouseSetupId) return;
    setSetupWarehouseId(routeState.openWarehouseSetupId);
    setWizardInitialWarehouseId(routeState.openWarehouseSetupId);
    setWizardOpen(true);
    navigate("/", { replace: true, state: null });
  }, [location.state, navigate]);

  const handleNavigation = useCallback((target: NavigationTarget) => {
    if (wizardOpen && (!wizardNavigationCloseRequestRef.current || !wizardNavigationCloseRequestRef.current())) return;
    if (!closeDashboardEditors()) return;
    setActiveWarehouseId(null);
    setSelectedEventId(null);
    setSelectedEvent(null);
    setSelectedInventoryId(null);
    setSelectedInventory(null);
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
  }, [activeSection, closeDashboardEditors, wizardOpen]);

  const closePanel = useCallback(() => {
    if (!closeDashboardEditors()) return;
    setSelectedEventId(null);
    setSelectedEvent(null);
    setSelectedInventoryId(null);
    setSelectedInventory(null);
    setActiveSection(null);
    setSheetState("closed");
  }, [closeDashboardEditors]);

  const openWarehouseWizard = useCallback((warehouseId: number | null = null) => {
    if (!closeDashboardEditors()) return;
    setSelectedEventId(null);
    setSelectedEvent(null);
    setSelectedInventoryId(null);
    setSelectedInventory(null);
    setActiveSection(null);
    setSheetState("closed");
    setActiveWarehouseId(null);
    setSetupWarehouseId(warehouseId);
    setWizardInitialWarehouseId(warehouseId);
    setWizardOpen(true);
  }, [closeDashboardEditors]);

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

  const handleWarehouseUpdated = useCallback((warehouse: Warehouse) => {
    setWarehouses((current) => current.map((item) => item.id === warehouse.id ? warehouse : item));
    setWarehouseNotice("Данные склада обновлены.");
  }, []);

  const handleWarehouseDeleted = useCallback(() => {
    if (!warehouseManagement) return;
    if (warehouseManagement.mode === "delete-layout") {
      setWarehouseNotice("Планировка склада удалена.");
      return;
    }
    setWarehouses((current) => current.filter((item) => item.id !== warehouseManagement.warehouse.id));
    setActiveWarehouseId((current) => current === warehouseManagement.warehouse.id ? null : current);
    setWarehouseNotice("Склад удалён.");
  }, [warehouseManagement]);

  const handleSheetStateChange = useCallback((state: SheetState) => {
    setSheetState(state);
    if (state === "closed") {
      setSelectedEventId(null);
      setSelectedEvent(null);
      setSelectedInventoryId(null);
      setSelectedInventory(null);
      setActiveSection(null);
    }
  }, []);

  const handleInventoryCreated = useCallback(async () => {
    const refreshed = await loadInventory();
    setInventoryNotice(refreshed
      ? "Инвентарь успешно добавлен."
      : "Позиция добавлена, но список не удалось обновить. Попробуйте загрузить его ещё раз.");
  }, [loadInventory]);

  const handleInventoryUpdated = useCallback(async (updated: { id: number }) => {
    const refreshed = await loadInventoryDetail(updated.id);
    if (!refreshed) {
      setInventoryLoadError("Изменения сохранены, но список и количества не удалось обновить. Нажмите «Повторить».");
      setInventoryNotice("Изменения сохранены. Для актуальных остатков обновите список.");
    }
  }, [loadInventoryDetail]);

  const handleInventoryDeleted = useCallback(async (inventoryId: number) => {
    inventoryDetailRequestId.current += 1;
    setSelectedInventoryId(null);
    setSelectedInventory(null);
    setInventoryDetailError(null);
    setInventoryItems((current) => current.filter((item) => item.id !== inventoryId));
    const refreshed = await loadInventory();
    setInventoryNotice(refreshed
      ? "Инвентарь удалён."
      : "Инвентарь удалён, но список не удалось обновить. Нажмите «Повторить».");
  }, [loadInventory]);

  const backToInventoryList = useCallback(() => {
    inventoryDetailRequestId.current += 1;
    setSelectedInventoryId(null);
    setSelectedInventory(null);
    setInventoryDetailLoading(false);
    setInventoryDetailError(null);
  }, []);

  const handleEventCreated = useCallback((eventId: number) => {
    setActiveSection("events");
    setSheetState("peek");
    void loadEvents();
    void loadEvent(eventId);
  }, [loadEvent, loadEvents]);

  const handleEventUpdated = useCallback(async (eventId: number) => {
    await Promise.all([loadEvents(), loadEvent(eventId)]);
  }, [loadEvent, loadEvents]);

  const handleEventDeleted = useCallback(async (eventId: number) => {
    eventDetailRequestId.current += 1;
    setSelectedEventId(null);
    setSelectedEvent(null);
    setEventDetailLoading(false);
    setEventDetailError(null);
    setEvents((current) => current.filter((item) => item.id !== eventId));
    await loadEvents();
  }, [loadEvents]);

  const handleReservationSaved = useCallback(async (eventId: number) => {
    await loadEvent(eventId);
  }, [loadEvent]);

  return (
    <main
      className="dashboard-shell"
      data-editor-open={Boolean(inventoryCreateOpen || inventoryManagement || eventCreateOpen || eventManagement || warehouseManagement || wizardOpen)}
    >
      <WarehouseMap
        activeWarehouseId={activeWarehouseId}
        layoutKey={`${activeSection ?? "closed"}-${sheetState}`}
        onActiveWarehouseChange={setActiveWarehouseId}
        onOpenWarehouse={(warehouseId) => navigate(`/warehouses/${warehouseId}`)}
        onEditWarehouse={(warehouse) => {
          if (!closeDashboardEditors()) return;
          setWarehouseNotice(null);
          setWarehouseManagement({ warehouse, mode: "edit" });
        }}
        onDeleteWarehouse={(warehouse) => {
          if (!closeDashboardEditors()) return;
          setWarehouseNotice(null);
          setWarehouseManagement({ warehouse, mode: "delete" });
        }}
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
          <span>Не удалось загрузить список складов. Проверьте соединение с сервером.</span>
          <Button className="h-8 rounded-md px-2 text-xs" onClick={() => void loadWarehouses()} type="button" variant="outline">Повторить</Button>
        </div>
      )}
      {!warehouseLoadError && warehouseLoading && (
        <div className="dashboard-warehouse-state" role="status">Загружаем склады…</div>
      )}
      {!warehouseLoadError && !warehouseLoading && warehouses.length === 0 && (
        <div className="dashboard-warehouse-state dashboard-warehouse-state--empty">
          <strong>Пока нет складов</strong>
          <span>Создайте первый склад, чтобы он появился на карте.</span>
          <Button className="h-9 rounded-lg" onClick={() => openWarehouseWizard(null)} type="button" variant="outline">
            <Plus aria-hidden="true" size={15} /> Создать склад
          </Button>
        </div>
      )}
      {warehouseNotice && <div className="dashboard-warehouse-notice" role="status">{warehouseNotice}</div>}

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
        inventoryDetailId={selectedInventoryId}
        inventoryDetail={selectedInventory}
        inventoryDetailLoading={inventoryDetailLoading}
        inventoryDetailError={inventoryDetailError}
        onAddInventory={() => {
          if (inventoryCreateOpen) return;
          if (!closeDashboardEditors()) return;
          setInventoryNotice(null);
          setInventoryCreateOpen(true);
        }}
        onClose={closePanel}
        onRetryInventory={() => void loadInventory()}
        onRetryInventoryDetail={() => {
          if (selectedInventoryId !== null) void loadInventoryDetail(selectedInventoryId);
        }}
        onOpenInventory={(inventoryId) => void loadInventoryDetail(inventoryId)}
        onBackToInventory={backToInventoryList}
        onEditInventory={() => {
          if (selectedInventory && closeDashboardEditors()) setInventoryManagement({ item: selectedInventory, mode: "edit" });
        }}
        onDeleteInventory={() => {
          if (selectedInventory && closeDashboardEditors()) setInventoryManagement({ item: selectedInventory, mode: "delete" });
        }}
        onRetryEvents={() => void loadEvents()}
        onRetryEventDetail={() => {
          if (selectedEventId !== null) void loadEvent(selectedEventId);
        }}
        onCreateEvent={() => {
          if (eventCreateOpen) return;
          if (closeDashboardEditors()) setEventCreateOpen(true);
        }}
        onOpenEvent={(eventId) => void loadEvent(eventId)}
        onBackToEvents={() => {
          eventDetailRequestId.current += 1;
          setSelectedEventId(null);
          setSelectedEvent(null);
          setEventDetailLoading(false);
          setEventDetailError(null);
        }}
        onEditEvent={() => {
          if (selectedEvent && closeDashboardEditors()) setEventManagement({ event: selectedEvent, mode: "edit" });
        }}
        onDeleteEvent={() => {
          if (selectedEvent && closeDashboardEditors()) setEventManagement({ event: selectedEvent, mode: "delete" });
        }}
        onAddReservation={() => {
          if (selectedEvent && closeDashboardEditors()) setReservationManagement({ event: selectedEvent, mode: "create" });
        }}
        onEditReservation={(reservation) => {
          if (selectedEvent && closeDashboardEditors()) setReservationManagement({ event: selectedEvent, mode: "edit", reservation });
        }}
        onDeleteReservation={(reservation) => {
          if (selectedEvent && closeDashboardEditors()) setReservationManagement({ event: selectedEvent, mode: "delete", reservation });
        }}
        onOpenPlacement={(warehouseId, cellId) => {
          navigate(`/warehouses/${warehouseId}?cellId=${encodeURIComponent(cellId)}`);
        }}
        onSheetStateChange={handleSheetStateChange}
        sheetState={sheetState}
      />
      <InventoryCreateDialog
        closeRequestRef={inventoryCreateCloseRequestRef}
        onClose={() => setInventoryCreateOpen(false)}
        onCreated={handleInventoryCreated}
        open={inventoryCreateOpen}
      />
      {inventoryManagement && (
        <InventoryManagementDialog
          key={`${inventoryManagement.item.id}-${inventoryManagement.mode}`}
          item={inventoryManagement.item}
          mode={inventoryManagement.mode}
          closeRequestRef={inventoryManagementCloseRequestRef}
          onClose={() => setInventoryManagement(null)}
          onDeleted={handleInventoryDeleted}
          onUpdated={handleInventoryUpdated}
        />
      )}
      <EventCreateDialog
        closeRequestRef={eventCreateCloseRequestRef}
        onClose={() => setEventCreateOpen(false)}
        onCreated={handleEventCreated}
        open={eventCreateOpen}
      />
      {eventManagement && (
        <EventManagementDialog
          key={`${eventManagement.event.id}-${eventManagement.mode}`}
          event={eventManagement.event}
          mode={eventManagement.mode}
          closeRequestRef={eventManagementCloseRequestRef}
          onClose={() => setEventManagement(null)}
          onDeleted={handleEventDeleted}
          onUpdated={handleEventUpdated}
        />
      )}
      {reservationManagement && (
        <ReservationManagementDialog
          key={`${reservationManagement.event.id}-${reservationManagement.mode}-${reservationManagement.reservation?.id ?? "new"}`}
          eventId={reservationManagement.event.id}
          eventName={reservationManagement.event.name}
          mode={reservationManagement.mode}
          closeRequestRef={reservationCloseRequestRef}
          onClose={() => setReservationManagement(null)}
          onSaved={handleReservationSaved}
          reservation={reservationManagement.reservation}
          reservations={reservationManagement.event.reservations}
        />
      )}
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
        closeRequestRef={wizardNavigationCloseRequestRef}
        initialWarehouseId={wizardInitialWarehouseId}
        onClose={closeWarehouseWizard}
        onOpenWarehouse={(warehouseId) => {
          setSetupWarehouseId(null);
          navigate(`/warehouses/${warehouseId}`);
        }}
        onWarehouseCreated={handleWarehouseCreated}
        open={wizardOpen}
      />
      {warehouseManagement && (
        <WarehouseManagementDialog
          key={`${warehouseManagement.warehouse.id}-${warehouseManagement.mode}`}
          context="dashboard"
          mode={warehouseManagement.mode}
          onClose={() => setWarehouseManagement(null)}
          onDeleted={handleWarehouseDeleted}
          onSaved={handleWarehouseUpdated}
          open
          warehouse={warehouseManagement.warehouse}
        />
      )}
    </main>
  );
}
