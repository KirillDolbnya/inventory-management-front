import type { InventoryCell, InventoryItem, InventoryPlacement } from "@/features/dashboard/types/inventory";

export interface Cell extends InventoryCell {}

export interface Rack {
  id: number;
  code: string;
  levels_count: number;
  cells_per_level: number;
  cells: Cell[];
}

export interface WarehouseLayout {
  version: number;
  room: {
    width: number;
    length: number;
    height: number;
  };
  walls: LayoutWall[];
  columns: LayoutColumn[];
  racks: LayoutRack[];
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
  position: { x: number; z: number };
  rotation: number;
  dimensions: { width: number; depth: number; height: number };
}

export type WarehouseCellItem = InventoryItem & {
  cell_quantity: number;
  placement: InventoryPlacement;
};

export type WarehouseInventoryItem = InventoryItem & {
  warehouse_quantity: number;
};

export type WarehousePanel = "inventory" | "events" | "cell";
