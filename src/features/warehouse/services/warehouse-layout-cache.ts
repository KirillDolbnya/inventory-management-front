import type { WarehouseLayout } from "@/features/warehouse/types";

const CACHE_KEY_PREFIX = "inventory-management:warehouse-layout:";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isPoint(value: unknown): value is { x: number; z: number } {
  return isRecord(value) && isFiniteNumber(value.x) && isFiniteNumber(value.z);
}

function isLayoutRack(value: unknown): boolean {
  return isRecord(value) &&
    isFiniteNumber(value.rackId) &&
    isRecord(value.position) &&
    isFiniteNumber(value.position.x) &&
    isFiniteNumber(value.position.y) &&
    isFiniteNumber(value.position.z) &&
    isFiniteNumber(value.rotation_y_deg) &&
    isRecord(value.dimensions) &&
    isFiniteNumber(value.dimensions.width) &&
    isFiniteNumber(value.dimensions.depth) &&
    isFiniteNumber(value.dimensions.height);
}

function isWarehouseLayout(value: unknown): value is WarehouseLayout {
  if (!isRecord(value) || !isRecord(value.room) || !Array.isArray(value.wallOutline) ||
    !Array.isArray(value.walls) || !Array.isArray(value.columns) || !Array.isArray(value.racks)) {
    return false;
  }
  if (![value.room.width, value.room.length, value.room.height].every(isFiniteNumber) ||
    !value.wallOutline.every(isPoint) || !value.racks.every(isLayoutRack)) {
    return false;
  }
  if (value.model !== undefined && (!isRecord(value.model) || typeof value.model.url !== "string")) return false;
  return true;
}

function getCacheKey(warehouseId: number) {
  return `${CACHE_KEY_PREFIX}${warehouseId}`;
}

export function readWarehouseLayoutCache(warehouseId: number): WarehouseLayout | null {
  try {
    const cachedValue = localStorage.getItem(getCacheKey(warehouseId));
    if (!cachedValue) return null;
    const parsedValue: unknown = JSON.parse(cachedValue);
    if (!isWarehouseLayout(parsedValue) || !parsedValue.model?.url) {
      localStorage.removeItem(getCacheKey(warehouseId));
      return null;
    }
    return parsedValue;
  } catch {
    return null;
  }
}

export function writeWarehouseLayoutCache(warehouseId: number, layout: WarehouseLayout) {
  if (!layout.model?.url) return;
  try {
    localStorage.setItem(getCacheKey(warehouseId), JSON.stringify(layout));
  } catch {
    // The server remains the source of truth when browser storage is unavailable.
  }
}

export function clearWarehouseLayoutCache(warehouseId: number) {
  try {
    localStorage.removeItem(getCacheKey(warehouseId));
  } catch {
    // Ignore unavailable browser storage.
  }
}
