import L from "leaflet";
import { ArrowUpRight, LocateFixed, Minus, Plus, Warehouse as WarehouseIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, Marker, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import { Button } from "@/components/ui/button";
import type { Warehouse } from "@/features/dashboard/types/warehouse";
import "leaflet/dist/leaflet.css";

const defaultMarkerIcon = createWarehouseIcon(false);
const activeMarkerIcon = createWarehouseIcon(true);
const DEFAULT_MAP_CENTER: [number, number] = [45.0445, 41.969];

type WarehouseMapProps = {
  warehouses: Warehouse[];
  activeWarehouseId: number | null;
  onActiveWarehouseChange: (warehouseId: number | null) => void;
  onOpenWarehouse: (warehouseId: number) => void;
  onResetBounds: () => void;
  layoutKey: string;
  resetKey: number;
};

export function WarehouseMap({
  warehouses,
  activeWarehouseId,
  onActiveWarehouseChange,
  onOpenWarehouse,
  onResetBounds,
  layoutKey,
  resetKey,
}: WarehouseMapProps) {
  const [hoveredWarehouseId, setHoveredWarehouseId] = useState<number | null>(null);
  const hoverCloseTimer = useRef<number | null>(null);

  const keepTooltipOpen = useCallback((warehouseId: number) => {
    if (hoverCloseTimer.current !== null) window.clearTimeout(hoverCloseTimer.current);
    setHoveredWarehouseId(warehouseId);
  }, []);

  const closeTooltipSoon = useCallback(() => {
    if (hoverCloseTimer.current !== null) window.clearTimeout(hoverCloseTimer.current);
    hoverCloseTimer.current = window.setTimeout(() => {
      setHoveredWarehouseId(null);
      hoverCloseTimer.current = null;
    }, 260);
  }, []);

  useEffect(
    () => () => {
      if (hoverCloseTimer.current !== null) window.clearTimeout(hoverCloseTimer.current);
    },
    [],
  );

  return (
    <MapContainer
      center={DEFAULT_MAP_CENTER}
      className="dashboard-map"
      attributionControl={false}
      zoom={12}
      zoomControl={false}
      scrollWheelZoom
      preferCanvas
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        maxZoom={19}
        url={
          import.meta.env.VITE_MAP_TILE_URL ||
          "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        }
      />

      <MapLifecycleController warehouses={warehouses} layoutKey={layoutKey} resetKey={resetKey} />
      <MapClickAway
        onClear={() => {
          onActiveWarehouseChange(null);
          setHoveredWarehouseId(null);
        }}
      />

      {warehouses.map((warehouse) => (
        <WarehouseMapMarker
          active={activeWarehouseId === warehouse.id}
          key={warehouse.id}
          onActiveChange={() =>
            onActiveWarehouseChange(activeWarehouseId === warehouse.id ? null : warehouse.id)
          }
          onPointerEnter={() => keepTooltipOpen(warehouse.id)}
          onPointerLeave={closeTooltipSoon}
          onOpenWarehouse={onOpenWarehouse}
          visible={activeWarehouseId === warehouse.id || hoveredWarehouseId === warehouse.id}
          warehouse={warehouse}
        />
      ))}

      <MapControls onReset={onResetBounds} />
    </MapContainer>
  );
}

function WarehouseMapMarker({
  warehouse,
  active,
  visible,
  onActiveChange,
  onOpenWarehouse,
  onPointerEnter,
  onPointerLeave,
}: {
  warehouse: Warehouse;
  active: boolean;
  visible: boolean;
  onActiveChange: () => void;
  onOpenWarehouse: (warehouseId: number) => void;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
}) {
  const map = useMap();
  const [tooltipOffsetX, setTooltipOffsetX] = useState(0);
  const position = useMemo<[number, number]>(
    () => [warehouse.latitude, warehouse.longitude],
    [warehouse.latitude, warehouse.longitude],
  );

  const updateTooltipOffset = useCallback(() => {
    const mapWidth = map.getSize().x;
    const cardWidth = Math.min(290, mapWidth - 32);
    const margin = 12;
    const markerX = map.latLngToContainerPoint(position).x;
    const minCenter = cardWidth / 2 + margin;
    const maxCenter = mapWidth - cardWidth / 2 - margin;
    const desiredCenter = Math.max(minCenter, Math.min(maxCenter, markerX));
    const nextOffset = Math.round(desiredCenter - markerX);
    setTooltipOffsetX((current) => current === nextOffset ? current : nextOffset);
  }, [map, position]);

  useEffect(() => {
    updateTooltipOffset();
    map.on("move zoom resize", updateTooltipOffset);
    return () => {
      map.off("move zoom resize", updateTooltipOffset);
    };
  }, [map, updateTooltipOffset]);

  return (
    <Marker
      alt={warehouse.name}
      bubblingMouseEvents={false}
      icon={active ? activeMarkerIcon : defaultMarkerIcon}
      position={position}
      riseOnHover
      title={warehouse.name}
      eventHandlers={{
        mouseover: onPointerEnter,
        mouseout: onPointerLeave,
        click: onActiveChange,
      }}
    >
      {visible && (
        <Tooltip
          className="warehouse-tooltip"
          direction="top"
          interactive
          offset={[tooltipOffsetX, -13]}
          opacity={1}
          permanent
        >
          <WarehousePreview
            warehouse={warehouse}
            onOpenWarehouse={onOpenWarehouse}
            onPointerEnter={onPointerEnter}
            onPointerLeave={onPointerLeave}
          />
        </Tooltip>
      )}
    </Marker>
  );
}

function WarehousePreview({
  warehouse,
  onOpenWarehouse,
  onPointerEnter,
  onPointerLeave,
}: {
  warehouse: Warehouse;
  onOpenWarehouse: (warehouseId: number) => void;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
}) {
  const linkRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    const link = linkRef.current;
    if (!link) return;

    const openWarehouse = (event: MouseEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      onOpenWarehouse(warehouse.id);
    };
    link.addEventListener("click", openWarehouse, true);
    return () => link.removeEventListener("click", openWarehouse, true);
  }, [onOpenWarehouse, warehouse.id]);

  return (
    <div className="warehouse-preview" onMouseEnter={onPointerEnter} onMouseLeave={onPointerLeave}>
      <div aria-hidden="true" className="warehouse-preview__image">
        <WarehouseIcon size={22} strokeWidth={1.6} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="break-words text-sm font-semibold leading-5 text-foreground">{warehouse.name}</p>
        <p className="mt-1 line-clamp-2 text-xs leading-4 text-muted-foreground">
          {warehouse.address}
        </p>
      </div>
      <a
        aria-label={`Открыть страницу склада «${warehouse.name}»`}
        className="warehouse-preview__link"
        href={`/warehouses/${warehouse.id}`}
        ref={linkRef}
      >
        <ArrowUpRight aria-hidden="true" size={15} />
      </a>
    </div>
  );
}

function MapLifecycleController({
  warehouses,
  layoutKey,
  resetKey,
}: {
  warehouses: Warehouse[];
  layoutKey: string;
  resetKey: number;
}) {
  const map = useMap();
  const bounds = useMemo(
    () =>
      warehouses.length
        ? L.latLngBounds(
            warehouses.map(({ latitude, longitude }) => [latitude, longitude] as [number, number]),
          )
        : null,
    [warehouses],
  );

  useEffect(() => {
    if (!bounds?.isValid()) return;
    const firstFrame = window.requestAnimationFrame(() => {
      map.invalidateSize({ pan: false });
      window.requestAnimationFrame(() => {
        map.fitBounds(bounds.pad(0.32), { maxZoom: 12, animate: false });
      });
    });
    return () => window.cancelAnimationFrame(firstFrame);
  }, [bounds, map, resetKey]);

  useEffect(() => {
    const container = map.getContainer();
    let frame = 0;
    const refitAfterResize = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        map.invalidateSize({ pan: false });
        if (bounds?.isValid()) {
          map.fitBounds(bounds.pad(0.32), { maxZoom: 12, animate: false });
        }
      });
    };
    const observer = new ResizeObserver(refitAfterResize);
    observer.observe(container);

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [bounds, map]);

  useEffect(() => {
    let frame = window.requestAnimationFrame(() => map.invalidateSize({ pan: false }));
    const timeout = window.setTimeout(() => {
      frame = window.requestAnimationFrame(() => map.invalidateSize({ pan: false }));
    }, 260);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
    };
  }, [layoutKey, map]);

  return null;
}

function MapClickAway({ onClear }: { onClear: () => void }) {
  useMapEvents({
    click: (event) => {
      const target = event.originalEvent.target;
      if (target instanceof Element && target.closest(".warehouse-tooltip")) return;
      onClear();
    },
  });
  return null;
}

function MapControls({ onReset }: { onReset: () => void }) {
  const map = useMap();

  return (
    <div aria-label="Управление картой" className="map-controls" role="group">
      <Button
        aria-label="Приблизить карту"
        className="size-10 rounded-lg bg-white text-foreground shadow-sm hover:bg-muted"
        onClick={(event) => {
          event.stopPropagation();
          map.zoomIn();
        }}
        size="icon"
        type="button"
        variant="outline"
      >
        <Plus aria-hidden="true" size={17} />
      </Button>
      <Button
        aria-label="Отдалить карту"
        className="size-10 rounded-lg bg-white text-foreground shadow-sm hover:bg-muted"
        onClick={(event) => {
          event.stopPropagation();
          map.zoomOut();
        }}
        size="icon"
        type="button"
        variant="outline"
      >
        <Minus aria-hidden="true" size={17} />
      </Button>
      <span aria-hidden="true" className="map-controls__separator" />
      <Button
        aria-label="Показать все склады"
        className="size-10 rounded-lg bg-white text-foreground shadow-sm hover:bg-muted"
        onClick={(event) => {
          event.stopPropagation();
          onReset();
        }}
        size="icon"
        type="button"
        variant="outline"
      >
        <LocateFixed aria-hidden="true" size={17} />
      </Button>
    </div>
  );
}

function createWarehouseIcon(active: boolean) {
  return L.divIcon({
    className: "warehouse-marker-wrapper",
    html: `<span class="warehouse-marker${active ? " warehouse-marker--active" : ""}"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-6 9 6v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><path d="M9 21v-8h6v8M7 10h.01M17 10h.01"/></svg></span>`,
    iconSize: [46, 46],
    iconAnchor: [23, 23],
  });
}
