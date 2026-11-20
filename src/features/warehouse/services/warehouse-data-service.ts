import { dashboardDataService } from "@/features/dashboard/services/dashboard-data-service";
import { ApiError } from "@/api/client";
import { warehouseApi } from "@/features/warehouse/api/warehouse-api";
import { readWarehouseModelLayout } from "@/features/warehouse-creation/services/warehouse-model-reader";
import { inventoryPlacementApi, type CellInventoryItem, type CreateInventoryPlacementInput, type TransferInventoryInput } from "@/features/warehouse/api/inventory-placement-api";
import type { LayoutRack, WarehouseLayout } from "@/features/warehouse/types";
import { applyWallOutline, createWallsFromOutline } from "@/features/warehouse/utils/wall-outline";
import { clearWarehouseLayoutCache, readWarehouseLayoutCache, writeWarehouseLayoutCache } from "@/features/warehouse/services/warehouse-layout-cache";
import { WarehouseModelReadError } from "@/features/warehouse-creation/services/warehouse-model-read-error";

export const warehouseDataService = {
  async getWarehouse(warehouseId: number) {
    try {
      return await warehouseApi.getWarehouse(warehouseId);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return null;
      throw error;
    }
  },

  async getRacks(warehouseId: number) {
    return warehouseApi.getRacks(warehouseId);
  },

  async getWarehouses() {
    return warehouseApi.getWarehouses();
  },

  async getLayout(warehouseId: number): Promise<WarehouseLayout | null> {
    let savedLayout: Awaited<ReturnType<typeof warehouseApi.getLayout>>;
    try {
      savedLayout = await warehouseApi.getLayout(warehouseId);
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 404)) throw error;

      // The API returns 404 while any rack is still unplaced; preserve the last complete layout.
      const cachedLayout = readWarehouseLayoutCache(warehouseId);
      if (!cachedLayout) return null;
      try {
        await readWarehouseModelLayout(cachedLayout.model?.url ?? "");
      } catch (modelError) {
        if (modelError instanceof WarehouseModelReadError && modelError.kind === "http" && modelError.status === 404) {
          clearWarehouseLayoutCache(warehouseId);
          return null;
        }
      }
      return cachedLayout;
    }

    const modelMetadata = await readWarehouseModelLayout(savedLayout.model.url);
    const layoutRacks: LayoutRack[] = savedLayout.racks.map((rack) => ({
      rackId: rack.id,
      position: rack.position,
      rotation_y_deg: rack.rotation_y_deg,
      dimensions: rack.dimensions,
    }));
    const wallOutline = savedLayout.walls?.outline ?? modelMetadata.wallOutline;
    const baseLayout: WarehouseLayout = {
      room: modelMetadata.room,
      wallOutline: modelMetadata.wallOutline,
      hiddenWallIndex: modelMetadata.hiddenWallIndex,
      walls: createWallsFromOutline(modelMetadata.wallOutline, modelMetadata.room.height),
      columns: modelMetadata.columns,
      racks: layoutRacks,
      model: savedLayout.model,
    };
    const layout = applyWallOutline(baseLayout, wallOutline);
    writeWarehouseLayoutCache(warehouseId, layout);
    return layout;
  },

  cacheLayout(warehouseId: number, layout: WarehouseLayout) {
    writeWarehouseLayoutCache(warehouseId, layout);
  },

  clearLayoutCache(warehouseId: number) {
    clearWarehouseLayoutCache(warehouseId);
  },

  getInventoryItems: dashboardDataService.getInventoryItems,

  getCellInventory(cellId: number): Promise<CellInventoryItem[]> {
    return inventoryPlacementApi.getByCell(cellId);
  },

  createInventoryPlacement(inventoryId: number, input: CreateInventoryPlacementInput) {
    return inventoryPlacementApi.create(inventoryId, input);
  },

  transferInventory(placementId: number, input: TransferInventoryInput) {
    return inventoryPlacementApi.transfer(placementId, input);
  },

  unplaceInventory(placementId: number, quantity: number) {
    return inventoryPlacementApi.unplace(placementId, quantity);
  },

  async getEventsForWarehouse(warehouseId: number) {
    const events = await dashboardDataService.getEvents();
    const details = await Promise.all(events.map((event) => dashboardDataService.getEvent(event.id)));
    return details
      .filter((event) => event.reservations.some((reservation) => reservation.warehouse.id === warehouseId))
      .map(({ id, name, description, starts_at, ends_at }) => ({ id, name, description, starts_at, ends_at }));
  },
};
