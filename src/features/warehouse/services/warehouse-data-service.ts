import { dashboardDataService } from "@/features/dashboard/services/dashboard-data-service";
import { ApiError } from "@/api/client";
import { warehouseApi } from "@/features/warehouse/api/warehouse-api";
import { readWarehouseModelLayout } from "@/features/warehouse-creation/services/warehouse-model-reader";
import { inventoryPlacementApi, type CellInventoryItem, type CreateInventoryPlacementInput, type TransferInventoryInput } from "@/features/warehouse/api/inventory-placement-api";
import type { LayoutRack, WarehouseLayout } from "@/features/warehouse/types";
import { applyWallOutline, createWallsFromOutline } from "@/features/warehouse/utils/wall-outline";

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
    try {
      const savedLayout = await warehouseApi.getLayout(warehouseId);
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
      return {
        ...applyWallOutline(baseLayout, wallOutline),
      };
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return null;
      throw error;
    }
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
