import { ArrowLeft, CalendarCheck2, CalendarClock, CalendarX2, LoaderCircle, MapPin, Package, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { InventoryEventDetail } from "@/features/dashboard/types/inventory-event";
import { getEventTimeStatus } from "@/features/dashboard/utils/event-time";

type EventDetailProps = {
  event: InventoryEventDetail | null;
  loading: boolean;
  error: string | null;
  onBack: () => void;
  onRetry: () => void;
};

const dateTimeFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function EventDetail({ event, loading, error, onBack, onRetry }: EventDetailProps) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!event) return;
    const currentTime = Date.now();
    const boundary = [Date.parse(event.starts_at), Date.parse(event.ends_at)]
      .filter((time) => time > currentTime)
      .sort((a, b) => a - b)[0];
    if (!boundary) return;
    const timeout = window.setTimeout(() => setNow(Date.now()), Math.max(1000, boundary - currentTime + 50));
    return () => window.clearTimeout(timeout);
  }, [event, now]);

  const status = event ? getEventTimeStatus(event, now) : null;
  const statusConfig = status === "active"
    ? { text: "Активно", Icon: CalendarCheck2, color: "text-emerald-700", background: "bg-emerald-50" }
    : status === "upcoming"
      ? { text: "Предстоит", Icon: CalendarClock, color: "text-blue-700", background: "bg-blue-50" }
      : { text: "Завершено", Icon: CalendarX2, color: "text-muted-foreground", background: "bg-muted" };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-5 pb-6 pt-4 sm:px-6">
        <Button className="-ml-2 mb-4 h-9 w-fit rounded-lg px-2 text-muted-foreground" onClick={onBack} type="button" variant="ghost">
          <ArrowLeft aria-hidden="true" size={16} />
          Все события
        </Button>

        {loading ? (
          <div className="flex min-h-56 items-center justify-center gap-2 text-sm text-muted-foreground" role="status">
            <LoaderCircle aria-hidden="true" className="animate-spin" size={17} />
            Загружаем событие…
          </div>
        ) : error ? (
          <div className="flex min-h-56 flex-col items-center justify-center px-3 text-center">
            <p className="max-w-64 text-sm leading-5 text-muted-foreground" role="alert">{error}</p>
            <Button className="mt-4 h-10 rounded-lg" onClick={onRetry} type="button" variant="outline">
              <RefreshCw aria-hidden="true" size={15} />
              Повторить
            </Button>
          </div>
        ) : event ? (
          <>
            <div className="flex items-start gap-3">
              <span className={`mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl ${statusConfig.background} ${statusConfig.color}`}>
                <statusConfig.Icon aria-hidden="true" size={19} />
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="break-words text-lg font-semibold leading-6 tracking-tight">{event.name}</h3>
                <span className={`mt-1 inline-flex text-xs font-medium ${statusConfig.color}`}>{statusConfig.text}</span>
              </div>
            </div>

            {event.description && (
              <p className="mt-5 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">
                {event.description}
              </p>
            )}

            <dl className="mt-5 space-y-3 rounded-xl border border-border bg-white p-4">
              <DateField label="Начало" value={event.starts_at} />
              <DateField label="Окончание" value={event.ends_at} />
            </dl>

            <div className="mt-7">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h4 className="text-sm font-semibold">Забронированный инвентарь</h4>
                <span className="text-xs text-muted-foreground">{event.reservations.length}</span>
              </div>
              {event.reservations.length ? (
                <ul className="divide-y divide-border rounded-xl border border-border bg-white">
                  {event.reservations.map((reservation) => (
                    <li className="flex min-w-0 items-start gap-3 p-3.5" key={reservation.id}>
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                        <Package aria-hidden="true" size={15} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="break-words text-sm font-medium leading-5">{reservation.inventory.name}</p>
                        <p className="mt-1 flex items-start gap-1 text-xs leading-5 text-muted-foreground">
                          <MapPin aria-hidden="true" className="mt-0.5 shrink-0" size={12} />
                          <span className="break-words">
                            {reservation.warehouse.name} · стеллаж {reservation.rack.code} · ячейка {reservation.cell.number}
                          </span>
                        </p>
                      </div>
                      <span className="shrink-0 pt-0.5 text-sm font-semibold tabular-nums">
                        {reservation.quantity.toLocaleString("ru-RU")} шт.
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                  Для события не найдено бронирований.
                </p>
              )}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

function DateField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:justify-between sm:gap-4">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium tabular-nums sm:text-right">{dateTimeFormatter.format(new Date(value))}</dd>
    </div>
  );
}
