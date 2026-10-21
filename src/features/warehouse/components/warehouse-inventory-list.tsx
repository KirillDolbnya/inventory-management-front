import { ArrowRightLeft, PackageMinus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Cell, Rack, WarehouseCellItem, WarehouseInventoryItem } from "@/features/warehouse/types";

export function WarehouseInventoryList({ items }: { items: WarehouseInventoryItem[] }) {
  const [query, setQuery] = useState("");
  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("ru");
    return items.filter((item) => item.name.toLocaleLowerCase("ru").includes(normalizedQuery));
  }, [items, query]);

  return (
    <div className="warehouse-inventory-list">
      <div className="warehouse-search">
        <Search aria-hidden="true" className="warehouse-search__icon" size={16} />
        <Label className="sr-only" htmlFor="warehouse-inventory-search">Поиск по названию инвентаря</Label>
        <Input
          autoComplete="off"
          className="h-11 rounded-lg border-zinc-200 bg-white pl-9 text-base md:text-sm"
          id="warehouse-inventory-search"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Найти инвентарь"
          type="search"
          value={query}
        />
      </div>

      {filteredItems.length ? (
        <ul className="warehouse-item-list">
          {filteredItems.map((item) => (
            <li className="warehouse-item-row" key={item.id}>
              <div className="min-w-0 flex-1">
                <p className="warehouse-item-row__name">{item.name}</p>
                {item.description && <p className="warehouse-item-row__description">{item.description}</p>}
              </div>
              <div className="warehouse-item-row__quantity">
                <span>{new Intl.NumberFormat("ru-RU").format(item.warehouse_quantity)}</span>
                <small>ед.</small>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="warehouse-empty-state">
          {query.trim() ? "По вашему запросу ничего не найдено" : "На этом складе пока нет инвентаря"}
        </p>
      )}
    </div>
  );
}

export function CellInventoryList({
  rack,
  cell,
  items,
  isLoading,
  error,
  notice,
  onRetry,
  onPlace,
  onTransfer,
  onUnplace,
}: {
  rack: Rack;
  cell: Cell;
  items: WarehouseCellItem[];
  isLoading: boolean;
  error: string | null;
  notice: string | null;
  onRetry: () => void;
  onPlace: () => void;
  onTransfer: (item: WarehouseCellItem) => void;
  onUnplace: (item: WarehouseCellItem) => void;
}) {
  return (
    <div className="warehouse-cell-list">
      {notice && <p className="warehouse-cell-notice" role="status">{notice}</p>}
      <Button className="warehouse-cell-place-button" onClick={onPlace} type="button">
        Разместить инвентарь
      </Button>
      <div className="warehouse-cell-heading">
        <p>Инвентарь в ячейке</p>
        <span>{items.length} {items.length === 1 ? "позиция" : "позиций"}</span>
      </div>
      {isLoading ? (
        <p aria-live="polite" className="warehouse-cell-status">Загружаем содержимое ячейки…</p>
      ) : error ? (
        <div className="warehouse-cell-load-error" role="alert">
          <p>{error}</p>
          <Button className="mt-3" onClick={onRetry} type="button" variant="outline">Повторить</Button>
        </div>
      ) : items.length ? (
        <ul className="warehouse-item-list">
          {items.map((item) => (
            <li className="warehouse-item-row" key={`${item.id}-${item.placement_id}`}>
              <div className="min-w-0 flex-1">
                <p className="warehouse-item-row__name">{item.name}</p>
                {item.description && <p className="warehouse-item-row__description">{item.description}</p>}
              </div>
              <div className="warehouse-item-row__quantity">
                <span>{new Intl.NumberFormat("ru-RU").format(item.quantity_in_cell)}</span>
                <small>ед.</small>
              </div>
              <div className="warehouse-cell-actions">
                <Button
                  aria-label={`Переместить ${item.name}`}
                  className="warehouse-cell-action-button"
                  onClick={() => onTransfer(item)}
                  type="button"
                  variant="outline"
                >
                  <ArrowRightLeft aria-hidden="true" size={15} />
                  <span>Переместить</span>
                </Button>
                <Button
                  aria-label={`Снять ${item.name} с размещения`}
                  className="warehouse-cell-action-button"
                  onClick={() => onUnplace(item)}
                  type="button"
                  variant="outline"
                >
                  <PackageMinus aria-hidden="true" size={15} />
                  <span>Снять с размещения</span>
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="warehouse-cell-empty">
          <p>В этой ячейке пока нет инвентаря</p>
          <span>{rack.code} · ячейка №{cell.number}</span>
        </div>
      )}
    </div>
  );
}
