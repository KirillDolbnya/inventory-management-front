import { ApiError, requestApi } from "@/api/client";
import type { Cell, Rack } from "@/features/warehouse/types";
import type { Warehouse } from "@/features/dashboard/types/warehouse";

export interface AddressSuggestion {
  address: string;
  fias_id: string;
}

export interface RackLayoutInput {
  id: number;
  position: { x: number; y: number; z: number };
  rotation_y_deg: number;
  dimensions: { width: number; depth: number; height: number };
}

export interface WarehouseLayoutRack extends RackLayoutInput {
  code: string;
  levels_count: number;
  cells_per_level: number;
}

export interface WarehouseLayoutResponse {
  id: number;
  model: {
    url: string;
    format: string;
    unit: string;
    origin: string;
  };
  racks: WarehouseLayoutRack[];
}

type DataEnvelope<T> = { data: T };

function toNumber(value: unknown, field: string): number {
  const numberValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numberValue)) {
    throw new ApiError(`Unexpected ${field} in API response`, 0, undefined, "response");
  }
  return numberValue;
}

function parseCell(value: unknown): Cell {
  if (typeof value !== "object" || value === null) {
    throw new ApiError("Unexpected cell in API response", 0, undefined, "response");
  }
  const cell = value as Record<string, unknown>;
  return {
    id: toNumber(cell.id, "cell.id"),
    number: toNumber(cell.number, "cell.number"),
    level: toNumber(cell.level, "cell.level"),
    position: toNumber(cell.position, "cell.position"),
  };
}

function parseRack(value: unknown): Rack {
  if (typeof value !== "object" || value === null) {
    throw new ApiError("Unexpected rack in API response", 0, undefined, "response");
  }
  const rack = value as Record<string, unknown>;
  if (typeof rack.code !== "string" || !Array.isArray(rack.cells)) {
    throw new ApiError("Unexpected rack in API response", 0, undefined, "response");
  }
  return {
    id: toNumber(rack.id, "rack.id"),
    code: rack.code,
    levels_count: toNumber(rack.levels_count, "rack.levels_count"),
    cells_per_level: toNumber(rack.cells_per_level, "rack.cells_per_level"),
    cells: rack.cells.map(parseCell),
  };
}

function parseLayoutResponse(value: DataEnvelope<WarehouseLayoutResponse>): WarehouseLayoutResponse {
  const layout = value?.data;
  if (!layout || typeof layout !== "object" || !layout.model || !Array.isArray(layout.racks)) {
    throw new ApiError("Unexpected warehouse layout response", 0, undefined, "response");
  }
  return {
    id: toNumber(layout.id, "layout.id"),
    model: {
      url: layout.model.url,
      format: layout.model.format,
      unit: layout.model.unit,
      origin: layout.model.origin,
    },
    racks: layout.racks.map((rack) => ({
      id: toNumber(rack.id, "layout.rack.id"),
      code: rack.code,
      position: {
        x: toNumber(rack.position.x, "layout.rack.position.x"),
        y: toNumber(rack.position.y, "layout.rack.position.y"),
        z: toNumber(rack.position.z, "layout.rack.position.z"),
      },
      rotation_y_deg: toNumber(rack.rotation_y_deg, "layout.rack.rotation_y_deg"),
      dimensions: {
        width: toNumber(rack.dimensions.width, "layout.rack.dimensions.width"),
        depth: toNumber(rack.dimensions.depth, "layout.rack.dimensions.depth"),
        height: toNumber(rack.dimensions.height, "layout.rack.dimensions.height"),
      },
      levels_count: toNumber(rack.levels_count, "layout.rack.levels_count"),
      cells_per_level: toNumber(rack.cells_per_level, "layout.rack.cells_per_level"),
    })),
  };
}

export const warehouseApi = {
  async getWarehouses(): Promise<Warehouse[]> {
    const response = await requestApi<DataEnvelope<Warehouse[]>>("warehouses");
    return response.data;
  },

  async getWarehouse(warehouseId: number): Promise<Warehouse> {
    return requestApi<Warehouse>(`warehouses/${warehouseId}`);
  },

  async suggestAddresses(address: string): Promise<AddressSuggestion[]> {
    const query = new URLSearchParams({ address });
    const response = await requestApi<DataEnvelope<AddressSuggestion[]>>(
      `addresses/suggestions?${query.toString()}`,
    );
    return response.data;
  },

  async createWarehouse(input: { name: string; fias_id: string }): Promise<Warehouse> {
    return requestApi<Warehouse>("warehouses", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  async getRacks(warehouseId: number): Promise<Rack[]> {
    const response = await requestApi<DataEnvelope<unknown[]>>(`warehouses/${warehouseId}/racks`);
    return response.data.map(parseRack);
  },

  async createRack(
    warehouseId: number,
    rack: { code: string; levels_count: number; cells_per_level: number },
  ): Promise<Rack> {
    const response = await requestApi<DataEnvelope<unknown[]>>(`warehouses/${warehouseId}/racks`, {
      method: "POST",
      body: JSON.stringify({ racks: [rack] }),
    });
    const createdRack = response.data[0];
    if (!createdRack) {
      throw new ApiError("The API did not return the created rack", 0, undefined, "response");
    }
    return parseRack(createdRack);
  },

  async getLayout(warehouseId: number): Promise<WarehouseLayoutResponse> {
    const response = await requestApi<DataEnvelope<WarehouseLayoutResponse>>(
      `warehouses/${warehouseId}/layout`,
      { cache: "no-store" },
    );
    return parseLayoutResponse(response);
  },

  async saveLayout(
    warehouseId: number,
    modelFile: File,
    racks: RackLayoutInput[],
  ): Promise<WarehouseLayoutResponse> {
    const body = new FormData();
    body.append("model_path", modelFile, modelFile.name);
    racks.forEach((rack, index) => {
      body.append(`racks[${index}][id]`, String(rack.id));
      body.append(`racks[${index}][position_x]`, String(rack.position.x));
      body.append(`racks[${index}][position_y]`, String(rack.position.y));
      body.append(`racks[${index}][position_z]`, String(rack.position.z));
      body.append(`racks[${index}][rotation_y_deg]`, String(rack.rotation_y_deg));
      body.append(`racks[${index}][width]`, String(rack.dimensions.width));
      body.append(`racks[${index}][depth]`, String(rack.dimensions.depth));
      body.append(`racks[${index}][height]`, String(rack.dimensions.height));
    });
    const response = await requestApi<DataEnvelope<WarehouseLayoutResponse>>(
      `warehouses/${warehouseId}/layout`,
      { method: "PUT", body },
    );
    return parseLayoutResponse(response);
  },
};
