export interface InventoryEvent {
  id: number;
  title: string;
  description: string;
  created_at: string;
  warehouse_id?: number;
}
