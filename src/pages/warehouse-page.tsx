import { Minus, Plus, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import { useGLTF } from "@react-three/drei";
import { ApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { WarehouseInfoCard } from "@/features/warehouse/components/warehouse-info-card";
import { WarehouseManagementDialog, type WarehouseManagementMode } from "@/features/warehouse/components/warehouse-management-dialog";
import { WarehouseCreationWizard } from "@/features/warehouse-creation/components/warehouse-creation-wizard";
import { WarehouseRackManagementDialog } from "@/features/warehouse/components/warehouse-rack-management-dialog";
import { WarehouseModelReadError } from "@/features/warehouse-creation/services/warehouse-model-read-error";
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
  layout: WarehouseLayout | null;
  items: InventoryItem[];
  events: InventoryEvent[];
  eventsError: string | null;
};

type CellView = "details" | "place" | "transfer" | "unplace";

type WarehouseLoadSource = "warehouse" | "racks" | "layout" | "inventory";

class WarehousePageLoadError extends Error {
  constructor(readonly source: WarehouseLoadSource, readonly cause: unknown) {
    super("Warehouse page data could not be loaded");
  }
}

function trackWarehouseRequest<T>(source: WarehouseLoadSource, request: Promise<T>): Promise<T> {
  return request.catch((error: unknown) => { throw new WarehousePageLoadError(source, error); });
}

function getCellLoadError(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 401) return "Сеанс завершён. Войдите в систему снова.";
    if (error.status === 403) return "У вас нет доступа к содержимому этой ячейки.";
    if (error.status === 404) return "Ячейка не найдена. Обновите страницу и попробуйте снова.";
    if (error.status === 419) return "Сеанс истёк. Обновите страницу и попробуйте снова.";
    if (error.kind === "network") return "Не удалось подключиться к серверу. Проверьте соединение.";
  }
  return "Не удалось обновить данные ячейки. Попробуйте ещё раз.";
}

function getWarehouseLoadError(error: unknown) {
  const source = error instanceof WarehousePageLoadError ? error.source : null;
  const cause = error instanceof WarehousePageLoadError ? error.cause : error;
  if (source === "layout" && cause instanceof WarehouseModelReadError) {
    if (cause.kind === "network") return "Браузер не может получить файл 3D-модели. Проверьте адрес файла и доступ к нему из frontend.";
    if (cause.kind === "timeout") return "Загрузка файла 3D-модели заняла слишком долго. Проверьте сервер и повторите попытку.";
    if (cause.kind === "http") return cause.status === 404
      ? "Файл 3D-модели не найден на сервере. Планировка склада сохранена, но модель нужно восстановить."
      : "Сервер не смог отдать файл 3D-модели. Повторите попытку позже.";
    return "Файл планировки получен, но его нельзя прочитать как GLB-модель.";
  }
  if (source === "layout" && !(cause instanceof ApiError)) {
    return "Не удалось прочитать сохранённую 3D-модель склада. Проверьте доступность файла и повторите попытку.";
  }
  if (source === "racks" && !(cause instanceof ApiError)) {
    return "Не удалось загрузить стеллажи и ячейки этого склада.";
  }
  if (source === "inventory" && !(cause instanceof ApiError)) {
    return "Не удалось загрузить данные, необходимые для показателей склада.";
  }
  if (cause instanceof ApiError) {
    if (cause.status === 401) return "Сеанс завершён. Войдите в систему снова.";
    if (cause.status === 403) return "У вас нет доступа к этому складу.";
    if (cause.status === 404) return "Склад не найден или его данные уже удалены.";
    if (cause.status === 419) return "Сеанс истёк. Обновите страницу и попробуйте снова.";
    if (cause.kind === "network" || cause.status === 0) return "Не удалось подключиться к серверу. Проверьте соединение и попробуйте снова.";
    if (cause.kind === "response") return "Сервер вернул данные склада в неподдерживаемом формате.";
  }
  if (source === "layout") return "Не удалось получить сохранённую планировку склада.";
  if (source === "warehouse") return "Не удалось получить данные выбранного склада.";
  return "Не удалось загрузить данные склада. Попробуйте ещё раз.";
}

export function WarehousePage() {
  const { warehouseId: warehouseIdParam } = useParams();
  const warehouseId = Number(warehouseIdParam);
  const location = useLocation();
  const navigate = useNavigate();
  const cellIdParam = new URLSearchParams(location.search).get("cellId");
  const cameraApiRef = useRef<WarehouseCameraApi | null>(null);
  const layoutWizardCloseRequestRef = useRef<(() => boolean) | null>(null);
  const warehouseEditorCloseRequestRef = useRef<(() => boolean) | null>(null);
  const pendingSavedLayoutRef = useRef<WarehouseLayout | null>(null);
  const pendingWarehouseManagementRef = useRef<{ mode: WarehouseManagementMode; warehouse: Warehouse } | null>(null);
  const [pageData, setPageData] = useState<PageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [warehouseManagement, setWarehouseManagement] = useState<{ mode: WarehouseManagementMode; warehouse: Warehouse } | null>(null);
  const [rackManagementOpen, setRackManagementOpen] = useState(false);
  const [layoutWizardOpen, setLayoutWizardOpen] = useState(false);

  useEffect(() => {
    if (warehouseManagement || !pendingWarehouseManagementRef.current) return;
    const nextPanel = pendingWarehouseManagementRef.current;
    pendingWarehouseManagementRef.current = null;
    setWarehouseManagement(nextPanel);
  }, [warehouseManagement]);

  const openWarehouseManagement = (mode: WarehouseManagementMode, warehouse: Warehouse) => {
    const nextPanel = { mode, warehouse };
    if (!warehouseManagement) {
      setWarehouseManagement(nextPanel);
      return;
    }
    if (warehouseManagement.mode === mode) return;
    const closeCurrentPanel = warehouseEditorCloseRequestRef.current;
    if (closeCurrentPanel?.()) pendingWarehouseManagementRef.current = nextPanel;
  };
  const [activePanel, setActivePanel] = useState<WarehousePanelType | null>(null);
  const [sheetState, setSheetState] = useState<SheetState>("closed");
  const [selectedCell, setSelectedCell] = useState<{ rack: Rack; cell: Cell } | null>(null);
  const [focusCellRequest, setFocusCellRequest] = useState<{ rackId: number; cellId: number } | null>(null);
  const [cellView, setCellView] = useState<CellView>("details");
  const [transferItem, setTransferItem] = useState<WarehouseCellItem | null>(null);
  const [unplaceItem, setUnplaceItem] = useState<WarehouseCellItem | null>(null);
  const [pickedTarget, setPickedTarget] = useState<{ rack: Rack; cell: Cell } | null>(null);
  const [isPickingTarget, setIsPickingTarget] = useState(false);
  const [selectionNotice, setSelectionNotice] = useState<string | null>(null);
  const [cellItems, setCellItems] = useState<WarehouseCellItem[]>([]);
  const [cellItemsLoading, setCellItemsLoading] = useState(false);
  const [cellItemsError, setCellItemsError] = useState<string | null>(null);
  const [placementNotice, setPlacementNotice] = useState<string | null>(null);
  const [deepLinkNotice, setDeepLinkNotice] = useState<string | null>(null);
  const cellRequestId = useRef(0);
  const selectedCellIdRef = useRef<number | null>(null);
  const processedDeepLinkRef = useRef<string | null>(null);
  const cellInventoryCache = useRef(new Map<number, WarehouseCellItem[]>());

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setLoadError(null);
    setPageData(null);
    const eventsRequest = warehouseDataService.getEventsForWarehouse(warehouseId).then(
      (events) => ({ events, eventsError: null }),
      (error: unknown) => ({
        events: [],
        eventsError: error instanceof ApiError && error.status === 404
          ? "Список событий недоступен: в текущем API не найден маршрут этого раздела."
          : "Не удалось загрузить события. Попробуйте позже.",
      }),
    );
    Promise.all([
      trackWarehouseRequest("warehouse", warehouseDataService.getWarehouse(warehouseId)),
      trackWarehouseRequest("racks", warehouseDataService.getRacks(warehouseId)),
      trackWarehouseRequest("layout", warehouseDataService.getLayout(warehouseId)),
      trackWarehouseRequest("inventory", warehouseDataService.getInventoryItems()),
      eventsRequest,
    ]).then(([warehouse, racks, layout, items, eventResult]) => {
      if (!mounted) return;
      const rackIds = new Set(racks.map((rack) => rack.id));
      const currentLayout = layout
        ? { ...layout, racks: layout.racks.filter((rack) => rackIds.has(rack.rackId)) }
        : null;
      setPageData(warehouse ? {
        warehouse,
        racks,
        layout: currentLayout,
        items,
        events: eventResult.events,
        eventsError: eventResult.eventsError,
      } : null);
      setLoading(false);
    }).catch((error: unknown) => {
      if (!mounted) return;
      setLoadError(getWarehouseLoadError(error));
      setLoading(false);
    });

    return () => {
      mounted = false;
    };
  }, [warehouseId]);

  useEffect(() => {
    if (!pageData) return;
    if (pageData.layout) warehouseDataService.cacheLayout(pageData.warehouse.id, pageData.layout);
    else warehouseDataService.clearLayoutCache(pageData.warehouse.id);
  }, [pageData?.layout, pageData?.warehouse.id]);

  const warehouseInventory = useMemo<WarehouseInventoryItem[]>(() => {
    if (!pageData) return [];
    return pageData.items.flatMap((item) => {
      const placements = item.placements.filter(
        (placement) => placement.warehouse.id === warehouseId && placement.quantity > 0,
      );
      const warehouseQuantity = placements.reduce((total, placement) => total + placement.quantity, 0);
      return warehouseQuantity > 0 ? [{ ...item, placements, warehouse_quantity: warehouseQuantity }] : [];
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

  const selectedRackCells = useMemo(() => selectedCell
    ? [...selectedCell.rack.cells].sort((first, second) =>
      first.level - second.level ||
      first.position - second.position ||
      first.number - second.number ||
      first.id - second.id)
    : [], [selectedCell]);

  const selectedCellOrder = useMemo(
    () => selectedRackCells.findIndex((cell) => cell.id === selectedCell?.cell.id),
    [selectedCell?.cell.id, selectedRackCells],
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

  const occupiedCellIds = useMemo(() => {
    const occupied = new Set<number>();
    const knownCellIds = new Set(pageData?.racks.flatMap((rack) => rack.cells.map((cell) => cell.id)) ?? []);
    pageData?.items.forEach((item) => {
      item.placements.forEach((placement) => {
        if (placement.warehouse.id === warehouseId && placement.quantity > 0 && knownCellIds.has(placement.cell.id)) {
          occupied.add(placement.cell.id);
        }
      });
    });
    return occupied;
  }, [pageData, warehouseId]);

  const loadCellData = useCallback(async (cellId: number, refreshInventory: boolean) => {
    const requestId = ++cellRequestId.current;
    setCellItems(cellInventoryCache.current.get(cellId) ?? []);
    setCellItemsLoading(true);
    setCellItemsError(null);

    const [cellResult, inventoryResult] = await Promise.all([
      warehouseDataService.getCellInventory(cellId).then(
        (items) => ({ ok: true as const, items }),
        (error: unknown) => ({ ok: false as const, error }),
      ),
      refreshInventory
        ? warehouseDataService.getInventoryItems().then(
          (items) => ({ ok: true as const, items }),
          (error: unknown) => ({ ok: false as const, error }),
        )
        : Promise.resolve(null),
    ]);

    if (requestId !== cellRequestId.current || selectedCellIdRef.current !== cellId) return;

    if (cellResult.ok) {
      cellInventoryCache.current.set(cellId, cellResult.items);
      setCellItems(cellResult.items);
    }
    else setCellItemsError(getCellLoadError(cellResult.error));

    if (inventoryResult) {
      if (inventoryResult.ok) {
        setPageData((current) => current ? { ...current, items: inventoryResult.items } : current);
      } else {
        const inventoryError = "Не удалось обновить доступные остатки и показатели склада.";
        setCellItemsError((current) => current ? `${current} ${inventoryError}` : inventoryError);
      }
    }

    setCellItemsLoading(false);
  }, []);

  useEffect(() => {
    if (cellIdParam === null) {
      processedDeepLinkRef.current = null;
      setDeepLinkNotice(null);
      setFocusCellRequest(null);
      return;
    }
    if (!pageData || pageData.warehouse.id !== warehouseId || !pageData.layout) return;

    const deepLinkKey = `${warehouseId}:${cellIdParam}`;
    if (processedDeepLinkRef.current === deepLinkKey) return;
    processedDeepLinkRef.current = deepLinkKey;
    setDeepLinkNotice(null);
    setFocusCellRequest(null);

    const targetCellId = Number(cellIdParam);
    if (!Number.isSafeInteger(targetCellId) || targetCellId < 1) {
      setDeepLinkNotice("В ссылке указан некорректный идентификатор ячейки. Склад доступен для обычного просмотра.");
      return;
    }

    const targetRack = pageData.racks.find((rack) => rack.cells.some((cell) => cell.id === targetCellId));
    const targetCell = targetRack?.cells.find((cell) => cell.id === targetCellId);
    if (!targetRack || !targetCell) {
      setDeepLinkNotice("Эта ячейка не найдена на выбранном складе. Вы можете выбрать другую ячейку на модели.");
      return;
    }

    if (!pageData.layout.racks.some((rack) => rack.rackId === targetRack.id)) {
      setDeepLinkNotice("Эта ячейка не представлена в 3D-планировке склада. Вы можете продолжить обычный просмотр.");
      return;
    }

    selectedCellIdRef.current = targetCell.id;
    setSelectedCell({ rack: targetRack, cell: targetCell });
    setCellView("details");
    setTransferItem(null);
    setUnplaceItem(null);
    setPickedTarget(null);
    setSelectionNotice(null);
    setPlacementNotice(null);
    setActivePanel("cell");
    setSheetState("peek");
    setFocusCellRequest({ rackId: targetRack.id, cellId: targetCell.id });
    void loadCellData(targetCell.id, false);
  }, [cellIdParam, loadCellData, pageData, warehouseId]);

  const openPanel = useCallback((section: "inventory" | "events") => {
    setIsPickingTarget(false);
    setSelectionNotice(null);
    selectedCellIdRef.current = null;
    setSelectedCell(null);
    setTransferItem(null);
    setUnplaceItem(null);
    setPickedTarget(null);
    setCellView("details");
    setPlacementNotice(null);
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
      if (layoutWizardOpen && (!layoutWizardCloseRequestRef.current || !layoutWizardCloseRequestRef.current())) return;
      if (warehouseManagement && (!warehouseEditorCloseRequestRef.current || !warehouseEditorCloseRequestRef.current())) return;
      setIsPickingTarget(false);
      setSelectionNotice(null);
      setActivePanel(null);
      setSheetState("closed");
      selectedCellIdRef.current = null;
      setSelectedCell(null);
      setTransferItem(null);
      setUnplaceItem(null);
      setPickedTarget(null);
      setCellView("details");
      setRackManagementOpen(false);
      return;
    }
    openPanel(section);
  }, [layoutWizardOpen, openPanel, warehouseManagement]);

  const handleCellSelect = useCallback((rack: Rack, cell: Cell) => {
    if (isPickingTarget) {
      if (cell.id === selectedCell?.cell.id) {
        setSelectionNotice("Исходную ячейку нельзя выбрать в качестве места назначения.");
        setIsPickingTarget(false);
        setSheetState("peek");
        return;
      }
      setPickedTarget({ rack, cell });
      setSelectionNotice(null);
      setIsPickingTarget(false);
      setActivePanel("cell");
      setSheetState("peek");
      return;
    }
    selectedCellIdRef.current = cell.id;
    setSelectedCell({ rack, cell });
    setCellView("details");
    setTransferItem(null);
    setUnplaceItem(null);
    setFocusCellRequest(null);
    setPickedTarget(null);
    setSelectionNotice(null);
    setPlacementNotice(null);
    setDeepLinkNotice(null);
    setActivePanel("cell");
    setSheetState("peek");
    void loadCellData(cell.id, false);
  }, [isPickingTarget, loadCellData, selectedCell]);

  const handleCellNavigation = useCallback((direction: -1 | 1) => {
    if (!selectedCell || selectedCellOrder < 0) return;
    const nextCell = selectedRackCells[selectedCellOrder + direction];
    if (!nextCell) return;

    selectedCellIdRef.current = nextCell.id;
    setSelectedCell({ rack: selectedCell.rack, cell: nextCell });
    setCellView("details");
    setTransferItem(null);
    setUnplaceItem(null);
    setFocusCellRequest(null);
    setPickedTarget(null);
    setSelectionNotice(null);
    setPlacementNotice(null);
    setDeepLinkNotice(null);
    setIsPickingTarget(false);
    setActivePanel("cell");
    void loadCellData(nextCell.id, false);
  }, [loadCellData, selectedCell, selectedCellOrder, selectedRackCells]);

  const handleInventoryPlacementOpen = useCallback((rackId: number, cellId: number) => {
    if (!pageData?.layout) return;
    const rack = pageData.racks.find((candidate) => candidate.id === rackId);
    const cell = rack?.cells.find((candidate) => candidate.id === cellId);
    if (!rack || !cell || !pageData.layout.racks.some((layoutRack) => layoutRack.rackId === rack.id)) {
      setDeepLinkNotice("Не удалось найти эту ячейку в планировке склада. Обновите данные и попробуйте снова.");
      return;
    }

    selectedCellIdRef.current = cell.id;
    setSelectedCell({ rack, cell });
    setCellView("details");
    setTransferItem(null);
    setUnplaceItem(null);
    setIsPickingTarget(false);
    setPickedTarget(null);
    setSelectionNotice(null);
    setPlacementNotice(null);
    setDeepLinkNotice(null);
    setActivePanel("cell");
    setSheetState("peek");
    setFocusCellRequest({ rackId: rack.id, cellId: cell.id });
    void loadCellData(cell.id, false);
  }, [loadCellData, pageData]);

  const closePanel = useCallback(() => {
    setIsPickingTarget(false);
    setSelectionNotice(null);
    setActivePanel(null);
    setSheetState("closed");
  }, []);

  const handlePlaceInventory = useCallback(async (inventoryId: number, quantity: number) => {
    const cellId = selectedCell?.cell.id;
    if (!cellId) return;

    await warehouseDataService.createInventoryPlacement(inventoryId, { cell_id: cellId, quantity });
    const shouldUpdateSelectedCell = selectedCellIdRef.current === cellId;
    setPlacementNotice("Инвентарь успешно размещён.");
    setCellView("details");
    setFocusCellRequest(null);
    if (shouldUpdateSelectedCell) {
      setCellItemsLoading(true);
      setCellItemsError(null);
    }

    const [cellResult, inventoryResult] = await Promise.allSettled([
      warehouseDataService.getCellInventory(cellId),
      warehouseDataService.getInventoryItems(),
    ]);

    if (cellResult.status === "fulfilled") {
      cellInventoryCache.current.set(cellId, cellResult.value);
      if (selectedCellIdRef.current === cellId) setCellItems(cellResult.value);
    } else if (selectedCellIdRef.current === cellId) {
      setCellItemsError(getCellLoadError(cellResult.reason));
    }

    if (inventoryResult.status === "fulfilled") {
      setPageData((current) => current ? { ...current, items: inventoryResult.value } : current);
    } else if (selectedCellIdRef.current === cellId) {
      setPlacementNotice("Инвентарь размещён, но общие остатки склада не обновились. Повторите загрузку данных.");
    }

    if (selectedCellIdRef.current === cellId) setCellItemsLoading(false);
  }, [selectedCell]);

  const handleTransferInventory = useCallback(async (placementId: number, targetCellId: number, quantity: number) => {
    const sourceCellId = selectedCell?.cell.id;
    if (!sourceCellId || sourceCellId === targetCellId) return;

    try {
      await warehouseDataService.transferInventory(placementId, {
        target_cell_id: targetCellId,
        quantity,
      });
    } catch (error) {
      if (error instanceof ApiError && [404, 409, 422].includes(error.status)) {
        const [sourceResult, inventoryResult] = await Promise.allSettled([
          warehouseDataService.getCellInventory(sourceCellId),
          warehouseDataService.getInventoryItems(),
        ]);
        if (sourceResult.status === "fulfilled") {
          cellInventoryCache.current.set(sourceCellId, sourceResult.value);
          if (selectedCellIdRef.current === sourceCellId) setCellItems(sourceResult.value);
          const refreshedItem = sourceResult.value.find((cellItem) => cellItem.placement_id === placementId);
          if (refreshedItem) setTransferItem(refreshedItem);
          else setTransferItem((current) => current ? { ...current, quantity_in_cell: 0 } : current);
        }
        if (inventoryResult.status === "fulfilled") {
          setPageData((current) => current ? { ...current, items: inventoryResult.value } : current);
        }
      }
      throw error;
    }

    setPlacementNotice("Инвентарь успешно перемещён.");
    setCellView("details");
    setTransferItem(null);
    setUnplaceItem(null);
    setFocusCellRequest(null);
    setPickedTarget(null);
    setSelectionNotice(null);
    setIsPickingTarget(false);
    setCellItemsLoading(true);
    setCellItemsError(null);

    const [sourceResult, targetResult, inventoryResult] = await Promise.allSettled([
      warehouseDataService.getCellInventory(sourceCellId),
      warehouseDataService.getCellInventory(targetCellId),
      warehouseDataService.getInventoryItems(),
    ]);

    if (sourceResult.status === "fulfilled") {
      cellInventoryCache.current.set(sourceCellId, sourceResult.value);
      if (selectedCellIdRef.current === sourceCellId) setCellItems(sourceResult.value);
    } else if (selectedCellIdRef.current === sourceCellId) {
      setCellItemsError(getCellLoadError(sourceResult.reason));
    }

    if (targetResult.status === "fulfilled") {
      cellInventoryCache.current.set(targetCellId, targetResult.value);
    } else if (selectedCellIdRef.current === sourceCellId) {
      setPlacementNotice("Инвентарь перемещён. Не удалось обновить содержимое ячейки назначения — выберите её на модели, чтобы загрузить актуальные данные.");
    }

    if (inventoryResult.status === "fulfilled") {
      setPageData((current) => current ? { ...current, items: inventoryResult.value } : current);
    } else if (selectedCellIdRef.current === sourceCellId) {
      setCellItemsError((current) => current
        ? `${current} Общее количество склада не обновилось.`
        : "Общее количество склада не обновилось. Нажмите «Повторить», чтобы загрузить актуальные данные.");
    }

    if (selectedCellIdRef.current === sourceCellId) setCellItemsLoading(false);
  }, [selectedCell]);

  const openTransfer = useCallback((item: WarehouseCellItem) => {
    setTransferItem(item);
    setUnplaceItem(null);
    setPickedTarget(null);
    setSelectionNotice(null);
    setCellView("transfer");
  }, []);

  const openUnplace = useCallback((item: WarehouseCellItem) => {
    setUnplaceItem(item);
    setTransferItem(null);
    setSelectionNotice(null);
    setCellView("unplace");
  }, []);

  const handleUnplaceInventory = useCallback(async (placementId: number, quantity: number) => {
    const sourceCellId = selectedCell?.cell.id;
    if (!sourceCellId) return;

    try {
      await warehouseDataService.unplaceInventory(placementId, quantity);
    } catch (error) {
      const [sourceResult, inventoryResult] = await Promise.allSettled([
        warehouseDataService.getCellInventory(sourceCellId),
        warehouseDataService.getInventoryItems(),
      ]);
      if (sourceResult.status === "fulfilled") {
        cellInventoryCache.current.set(sourceCellId, sourceResult.value);
        if (selectedCellIdRef.current === sourceCellId) {
          setCellItems(sourceResult.value);
          const currentPlacement = sourceResult.value.find((item) => item.placement_id === placementId);
          if (currentPlacement) setUnplaceItem(currentPlacement);
          else {
            setUnplaceItem(null);
            setCellView("details");
            setPlacementNotice("Размещение изменилось. Данные ячейки обновлены.");
          }
        }
      }
      if (inventoryResult.status === "fulfilled") {
        setPageData((current) => current ? { ...current, items: inventoryResult.value } : current);
      }
      throw error;
    }

    setCellView("details");
    setUnplaceItem(null);
    setTransferItem(null);
    setPlacementNotice(`Снято с размещения: ${quantity.toLocaleString("ru-RU")} шт.`);
    setCellItemsLoading(true);
    setCellItemsError(null);

    const [sourceResult, inventoryResult] = await Promise.allSettled([
      warehouseDataService.getCellInventory(sourceCellId),
      warehouseDataService.getInventoryItems(),
    ]);

    if (sourceResult.status === "fulfilled") {
      cellInventoryCache.current.set(sourceCellId, sourceResult.value);
      if (selectedCellIdRef.current === sourceCellId) setCellItems(sourceResult.value);
    } else if (selectedCellIdRef.current === sourceCellId) {
      setCellItemsError("Снятие выполнено, но содержимое ячейки не обновилось. Нажмите «Повторить».");
    }

    if (inventoryResult.status === "fulfilled") {
      setPageData((current) => current ? { ...current, items: inventoryResult.value } : current);
    } else if (selectedCellIdRef.current === sourceCellId) {
      setPlacementNotice("Снятие выполнено, но общий список и показатели не обновились. Повторите загрузку данных.");
    }

    if (selectedCellIdRef.current === sourceCellId) setCellItemsLoading(false);
  }, [selectedCell]);

  const beginTargetPick = useCallback(() => {
    setSelectionNotice(null);
    setIsPickingTarget(true);
    setSheetState("closed");
  }, []);

  const cancelTargetPick = useCallback(() => {
    setIsPickingTarget(false);
    setSheetState("peek");
  }, []);

  const retryCellData = useCallback(() => {
    const cellId = selectedCell?.cell.id;
    if (cellId) void loadCellData(cellId, true);
  }, [loadCellData, selectedCell]);

  const changeSheetState = useCallback((state: SheetState) => {
    setSheetState(state);
    if (state === "closed" && !isPickingTarget) setActivePanel(null);
  }, [isPickingTarget]);

  if (loading) {
    return <main aria-busy="true" className="warehouse-loading"><span className="warehouse-loading__spinner" />Загружаем склад…</main>;
  }

  if (loadError) {
    return (
      <main className="warehouse-not-found">
        <h1>{loadError.startsWith("Склад не найден") ? "Склад не найден" : "Не удалось загрузить склад"}</h1>
        <p>{loadError}</p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button onClick={() => window.location.reload()} type="button" variant="outline">Повторить</Button>
          <Button onClick={() => navigate("/")} type="button" variant="outline">← Все склады</Button>
        </div>
      </main>
    );
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

  if (!pageData.layout) {
    return (
      <>
        <main className="warehouse-not-found">
          <h1>Планировка ещё не сохранена</h1>
          <p>Склад и стеллажи сохранены. Завершите настройку планировки, чтобы открыть 3D-модель.</p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={() => setLayoutWizardOpen(true)} type="button">Продолжить настройку</Button>
            <Button onClick={() => navigate("/")} type="button" variant="outline">← Все склады</Button>
          </div>
        </main>
        <WarehouseCreationWizard
          closeRequestRef={layoutWizardCloseRequestRef}
          context="warehouse"
          initialWarehouseId={warehouseId}
          onClose={() => {
            setLayoutWizardOpen(false);
            const savedLayout = pendingSavedLayoutRef.current;
            if (savedLayout) {
              setPageData((current) => current ? { ...current, layout: savedLayout } : current);
              pendingSavedLayoutRef.current = null;
            }
          }}
          onLayoutSaved={(layout) => { pendingSavedLayoutRef.current = layout; }}
          onOpenWarehouse={() => undefined}
          onWarehouseCreated={() => undefined}
          open={layoutWizardOpen}
          returnToWarehouse
        />
      </>
    );
  }

  return (
    <main className="warehouse-shell">
      <WarehouseScene
        cameraApiRef={cameraApiRef}
        layout={pageData.layout}
        onCellSelect={handleCellSelect}
        occupiedCellIds={occupiedCellIds}
        racks={pageData.racks}
        focusCellRequest={focusCellRequest}
        selectedCellId={selectedCell?.cell.id ?? null}
        targetCellId={pickedTarget?.cell.id ?? null}
      />

      {isPickingTarget && (
        <div className="warehouse-target-pick-banner" role="status">
          <div className="min-w-0">
            <strong>Выберите ячейку назначения</strong>
            <span>Синяя — источник, оранжевая — цель. Выбор не отправляет перенос</span>
          </div>
          <Button className="shrink-0" onClick={cancelTargetPick} type="button" variant="outline">Отмена</Button>
        </div>
      )}

      <WarehouseNavigation activePanel={activePanel} onNavigate={handleNavigation} />

      {deepLinkNotice && (
        <div className="warehouse-deep-link-notice" role="status">
          {deepLinkNotice}
        </div>
      )}

      <WarehouseInfoCard
        cellCount={cellCount}
        freeCellCount={Math.max(0, cellCount - occupiedCellCount)}
        inventoryQuantity={inventoryQuantity}
        rackCount={pageData.racks.length}
        warehouse={pageData.warehouse}
        onEdit={() => openWarehouseManagement("edit", pageData.warehouse)}
        onDelete={() => openWarehouseManagement("delete", pageData.warehouse)}
        onDeleteLayout={() => openWarehouseManagement("delete-layout", pageData.warehouse)}
        onManageRacks={() => setRackManagementOpen(true)}
      />

      {rackManagementOpen && (
        <WarehouseRackManagementDialog
          open
          warehouseId={pageData.warehouse.id}
          warehouseName={pageData.warehouse.name}
          placedRackIds={pageData.layout?.racks.map((rack) => rack.rackId) ?? []}
          onClose={() => setRackManagementOpen(false)}
          onRacksChange={(racks, change) => {
            setPageData((current) => current ? {
              ...current,
              racks,
              layout: change.deleted && current.layout
                ? { ...current.layout, racks: current.layout.racks.filter((rack) => rack.rackId !== change.rackId) }
                : current.layout,
            } : current);
            cellInventoryCache.current.clear();
            cellRequestId.current += 1;
            selectedCellIdRef.current = null;
            setSelectedCell(null);
            setCellItems([]);
            setCellItemsError(null);
            setActivePanel((current) => current === "cell" ? null : current);
            setPickedTarget(null);
            setIsPickingTarget(false);
          }}
          onOpenLayout={() => setLayoutWizardOpen(true)}
        />
      )}

      {warehouseManagement && (
        <WarehouseManagementDialog
          key={`${warehouseManagement.warehouse.id}-${warehouseManagement.mode}`}
          context="warehouse"
          closeRequestRef={warehouseEditorCloseRequestRef}
          mode={warehouseManagement.mode}
          onClose={() => setWarehouseManagement(null)}
          onDeleted={() => {
            if (warehouseManagement.mode === "delete-layout") {
              setPageData((current) => current ? { ...current, layout: null } : current);
            } else {
              navigate("/");
            }
          }}
          onSaved={(warehouse) => {
            setPageData((current) => current ? { ...current, warehouse } : current);
          }}
          open
          warehouse={warehouseManagement.warehouse}
        />
      )}

      <WarehouseCreationWizard
        closeRequestRef={layoutWizardCloseRequestRef}
        context="warehouse"
        initialLayout={pageData.layout}
        initialWarehouseId={pageData.warehouse.id}
        onClose={() => setLayoutWizardOpen(false)}
        onLayoutSaved={(layout) => {
          if (layout.model?.url) useGLTF.clear(layout.model.url);
          setPageData((current) => current ? { ...current, layout } : current);
        }}
        onOpenWarehouse={() => undefined}
        onWarehouseCreated={() => undefined}
        open={layoutWizardOpen}
        returnToWarehouse
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
        events={pageData.events}
        eventsError={pageData.eventsError}
        availableItems={pageData.items}
        currentWarehouse={pageData.warehouse}
        currentRacks={pageData.racks}
        inventoryItems={warehouseInventory}
        cellView={cellView}
        transferItem={transferItem}
        unplaceItem={unplaceItem}
        pickedTarget={pickedTarget}
        selectionNotice={selectionNotice}
        isPickingTarget={isPickingTarget}
        cellItemsError={cellItemsError}
        cellItemsLoading={cellItemsLoading}
        onBackToCell={() => {
          setCellView("details");
          setTransferItem(null);
          setPickedTarget(null);
          setSelectionNotice(null);
          setIsPickingTarget(false);
        }}
        onCellRetry={retryCellData}
        onClose={closePanel}
        onOpenInventoryPlacement={handleInventoryPlacementOpen}
        onOpenPlacement={() => {
          setPlacementNotice(null);
          setCellView("place");
        }}
        onPlaceInventory={handlePlaceInventory}
        onOpenTransfer={openTransfer}
        onOpenUnplace={openUnplace}
        onPickTargetOnModel={beginTargetPick}
        onTransferInventory={handleTransferInventory}
        onUnplaceInventory={handleUnplaceInventory}
        onSheetStateChange={changeSheetState}
        placementNotice={placementNotice}
        selectedCell={selectedCell}
        cellNavigation={{
          current: selectedCellOrder + 1,
          total: selectedRackCells.length,
          canPrevious: selectedCellOrder > 0,
          canNext: selectedCellOrder >= 0 && selectedCellOrder < selectedRackCells.length - 1,
          onPrevious: () => handleCellNavigation(-1),
          onNext: () => handleCellNavigation(1),
        }}
        cellItems={cellItems}
        sheetState={sheetState}
      />
    </main>
  );
}
