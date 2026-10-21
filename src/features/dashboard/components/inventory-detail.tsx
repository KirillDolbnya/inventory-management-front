import { ArrowLeft, ArrowUpRight, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { InventoryItem, InventoryPlacement } from "@/features/dashboard/types/inventory";

type InventoryDetailProps = {
  item: InventoryItem;
  onBack: () => void;
  onOpenPlacement: (warehouseId: number, cellId: number) => void;
};

export function InventoryDetail({ item, onBack, onOpenPlacement }: InventoryDetailProps) {
  return (
    <div className="flex min-h-full flex-col">
      <div className="px-5 pb-5 pt-3 sm:px-6">
        <Button className="-ml-2 h-10 rounded-lg px-2 text-muted-foreground" onClick={onBack} type="button" variant="ghost">
          <ArrowLeft aria-hidden="true" size={16} />
          Назад к списку
        </Button>

        <div className="mt-3">
          <h3 className="break-words text-lg font-semibold leading-6 tracking-tight">{item.name}</h3>
          {item.description && <p className="mt-2 break-words text-sm leading-5 text-muted-foreground">{item.description}</p>}
        </div>

        <dl className="mt-5 grid grid-cols-3 gap-2">
          <Quantity label="Всего" value={item.quantity} />
          <Quantity label="Размещено" value={item.placed_quantity} />
          <Quantity label="Не размещено" value={item.unplaced_quantity} />
        </dl>
      </div>

      <div className="border-t border-border px-5 pb-5 pt-4 sm:px-6">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h4 className="text-sm font-semibold">Размещения</h4>
          <span className="text-xs text-muted-foreground">
            {item.placements.length} {getCountWord(item.placements.length)}
          </span>
        </div>

        {item.placements.length ? (
          <ul className="space-y-2">
            {item.placements.map((placement) => (
              <li key={placement.id}>
                <PlacementCard
                  onClick={() => onOpenPlacement(placement.warehouse.id, placement.cell.id)}
                  placement={placement}
                />
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-7 text-center">
            <MapPin aria-hidden="true" className="mx-auto mb-2 text-muted-foreground" size={18} />
            <p className="text-sm text-muted-foreground">Инвентарь пока не размещён на складах</p>
          </div>
        )}
      </div>
    </div>
  );
}

function PlacementCard({ placement, onClick }: { placement: InventoryPlacement; onClick: () => void }) {
  return (
    <button
      aria-label={`Показать ${placement.warehouse.name}, стеллаж ${placement.rack.code}, ячейка ${placement.cell.number}`}
      className="w-full rounded-xl border border-border bg-white p-3 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      onClick={onClick}
      type="button"
    >
      <span className="flex min-w-0 items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="block break-words text-sm font-medium leading-5">{placement.warehouse.name}</span>
          <span className="mt-1 block break-words text-xs leading-5 text-muted-foreground">
            Стеллаж {placement.rack.code} · Ячейка №{placement.cell.number}
          </span>
          <span className="block text-xs leading-5 text-muted-foreground">
            Уровень {placement.cell.level} · позиция {placement.cell.position}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block text-sm font-semibold tabular-nums">{placement.quantity.toLocaleString("ru-RU")} шт.</span>
          <span className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-foreground">
            Показать на складе <ArrowUpRight aria-hidden="true" size={13} />
          </span>
        </span>
      </span>
    </button>
  );
}

function Quantity({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0 rounded-lg bg-muted/70 px-2.5 py-2">
      <dt className="truncate text-[10px] leading-4 text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold tabular-nums">{value.toLocaleString("ru-RU")}</dd>
    </div>
  );
}

function getCountWord(count: number) {
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod100 >= 11 && mod100 <= 14) return "размещений";
  if (mod10 === 1) return "размещение";
  if (mod10 >= 2 && mod10 <= 4) return "размещения";
  return "размещений";
}
