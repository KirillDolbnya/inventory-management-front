import { ApiError, requestApi } from "@/api/client";
import type { Cell, LayoutPoint, Rack } from "@/features/warehouse/types";
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
  walls: { outline: LayoutPoint[] } | null;
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

function parseWarehouse(value: unknown): Warehouse {
  if (typeof value !== "object" || value === null) {
    throw new ApiError("Unexpected warehouse in API response", 0, undefined, "response");
  }
  const warehouse = value as Record<string, unknown>;
  if (typeof warehouse.name !== "string" || typeof warehouse.address !== "string") {
    throw new ApiError("Unexpected warehouse in API response", 0, undefined, "response");
  }
  return {
    id: toNumber(warehouse.id, "warehouse.id"),
    name: warehouse.name,
    address: warehouse.address,
    latitude: toNumber(warehouse.latitude, "warehouse.latitude"),
    longitude: toNumber(warehouse.longitude, "warehouse.longitude"),
  };
}

function resolveWarehouseModelUrl(value: string): string {
  const apiBase = import.meta.env.VITE_API_URL?.trim();
  if (!apiBase) return value;
  try {
    const apiUrl = new URL(apiBase);
    const modelUrl = new URL(value, apiUrl.origin);
    const localHost = apiUrl.hostname === "localhost" || apiUrl.hostname === "127.0.0.1";
    if (
      localHost &&
      modelUrl.pathname.startsWith("/storage/") &&
      modelUrl.origin !== apiUrl.origin
    ) {
      modelUrl.protocol = apiUrl.protocol;
      modelUrl.host = apiUrl.host;
    }
    return modelUrl.href;
  } catch {
    throw new ApiError("Unexpected warehouse model URL in API response", 0, undefined, "response");
  }
}

function buildLayoutFormData(modelFile: File, racks: RackLayoutInput[], wallOutline: LayoutPoint[]) {
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
  wallOutline.forEach((point, index) => {
    body.append(`walls[outline][${index}][x]`, String(point.x));
    body.append(`walls[outline][${index}][z]`, String(point.z));
  });
  return body;
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
  const wallOutline = layout.walls?.outline;
  return {
    id: toNumber(layout.id, "layout.id"),
    walls: Array.isArray(wallOutline)
      ? {
        outline: wallOutline.map((point, index) => ({
          x: toNumber(point.x, `layout.walls.outline.${index}.x`),
          z: toNumber(point.z, `layout.walls.outline.${index}.z`),
        })),
      }
      : null,
    model: {
      url: resolveWarehouseModelUrl(layout.model.url),
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
    return response.data.map(parseWarehouse);
  },

  async getWarehouse(warehouseId: number): Promise<Warehouse> {
    return parseWarehouse(await requestApi<unknown>(`warehouses/${warehouseId}`));
  },

  async suggestAddresses(address: string): Promise<AddressSuggestion[]> {
    const query = new URLSearchParams({ address });
    const response = await requestApi<DataEnvelope<AddressSuggestion[]>>(
      `addresses/suggestions?${query.toString()}`,
    );
    return response.data;
  },

  async createWarehouse(input: { name: string; fias_id: string }): Promise<Warehouse> {
    return parseWarehouse(await requestApi<unknown>("warehouses", {
      method: "POST",
      body: JSON.stringify(input),
    }));
  },

  async updateWarehouse(warehouseId: number, input: { name?: string; fias_id?: string }): Promise<Warehouse> {
    return parseWarehouse(await requestApi<unknown>(`warehouses/${warehouseId}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }));
  },

  async deleteWarehouse(warehouseId: number): Promise<void> {
    await requestApi<void>(`warehouses/${warehouseId}`, { method: "DELETE" });
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

  async updateRack(
    warehouseId: number,
    rackId: number,
    input: { code?: string; levels_count?: number; cells_per_level?: number },
  ): Promise<Rack> {
    const response = await requestApi<unknown>(`warehouses/${warehouseId}/racks/${rackId}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
    return parseRack(response);
  },

  async deleteRack(warehouseId: number, rackId: number): Promise<void> {
    await requestApi<void>(`warehouses/${warehouseId}/racks/${rackId}`, { method: "DELETE" });
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
    wallOutline: LayoutPoint[],
  ): Promise<WarehouseLayoutResponse> {
    const response = await requestApi<DataEnvelope<WarehouseLayoutResponse>>(
      `warehouses/${warehouseId}/layout`,
      { method: "PUT", body: buildLayoutFormData(modelFile, racks, wallOutline) },
    );
    return parseLayoutResponse(response);
  },

  async updateLayout(
    warehouseId: number,
    modelFile: File,
    racks: RackLayoutInput[],
    wallOutline: LayoutPoint[],
  ): Promise<WarehouseLayoutResponse> {
    const body = buildLayoutFormData(modelFile, racks, wallOutline);
    // Laravel/Symfony parses multipart uploads reliably on POST; _method routes it to the documented PATCH endpoint.
    body.append("_method", "PATCH");
    const response = await requestApi<DataEnvelope<WarehouseLayoutResponse>>(
      `warehouses/${warehouseId}/layout`,
      { method: "POST", body },
    );
    return parseLayoutResponse(response);
  },

  async deleteLayout(warehouseId: number): Promise<void> {
    await requestApi<void>(`warehouses/${warehouseId}/layout`, { method: "DELETE" });
  },
};
