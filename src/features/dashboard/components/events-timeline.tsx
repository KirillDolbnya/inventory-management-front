import { Activity } from "lucide-react";
import type { InventoryEvent } from "@/features/dashboard/types/inventory-event";

type EventsTimelineProps = {
  events: InventoryEvent[];
};

const eventDateFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export function EventsTimeline({ events }: EventsTimelineProps) {
  return (
    <ol className="px-5 pb-5 pt-5 sm:px-6">
      {events.map((event, index) => (
        <li className="relative flex gap-3 pb-6 last:pb-0" key={event.id}>
          {index < events.length - 1 && (
            <span
              aria-hidden="true"
              className="absolute bottom-0 left-[15px] top-8 w-px bg-border"
            />
          )}
          <span className="relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-white text-muted-foreground">
            <Activity aria-hidden="true" size={15} />
          </span>
          <div className="min-w-0 flex-1 pt-0.5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h3 className="min-w-0 break-words text-sm font-medium leading-5">{event.title}</h3>
              <time
                className="shrink-0 text-[11px] tabular-nums text-muted-foreground"
                dateTime={event.created_at}
              >
                {eventDateFormatter.format(new Date(event.created_at))}
              </time>
            </div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{event.description}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
