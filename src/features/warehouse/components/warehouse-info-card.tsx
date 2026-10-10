import { ChevronDown, ChevronUp, MapPin, Warehouse as WarehouseIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { Warehouse } from "@/features/dashboard/types/warehouse";

type WarehouseInfoCardProps = {
  warehouse: Warehouse;
  inventoryQuantity: number;
  rackCount: number;
  cellCount: number;
  occupiedCellCount: number;
  freeCellCount: number;
};

export function WarehouseInfoCard({
  warehouse,
  inventoryQuantity,
  rackCount,
  cellCount,
  occupiedCellCount,
  freeCellCount,
}: WarehouseInfoCardProps) {
  const [expanded, setExpanded] = useState(false);
  const metrics = [
    { label: "Стеллажи", value: rackCount },
    { label: "Ячейки", value: cellCount },
    { label: "Занято", value: occupiedCellCount },
    { label: "Свободно", value: freeCellCount },
  ];

  return (
    <section aria-label="Информация о складе" className="warehouse-info-card" data-expanded={expanded}>
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
        <span className="warehouse-status"><span aria-hidden="true" />Работает</span>
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
    </section>
  );
}
