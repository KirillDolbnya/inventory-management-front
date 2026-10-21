import type { InventoryCell, InventoryItem } from "@/features/dashboard/types/inventory";
import type { CellInventoryItem } from "@/features/warehouse/api/inventory-placement-api";

export interface Cell extends InventoryCell {}

export interface Rack {
  id: number;
  code: string;
  levels_count: number;
  cells_per_level: number;
  cells: Cell[];
}

export interface WarehouseLayout {
  room: {
    width: number;
    length: number;
    height: number;
  };
  walls: LayoutWall[];
  columns: LayoutColumn[];
  racks: LayoutRack[];
  model?: {
    url: string;
    format: string;
    unit: string;
    origin: string;
  };
}

export interface LayoutWall {
  id: string;
  start: { x: number; z: number };
  end: { x: number; z: number };
  height: number;
  thickness: number;
}

export interface LayoutColumn {
  id: string;
  position: { x: number; z: number };
  dimensions: { width: number; depth: number; height: number };
}

export interface LayoutRack {
  rackId: number;
  position: { x: number; y: number; z: number };
  rotation_y_deg: number;
  dimensions: { width: number; depth: number; height: number };
}

export type WarehouseCellItem = CellInventoryItem;

export type WarehouseInventoryItem = InventoryItem & {
  warehouse_quantity: number;
};

export type WarehousePanel = "inventory" | "events" | "cell";
