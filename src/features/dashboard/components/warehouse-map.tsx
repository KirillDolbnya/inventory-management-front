import L from "leaflet";
import { ArrowUpRight, LocateFixed, Minus, Plus, Warehouse as WarehouseIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, Marker, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import { Button } from "@/components/ui/button";
import type { Warehouse } from "@/features/dashboard/types/warehouse";
import "leaflet/dist/leaflet.css";

const defaultMarkerIcon = createWarehouseIcon(false);
const activeMarkerIcon = createWarehouseIcon(true);
const defaultCenter: [number, number] = [55.7558, 37.6173];
// Batch wheel deltas at Leaflet's default cadence and scale, then keep them queued during animations.
const wheelZoomBatchMs = 40;
const wheelPixelsPerZoomLevel = 60;
// Leaflet skips animated zooms above this threshold, so larger requests are split into steps.
const maxAnimatedZoomStep = 4;

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
      center={defaultCenter}
      className="dashboard-map"
      attributionControl={false}
      zoom={12}
      zoomDelta={0.5}
      zoomSnap={0.1}
      zoomControl={false}
      scrollWheelZoom={false}
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
    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      map.invalidateSize({ pan: false });
      secondFrame = window.requestAnimationFrame(() => {
        map.fitBounds(bounds.pad(0.32), { maxZoom: 12, animate: false });
      });
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
    };
  }, [bounds, map, resetKey]);

  useEffect(() => {
    const container = map.getContainer();
    let frame = 0;
    const refreshSize = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        map.invalidateSize({ pan: false });
      });
    };
    const observer = new ResizeObserver(refreshSize);
    observer.observe(container);

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [map]);

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
  const onResetRef = useRef(onReset);
  const requestedZoomRef = useRef<number | null>(null);
  const zoomCenterRef = useRef<L.LatLng | null>(null);
  const zoomAnimationPendingRef = useRef(false);
  const zoomAnimationActiveRef = useRef(false);
  const pendingResetRef = useRef(false);
  const nextZoomFrameRef = useRef<number | null>(null);
  const wheelTimerRef = useRef<number | null>(null);
  const wheelBatchStartRef = useRef<number | null>(null);
  const wheelDeltaRef = useRef(0);
  const queuedWheelDeltaRef = useRef(0);

  useEffect(() => {
    onResetRef.current = onReset;
  }, [onReset]);

  const applyNextZoomStep = useCallback(() => {
    if (zoomAnimationPendingRef.current || zoomAnimationActiveRef.current || pendingResetRef.current) {
      return;
    }

    let requestedZoom = requestedZoomRef.current;
    const currentZoom = map.getZoom();
    if (requestedZoom !== null && Math.abs(requestedZoom - currentZoom) < 0.05) {
      requestedZoom = null;
      requestedZoomRef.current = null;
      zoomCenterRef.current = null;
    }

    if (requestedZoom === null && queuedWheelDeltaRef.current !== 0) {
      const pixelDelta = queuedWheelDeltaRef.current;
      queuedWheelDeltaRef.current = 0;
      const delta = -pixelDelta;
      const normalizedDelta = Math.abs(delta) / (wheelPixelsPerZoomLevel * 4);
      const smoothDelta =
        (4 * Math.log(2 / (1 + Math.exp(-normalizedDelta)))) / Math.LN2;
      const snap = map.options.zoomSnap ?? 0;
      const zoomDelta = snap > 0 ? Math.ceil(smoothDelta / snap) * snap : smoothDelta;
      requestedZoom = Math.max(
        map.getMinZoom(),
        Math.min(map.getMaxZoom(), currentZoom + Math.sign(delta) * zoomDelta),
      );

      if (requestedZoom === currentZoom) return;
      zoomCenterRef.current ??= map.getCenter();
      requestedZoomRef.current = requestedZoom;
    }

    if (requestedZoom === null) return;

    const difference = requestedZoom - currentZoom;
    if (Math.abs(difference) < 0.05) {
      requestedZoomRef.current = null;
      zoomCenterRef.current = null;
      return;
    }

    const nextZoom = currentZoom + Math.sign(difference) * Math.min(maxAnimatedZoomStep, Math.abs(difference));
    zoomAnimationPendingRef.current = true;
    map.setView(zoomCenterRef.current ?? map.getCenter(), nextZoom, { animate: true });
  }, [map]);

  const flushWheelDelta = useCallback(() => {
    wheelTimerRef.current = null;
    wheelBatchStartRef.current = null;

    queuedWheelDeltaRef.current += wheelDeltaRef.current;
    wheelDeltaRef.current = 0;
    if (queuedWheelDeltaRef.current === 0 || pendingResetRef.current) return;
    applyNextZoomStep();
  }, [applyNextZoomStep]);

  const handleWheel = useCallback((event: WheelEvent) => {
    const target = event.target;
    if (target instanceof Element && target.closest(".map-controls, .warehouse-tooltip")) return;

    event.preventDefault();
    // WheelEvent pixel deltas are already CSS pixels; avoid Leaflet's extra Retina/macOS reduction.
    let delta = event.deltaY;
    if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) delta *= 20;
    else if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) delta *= 60;

    wheelDeltaRef.current += delta;
    const now = performance.now();
    wheelBatchStartRef.current ??= now;
    const timeLeft = Math.max(wheelZoomBatchMs - (now - wheelBatchStartRef.current), 0);

    if (wheelTimerRef.current !== null) window.clearTimeout(wheelTimerRef.current);
    wheelTimerRef.current = window.setTimeout(flushWheelDelta, timeLeft);
  }, [flushWheelDelta]);

  useEffect(() => {
    const handleZoomStart = () => {
      zoomAnimationActiveRef.current = true;
    };

    const handleZoomEnd = () => {
      zoomAnimationActiveRef.current = false;

      if (pendingResetRef.current) {
        pendingResetRef.current = false;
        zoomAnimationPendingRef.current = false;
        requestedZoomRef.current = null;
        zoomCenterRef.current = null;
        nextZoomFrameRef.current = window.requestAnimationFrame(() => {
          nextZoomFrameRef.current = null;
          onResetRef.current();
        });
        return;
      }

      zoomAnimationPendingRef.current = false;
      if (requestedZoomRef.current === null && queuedWheelDeltaRef.current === 0) return;

      if (nextZoomFrameRef.current !== null) {
        window.cancelAnimationFrame(nextZoomFrameRef.current);
      }
      nextZoomFrameRef.current = window.requestAnimationFrame(() => {
        nextZoomFrameRef.current = null;
        applyNextZoomStep();
      });
    };

    map.on("zoomstart", handleZoomStart);
    map.on("zoomend", handleZoomEnd);
    map.getContainer().addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      map.off("zoomstart", handleZoomStart);
      map.off("zoomend", handleZoomEnd);
      map.getContainer().removeEventListener("wheel", handleWheel);
      if (nextZoomFrameRef.current !== null) {
        window.cancelAnimationFrame(nextZoomFrameRef.current);
      }
      if (wheelTimerRef.current !== null) window.clearTimeout(wheelTimerRef.current);
    };
  }, [applyNextZoomStep, handleWheel, map]);

  const changeZoom = (direction: "in" | "out") => {
    if (pendingResetRef.current) return;
    const currentTarget = requestedZoomRef.current ?? map.getZoom();
    const requestedStep = direction === "in" ? 0.5 : -0.5;
    const nextTarget = Math.max(
      map.getMinZoom(),
      Math.min(map.getMaxZoom(), currentTarget + requestedStep),
    );

    if (nextTarget === currentTarget) return;

    zoomCenterRef.current ??= map.getCenter();
    requestedZoomRef.current = nextTarget;
    applyNextZoomStep();
  };

  const resetBounds = () => {
    requestedZoomRef.current = null;
    zoomCenterRef.current = null;
    wheelDeltaRef.current = 0;
    queuedWheelDeltaRef.current = 0;
    wheelBatchStartRef.current = null;
    if (wheelTimerRef.current !== null) {
      window.clearTimeout(wheelTimerRef.current);
      wheelTimerRef.current = null;
    }
    if (nextZoomFrameRef.current !== null) {
      window.cancelAnimationFrame(nextZoomFrameRef.current);
      nextZoomFrameRef.current = null;
    }

    if (zoomAnimationActiveRef.current || zoomAnimationPendingRef.current) {
      pendingResetRef.current = true;
    } else {
      onResetRef.current();
    }
  };

  return (
    <div aria-label="Управление картой" className="map-controls" role="group">
      <Button
        aria-label="Приблизить карту"
        className="size-10 rounded-lg bg-white text-foreground shadow-sm hover:bg-muted"
        onClick={(event) => {
          event.stopPropagation();
          changeZoom("in");
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
          changeZoom("out");
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
          resetBounds();
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
