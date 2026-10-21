import { ApiError, requestApi } from "@/api/client";
import type {
  CreateEventInput,
  CreatedEvent,
  EventReservation,
  InventoryEvent,
  InventoryEventDetail,
} from "@/features/dashboard/types/inventory-event";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

function parseDateTime(value: unknown, field: string): string {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new ApiError(`Unexpected ${field} in event API response`, 0, undefined, "response");
  }
  return value;
}

function parseEvent(value: unknown): InventoryEvent {
  if (
    !isRecord(value) ||
    !isPositiveInteger(value.id) ||
    typeof value.name !== "string" ||
    !(typeof value.description === "string" || value.description === null)
  ) {
    throw new ApiError("Unexpected event in API response", 0, undefined, "response");
  }

  return {
    id: value.id,
    name: value.name,
    description: value.description,
    starts_at: parseDateTime(value.starts_at, "starts_at"),
    ends_at: parseDateTime(value.ends_at, "ends_at"),
  };
}

function parseReservation(value: unknown): EventReservation {
  if (
    !isRecord(value) ||
    !isPositiveInteger(value.id) ||
    !isPositiveInteger(value.quantity) ||
    !isRecord(value.inventory) ||
    !isPositiveInteger(value.inventory.id) ||
    typeof value.inventory.name !== "string" ||
    !isNonNegativeInteger(value.inventory.quantity) ||
    !isRecord(value.warehouse) ||
    !isPositiveInteger(value.warehouse.id) ||
    typeof value.warehouse.name !== "string" ||
    !isRecord(value.rack) ||
    !isPositiveInteger(value.rack.id) ||
    typeof value.rack.code !== "string" ||
    !isRecord(value.cell) ||
    !isPositiveInteger(value.cell.id) ||
    !isPositiveInteger(value.cell.number) ||
    !isPositiveInteger(value.cell.level) ||
    !isPositiveInteger(value.cell.position)
  ) {
    throw new ApiError("Unexpected event reservation in API response", 0, undefined, "response");
  }

  return {
    id: value.id,
    quantity: value.quantity,
    inventory: {
      id: value.inventory.id,
      name: value.inventory.name,
      quantity: value.inventory.quantity,
    },
    warehouse: { id: value.warehouse.id, name: value.warehouse.name },
    rack: { id: value.rack.id, code: value.rack.code },
    cell: {
      id: value.cell.id,
      number: value.cell.number,
      level: value.cell.level,
      position: value.cell.position,
    },
  };
}

function parseEventDetail(value: unknown): InventoryEventDetail {
  if (!isRecord(value) || !Array.isArray(value.reservations)) {
    throw new ApiError("Unexpected event detail in API response", 0, undefined, "response");
  }
  return { ...parseEvent(value), reservations: value.reservations.map(parseReservation) };
}

function parseCreatedEvent(value: unknown): CreatedEvent {
  if (!isRecord(value) || !Array.isArray(value.reservations)) {
    throw new ApiError("Unexpected created event in API response", 0, undefined, "response");
  }
  const reservations = value.reservations.map((reservation): CreatedEvent["reservations"][number] => {
    if (
      !isRecord(reservation) ||
      !isPositiveInteger(reservation.id) ||
      !isPositiveInteger(reservation.inventory_id) ||
      !isPositiveInteger(reservation.cell_id) ||
      !isPositiveInteger(reservation.quantity)
    ) {
      throw new ApiError("Unexpected created reservation in API response", 0, undefined, "response");
    }
    return {
      id: reservation.id,
      inventory_id: reservation.inventory_id,
      cell_id: reservation.cell_id,
      quantity: reservation.quantity,
    };
  });

  return { ...parseEvent(value), reservations };
}

export const eventsApi = {
  async getAll(): Promise<InventoryEvent[]> {
    const response = await requestApi<unknown>("events", { cache: "no-store" });
    if (!isRecord(response) || !Array.isArray(response.data)) {
      throw new ApiError("Unexpected event list in API response", 0, undefined, "response");
    }
    return response.data.map(parseEvent);
  },

  async getById(eventId: number): Promise<InventoryEventDetail> {
    return parseEventDetail(await requestApi<unknown>(`events/${eventId}`, { cache: "no-store" }));
  },

  async create(input: CreateEventInput): Promise<CreatedEvent> {
    return parseCreatedEvent(await requestApi<unknown>("events", {
      method: "POST",
      body: JSON.stringify(input),
    }));
  },
};
