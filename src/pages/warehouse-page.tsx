import { Minus, Plus, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { Button } from "@/components/ui/button";
import { WarehouseInfoCard } from "@/features/warehouse/components/warehouse-info-card";
import { WarehouseNavigation } from "@/features/warehouse/components/warehouse-navigation";
import { WarehousePanel } from "@/features/warehouse/components/warehouse-panel";
import { WarehouseScene, type WarehouseCameraApi } from "@/features/warehouse/components/warehouse-scene";
import { warehouseDataService } from "@/features/warehouse/services/warehouse-data-service";
import type { Cell, Rack, WarehouseCellItem, WarehouseInventoryItem, WarehousePanel as WarehousePanelType, WarehouseLayout } from "@/features/warehouse/types";
import type { InventoryEvent } from "@/features/dashboard/types/inventory-event";
import type { InventoryItem } from "@/features/dashboard/types/inventory";
import type { Warehouse } from "@/features/dashboard/types/warehouse";
import "@/features/warehouse/warehouse.css";

type SheetState = "closed" | "peek" | "expanded";

type PageData = {
  warehouse: Warehouse;
  racks: Rack[];
  layout: WarehouseLayout;
  items: InventoryItem[];
  events: InventoryEvent[];
};

export function WarehousePage() {
  const { warehouseId: warehouseIdParam } = useParams();
  const warehouseId = Number(warehouseIdParam);
  const navigate = useNavigate();
  const cameraApiRef = useRef<WarehouseCameraApi | null>(null);
  const [pageData, setPageData] = useState<PageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activePanel, setActivePanel] = useState<WarehousePanelType | null>(null);
  const [sheetState, setSheetState] = useState<SheetState>("closed");
  const [selectedCell, setSelectedCell] = useState<{ rack: Rack; cell: Cell } | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    Promise.all([
      warehouseDataService.getWarehouse(warehouseId),
      warehouseDataService.getRacks(warehouseId),
      warehouseDataService.getLayout(warehouseId),
      warehouseDataService.getInventoryItems(),
      warehouseDataService.getEventsForWarehouse(warehouseId),
    ]).then(([warehouse, racks, layout, items, events]) => {
      if (!mounted) return;
      setPageData(warehouse ? { warehouse, racks, layout, items, events } : null);
      setLoading(false);
    });

    return () => {
      mounted = false;
    };
  }, [warehouseId]);

  const warehouseInventory = useMemo<WarehouseInventoryItem[]>(() => {
    if (!pageData) return [];
    return pageData.items.flatMap((item) => {
      const warehouseQuantity = item.placements
        .filter((placement) => placement.warehouse.id === warehouseId)
        .reduce((total, placement) => total + placement.quantity, 0);
      return warehouseQuantity > 0 ? [{ ...item, warehouse_quantity: warehouseQuantity }] : [];
    });
  }, [pageData, warehouseId]);

  const inventoryQuantity = useMemo(
    () => warehouseInventory.reduce((total, item) => total + item.warehouse_quantity, 0),
    [warehouseInventory],
  );

  const cellCount = useMemo(
    () => pageData?.racks.reduce((total, rack) => total + rack.cells.length, 0) ?? 0,
    [pageData],
  );

  const occupiedCellCount = useMemo(() => {
    if (!pageData) return 0;
    const occupied = new Set<string>();
    const rackById = new Map(pageData.racks.map((rack) => [rack.id, rack]));
    pageData.items.forEach((item) => {
      item.placements.forEach((placement) => {
        if (placement.warehouse.id !== warehouseId || placement.quantity <= 0) return;
        const rack = rackById.get(placement.rack.id);
        if (!rack?.cells.some((cell) => cell.id === placement.cell.id)) return;
        occupied.add(`${rack.id}:${placement.cell.id}`);
      });
    });
    return occupied.size;
  }, [pageData, warehouseId]);

  const cellItems = useMemo<WarehouseCellItem[]>(() => {
    if (!pageData || !selectedCell) return [];
    return pageData.items.flatMap((item) =>
      item.placements
        .filter((placement) =>
          placement.warehouse.id === warehouseId &&
          placement.rack.id === selectedCell.rack.id &&
          placement.cell.id === selectedCell.cell.id,
        )
        .map((placement) => ({ ...item, cell_quantity: placement.quantity, placement })),
    );
  }, [pageData, selectedCell, warehouseId]);

  const openPanel = useCallback((section: "inventory" | "events") => {
    setSelectedCell(null);
    if (activePanel === section) {
      setActivePanel(null);
      setSheetState("closed");
    } else {
      setActivePanel(section);
      setSheetState("peek");
    }
  }, [activePanel]);

  const handleNavigation = useCallback((section: "overview" | "inventory" | "events") => {
    if (section === "overview") {
      setActivePanel(null);
      setSheetState("closed");
      setSelectedCell(null);
      cameraApiRef.current?.reset();
      return;
    }
    openPanel(section);
  }, [openPanel]);

  const handleCellSelect = useCallback((rack: Rack, cell: Cell) => {
    setSelectedCell({ rack, cell });
    setActivePanel("cell");
    setSheetState("peek");
  }, []);

  const closePanel = useCallback(() => {
    setActivePanel(null);
    setSheetState("closed");
  }, []);

  const changeSheetState = useCallback((state: SheetState) => {
    setSheetState(state);
    if (state === "closed") setActivePanel(null);
  }, []);

  if (loading) {
    return <main aria-busy="true" className="warehouse-loading"><span className="warehouse-loading__spinner" />Загружаем склад…</main>;
  }

  if (!pageData) {
    return (
      <main className="warehouse-not-found">
        <h1>Склад не найден</h1>
        <p>Проверьте адрес страницы или вернитесь к списку складов.</p>
        <Button onClick={() => navigate("/")} type="button" variant="outline">← Все склады</Button>
      </main>
    );
  }

  return (
    <main className="warehouse-shell">
      <WarehouseScene
        cameraApiRef={cameraApiRef}
        layout={pageData.layout}
        onCellSelect={handleCellSelect}
        racks={pageData.racks}
        selectedCellId={selectedCell?.cell.id ?? null}
      />

      <WarehouseNavigation activePanel={activePanel} onNavigate={handleNavigation} />

      <WarehouseInfoCard
        cellCount={cellCount}
        freeCellCount={Math.max(0, cellCount - occupiedCellCount)}
        inventoryQuantity={inventoryQuantity}
        rackCount={pageData.racks.length}
        warehouse={pageData.warehouse}
      />

      <div aria-label="Управление камерой" className="warehouse-camera-controls" role="group">
        <Button
          aria-label="Приблизить модель"
          className="size-10 rounded-lg bg-white/95 text-foreground shadow-sm hover:bg-white"
          onClick={() => cameraApiRef.current?.zoomIn()}
          size="icon"
          type="button"
          variant="outline"
        >
          <Plus aria-hidden="true" size={17} />
        </Button>
        <Button
          aria-label="Отдалить модель"
          className="size-10 rounded-lg bg-white/95 text-foreground shadow-sm hover:bg-white"
          onClick={() => cameraApiRef.current?.zoomOut()}
          size="icon"
          type="button"
          variant="outline"
        >
          <Minus aria-hidden="true" size={17} />
        </Button>
        <span className="warehouse-camera-controls__divider" />
        <Button
          aria-label="Сбросить положение камеры"
          className="size-10 rounded-lg bg-white/95 text-foreground shadow-sm hover:bg-white"
          onClick={() => cameraApiRef.current?.reset()}
          size="icon"
          type="button"
          variant="outline"
        >
          <RotateCcw aria-hidden="true" size={16} />
        </Button>
      </div>

      <WarehousePanel
        activePanel={activePanel}
        cellItems={cellItems}
        events={pageData.events}
        inventoryItems={warehouseInventory}
        onClose={closePanel}
        onSheetStateChange={changeSheetState}
        selectedCell={selectedCell}
        sheetState={sheetState}
      />
    </main>
  );
}
