import { ApiError, requestApi } from "@/api/client";

export interface CellInventoryItem {
  id: number;
  name: string;
  description: string | null;
  quantity: number;
  quantity_in_cell: number;
  placement_id: number;
}

export interface CreateInventoryPlacementInput {
  cell_id: number;
  quantity: number;
}

export interface CreatedInventoryPlacement {
  id: number;
  inventory_id: number;
  cell_id: number;
  inventory_quantity: number;
  placement_quantity: number;
  placed_quantity: number;
  unplaced_quantity: number;
}

export interface TransferInventoryInput {
  target_cell_id: number;
  quantity: number;
}

export interface TransferredPlacement {
  id: number;
  cell_id: number;
  quantity: number;
}

export interface TransferredInventory {
  inventory_id: number;
  transferred_quantity: number;
  source_placement: TransferredPlacement | null;
  target_placement: TransferredPlacement;
  placed_quantity: number;
  unplaced_quantity: number;
}

export interface UnplacedInventory {
  inventory_id: number;
  removed_quantity: number;
  placement_quantity: number;
  placed_quantity: number;
  unplaced_quantity: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

function parseInteger(value: unknown, field: string, allowZero = false) {
  const numberValue = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(numberValue) || (allowZero ? numberValue < 0 : numberValue < 1)) {
    throw new ApiError(`Unexpected ${field} in API response`, 0, undefined, "response");
  }
  return numberValue;
}

function parseCellInventoryItem(value: unknown): CellInventoryItem {
  if (
    !isRecord(value) ||
    !isPositiveInteger(value.id) ||
    typeof value.name !== "string" ||
    !(typeof value.description === "string" || value.description === null) ||
    !isNonNegativeInteger(value.quantity) ||
    !isNonNegativeInteger(value.quantity_in_cell) ||
    !isPositiveInteger(value.placement_id)
  ) {
    throw new ApiError("Unexpected cell inventory in API response", 0, undefined, "response");
  }

  return {
    id: value.id,
    name: value.name,
    description: value.description,
    quantity: value.quantity,
    quantity_in_cell: value.quantity_in_cell,
    placement_id: value.placement_id,
  };
}

function parseCreatedInventoryPlacement(value: unknown): CreatedInventoryPlacement {
  if (
    !isRecord(value) ||
    !isPositiveInteger(value.id) ||
    !isPositiveInteger(value.inventory_id) ||
    !isPositiveInteger(value.cell_id) ||
    !isNonNegativeInteger(value.inventory_quantity) ||
    !isPositiveInteger(value.placement_quantity) ||
    !isNonNegativeInteger(value.placed_quantity) ||
    !isNonNegativeInteger(value.unplaced_quantity)
  ) {
    throw new ApiError("Unexpected inventory placement response", 0, undefined, "response");
  }

  return {
    id: value.id,
    inventory_id: value.inventory_id,
    cell_id: value.cell_id,
    inventory_quantity: value.inventory_quantity,
    placement_quantity: value.placement_quantity,
    placed_quantity: value.placed_quantity,
    unplaced_quantity: value.unplaced_quantity,
  };
}

function parseTransferredPlacement(value: unknown, field: string): TransferredPlacement {
  if (!isRecord(value)) {
    throw new ApiError(`Unexpected ${field} in API response`, 0, undefined, "response");
  }
  return {
    id: parseInteger(value.id, `${field}.id`),
    cell_id: parseInteger(value.cell_id, `${field}.cell_id`),
    quantity: parseInteger(value.quantity, `${field}.quantity`),
  };
}

function parseTransferredInventory(value: unknown): TransferredInventory {
  if (!isRecord(value)) {
    throw new ApiError("Unexpected inventory transfer response", 0, undefined, "response");
  }
  return {
    inventory_id: parseInteger(value.inventory_id, "inventory_id"),
    transferred_quantity: parseInteger(value.transferred_quantity, "transferred_quantity"),
    source_placement: value.source_placement === null
      ? null
      : parseTransferredPlacement(value.source_placement, "source_placement"),
    target_placement: parseTransferredPlacement(value.target_placement, "target_placement"),
    placed_quantity: parseInteger(value.placed_quantity, "placed_quantity", true),
    unplaced_quantity: parseInteger(value.unplaced_quantity, "unplaced_quantity", true),
  };
}

function parseUnplacedInventory(value: unknown): UnplacedInventory {
  if (!isRecord(value)) {
    throw new ApiError("Unexpected inventory unplace response", 0, undefined, "response");
  }
  return {
    inventory_id: parseInteger(value.inventory_id, "inventory_id"),
    removed_quantity: parseInteger(value.removed_quantity, "removed_quantity"),
    placement_quantity: parseInteger(value.placement_quantity, "placement_quantity", true),
    placed_quantity: parseInteger(value.placed_quantity, "placed_quantity", true),
    unplaced_quantity: parseInteger(value.unplaced_quantity, "unplaced_quantity", true),
  };
}

export const inventoryPlacementApi = {
  async getByCell(cellId: number): Promise<CellInventoryItem[]> {
    const response = await requestApi<unknown>(`cells/${cellId}/inventories`, { cache: "no-store" });
    if (!isRecord(response) || !Array.isArray(response.data)) {
      throw new ApiError("Unexpected cell inventory list in API response", 0, undefined, "response");
    }
    return response.data.map(parseCellInventoryItem);
  },

  async create(inventoryId: number, input: CreateInventoryPlacementInput): Promise<CreatedInventoryPlacement> {
    const response = await requestApi<unknown>(`inventories/${inventoryId}/placements`, {
      method: "POST",
      body: JSON.stringify(input),
    });
    return parseCreatedInventoryPlacement(response);
  },

  async transfer(placementId: number, input: TransferInventoryInput): Promise<TransferredInventory> {
    const response = await requestApi<unknown>(`inventory-placements/${placementId}/transfer`, {
      method: "POST",
      body: JSON.stringify(input),
    });
    return parseTransferredInventory(response);
  },

  async unplace(placementId: number, quantity: number): Promise<UnplacedInventory> {
    const response = await requestApi<unknown>(`inventory-placements/${placementId}/unplace`, {
      method: "POST",
      body: JSON.stringify({ quantity }),
    });
    return parseUnplacedInventory(response);
  },
};
