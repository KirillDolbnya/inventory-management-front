import {
  mockInventoryEvents,
  mockInventoryItems,
  mockWarehouses,
} from "@/features/dashboard/data/mock-data";
import type { InventoryEvent } from "@/features/dashboard/types/inventory-event";
import type { InventoryItem } from "@/features/dashboard/types/inventory";
import type { Warehouse } from "@/features/dashboard/types/warehouse";

export const dashboardDataService = {
  async getWarehouses(): Promise<Warehouse[]> {
    return mockWarehouses;
  },

  async getInventoryItems(): Promise<InventoryItem[]> {
    return mockInventoryItems;
  },

  async getEvents(): Promise<InventoryEvent[]> {
    return mockInventoryEvents;
  },
};
