import type { InventoryEvent } from "@/features/dashboard/types/inventory-event";

export type EventTimeStatus = "upcoming" | "active" | "completed";

export function getEventTimeStatus(event: Pick<InventoryEvent, "starts_at" | "ends_at">, now = Date.now()): EventTimeStatus {
  const startsAt = Date.parse(event.starts_at);
  const endsAt = Date.parse(event.ends_at);
  if (now < startsAt) return "upcoming";
  if (now >= endsAt) return "completed";
  return "active";
}

export function sortEventsByTime(events: InventoryEvent[], now = Date.now()): InventoryEvent[] {
  const rank: Record<EventTimeStatus, number> = { active: 0, upcoming: 1, completed: 2 };
  return [...events].sort((left, right) => {
    const leftStatus = getEventTimeStatus(left, now);
    const rightStatus = getEventTimeStatus(right, now);
    const statusOrder = rank[leftStatus] - rank[rightStatus];
    if (statusOrder !== 0) return statusOrder;
    if (leftStatus === "completed") return Date.parse(right.ends_at) - Date.parse(left.ends_at);
    return Date.parse(left.starts_at) - Date.parse(right.starts_at);
  });
}
