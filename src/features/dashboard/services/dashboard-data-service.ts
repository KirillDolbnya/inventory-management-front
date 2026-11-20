import { ApiError } from "@/api/client";
import {
  inventoryApi,
  type CreateInventoryInput,
  type UpdateInventoryInput,
} from "@/features/dashboard/api/inventory-api";
import { eventsApi } from "@/features/dashboard/api/events-api";
import type { CreateEventInput, InventoryEvent, InventoryEventDetail, ReservationInput, UpdateEventInput } from "@/features/dashboard/types/inventory-event";
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

  async getInventoryDetail(inventoryId: number) {
    const [detail, items] = await Promise.all([
      inventoryApi.getById(inventoryId),
      inventoryApi.getAll(),
    ]);
    const listItem = items.find((item) => item.id === inventoryId);
    if (!listItem) {
      throw new ApiError("Inventory item is no longer available in the list", 404);
    }
    return {
      items,
      item: {
        ...listItem,
        name: detail.name,
        description: detail.description,
        quantity: detail.quantity,
      },
    };
  },

  async updateInventory(inventoryId: number, input: UpdateInventoryInput) {
    return inventoryApi.update(inventoryId, input);
  },

  async deleteInventory(inventoryId: number) {
    return inventoryApi.delete(inventoryId);
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

  async updateEvent(eventId: number, input: UpdateEventInput) {
    return eventsApi.update(eventId, input);
  },

  async deleteEvent(eventId: number) {
    return eventsApi.delete(eventId);
  },

  async addEventReservations(eventId: number, reservations: ReservationInput[]) {
    return eventsApi.addReservations(eventId, reservations);
  },

  async updateEventReservation(eventId: number, reservationId: number, quantity: number) {
    return eventsApi.updateReservation(eventId, reservationId, quantity);
  },

  async deleteEventReservation(eventId: number, reservationId: number) {
    return eventsApi.deleteReservation(eventId, reservationId);
  },
};
