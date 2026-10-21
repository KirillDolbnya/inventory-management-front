import { ApiError, requestApi } from "@/api/client";
import type {
  InventoryCell,
  InventoryItem,
  InventoryRack,
  InventoryWarehouse,
  InventoryPlacement,
} from "@/features/dashboard/types/inventory";

export type CreateInventoryInput = {
  name: string;
  description: string | null;
  quantity: number;
};

export type CreatedInventory = {
  id: number;
  name: string;
  description: string | null;
  quantity: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

function parseWarehouse(value: unknown): InventoryWarehouse {
  if (!isRecord(value) || !isPositiveInteger(value.id) || typeof value.name !== "string") {
    throw new ApiError("Unexpected inventory warehouse in API response", 0, undefined, "response");
  }
  return { id: value.id, name: value.name };
}

function parseRack(value: unknown): InventoryRack {
  if (!isRecord(value) || !isPositiveInteger(value.id) || typeof value.code !== "string") {
    throw new ApiError("Unexpected inventory rack in API response", 0, undefined, "response");
  }
  return { id: value.id, code: value.code };
}

function parseCell(value: unknown): InventoryCell {
  if (
    !isRecord(value) ||
    !isPositiveInteger(value.id) ||
    !isPositiveInteger(value.number) ||
    !isPositiveInteger(value.level) ||
    !isPositiveInteger(value.position)
  ) {
    throw new ApiError("Unexpected inventory cell in API response", 0, undefined, "response");
  }
  return { id: value.id, number: value.number, level: value.level, position: value.position };
}

function parsePlacement(value: unknown): InventoryPlacement {
  if (!isRecord(value) || !isPositiveInteger(value.id) || !isNonNegativeInteger(value.quantity)) {
    throw new ApiError("Unexpected inventory placement in API response", 0, undefined, "response");
  }
  return {
    id: value.id,
    quantity: value.quantity,
    warehouse: parseWarehouse(value.warehouse),
    rack: parseRack(value.rack),
    cell: parseCell(value.cell),
  };
}

function parseInventoryItem(value: unknown): InventoryItem {
  if (
    !isRecord(value) ||
    !isPositiveInteger(value.id) ||
    typeof value.name !== "string" ||
    !(typeof value.description === "string" || value.description === null) ||
    !isNonNegativeInteger(value.quantity) ||
    !isNonNegativeInteger(value.placed_quantity) ||
    !isNonNegativeInteger(value.unplaced_quantity) ||
    !Array.isArray(value.placements)
  ) {
    throw new ApiError("Unexpected inventory item in API response", 0, undefined, "response");
  }

  return {
    id: value.id,
    name: value.name,
    description: value.description,
    quantity: value.quantity,
    placed_quantity: value.placed_quantity,
    unplaced_quantity: value.unplaced_quantity,
    placements: value.placements.map(parsePlacement),
  };
}

function parseCreatedInventory(value: unknown): CreatedInventory {
  if (
    !isRecord(value) ||
    !isPositiveInteger(value.id) ||
    typeof value.name !== "string" ||
    !(typeof value.description === "string" || value.description === null) ||
    !isNonNegativeInteger(value.quantity)
  ) {
    throw new ApiError("Unexpected inventory response", 0, undefined, "response");
  }

  return {
    id: value.id,
    name: value.name,
    description: value.description,
    quantity: value.quantity,
  };
}

export const inventoryApi = {
  async getAll(): Promise<InventoryItem[]> {
    const response = await requestApi<unknown>("inventories", { cache: "no-store" });
    if (!isRecord(response) || !Array.isArray(response.data)) {
      throw new ApiError("Unexpected inventory list in API response", 0, undefined, "response");
    }
    return response.data.map(parseInventoryItem);
  },

  async create(input: CreateInventoryInput): Promise<CreatedInventory> {
    const response = await requestApi<unknown>("inventories", {
      method: "POST",
      body: JSON.stringify(input),
    });
    return parseCreatedInventory(response);
  },

};
