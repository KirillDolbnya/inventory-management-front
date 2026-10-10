import { X } from "lucide-react";
import {
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Button } from "@/components/ui/button";
import { EventsTimeline } from "@/features/dashboard/components/events-timeline";
import { InventoryList } from "@/features/dashboard/components/inventory-list";
import type { DashboardSection } from "@/features/dashboard/components/dashboard-navigation";
import type { InventoryEvent } from "@/features/dashboard/types/inventory-event";
import type { InventoryItem } from "@/features/dashboard/types/inventory";

type SheetState = "closed" | "peek" | "expanded";

type DashboardPanelProps = {
  activeSection: DashboardSection | null;
  sheetState: SheetState;
  inventoryItems: InventoryItem[];
  events: InventoryEvent[];
  onClose: () => void;
  onSheetStateChange: (state: SheetState) => void;
};

export function DashboardPanel({
  activeSection,
  sheetState,
  inventoryItems,
  events,
  onClose,
  onSheetStateChange,
}: DashboardPanelProps) {
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
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
  const countLabel = activeSection === "events" ? `${count} событий` : `${count} позиций`;

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
          <div className="dashboard-panel__events-scroll">
            <EventsTimeline events={events} />
          </div>
        ) : (
          <InventoryList items={inventoryItems} />
        )}
      </div>
    </section>
  );
}
