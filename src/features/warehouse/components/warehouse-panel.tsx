import { X } from "lucide-react";
import { useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { Button } from "@/components/ui/button";
import { EventsTimeline } from "@/features/dashboard/components/events-timeline";
import { CellInventoryList, WarehouseInventoryList } from "@/features/warehouse/components/warehouse-inventory-list";
import type { InventoryEvent } from "@/features/dashboard/types/inventory-event";
import type { Cell, Rack, WarehouseCellItem, WarehouseInventoryItem, WarehousePanel } from "@/features/warehouse/types";

type SheetState = "closed" | "peek" | "expanded";

type WarehousePanelProps = {
  activePanel: WarehousePanel | null;
  sheetState: SheetState;
  inventoryItems: WarehouseInventoryItem[];
  events: InventoryEvent[];
  selectedCell: { rack: Rack; cell: Cell } | null;
  cellItems: WarehouseCellItem[];
  onClose: () => void;
  onSheetStateChange: (state: SheetState) => void;
};

export function WarehousePanel({
  activePanel,
  sheetState,
  inventoryItems,
  events,
  selectedCell,
  cellItems,
  onClose,
  onSheetStateChange,
}: WarehousePanelProps) {
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef<{ pointerId: number; y: number } | null>(null);
  const wasDragged = useRef(false);
  const isOpen = activePanel !== null;

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

  const isCellPanel = activePanel === "cell" && selectedCell;
  const title = activePanel === "events"
    ? "События"
    : activePanel === "cell" && selectedCell
      ? `Ячейка №${selectedCell.cell.number}`
      : "Инвентарь";
  const subtitle = activePanel === "events"
    ? `${events.length} событий`
    : isCellPanel
      ? `Стеллаж ${selectedCell.rack.code} · уровень ${selectedCell.cell.level} · позиция ${selectedCell.cell.position}`
      : `${inventoryItems.length} позиций`;

  return (
    <section
      aria-hidden={!isOpen}
      aria-label={title}
      className="warehouse-panel"
      data-dragging={isDragging}
      data-open={isOpen}
      data-sheet={sheetState}
      inert={!isOpen}
      style={{ "--warehouse-drag-offset": `${isDragging ? dragOffset : 0}px` } as CSSProperties}
    >
      <div className="warehouse-panel__grab-area">
        <button
          aria-label={sheetState === "expanded" ? "Свернуть панель" : "Развернуть панель"}
          className="warehouse-panel__grabber"
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
      <header className="warehouse-panel__header">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold tracking-tight">{title}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
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

      <div className="warehouse-panel__content">
        {activePanel === "events" ? (
          <EventsTimeline events={events} />
        ) : activePanel === "cell" && selectedCell ? (
          <CellInventoryList rack={selectedCell.rack} cell={selectedCell.cell} items={cellItems} />
        ) : (
          <WarehouseInventoryList items={inventoryItems} />
        )}
      </div>
    </section>
  );
}
