import { X } from "lucide-react";
import { useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { Button } from "@/components/ui/button";
import { EventsTimeline } from "@/features/dashboard/components/events-timeline";
import { CellPlacementForm } from "@/features/warehouse/components/cell-placement-form";
import { CellTransferForm } from "@/features/warehouse/components/cell-transfer-form";
import { CellUnplaceForm } from "@/features/warehouse/components/cell-unplace-form";
import { CellInventoryList, WarehouseInventoryList } from "@/features/warehouse/components/warehouse-inventory-list";
import type { InventoryEvent } from "@/features/dashboard/types/inventory-event";
import type { InventoryItem } from "@/features/dashboard/types/inventory";
import type { Warehouse } from "@/features/dashboard/types/warehouse";
import type { Cell, Rack, WarehouseCellItem, WarehouseInventoryItem, WarehousePanel } from "@/features/warehouse/types";

type SheetState = "closed" | "peek" | "expanded";

type WarehousePanelProps = {
  activePanel: WarehousePanel | null;
  sheetState: SheetState;
  inventoryItems: WarehouseInventoryItem[];
  events: InventoryEvent[];
  selectedCell: { rack: Rack; cell: Cell } | null;
  currentWarehouse: Warehouse;
  currentRacks: Rack[];
  cellItems: WarehouseCellItem[];
  availableItems: InventoryItem[];
  cellView: "details" | "place" | "transfer" | "unplace";
  transferItem: WarehouseCellItem | null;
  unplaceItem: WarehouseCellItem | null;
  pickedTarget: { rack: Rack; cell: Cell } | null;
  selectionNotice: string | null;
  isPickingTarget: boolean;
  cellItemsLoading: boolean;
  cellItemsError: string | null;
  placementNotice: string | null;
  onClose: () => void;
  onSheetStateChange: (state: SheetState) => void;
  onCellRetry: () => void;
  onOpenPlacement: () => void;
  onOpenInventoryPlacement: (rackId: number, cellId: number) => void;
  onBackToCell: () => void;
  onPlaceInventory: (inventoryId: number, quantity: number) => Promise<void>;
  onOpenTransfer: (item: WarehouseCellItem) => void;
  onOpenUnplace: (item: WarehouseCellItem) => void;
  onPickTargetOnModel: () => void;
  onTransferInventory: (placementId: number, targetCellId: number, quantity: number) => Promise<void>;
  onUnplaceInventory: (placementId: number, quantity: number) => Promise<void>;
};

export function WarehousePanel({
  activePanel,
  sheetState,
  inventoryItems,
  events,
  selectedCell,
  currentWarehouse,
  currentRacks,
  cellItems,
  availableItems,
  cellView,
  transferItem,
  unplaceItem,
  pickedTarget,
  selectionNotice,
  isPickingTarget,
  cellItemsLoading,
  cellItemsError,
  placementNotice,
  onClose,
  onSheetStateChange,
  onCellRetry,
  onOpenPlacement,
  onOpenInventoryPlacement,
  onBackToCell,
  onPlaceInventory,
  onOpenTransfer,
  onOpenUnplace,
  onPickTargetOnModel,
  onTransferInventory,
  onUnplaceInventory,
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
      aria-hidden={!isOpen || isPickingTarget}
      aria-label={title}
      className="warehouse-panel"
      data-dragging={isDragging}
      data-open={isOpen}
      data-picking-target={isPickingTarget}
      data-sheet={sheetState}
      inert={!isOpen || isPickingTarget}
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
          cellView === "place" ? (
            <CellPlacementForm inventoryItems={availableItems} onBack={onBackToCell} onPlace={onPlaceInventory} />
          ) : cellView === "transfer" && transferItem ? (
            <CellTransferForm
              item={transferItem}
              onBack={onBackToCell}
              onPickOnModel={onPickTargetOnModel}
              onTransfer={onTransferInventory}
              pickedTarget={pickedTarget}
              selectionNotice={selectionNotice}
              sourceCell={selectedCell.cell}
              sourceRack={selectedCell.rack}
              sourceRacks={currentRacks}
              sourceWarehouse={currentWarehouse}
            />
          ) : cellView === "unplace" && unplaceItem ? (
            <CellUnplaceForm
              item={unplaceItem}
              onBack={onBackToCell}
              onUnplace={onUnplaceInventory}
            />
          ) : (
            <CellInventoryList
              cell={selectedCell.cell}
              error={cellItemsError}
              isLoading={cellItemsLoading}
              items={cellItems}
              notice={placementNotice}
              onPlace={onOpenPlacement}
              onRetry={onCellRetry}
              onTransfer={onOpenTransfer}
              onUnplace={onOpenUnplace}
              rack={selectedCell.rack}
            />
          )
        ) : (
          <WarehouseInventoryList items={inventoryItems} onOpenPlacement={onOpenInventoryPlacement} />
        )}
      </div>
    </section>
  );
}
