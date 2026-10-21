import {
  inventoryApi,
  type CreateInventoryInput,
} from "@/features/dashboard/api/inventory-api";
import { eventsApi } from "@/features/dashboard/api/events-api";
import type { CreateEventInput, InventoryEvent, InventoryEventDetail } from "@/features/dashboard/types/inventory-event";
import type { InventoryItem } from "@/features/dashboard/types/inventory";
import type { Warehouse } from "@/features/dashboard/types/warehouse";
import { warehouseApi } from "@/features/warehouse/api/warehouse-api";

export const dashboardDataService = {
  async getWarehouses(): Promise<Warehouse[]> {
    return warehouseApi.getWarehouses();
  },

  async getInventoryItems(): Promise<InventoryItem[]> {
    return inventoryApi.getAll();
  },

  async createInventory(input: CreateInventoryInput) {
    return inventoryApi.create(input);
  },

  async getEvents(): Promise<InventoryEvent[]> {
    return eventsApi.getAll();
  },

  async getEvent(eventId: number): Promise<InventoryEventDetail> {
    return eventsApi.getById(eventId);
  },

  async createEvent(input: CreateEventInput) {
    return eventsApi.create(input);
  },
};
