export interface InventoryEvent {
  id: number;
  name: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
}

export interface EventReservation {
  id: number;
  quantity: number;
  inventory: {
    id: number;
    name: string;
    quantity: number;
  };
  warehouse: {
    id: number;
    name: string;
  };
  rack: {
    id: number;
    code: string;
  };
  cell: {
    id: number;
    number: number;
    level: number;
    position: number;
  };
}

export interface InventoryEventDetail extends InventoryEvent {
  reservations: EventReservation[];
}

export interface CreateEventInput {
  name: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  reservations: Array<{
    inventory_placement_id: number;
    quantity: number;
  }>;
}

export interface CreatedEvent extends InventoryEvent {
  reservations: Array<{
    id: number;
    inventory_id: number;
    cell_id: number;
    quantity: number;
  }>;
}

export type UpdateEventInput = Partial<Pick<InventoryEvent, "name" | "description" | "starts_at" | "ends_at">>;

export interface ReservationInput {
  inventory_placement_id: number;
  quantity: number;
}

export interface ReservationMutationResult {
  id: number;
  event_id: number;
  inventory_id: number;
  cell_id: number;
  quantity: number;
}
