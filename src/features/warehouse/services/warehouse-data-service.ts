import { dashboardDataService } from "@/features/dashboard/services/dashboard-data-service";
import { demoWarehouseLayout } from "@/features/warehouse/data/warehouse-layout";
import { getMockRacks } from "@/features/warehouse/data/mock-racks";

export const warehouseDataService = {
  async getWarehouse(warehouseId: number) {
    const warehouses = await dashboardDataService.getWarehouses();
    return warehouses.find((warehouse) => warehouse.id === warehouseId) ?? null;
  },

  async getRacks(warehouseId: number) {
    return getMockRacks(warehouseId);
  },

  async getLayout(warehouseId: number) {
    const racks = getMockRacks(warehouseId);
    return {
      ...demoWarehouseLayout,
      racks: demoWarehouseLayout.racks.map((layoutRack, index) => ({
        ...layoutRack,
        rackId: racks[index]?.id ?? layoutRack.rackId,
      })),
    };
  },

  getInventoryItems: dashboardDataService.getInventoryItems,

  async getEventsForWarehouse(warehouseId: number) {
    const events = await dashboardDataService.getEvents();
    return events.filter((event) => event.warehouse_id === warehouseId);
  },
};
