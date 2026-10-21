import { CalendarCheck2, CalendarClock, CalendarX2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { InventoryEvent } from "@/features/dashboard/types/inventory-event";
import { getEventTimeStatus, sortEventsByTime, type EventTimeStatus } from "@/features/dashboard/utils/event-time";

type EventsTimelineProps = {
  events: InventoryEvent[];
  onSelectEvent?: (eventId: number) => void;
};

const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "short",
});
const timeFormatter = new Intl.DateTimeFormat("ru-RU", {
  hour: "2-digit",
  minute: "2-digit",
});

const statusDisplay: Record<EventTimeStatus, {
  label: string;
  className: string;
  Icon: typeof CalendarClock;
}> = {
  active: { label: "Активно", className: "text-emerald-700", Icon: CalendarCheck2 },
  upcoming: { label: "Предстоит", className: "text-blue-700", Icon: CalendarClock },
  completed: { label: "Завершено", className: "text-muted-foreground", Icon: CalendarX2 },
};

export function EventsTimeline({ events, onSelectEvent }: EventsTimelineProps) {
  const [now, setNow] = useState(Date.now());
  const sortedEvents = useMemo(() => sortEventsByTime(events, now), [events, now]);

  useEffect(() => {
    const currentTime = Date.now();
    const nextBoundary = events
      .flatMap((event) => [Date.parse(event.starts_at), Date.parse(event.ends_at)])
      .filter((time) => time > currentTime)
      .sort((a, b) => a - b)[0];

    if (!nextBoundary) return;
    const timeout = window.setTimeout(
      () => setNow(Date.now()),
      Math.max(1000, nextBoundary - currentTime + 50),
    );
    return () => window.clearTimeout(timeout);
  }, [events, now]);

  if (events.length === 0) {
    return (
      <div className="flex min-h-44 flex-col items-center justify-center px-6 text-center">
        <div className="mb-3 flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <CalendarClock aria-hidden="true" size={18} />
        </div>
        <p className="text-sm font-medium">Событий пока нет</p>
        <p className="mt-1 max-w-56 text-xs leading-5 text-muted-foreground">
          Создайте событие и забронируйте для него инвентарь.
        </p>
      </div>
    );
  }

  return (
    <ol className="px-5 pb-5 pt-4 sm:px-6">
      {sortedEvents.map((event, index) => {
        const status = getEventTimeStatus(event, now);
        const { Icon, label, className } = statusDisplay[status];
        const content = (
          <>
            <span className={`relative z-10 flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-white ${className}`}>
              <Icon aria-hidden="true" size={16} />
            </span>
            <span className="min-w-0 flex-1 pt-0.5">
              <span className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
                <span className="min-w-0 break-words text-sm font-medium leading-5">{event.name}</span>
                <span className={`shrink-0 text-[10px] font-medium ${className}`}>{label}</span>
              </span>
              <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                {formatEventRange(event.starts_at, event.ends_at)}
              </span>
              {event.description && (
                <span className="mt-1 block break-words text-xs leading-5 text-muted-foreground">
                  {event.description}
                </span>
              )}
            </span>
          </>
        );

        return (
          <li className="relative flex gap-3 pb-5 last:pb-0" key={event.id}>
            {index < sortedEvents.length - 1 && (
              <span aria-hidden="true" className="absolute bottom-0 left-[17px] top-9 w-px bg-border" />
            )}
            {onSelectEvent ? (
              <button
                className="flex w-full min-w-0 gap-3 rounded-lg py-1 text-left outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                onClick={() => onSelectEvent(event.id)}
                type="button"
              >
                {content}
              </button>
            ) : (
              <div className="flex w-full min-w-0 gap-3 py-1">{content}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function formatEventRange(startsAtValue: string, endsAtValue: string) {
  const startsAt = new Date(startsAtValue);
  const endsAt = new Date(endsAtValue);
  const startDate = dateFormatter.format(startsAt);
  const endDate = dateFormatter.format(endsAt);
  const startTime = timeFormatter.format(startsAt);
  const endTime = timeFormatter.format(endsAt);

  if (startsAt.toDateString() === endsAt.toDateString()) {
    return `${startDate} · ${startTime}–${endTime}`;
  }
  return `${startDate}, ${startTime} — ${endDate}, ${endTime}`;
}
