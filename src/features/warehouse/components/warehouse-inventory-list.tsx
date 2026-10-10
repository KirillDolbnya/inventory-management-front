import { Search } from "lucide-react";
import { useMemo, useState } from "react";
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
}: {
  rack: Rack;
  cell: Cell;
  items: WarehouseCellItem[];
}) {
  return (
    <div className="warehouse-cell-list">
      <div className="warehouse-cell-heading">
        <p>Инвентарь в ячейке</p>
        <span>{items.length} {items.length === 1 ? "позиция" : "позиций"}</span>
      </div>
      {items.length ? (
        <ul className="warehouse-item-list">
          {items.map((item) => (
            <li className="warehouse-item-row" key={`${item.id}-${item.placement.id}`}>
              <div className="min-w-0 flex-1">
                <p className="warehouse-item-row__name">{item.name}</p>
                {item.description && <p className="warehouse-item-row__description">{item.description}</p>}
              </div>
              <div className="warehouse-item-row__quantity">
                <span>{new Intl.NumberFormat("ru-RU").format(item.cell_quantity)}</span>
                <small>ед.</small>
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
