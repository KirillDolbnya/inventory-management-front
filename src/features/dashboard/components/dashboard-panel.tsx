import { LoaderCircle, Plus, RefreshCw, X } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Button } from "@/components/ui/button";
import { EventsTimeline } from "@/features/dashboard/components/events-timeline";
import { EventDetail } from "@/features/dashboard/components/event-detail";
import { InventoryDetail } from "@/features/dashboard/components/inventory-detail";
import { InventoryList } from "@/features/dashboard/components/inventory-list";
import type { DashboardSection } from "@/features/dashboard/components/dashboard-navigation";
import type { InventoryEvent, InventoryEventDetail } from "@/features/dashboard/types/inventory-event";
import type { InventoryItem } from "@/features/dashboard/types/inventory";

type SheetState = "closed" | "peek" | "expanded";

type DashboardPanelProps = {
  activeSection: DashboardSection | null;
  sheetState: SheetState;
  inventoryItems: InventoryItem[];
  inventoryLoading: boolean;
  inventoryError: string | null;
  inventoryNotice: string | null;
  events: InventoryEvent[];
  eventsLoading: boolean;
  eventsError: string | null;
  eventDetailOpen: boolean;
  eventDetail: InventoryEventDetail | null;
  eventDetailLoading: boolean;
  eventDetailError: string | null;
  onRetryInventory: () => void;
  onRetryEvents: () => void;
  onRetryEventDetail: () => void;
  onCreateEvent: () => void;
  onOpenEvent: (eventId: number) => void;
  onBackToEvents: () => void;
  onAddInventory: () => void;
  onOpenPlacement: (warehouseId: number, cellId: number) => void;
  onClose: () => void;
  onSheetStateChange: (state: SheetState) => void;
};

export function DashboardPanel({
  activeSection,
  sheetState,
  inventoryItems,
  inventoryLoading,
  inventoryError,
  inventoryNotice,
  events,
  eventsLoading,
  eventsError,
  eventDetailOpen,
  eventDetail,
  eventDetailLoading,
  eventDetailError,
  onRetryInventory,
  onRetryEvents,
  onRetryEventDetail,
  onCreateEvent,
  onOpenEvent,
  onBackToEvents,
  onAddInventory,
  onOpenPlacement,
  onClose,
  onSheetStateChange,
}: DashboardPanelProps) {
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [inventoryQuery, setInventoryQuery] = useState("");
  const [selectedInventoryId, setSelectedInventoryId] = useState<number | null>(null);
  const dragStart = useRef<{ pointerId: number; y: number } | null>(null);
  const wasDragged = useRef(false);
  const isOpen = activeSection !== null;

  const startDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    dragStart.current = { pointerId: event.pointerId, y: event.clientY };
    wasDragged.current = false;
    setIsDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const updateDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!dragStart.current || dragStart.current.pointerId !== event.pointerId) return;
    const delta = event.clientY - dragStart.current.y;
    if (Math.abs(delta) > 6) wasDragged.current = true;
    setDragOffset(Math.max(-150, Math.min(220, delta)));
  };

  const finishDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!dragStart.current || dragStart.current.pointerId !== event.pointerId) return;
    const delta = event.clientY - dragStart.current.y;
    dragStart.current = null;
    setIsDragging(false);
    setDragOffset(0);

    if (delta < -70) onSheetStateChange("expanded");
    else if (delta > 90) onSheetStateChange(sheetState === "expanded" ? "peek" : "closed");
  };

  const title = activeSection === "events" ? "События" : "Инвентарь";
  const count = activeSection === "events" ? events.length : inventoryItems.length;
  const countLabel = activeSection === "events"
    ? `${count} ${getCountWord(count, "событие", "события", "событий")}`
    : `${count} ${getCountWord(count, "позиция", "позиции", "позиций")}`;
  const selectedInventory = inventoryItems.find((item) => item.id === selectedInventoryId) ?? null;

  useEffect(() => {
    if (!inventoryNotice) return;
    setInventoryQuery("");
    setSelectedInventoryId(null);
  }, [inventoryNotice]);

  return (
    <section
      aria-hidden={!isOpen}
      aria-label={title}
      className="dashboard-panel"
      data-dragging={isDragging}
      data-open={isOpen}
      data-sheet={sheetState}
      inert={!isOpen}
      style={{ "--drag-offset": `${isDragging ? dragOffset : 0}px` } as CSSProperties}
    >
      <div className="dashboard-panel__mobile-grab-area">
        <button
          aria-label={sheetState === "expanded" ? "Свернуть панель" : "Развернуть панель"}
          className="dashboard-panel__grabber"
          onClick={() => {
            if (wasDragged.current) {
              wasDragged.current = false;
              return;
            }
            onSheetStateChange(sheetState === "expanded" ? "peek" : "expanded");
          }}
          onPointerCancel={finishDrag}
          onPointerDown={startDrag}
          onPointerMove={updateDrag}
          onPointerUp={finishDrag}
          type="button"
        >
          <span aria-hidden="true" />
        </button>
      </div>

      <header className="dashboard-panel__header">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold tracking-tight">{title}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{countLabel}</p>
        </div>
        <Button
          aria-label="Закрыть панель"
          className="size-9 rounded-lg"
          onClick={onClose}
          size="icon"
          type="button"
          variant="ghost"
        >
          <X aria-hidden="true" size={17} />
        </Button>
      </header>

      <div className="dashboard-panel__content">
        {activeSection === "events" ? (
          eventDetailOpen ? (
            <EventDetail
              error={eventDetailError}
              event={eventDetail}
              loading={eventDetailLoading}
              onBack={onBackToEvents}
              onRetry={onRetryEventDetail}
            />
          ) : (
            <div className="flex h-full min-h-0 flex-col">
              <div className="px-5 pb-3 pt-4 sm:px-6">
                <Button className="h-10 w-full justify-center rounded-lg" onClick={onCreateEvent} type="button">
                  <Plus aria-hidden="true" size={16} />
                  Создать событие
                </Button>
              </div>
              <div className="dashboard-panel__events-scroll min-h-0 flex-1">
                {eventsLoading ? (
                  <div className="flex min-h-44 items-center justify-center gap-2 text-sm text-muted-foreground" role="status">
                    <LoaderCircle aria-hidden="true" className="animate-spin" size={17} />
                    Загружаем события…
                  </div>
                ) : eventsError ? (
                  <div className="flex min-h-52 flex-col items-center justify-center px-4 text-center">
                    <p className="max-w-64 text-sm leading-5 text-muted-foreground" role="alert">{eventsError}</p>
                    <Button className="mt-4 h-10 rounded-lg" onClick={onRetryEvents} type="button" variant="outline">
                      <RefreshCw aria-hidden="true" size={15} />
                      Повторить
                    </Button>
                  </div>
                ) : (
                  <EventsTimeline events={events} onSelectEvent={onOpenEvent} />
                )}
              </div>
            </div>
          )
        ) : selectedInventory ? (
          <InventoryDetail
            item={selectedInventory}
            onBack={() => setSelectedInventoryId(null)}
            onOpenPlacement={onOpenPlacement}
          />
        ) : (
          <InventoryList
            error={inventoryError}
            items={inventoryItems}
            loading={inventoryLoading}
            notice={inventoryNotice}
            query={inventoryQuery}
            onAdd={onAddInventory}
            onQueryChange={setInventoryQuery}
            onRetry={onRetryInventory}
            onSelectItem={(item) => setSelectedInventoryId(item.id)}
          />
        )}
      </div>
    </section>
  );
}

function getCountWord(count: number, one: string, few: string, many: string) {
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}
