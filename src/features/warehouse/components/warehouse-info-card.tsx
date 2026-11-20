import { ArrowLeft, Boxes, ChevronDown, ChevronUp, MapPin, Pencil, Trash2, Warehouse as WarehouseIcon } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import type { Warehouse } from "@/features/dashboard/types/warehouse";

type WarehouseInfoCardProps = {
  warehouse: Warehouse;
  inventoryQuantity: number;
  rackCount: number;
  cellCount: number;
  freeCellCount: number;
  onEdit: () => void;
  onDelete: () => void;
  onDeleteLayout: () => void;
  onManageRacks: () => void;
};

export function WarehouseInfoCard({
  warehouse,
  inventoryQuantity,
  rackCount,
  cellCount,
  freeCellCount,
  onEdit,
  onDelete,
  onDeleteLayout,
  onManageRacks,
}: WarehouseInfoCardProps) {
  const [expanded, setExpanded] = useState(false);
  const metrics = [
    { label: "Стеллажи", value: rackCount },
    { label: "Ячейки", value: cellCount },
    { label: "Свободно", value: freeCellCount },
  ];

  return (
    <section aria-label="Информация о складе" className="warehouse-info-card" data-expanded={expanded}>
      <Link className="warehouse-info-card__back" to="/">
        <ArrowLeft aria-hidden="true" size={13} />
        <span>Все склады</span>
      </Link>
      <div className="warehouse-info-card__heading">
        <span aria-hidden="true" className="warehouse-info-card__icon">
          <WarehouseIcon size={17} strokeWidth={1.8} />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="warehouse-info-card__name">{warehouse.name}</h1>
          <p className="warehouse-info-card__address">
            <MapPin aria-hidden="true" size={12} />
            <span>{warehouse.address}</span>
          </p>
        </div>
        <Button
          aria-expanded={expanded}
          aria-label={expanded ? "Свернуть показатели" : "Развернуть показатели"}
          className="warehouse-info-card__toggle"
          onClick={() => setExpanded((current) => !current)}
          size="icon"
          type="button"
          variant="ghost"
        >
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </Button>
      </div>

      <div className="warehouse-info-card__summary">
        <p className="warehouse-info-card__eyebrow">Инвентарь на складе</p>
        <p className="warehouse-info-card__quantity">
          {new Intl.NumberFormat("ru-RU").format(inventoryQuantity)}
          <span>ед.</span>
        </p>
      </div>

      <dl className="warehouse-info-card__metrics">
        {metrics.map((metric) => (
          <div className="warehouse-info-card__metric" key={metric.label}>
            <dt>{metric.label}</dt>
            <dd>{metric.value}</dd>
          </div>
        ))}
      </dl>
      <div aria-label="Обозначения ячеек" className="warehouse-info-card__cell-legend">
        <span><i aria-hidden="true" className="is-empty" /> Пустая</span>
        <span><i aria-hidden="true" className="is-occupied" /> Занятая</span>
        <span><i aria-hidden="true" className="is-selected" /> Выбрана</span>
      </div>
      <div className="warehouse-info-card__actions">
        <div className="warehouse-info-card__actions-main">
          <Button className="h-9 rounded-lg px-2 text-xs" onClick={onManageRacks} type="button" variant="outline">
            <Boxes aria-hidden="true" size={13} /> Стеллажи
          </Button>
          <Button className="h-9 rounded-lg px-2 text-xs" onClick={onEdit} type="button" variant="outline">
            <Pencil aria-hidden="true" size={13} /> Изменить
          </Button>
          <Button aria-label="Удалить склад" className="size-9 rounded-lg text-destructive hover:text-destructive" onClick={onDelete} size="icon" type="button" variant="outline">
            <Trash2 aria-hidden="true" size={14} />
          </Button>
        </div>
        <Button className="warehouse-info-card__delete-layout h-9 rounded-lg px-2 text-xs" onClick={onDeleteLayout} type="button" variant="outline">
          Удалить планировку
        </Button>
      </div>
    </section>
  );
}
