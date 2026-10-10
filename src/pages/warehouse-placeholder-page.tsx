import { ArrowLeft, Boxes, Warehouse as WarehouseIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { Button } from "@/components/ui/button";
import { dashboardDataService } from "@/features/dashboard/services/dashboard-data-service";
import type { Warehouse } from "@/features/dashboard/types/warehouse";

export function WarehousePlaceholderPage() {
  const { warehouseId } = useParams();
  const navigate = useNavigate();
  const [warehouse, setWarehouse] = useState<Warehouse | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let mounted = true;
    dashboardDataService.getWarehouses().then((warehouses) => {
      if (!mounted) return;
      setWarehouse(warehouses.find((item) => item.id === Number(warehouseId)) ?? null);
      setLoaded(true);
    });
    return () => {
      mounted = false;
    };
  }, [warehouseId]);

  return (
    <main className="warehouse-placeholder-shell">
      <section className="warehouse-placeholder-card">
        <div className="mb-8 flex items-center gap-3 text-sm font-semibold">
          <span className="flex size-9 items-center justify-center rounded-xl border border-border bg-white">
            <Boxes aria-hidden="true" size={18} />
          </span>
          Склад
        </div>

        <div className="mb-5 flex size-12 items-center justify-center rounded-2xl bg-muted text-foreground">
          <WarehouseIcon aria-hidden="true" size={22} strokeWidth={1.7} />
        </div>
        <h1 className="break-words text-2xl font-semibold tracking-tight">
          {warehouse?.name ?? (loaded ? "Склад не найден" : "Загрузка…")}
        </h1>
        {warehouse && <p className="mt-2 text-sm text-muted-foreground">{warehouse.address}</p>}
        <p className="mt-4 text-sm leading-6 text-muted-foreground">
          Страница склада появится на следующем этапе разработки.
        </p>
        <Button className="mt-7" onClick={() => navigate("/")} type="button" variant="outline">
          <ArrowLeft aria-hidden="true" size={16} />
          Вернуться на карту
        </Button>
      </section>
    </main>
  );
}
