import { ArrowLeft, ArrowRight, ArrowRightLeft, ChevronRight, MapPin, PackageMinus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Cell, Rack, WarehouseCellItem, WarehouseInventoryItem } from "@/features/warehouse/types";

export function WarehouseInventoryList({
  items,
  onOpenPlacement,
}: {
  items: WarehouseInventoryItem[];
  onOpenPlacement: (rackId: number, cellId: number) => void;
}) {
  const [query, setQuery] = useState("");
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("ru");
    return items.filter((item) => item.name.toLocaleLowerCase("ru").includes(normalizedQuery));
  }, [items, query]);
  const selectedItem = items.find((item) => item.id === selectedItemId);

  if (selectedItem) {
    return (
      <div className="warehouse-inventory-list warehouse-inventory-detail">
        <Button
          className="warehouse-inventory-detail__back"
          onClick={() => setSelectedItemId(null)}
          type="button"
          variant="ghost"
        >
          <ArrowLeft aria-hidden="true" size={16} />
          Весь инвентарь
        </Button>

        <div className="warehouse-inventory-detail__summary">
          <h3>{selectedItem.name}</h3>
          {selectedItem.description && <p>{selectedItem.description}</p>}
          <span>На этом складе: {selectedItem.warehouse_quantity.toLocaleString("ru-RU")} шт.</span>
        </div>

        <div className="warehouse-inventory-detail__section-heading">
          <h4>Ячейки этого склада</h4>
          <span>{selectedItem.placements.length}</span>
        </div>
        <p className="warehouse-inventory-detail__hint">Выберите ячейку, чтобы открыть её на 3D-модели.</p>

        <ul className="warehouse-inventory-placement-list">
          {selectedItem.placements.map((placement) => (
            <li key={placement.id}>
              <button
                aria-label={`Открыть стеллаж ${placement.rack.code}, ячейка №${placement.cell.number}`}
                className="warehouse-inventory-placement"
                onClick={() => onOpenPlacement(placement.rack.id, placement.cell.id)}
                type="button"
              >
                <MapPin aria-hidden="true" className="warehouse-inventory-placement__icon" size={17} />
                <span className="warehouse-inventory-placement__location">
                  <strong>Стеллаж {placement.rack.code} · ячейка №{placement.cell.number}</strong>
                  <small>Уровень {placement.cell.level} · позиция {placement.cell.position}</small>
                </span>
                <span className="warehouse-inventory-placement__quantity">
                  <strong>{placement.quantity.toLocaleString("ru-RU")} шт.</strong>
                  <small>Открыть <ArrowRight aria-hidden="true" size={13} /></small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

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
            <li key={item.id}>
              <button
                aria-label={`Показать размещения: ${item.name}`}
                className="warehouse-item-row warehouse-item-row--selectable"
                onClick={() => setSelectedItemId(item.id)}
                type="button"
              >
                <div className="min-w-0 flex-1">
                  <p className="warehouse-item-row__name">{item.name}</p>
                  {item.description && <p className="warehouse-item-row__description">{item.description}</p>}
                </div>
                <div className="warehouse-item-row__quantity">
                  <span>{new Intl.NumberFormat("ru-RU").format(item.warehouse_quantity)}</span>
                  <small>ед.</small>
                </div>
                <ChevronRight aria-hidden="true" className="shrink-0 text-zinc-400" size={16} />
              </button>
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
