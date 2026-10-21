import { LoaderCircle, Plus, RefreshCw, Search, X } from "lucide-react";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { InventoryItem } from "@/features/dashboard/types/inventory";

type InventoryListProps = {
  items: InventoryItem[];
  loading: boolean;
  error: string | null;
  notice: string | null;
  query: string;
  onRetry: () => void;
  onAdd: () => void;
  onQueryChange: (query: string) => void;
  onSelectItem: (item: InventoryItem) => void;
};

export function InventoryList({
  items,
  loading,
  error,
  notice,
  query,
  onRetry,
  onAdd,
  onQueryChange,
  onSelectItem,
}: InventoryListProps) {
  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("ru-RU");
    if (!normalizedQuery) return items;

    return items.filter((item) => item.name.trim().toLocaleLowerCase("ru-RU").includes(normalizedQuery));
  }, [items, query]);
  const hasSearchOrItems = Boolean(query.trim()) || items.length > 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="px-5 pb-4 pt-4 sm:px-6">
        <Button className="h-11 w-full justify-center rounded-lg" onClick={onAdd} type="button">
          <Plus aria-hidden="true" size={16} />
          Добавить инвентарь
        </Button>
        {notice && (
          <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs leading-5 text-emerald-800" role="status">
            {notice}
          </p>
        )}
        <div className="relative">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            size={16}
          />
          <Input
            aria-label="Поиск по названию инвентаря"
            autoComplete="off"
            className="h-11 rounded-lg bg-white pl-9 pr-10 text-base sm:text-sm"
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Найти инвентарь"
            type="search"
            value={query}
          />
          {query && (
            <Button
              aria-label="Очистить поиск"
              className="absolute right-1 top-1/2 size-9 -translate-y-1/2 rounded-md text-muted-foreground"
              onClick={() => onQueryChange("")}
              size="icon"
              type="button"
              variant="ghost"
            >
              <X aria-hidden="true" size={15} />
            </Button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 sm:px-6">
        {loading ? (
          <div className="flex min-h-44 items-center justify-center gap-2 text-sm text-muted-foreground" role="status">
            <LoaderCircle aria-hidden="true" className="animate-spin" size={17} />
            Загружаем инвентарь…
          </div>
        ) : error ? (
          <div className="flex min-h-52 flex-col items-center justify-center px-4 text-center">
            <p className="max-w-64 text-sm leading-5 text-muted-foreground" role="alert">{error}</p>
            <Button className="mt-4 h-10 rounded-lg" onClick={onRetry} type="button" variant="outline">
              <RefreshCw aria-hidden="true" size={15} />
              Повторить
            </Button>
          </div>
        ) : filteredItems.length ? (
          <ul className="divide-y divide-border">
            {filteredItems.map((item) => (
              <li className="py-4 first:pt-1" key={item.id}>
                <button
                  aria-label={`Открыть размещения: ${item.name}`}
                  className="w-full rounded-lg text-left outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  onClick={() => onSelectItem(item)}
                  type="button"
                >
                  <article className="px-2 py-1">
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
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex min-h-44 flex-col items-center justify-center px-4 text-center">
            <div className="mb-3 flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
              <Search aria-hidden="true" size={18} />
            </div>
            <p className="text-sm font-medium">
              {hasSearchOrItems ? "Ничего не найдено" : "Инвентаря пока нет"}
            </p>
            <p className="mt-1 max-w-56 text-xs leading-5 text-muted-foreground">
              {hasSearchOrItems
                ? "Попробуйте изменить запрос или проверить написание."
                : "Добавьте первую позицию, чтобы вести учёт."}
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
