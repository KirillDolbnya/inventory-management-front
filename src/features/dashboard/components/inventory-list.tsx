import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import type { InventoryItem } from "@/features/dashboard/types/inventory";

type InventoryListProps = {
  items: InventoryItem[];
};

export function InventoryList({ items }: InventoryListProps) {
  const [query, setQuery] = useState("");
  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("ru-RU");
    if (!normalizedQuery) return items;

    return items.filter((item) => item.name.toLocaleLowerCase("ru-RU").includes(normalizedQuery));
  }, [items, query]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="px-5 pb-4 pt-4 sm:px-6">
        <div className="relative">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            size={16}
          />
          <Input
            aria-label="Поиск по названию инвентаря"
            autoComplete="off"
            className="h-11 rounded-lg bg-white pl-9 text-base sm:text-sm"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Найти инвентарь"
            type="search"
            value={query}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 sm:px-6">
        {filteredItems.length ? (
          <ul className="divide-y divide-border">
            {filteredItems.map((item) => (
              <li className="py-4 first:pt-1" key={item.id}>
                <article>
                  <h3 className="break-words text-sm font-medium leading-5">{item.name}</h3>
                  {item.description && (
                    <p className="mt-1 line-clamp-1 text-xs leading-5 text-muted-foreground">
                      {item.description}
                    </p>
                  )}

                  <dl className="mt-3 grid grid-cols-3 gap-2">
                    <Quantity label="Всего" value={item.quantity} />
                    <Quantity label="Размещено" value={item.placed_quantity} />
                    <Quantity label="Не размещено" value={item.unplaced_quantity} />
                  </dl>
                </article>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex min-h-44 flex-col items-center justify-center px-4 text-center">
            <div className="mb-3 flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
              <Search aria-hidden="true" size={18} />
            </div>
            <p className="text-sm font-medium">Ничего не найдено</p>
            <p className="mt-1 max-w-56 text-xs leading-5 text-muted-foreground">
              Попробуйте изменить запрос или проверить написание.
            </p>
          </div>
        )}
      </div>
    </div>
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

function pluralizeItems(count: number) {
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod100 >= 11 && mod100 <= 14) return "позиций";
  if (mod10 === 1) return "позиция";
  if (mod10 >= 2 && mod10 <= 4) return "позиции";
  return "позиций";
}
