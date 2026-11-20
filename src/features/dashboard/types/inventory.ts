export interface InventoryWarehouse {
  id: number;
  name: string;
}

export interface InventoryRack {
  id: number;
  code: string;
}

export interface InventoryCell {
  id: number;
  number: number;
  level: number;
  position: number;
}

export interface InventoryPlacement {
  id: number;
  quantity: number;
  warehouse: InventoryWarehouse;
  rack: InventoryRack;
  cell: InventoryCell;
}

export interface InventoryItem {
  id: number;
  name: string;
  description: string | null;
  quantity: number;
  placed_quantity: number;
  unplaced_quantity: number;
  placements: InventoryPlacement[];
}
