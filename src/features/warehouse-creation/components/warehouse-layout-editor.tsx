import { useEffect, useMemo, useRef, useState } from "react";
import { Box, Eye, EyeOff, PencilRuler, RotateCw, Ruler, Trash2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { WarehouseScene } from "@/features/warehouse/components/warehouse-scene";
import type { Cell, Rack } from "@/features/warehouse/types";
import type { WarehouseCameraApi } from "@/features/warehouse/components/warehouse-scene";
import type { LayoutColumn, LayoutPoint, LayoutRack, WarehouseLayout } from "@/features/warehouse/types";
import { validateWarehouseLayout } from "@/features/warehouse-creation/services/layout-validation";
import { findAvailableColumnPosition, makeDefaultRackLayout } from "@/features/warehouse-creation/services/layout-model";
import { applyWallOutline, getOutlineBounds, getWallOutlineErrors, insertPointOnWall, resizeOutline } from "@/features/warehouse/utils/wall-outline";

type Selection = { kind: "rack"; id: number } | { kind: "column"; id: string } | null;
type EditorMode = "plan" | "preview";
type DragTarget =
  | { kind: "object"; selection: Exclude<Selection, null>; offsetX: number; offsetZ: number; pointerId: number }
  | { kind: "wall-point"; index: number; pointerId: number };

const SVG_WIDTH = 960;
const SVG_HEIGHT = 600;
const PAD_X = 90;
const PAD_Y = 70;

function numberField(
  label: string,
  value: number,
  onChange: (value: number) => void,
  step = 0.1,
  min = 0.1,
  max?: number,
) {
  return (
    <label className="warehouse-layout-field">
      <span>{label}</span>
      <Input
        aria-label={label}
        inputMode="decimal"
        max={max}
        min={min}
        onChange={(event) => onChange(Number(event.target.value))}
        step={step}
        type="number"
        value={Number.isFinite(value) ? value : ""}
      />
    </label>
  );
}

function getPlanFrame(outline: LayoutPoint[]) {
  const bounds = getOutlineBounds(outline);
  const safeWidth = Math.max(bounds.width, 0.1);
  const safeLength = Math.max(bounds.length, 0.1);
  const scale = Math.min((SVG_WIDTH - PAD_X * 2) / safeWidth, (SVG_HEIGHT - PAD_Y * 2) / safeLength);
  const drawWidth = safeWidth * scale;
  const drawLength = safeLength * scale;
  return {
    scale,
    x: (SVG_WIDTH - drawWidth) / 2,
    y: (SVG_HEIGHT - drawLength) / 2,
    width: drawWidth,
    height: drawLength,
    bounds,
  };
}

function worldToPlan(point: LayoutPoint, frame: ReturnType<typeof getPlanFrame>) {
  return {
    x: frame.x + (point.x - frame.bounds.minX) * frame.scale,
    y: frame.y + (frame.bounds.maxZ - point.z) * frame.scale,
  };
}

function clampObjectPosition(
  x: number,
  z: number,
  width: number,
  depth: number,
  rotation: number,
  layout: WarehouseLayout,
) : { x: number; z: number } | null {
  const angle = rotation * Math.PI / 180;
  const halfX = Math.abs(Math.cos(angle)) * width / 2 + Math.abs(Math.sin(angle)) * depth / 2;
  const halfZ = Math.abs(Math.sin(angle)) * width / 2 + Math.abs(Math.cos(angle)) * depth / 2;
  const wallClearance = Math.max(0.1, ...layout.walls.map((wall) => wall.thickness / 2 + 0.02));
  const bounds = getOutlineBounds(layout.wallOutline);
  const minX = bounds.minX + wallClearance + halfX;
  const maxX = bounds.maxX - wallClearance - halfX;
  const minZ = bounds.minZ + wallClearance + halfZ;
  const maxZ = bounds.maxZ - wallClearance - halfZ;
  if (minX > maxX || minZ > maxZ) return null;
  return {
    x: Math.min(maxX, Math.max(minX, x)),
    z: Math.min(maxZ, Math.max(minZ, z)),
  };
}

function getRackPlacementError(
  layout: WarehouseLayout,
  racks: Rack[],
  rack: Rack,
  dimensions: LayoutRack["dimensions"],
  position: { x: number; z: number },
  rotation_y_deg: number,
) {
  const placement: LayoutRack = {
    rackId: rack.id,
    position: { x: position.x, y: 0, z: position.z },
    rotation_y_deg,
    dimensions,
  };
  const racksToValidate = racks.filter((item) =>
    item.id === rack.id || layout.racks.some((placed) => placed.rackId === item.id),
  );
  return validateWarehouseLayout({ ...layout, racks: [...layout.racks, placement] }, racksToValidate)[0] ?? null;
}

function PlanCanvas({
  layout,
  racks,
  selection,
  onSelect,
  onMove,
  wallEditing,
  hiddenWallIndex,
  selectedWallPoint,
  selectedWallEdge,
  placementMode,
  unplacedRackPreview,
  onSelectWallPoint,
  onSelectWallEdge,
  onMoveWallPoint,
  onAddPointOnWall,
  onChooseUnplacedPosition,
}: {
  layout: WarehouseLayout;
  racks: Rack[];
  selection: Selection;
  onSelect: (selection: Selection) => void;
  onMove: (selection: Exclude<Selection, null>, x: number, z: number) => void;
  wallEditing: boolean;
  hiddenWallIndex: number | null;
  selectedWallPoint: number | null;
  selectedWallEdge: number | null;
  placementMode: boolean;
  unplacedRackPreview: {
    code: string;
    position: { x: number; z: number };
    rotation_y_deg: number;
    dimensions: LayoutRack["dimensions"];
    error: string | null;
  } | null;
  onSelectWallPoint: (index: number | null) => void;
  onSelectWallEdge: (index: number | null) => void;
  onMoveWallPoint: (index: number, x: number, z: number) => void;
  onAddPointOnWall: (index: number) => void;
  onChooseUnplacedPosition: (position: { x: number; z: number }) => void;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<DragTarget | null>(null);
  const frame = getPlanFrame(layout.wallOutline);
  const rackById = useMemo(() => new Map(racks.map((rack) => [rack.id, rack])), [racks]);

  const clientToWorld = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    const matrix = svg?.getScreenCTM();
    if (!svg || !matrix) return null;
    const point = svg.createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    const local = point.matrixTransform(matrix.inverse());
    const clampedX = Math.max(frame.x, Math.min(frame.x + frame.width, local.x));
    const clampedY = Math.max(frame.y, Math.min(frame.y + frame.height, local.y));
    return {
      x: frame.bounds.minX + (clampedX - frame.x) / frame.scale,
      z: frame.bounds.maxZ - (clampedY - frame.y) / frame.scale,
    };
  };

  const objectCenter = (selected: Exclude<Selection, null>) => {
    if (selected.kind === "rack") {
      return layout.racks.find((rack) => rack.rackId === selected.id)?.position;
    }
    return layout.columns.find((column) => column.id === selected.id)?.position;
  };

  const handlePointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (wallEditing) {
      const pointElement = (event.target as Element).closest<SVGGElement>("[data-wall-point]");
      if (pointElement) {
        const index = Number(pointElement.dataset.wallPoint);
        if (!Number.isInteger(index)) return;
        const point = layout.wallOutline[index];
        if (!point) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        onSelect(null);
        onSelectWallEdge(null);
        onSelectWallPoint(index);
        dragRef.current = { kind: "wall-point", index, pointerId: event.pointerId };
        return;
      }
      const edgeElement = (event.target as Element).closest<SVGGElement>("[data-wall-edge]");
      if (edgeElement) {
        const index = Number(edgeElement.dataset.wallEdge);
        if (Number.isInteger(index)) {
          onSelect(null);
          onSelectWallPoint(null);
          onSelectWallEdge(index);
        }
        return;
      }
      onSelect(null);
      onSelectWallPoint(null);
      onSelectWallEdge(null);
      return;
    }
    const element = (event.target as Element).closest<SVGGElement>("[data-layout-kind]");
    if (!element) {
      if (placementMode) {
        const world = clientToWorld(event.clientX, event.clientY);
        if (world) {
          event.preventDefault();
          onChooseUnplacedPosition(world);
          return;
        }
      }
      onSelect(null);
      return;
    }
    const kind = element.dataset.layoutKind;
    const rawId = element.dataset.layoutId;
    if (!rawId || (kind !== "rack" && kind !== "column")) return;
    const target: Exclude<Selection, null> = kind === "rack"
      ? { kind, id: Number(rawId) }
      : { kind, id: rawId };
    const center = objectCenter(target);
    const world = clientToWorld(event.clientX, event.clientY);
    if (!center || !world) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    onSelect(target);
    dragRef.current = {
      kind: "object",
      selection: target,
      offsetX: center.x - world.x,
      offsetZ: center.z - world.z,
      pointerId: event.pointerId,
    };
  };

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const world = clientToWorld(event.clientX, event.clientY);
    if (!world) return;
    if (drag.kind === "wall-point") {
      const snap = (value: number) => Math.round(value * 10) / 10;
      onMoveWallPoint(drag.index, snap(world.x), snap(world.z));
      return;
    }
    let dimensions: { width: number; depth: number } | undefined;
    let rotation = 0;
    if (drag.selection.kind === "rack") {
      const object = layout.racks.find((rack) => rack.rackId === drag.selection.id);
      dimensions = object?.dimensions;
      rotation = object?.rotation_y_deg ?? 0;
    } else {
      dimensions = layout.columns.find((column) => column.id === drag.selection.id)?.dimensions;
    }
    if (!dimensions) return;
    const snap = (value: number) => Math.round(value / 0.25) * 0.25;
    const next = clampObjectPosition(
      snap(world.x + drag.offsetX),
      snap(world.z + drag.offsetZ),
      dimensions.width,
      dimensions.depth,
      rotation,
      layout,
    );
    if (!next) {
      onMove(drag.selection, world.x + drag.offsetX, world.z + drag.offsetZ);
      return;
    }
    onMove(drag.selection, next.x, next.z);
  };

  const handlePointerEnd = (event: React.PointerEvent<SVGSVGElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  };

  return (
    <div className="warehouse-layout-plan" aria-label="Редактор плана склада">
      <div className="warehouse-layout-plan__hint">
        <span><span className="warehouse-layout-plan__dot" /> Стеллажи</span>
        <span><span className="warehouse-layout-plan__dot warehouse-layout-plan__dot--column" /> Колонны</span>
        {wallEditing && <span><span className="warehouse-layout-plan__dot warehouse-layout-plan__dot--wall" /> Стены и точки</span>}
        <span className="warehouse-layout-plan__drag-hint">
          {wallEditing ? "Тяните точку · нажмите + на стене, чтобы добавить вершину" : placementMode ? "Нажмите на свободную точку плана, затем подтвердите добавление" : "Выберите и перетащите · шаг сетки 0,25 м"}
        </span>
      </div>
      <svg
        aria-label={`План помещения ${layout.room.width} на ${layout.room.length} метров`}
        className={`warehouse-layout-plan__svg${placementMode ? " is-placement-mode" : ""}`}
        onPointerCancel={handlePointerEnd}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        ref={svgRef}
        role="application"
        viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
      >
        <defs>
          <pattern
            id="warehouse-plan-grid"
            height={frame.scale}
            patternUnits="userSpaceOnUse"
            width={frame.scale}
          >
            <path d={`M ${frame.scale} 0 L 0 0 0 ${frame.scale}`} fill="none" stroke="#dce3eb" strokeWidth="0.8" />
          </pattern>
        </defs>
        <rect fill="url(#warehouse-plan-grid)" height={SVG_HEIGHT} width={SVG_WIDTH} />
        <polygon
          className="warehouse-layout-plan__floor"
          points={layout.wallOutline.map((point) => {
            const svgPoint = worldToPlan(point, frame);
            return `${svgPoint.x},${svgPoint.y}`;
          }).join(" ")}
        />
        {wallEditing ? layout.wallOutline.map((point, index) => {
          const start = worldToPlan(point, frame);
          const end = worldToPlan(layout.wallOutline[(index + 1) % layout.wallOutline.length], frame);
          const isSelected = selectedWallEdge === index;
          return (
            <g
              aria-label={`Стена ${index + 1}${hiddenWallIndex === index ? ", скрывается в 3D" : ""}`}
              className={`warehouse-layout-plan__wall-segment${isSelected ? " is-selected" : ""}${hiddenWallIndex === index ? " is-hidden-in-preview" : ""}`}
              data-wall-edge={index}
              key={`wall-segment-${index}`}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelectWallEdge(index);
                  onSelectWallPoint(null);
                }
              }}
            >
              <line x1={start.x} x2={end.x} y1={start.y} y2={end.y} />
              <line className="warehouse-layout-plan__wall-hit-area" x1={start.x} x2={end.x} y1={start.y} y2={end.y} />
              {hiddenWallIndex === index && (
                <g
                  aria-hidden="true"
                  className="warehouse-layout-plan__hidden-wall-badge"
                  pointerEvents="none"
                  transform={`translate(${(start.x + end.x) / 2} ${(start.y + end.y) / 2})`}
                >
                  <rect height="22" rx="7" width="58" x="-29" y="-11" />
                  <text dominantBaseline="central" textAnchor="middle" y="-1">Скрыта</text>
                </g>
              )}
              <g
                aria-label={`Добавить точку на стену ${index + 1}`}
                className="warehouse-layout-plan__add-point"
                role="button"
                tabIndex={0}
                transform={`translate(${(start.x + end.x) / 2} ${(start.y + end.y) / 2})`}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  event.preventDefault();
                  onSelectWallEdge(index);
                  onAddPointOnWall(index);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onAddPointOnWall(index);
                  }
                }}
              >
                <circle r="17" />
                <text dominantBaseline="central" textAnchor="middle" y="-1">+</text>
              </g>
            </g>
          );
        }) : (
          <polygon
            className="warehouse-layout-plan__outline"
            points={layout.wallOutline.map((point) => {
              const svgPoint = worldToPlan(point, frame);
              return `${svgPoint.x},${svgPoint.y}`;
            }).join(" ")}
          />
        )}
        {layout.racks.map((rackLayout) => {
          const rack = rackById.get(rackLayout.rackId);
          if (!rack) return null;
          const { x, y } = worldToPlan(rackLayout.position, frame);
          const width = rackLayout.dimensions.width * frame.scale;
          const depth = rackLayout.dimensions.depth * frame.scale;
          const isSelected = selection?.kind === "rack" && selection.id === rack.id;
          return (
            <g
              aria-label={`Стеллаж ${rack.code}, переместить`}
              className={`warehouse-layout-plan__object${isSelected ? " is-selected" : ""}`}
              data-layout-id={rack.id}
              data-layout-kind="rack"
              key={rack.id}
              transform={`rotate(${rackLayout.rotation_y_deg}, ${x}, ${y})`}
            >
              <rect height={depth} rx="4" width={width} x={x - width / 2} y={y - depth / 2} />
              <text dominantBaseline="central" textAnchor="middle" x={x} y={y}>{rack.code}</text>
            </g>
          );
        })}
        {layout.columns.map((column) => {
          const { x, y } = worldToPlan(column.position, frame);
          const width = column.dimensions.width * frame.scale;
          const depth = column.dimensions.depth * frame.scale;
          const isSelected = selection?.kind === "column" && selection.id === column.id;
          return (
            <g
              aria-label="Колонна, переместить"
              className={`warehouse-layout-plan__column${isSelected ? " is-selected" : ""}`}
              data-layout-id={column.id}
              data-layout-kind="column"
              key={column.id}
            >
              <rect height={depth} rx="3" width={width} x={x - width / 2} y={y - depth / 2} />
              <text dominantBaseline="central" textAnchor="middle" x={x} y={y}>▦</text>
            </g>
          );
        })}
        {unplacedRackPreview && (() => {
          const { x, y } = worldToPlan(unplacedRackPreview.position, frame);
          const width = unplacedRackPreview.dimensions.width * frame.scale;
          const depth = unplacedRackPreview.dimensions.depth * frame.scale;
          return (
            <g
              aria-label={`Предпросмотр размещения стеллажа ${unplacedRackPreview.code}`}
              className={`warehouse-layout-plan__object is-placement-preview${unplacedRackPreview.error ? " is-invalid" : ""}`}
              pointerEvents="none"
              transform={`rotate(${unplacedRackPreview.rotation_y_deg}, ${x}, ${y})`}
            >
              <rect height={depth} rx="4" width={width} x={x - width / 2} y={y - depth / 2} />
              <text dominantBaseline="central" textAnchor="middle" x={x} y={y}>{unplacedRackPreview.code}</text>
            </g>
          );
        })()}
        {wallEditing && layout.wallOutline.map((point, index) => {
          const svgPoint = worldToPlan(point, frame);
          const isSelected = selectedWallPoint === index;
          return (
            <g
              aria-label={`Точка ${index + 1}, переместить`}
              className={`warehouse-layout-plan__wall-point${isSelected ? " is-selected" : ""}`}
              data-wall-point={index}
              key={`wall-point-${index}`}
              role="button"
              tabIndex={0}
              transform={`translate(${svgPoint.x} ${svgPoint.y})`}
              onKeyDown={(event) => {
                const direction = {
                  ArrowUp: { x: 0, z: 0.1 },
                  ArrowDown: { x: 0, z: -0.1 },
                  ArrowLeft: { x: -0.1, z: 0 },
                  ArrowRight: { x: 0.1, z: 0 },
                }[event.key];
                if (direction) {
                  event.preventDefault();
                  onSelectWallPoint(index);
                  onMoveWallPoint(index, point.x + direction.x, point.z + direction.z);
                }
              }}
            >
              <circle className="warehouse-layout-plan__wall-point-hit" r="23" />
              <circle className="warehouse-layout-plan__wall-point-marker" r={isSelected ? 10 : 8} />
              <text dominantBaseline="central" textAnchor="middle" y="-1">{index + 1}</text>
            </g>
          );
        })}
        <text className="warehouse-layout-plan__measure" textAnchor="middle" x={SVG_WIDTH / 2} y={frame.y + frame.height + 35}>
          {layout.room.width.toFixed(1)} м
        </text>
        <text
          className="warehouse-layout-plan__measure"
          textAnchor="middle"
          transform={`rotate(-90, ${frame.x - 32}, ${SVG_HEIGHT / 2})`}
          x={frame.x - 32}
          y={SVG_HEIGHT / 2}
        >
          {layout.room.length.toFixed(1)} м
        </text>
      </svg>
    </div>
  );
}

function ObjectInspector({
  selection,
  layout,
  racks,
  unplacedDimensions,
  unplacedPosition,
  unplacedRotation,
  placementMode,
  unplacedPositionChosen,
  placementError,
  onChange,
  onUnplacedDimensionsChange,
  onUnplacedPositionChange,
  onUnplacedRotationChange,
  onStartPlacement,
  onPlaceRack,
  onRemoveColumn,
}: {
  selection: Selection;
  layout: WarehouseLayout;
  racks: Rack[];
  unplacedDimensions: LayoutRack["dimensions"] | null;
  unplacedPosition: { x: number; z: number };
  unplacedRotation: number;
  placementMode: boolean;
  unplacedPositionChosen: boolean;
  placementError: string | null;
  onChange: (next: WarehouseLayout) => void;
  onUnplacedDimensionsChange: (dimensions: LayoutRack["dimensions"]) => void;
  onUnplacedPositionChange: (position: { x: number; z: number }) => void;
  onUnplacedRotationChange: (rotation: number) => void;
  onStartPlacement: () => void;
  onPlaceRack: (rackId: number, position: { x: number; z: number }, rotation_y_deg: number) => void;
  onRemoveColumn: (id: string) => void;
}) {
  if (!selection) {
    return (
      <aside className="warehouse-layout-inspector">
        <div className="warehouse-layout-inspector__empty-icon"><Box size={18} /></div>
        <p className="font-medium text-sm">Выберите объект</p>
        <p className="text-xs leading-5 text-muted-foreground">Нажмите на стеллаж или колонну на плане, чтобы задать точные координаты и размеры.</p>
      </aside>
    );
  }

  if (selection.kind === "rack") {
    const layoutRack = layout.racks.find((rack) => rack.rackId === selection.id);
    const rack = racks.find((item) => item.id === selection.id);
    if (!rack) return null;
    if (!layoutRack) {
      const dimensions = unplacedDimensions ?? makeDefaultRackLayout(rack, layout.room).dimensions;
      const updateDimension = (key: "width" | "depth", value: number) =>
        onUnplacedDimensionsChange({ ...dimensions, [key]: value });
      return (
        <aside className="warehouse-layout-inspector">
          <div className="warehouse-layout-inspector__title-row">
            <div className="warehouse-layout-inspector__object-icon"><Box size={16} /></div>
            <div className="min-w-0">
              <p className="text-sm font-semibold">Стеллаж {rack.code}</p>
              <p className="text-xs font-medium text-amber-700">Пока не размещён</p>
            </div>
          </div>
          <p className="text-xs leading-5 text-muted-foreground">Стеллаж сохранён отдельно. Выберите точку на плане или задайте координаты вручную; существующие объекты не сдвигаются.</p>
          <div className="warehouse-layout-inspector__section">
            <p className="warehouse-layout-inspector__eyebrow">Размеры</p>
            <div className="warehouse-layout-inspector__fields">
              {numberField("Ширина, м", dimensions.width, (value) => updateDimension("width", value))}
              {numberField("Глубина, м", dimensions.depth, (value) => updateDimension("depth", value))}
            </div>
          </div>
          <div className="warehouse-layout-inspector__section">
            <p className="warehouse-layout-inspector__eyebrow"><Ruler size={13} /> Выберите место</p>
            <div className="warehouse-layout-inspector__fields">
              {numberField("X, м", unplacedPosition.x, (value) => onUnplacedPositionChange({ ...unplacedPosition, x: value }), 0.1, -1000, 1000)}
              {numberField("Z, м", unplacedPosition.z, (value) => onUnplacedPositionChange({ ...unplacedPosition, z: value }), 0.1, -1000, 1000)}
              {numberField("Поворот, °", unplacedRotation, onUnplacedRotationChange, 1, -360, 360)}
            </div>
          </div>
          <p className="warehouse-layout-inspector__note">Высота рассчитывается автоматически по количеству уровней.</p>
          <div className="warehouse-layout-inspector__placement-actions">
            <Button className="warehouse-layout-rotate" onClick={onStartPlacement} type="button" variant={placementMode ? "default" : "outline"}>
              {placementMode ? "Нажмите на план…" : "Выбрать место на плане"}
            </Button>
            {placementError && <p className="warehouse-layout-inspector__placement-error" role="alert">{placementError} Измените координаты или размеры.</p>}
            <Button className="warehouse-layout-rotate" disabled={!unplacedPositionChosen || Boolean(placementError)} onClick={() => onPlaceRack(rack.id, unplacedPosition, unplacedRotation)} type="button">
              Добавить в планировку
            </Button>
          </div>
        </aside>
      );
    }
    const update = (changes: Partial<LayoutRack>) => onChange({
      ...layout,
      model: undefined,
      racks: layout.racks.map((item) => item.rackId === rack.id ? { ...item, ...changes } : item),
    });
    const updatePosition = (axis: "x" | "z", value: number) =>
      update({ position: { ...layoutRack.position, [axis]: value } });
    const updateDimension = (key: "width" | "depth", value: number) =>
      update({ dimensions: { ...layoutRack.dimensions, [key]: value } });

    return (
      <aside className="warehouse-layout-inspector">
        <div className="warehouse-layout-inspector__title-row">
          <div className="warehouse-layout-inspector__object-icon"><Box size={16} /></div>
          <div className="min-w-0">
            <p className="text-sm font-semibold">Стеллаж {rack.code}</p>
            <p className="text-xs text-muted-foreground">{rack.levels_count} ур. · {rack.cells.length} ячеек</p>
          </div>
        </div>
        <div className="warehouse-layout-inspector__section">
          <p className="warehouse-layout-inspector__eyebrow"><Ruler size={13} /> Положение</p>
          <div className="warehouse-layout-inspector__fields">
            {numberField("X, м", layoutRack.position.x, (value) => updatePosition("x", value), 0.1, -1000, 1000)}
            {numberField("Z, м", layoutRack.position.z, (value) => updatePosition("z", value), 0.1, -1000, 1000)}
            {numberField("Поворот, °", layoutRack.rotation_y_deg, (value) => update({ rotation_y_deg: value }), 1, -360, 360)}
          </div>
          <Button
            aria-label={`Повернуть стеллаж ${rack.code} на 90 градусов`}
            className="warehouse-layout-rotate"
            onClick={() => update({ rotation_y_deg: ((layoutRack.rotation_y_deg + 90) % 360) })}
            size="default"
            type="button"
            variant="outline"
          >
            <RotateCw size={15} /> Повернуть на 90°
          </Button>
        </div>
        <div className="warehouse-layout-inspector__section">
          <p className="warehouse-layout-inspector__eyebrow">Размеры</p>
          <div className="warehouse-layout-inspector__fields">
            {numberField("Ширина, м", layoutRack.dimensions.width, (value) => updateDimension("width", value))}
            {numberField("Глубина, м", layoutRack.dimensions.depth, (value) => updateDimension("depth", value))}
          </div>
        </div>
        <p className="warehouse-layout-inspector__note">Высота стеллажа задаётся автоматически по количеству уровней.</p>
      </aside>
    );
  }

  const column = layout.columns.find((item) => item.id === selection.id);
  if (!column) return null;
  const updateColumn = (changes: Partial<LayoutColumn>) => onChange({
    ...layout,
    model: undefined,
    columns: layout.columns.map((item) => item.id === column.id ? { ...item, ...changes } : item),
  });
  const updatePosition = (axis: "x" | "z", value: number) =>
    updateColumn({ position: { ...column.position, [axis]: value } });
  const updateDimension = (key: "width" | "depth" | "height", value: number) =>
    updateColumn({ dimensions: { ...column.dimensions, [key]: value } });

  return (
    <aside className="warehouse-layout-inspector">
      <div className="warehouse-layout-inspector__title-row">
        <div className="warehouse-layout-inspector__object-icon warehouse-layout-inspector__object-icon--column"><Box size={16} /></div>
        <div className="min-w-0">
          <p className="text-sm font-semibold">Колонна</p>
          <p className="text-xs text-muted-foreground">Элемент 3D-модели</p>
        </div>
      </div>
      <div className="warehouse-layout-inspector__section">
        <p className="warehouse-layout-inspector__eyebrow"><Ruler size={13} /> Положение</p>
        <div className="warehouse-layout-inspector__fields">
          {numberField("X, м", column.position.x, (value) => updatePosition("x", value), 0.1, -1000, 1000)}
          {numberField("Z, м", column.position.z, (value) => updatePosition("z", value), 0.1, -1000, 1000)}
        </div>
      </div>
      <div className="warehouse-layout-inspector__section">
        <p className="warehouse-layout-inspector__eyebrow">Размеры</p>
        <div className="warehouse-layout-inspector__fields">
          {numberField("Ширина, м", column.dimensions.width, (value) => updateDimension("width", value))}
          {numberField("Глубина, м", column.dimensions.depth, (value) => updateDimension("depth", value))}
        </div>
      </div>
      <Button
        className="warehouse-layout-remove-column"
        onClick={() => onRemoveColumn(column.id)}
        type="button"
        variant="outline"
      >
        <Trash2 size={15} /> Удалить колонну с плана
      </Button>
      <p className="warehouse-layout-inspector__note">Колонна сохраняется в загружаемой GLB-модели. Отдельного endpoint для колонн нет.</p>
    </aside>
  );
}

function WallInspector({
  layout,
  hiddenWallIndex,
  selectedWallPoint,
  selectedWallEdge,
  onSelectWallPoint,
  onAddPointOnWall,
  onUpdatePoint,
  onDeletePoint,
  onSetHiddenWallIndex,
  onCancel,
}: {
  layout: WarehouseLayout;
  hiddenWallIndex: number | null;
  selectedWallPoint: number | null;
  selectedWallEdge: number | null;
  onSelectWallPoint: (index: number | null) => void;
  onAddPointOnWall: (index: number) => void;
  onUpdatePoint: (index: number, point: LayoutPoint) => void;
  onDeletePoint: (index: number) => void;
  onSetHiddenWallIndex: (index: number | null) => void;
  onCancel: () => void;
}) {
  const selectedPoint = selectedWallPoint === null ? null : layout.wallOutline[selectedWallPoint] ?? null;

  return (
    <aside className="warehouse-layout-inspector warehouse-layout-wall-inspector">
      <div className="warehouse-layout-inspector__title-row">
        <div className="warehouse-layout-inspector__object-icon warehouse-layout-inspector__object-icon--wall"><PencilRuler size={16} /></div>
        <div className="min-w-0">
          <p className="text-sm font-semibold">Форма стен</p>
          <p className="text-xs text-muted-foreground">{layout.wallOutline.length} из 10 точек</p>
        </div>
      </div>

      <p className="text-xs leading-5 text-muted-foreground">
        Контур замыкается автоматически. Выберите точку, чтобы ввести координаты, или потяните её на плане.
      </p>

      <div aria-label="Настройка скрываемой стены" className="warehouse-layout-hide-wall">
        <div className="warehouse-layout-hide-wall__heading">
          {hiddenWallIndex === null ? <Eye size={15} /> : <EyeOff size={15} />}
          <span>Скрывать в 3D</span>
        </div>
        <p className="warehouse-layout-inspector__note">Можно выбрать одну стену. Номер соответствует участку контура от точки N к следующей.</p>
        <div className="warehouse-layout-hide-wall__options">
          {layout.wallOutline.map((_point, index) => (
            <button
              aria-pressed={hiddenWallIndex === index}
              className={`warehouse-layout-hide-wall__option${hiddenWallIndex === index ? " is-selected" : ""}`}
              key={`hidden-wall-${index}`}
              onClick={() => onSetHiddenWallIndex(index)}
              type="button"
            >
              <span>Стена {index + 1}</span>
              {hiddenWallIndex === index && <span className="warehouse-layout-hide-wall__badge">Скрыта</span>}
            </button>
          ))}
        </div>
        <Button
          aria-pressed={hiddenWallIndex === null}
          className="warehouse-layout-show-walls"
          onClick={() => onSetHiddenWallIndex(null)}
          type="button"
          variant="outline"
        >
          <Eye size={15} /> Показывать все стены
        </Button>
        <p className="warehouse-layout-inspector__note">После добавления или удаления точки выберите участок снова.</p>
      </div>

      <div className="warehouse-layout-wall-points" aria-label="Точки контура">
        {layout.wallOutline.map((point, index) => (
          <button
            aria-pressed={selectedWallPoint === index}
            className={`warehouse-layout-wall-points__item${selectedWallPoint === index ? " is-selected" : ""}`}
            key={`wall-coordinate-${index}`}
            onClick={() => onSelectWallPoint(index)}
            type="button"
          >
            Точка {index + 1}
          </button>
        ))}
      </div>

      {selectedPoint && selectedWallPoint !== null ? (
        <div className="warehouse-layout-inspector__section">
          <p className="warehouse-layout-inspector__eyebrow"><Ruler size={13} /> Точка {selectedWallPoint + 1}, м</p>
          <div className="warehouse-layout-inspector__fields">
            {numberField("X", selectedPoint.x, (value) => onUpdatePoint(selectedWallPoint, { ...selectedPoint, x: value }), 0.1, -10000, 10000)}
            {numberField("Z", selectedPoint.z, (value) => onUpdatePoint(selectedWallPoint, { ...selectedPoint, z: value }), 0.1, -10000, 10000)}
          </div>
          <Button
            className="warehouse-layout-remove-column"
            disabled={layout.wallOutline.length <= 3}
            onClick={() => onDeletePoint(selectedWallPoint)}
            type="button"
            variant="outline"
          >
            <Trash2 size={15} /> Удалить точку
          </Button>
        </div>
      ) : (
        <div className="warehouse-layout-wall-inspector__empty">
          <p className="text-xs font-medium">Точка не выбрана</p>
          <p className="text-xs leading-5 text-muted-foreground">Нажмите на точку на плане или выберите её выше.</p>
        </div>
      )}

      <Button
        className="warehouse-layout-rotate"
        disabled={selectedWallEdge === null || layout.wallOutline.length >= 10}
        onClick={() => selectedWallEdge !== null && onAddPointOnWall(selectedWallEdge)}
        type="button"
        variant="outline"
      >
        <PencilRuler size={15} /> Добавить точку на стену
      </Button>
      {selectedWallEdge === null && <p className="warehouse-layout-inspector__note">Нажмите «+» на участке стены, чтобы добавить новую вершину.</p>}
      {layout.wallOutline.length >= 10 && <p className="warehouse-layout-inspector__note">API поддерживает максимум 10 точек контура.</p>}
      <Button className="warehouse-layout-wall-cancel" onClick={onCancel} type="button" variant="ghost">
        <Undo2 size={15} /> Отменить изменения стен
      </Button>
      <p className="warehouse-layout-inspector__note">После добавления точки потяните её или задайте точные координаты. Первая точка не дублируется в конце списка.</p>
    </aside>
  );
}

export function WarehouseLayoutEditor({
  layout,
  racks,
  onLayoutChange,
  onDirty,
}: {
  layout: WarehouseLayout;
  racks: Rack[];
  onLayoutChange: (layout: WarehouseLayout) => void;
  onDirty: () => void;
}) {
  const [mode, setMode] = useState<EditorMode>("plan");
  const [selection, setSelection] = useState<Selection>(null);
  const [wallEditing, setWallEditing] = useState(false);
  const [selectedWallPoint, setSelectedWallPoint] = useState<number | null>(null);
  const [selectedWallEdge, setSelectedWallEdge] = useState<number | null>(null);
  const [wallEditStartLayout, setWallEditStartLayout] = useState<WarehouseLayout | null>(null);
  const [unplacedDimensions, setUnplacedDimensions] = useState<LayoutRack["dimensions"] | null>(null);
  const [unplacedPosition, setUnplacedPosition] = useState({ x: 0, z: 0 });
  const [unplacedPositionChosen, setUnplacedPositionChosen] = useState(false);
  const [unplacedRotation, setUnplacedRotation] = useState(0);
  const [placementMode, setPlacementMode] = useState(false);
  const [placementNotice, setPlacementNotice] = useState<string | null>(null);
  const cameraApiRef = useRef<WarehouseCameraApi | null>(null);
  const errors = useMemo(() => validateWarehouseLayout(layout, racks), [layout, racks]);
  const wallOutlineErrors = useMemo(() => getWallOutlineErrors(layout.wallOutline), [layout.wallOutline]);
  const unplacedRackCodes = useMemo(
    () => racks.filter((rack) => !layout.racks.some((item) => item.rackId === rack.id)).map((rack) => rack.code),
    [layout.racks, racks],
  );
  const selectedUnplacedRackId = selection?.kind === "rack" &&
    !layout.racks.some((rack) => rack.rackId === selection.id)
    ? selection.id
    : null;

  useEffect(() => {
    if (selectedUnplacedRackId === null) {
      setUnplacedDimensions(null);
      setUnplacedPositionChosen(false);
      setPlacementMode(false);
      return;
    }
    const rack = racks.find((item) => item.id === selectedUnplacedRackId);
    if (rack) {
      setUnplacedDimensions(makeDefaultRackLayout(rack, layout.room).dimensions);
      setUnplacedPosition({ x: 0, z: 0 });
      setUnplacedPositionChosen(false);
      setPlacementMode(false);
      setUnplacedRotation(0);
    }
  }, [selectedUnplacedRackId]);

  const updateLayout = (next: WarehouseLayout) => {
    onLayoutChange(next);
    onDirty();
    setPlacementNotice(null);
  };

  const selectedUnplacedRack = selectedUnplacedRackId === null
    ? null
    : racks.find((rack) => rack.id === selectedUnplacedRackId) ?? null;
  const activeUnplacedDimensions = unplacedDimensions ?? (selectedUnplacedRack ? makeDefaultRackLayout(selectedUnplacedRack, layout.room).dimensions : null);
  const unplacedPreviewError = selectedUnplacedRack && activeUnplacedDimensions && unplacedPositionChosen
    ? getRackPlacementError(layout, racks, selectedUnplacedRack, activeUnplacedDimensions, unplacedPosition, unplacedRotation)
    : null;
  const unplacedRackPreview = selectedUnplacedRack && activeUnplacedDimensions && unplacedPositionChosen
    ? {
      code: selectedUnplacedRack.code,
      position: unplacedPosition,
      rotation_y_deg: unplacedRotation,
      dimensions: activeUnplacedDimensions,
      error: unplacedPreviewError,
    }
    : null;

  const chooseUnplacedPosition = (position: { x: number; z: number }) => {
    setUnplacedPosition(position);
    setUnplacedPositionChosen(true);
    setPlacementMode(false);
    setPlacementNotice(null);
  };

  const changeUnplacedPosition = (position: { x: number; z: number }) => {
    setUnplacedPosition(position);
    setUnplacedPositionChosen(true);
    setPlacementMode(false);
    setPlacementNotice(null);
  };

  const updateWallOutline = (outline: LayoutPoint[]) => {
    const hiddenWallIndex = outline.length === layout.wallOutline.length ? layout.hiddenWallIndex : null;
    updateLayout(applyWallOutline({ ...layout, model: undefined, hiddenWallIndex }, outline));
    setSelection(null);
  };

  const selectHiddenWall = (index: number | null) => {
    if (index !== null && (index < 0 || index >= layout.wallOutline.length)) return;
    setSelectedWallEdge(null);
    updateLayout({ ...layout, hiddenWallIndex: index });
  };

  const moveWallPoint = (index: number, x: number, z: number) => {
    const outline = layout.wallOutline.map((point, pointIndex) =>
      pointIndex === index ? { x, z } : point,
    );
    updateWallOutline(outline);
    setSelectedWallPoint(index);
  };

  const addPointOnWall = (index: number) => {
    if (layout.wallOutline.length >= 10) return;
    updateWallOutline(insertPointOnWall(layout.wallOutline, index));
    setSelectedWallPoint(index + 1);
    setSelectedWallEdge(null);
  };

  const deleteWallPoint = (index: number) => {
    if (layout.wallOutline.length <= 3) return;
    const outline = layout.wallOutline.filter((_point, pointIndex) => pointIndex !== index);
    updateWallOutline(outline);
    setSelectedWallPoint(null);
    setSelectedWallEdge(null);
  };

  const toggleWallEditing = () => {
    if (wallEditing) {
      setWallEditing(false);
      setWallEditStartLayout(null);
      setSelectedWallPoint(null);
      setSelectedWallEdge(null);
      return;
    }
    setWallEditStartLayout(layout);
    setSelection(null);
    setSelectedWallPoint(null);
    setSelectedWallEdge(null);
    setMode("plan");
    setWallEditing(true);
  };

  const cancelWallEditing = () => {
    if (wallEditStartLayout && (
      JSON.stringify(wallEditStartLayout.wallOutline) !== JSON.stringify(layout.wallOutline) ||
      wallEditStartLayout.hiddenWallIndex !== layout.hiddenWallIndex
    )) {
      updateLayout(wallEditStartLayout);
    }
    setWallEditing(false);
    setWallEditStartLayout(null);
    setSelectedWallPoint(null);
    setSelectedWallEdge(null);
  };

  const updateRoom = (key: "width" | "length", value: number) => {
    if (!Number.isFinite(value) || value <= 0) return;
    const nextWidth = key === "width" ? value : layout.room.width;
    const nextLength = key === "length" ? value : layout.room.length;
    const outline = resizeOutline(layout.wallOutline, nextWidth, nextLength);
    updateLayout(applyWallOutline({ ...layout, model: undefined }, outline));
  };

  const moveObject = (target: Exclude<Selection, null>, x: number, z: number) => {
    const item = target.kind === "rack"
      ? layout.racks.find((rack) => rack.rackId === target.id)
      : layout.columns.find((column) => column.id === target.id);
    if (!item) return;
    const dimensions = item.dimensions;
    const rotation = target.kind === "rack"
      ? layout.racks.find((rack) => rack.rackId === target.id)?.rotation_y_deg ?? 0
      : 0;
    const position = clampObjectPosition(x, z, dimensions.width + (target.kind === "column" ? 0.08 : 0), dimensions.depth + (target.kind === "column" ? 0.08 : 0), rotation, layout);
    if (!position) {
      setPlacementNotice("Объект не помещается между стенами. Увеличьте помещение или измените его размеры.");
      return;
    }
    const next = target.kind === "rack"
      ? {
        ...layout,
        model: undefined,
        racks: layout.racks.map((rack) => rack.rackId === target.id
          ? { ...rack, position: { ...rack.position, ...position } }
          : rack),
      }
      : {
        ...layout,
        model: undefined,
        columns: layout.columns.map((column) => column.id === target.id
          ? { ...column, position }
          : column),
      };
    const targetLabel = target.kind === "rack"
      ? `Стеллаж ${racks.find((rack) => rack.id === target.id)?.code ?? target.id}`
      : `Колонна ${target.id}`;
    const normalizedTargetLabel = targetLabel.toLocaleLowerCase("ru-RU");
    const targetPlacementError = validateWarehouseLayout(next, racks)
      .find((error) => error.toLocaleLowerCase("ru-RU").includes(normalizedTargetLabel));
    if (targetPlacementError) {
      setPlacementNotice(targetPlacementError);
      return;
    }
    setPlacementNotice(null);
    updateLayout(next);
  };

  const placeUnplacedRack = (rackId: number, position: { x: number; z: number }, rotation_y_deg: number) => {
    const rack = racks.find((item) => item.id === rackId);
    if (!rack) return;
    const placement: LayoutRack = {
      rackId,
      position: { x: position.x, y: 0, z: position.z },
      rotation_y_deg,
      dimensions: unplacedDimensions ?? makeDefaultRackLayout(rack, layout.room).dimensions,
    };
    const candidateLayout = { ...layout, racks: [...layout.racks, placement] };
    const racksToValidate = racks.filter((item) =>
      item.id === rackId || layout.racks.some((placed) => placed.rackId === item.id),
    );
    const placementError = validateWarehouseLayout(candidateLayout, racksToValidate)[0];
    if (placementError) {
      setPlacementNotice(`${placementError} Измените координаты или размеры, чтобы выбрать свободное место.`);
      return;
    }
    updateLayout({ ...candidateLayout, model: undefined });
    setSelection({ kind: "rack", id: rackId });
    setUnplacedDimensions(null);
    setPlacementNotice(null);
  };

  const addColumn = () => {
    const position = findAvailableColumnPosition(layout, racks);
    if (!position) {
      setPlacementNotice("Свободного места для колонны нет. Сначала измените план или увеличьте помещение.");
      return;
    }
    const column: LayoutColumn = {
      id: `column-${Date.now()}`,
      position,
      dimensions: { width: 0.4, depth: 0.4, height: layout.room.height },
    };
    updateLayout({ ...layout, model: undefined, columns: [...layout.columns, column] });
    setSelection({ kind: "column", id: column.id });
    setPlacementNotice(null);
  };

  const removeColumn = (id: string) => {
    updateLayout({ ...layout, model: undefined, columns: layout.columns.filter((column) => column.id !== id) });
    setSelection(null);
  };

  return (
    <section className="warehouse-layout-step">
      <div className="warehouse-layout-step__topline">
        <div className="warehouse-layout-step__dimensions">
          {numberField("Ширина, м", layout.room.width, (value) => updateRoom("width", value), 0.1, 0.1, 1000)}
          {numberField("Длина, м", layout.room.length, (value) => updateRoom("length", value), 0.1, 0.1, 1000)}
          <p className="warehouse-layout-step__fixed-height">Высота по 3D-модели: {layout.room.height.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} м</p>
        </div>
        <div className="warehouse-layout-step__actions">
          <div aria-label="Режим планировки" className="warehouse-layout-mode" role="group">
            <Button
              aria-pressed={mode === "plan"}
              className={mode === "plan" ? "is-active" : ""}
              onClick={() => setMode("plan")}
              type="button"
              variant="ghost"
            >
              План 2D
            </Button>
            <Button
              aria-pressed={mode === "preview"}
              className={mode === "preview" ? "is-active" : ""}
              disabled={wallOutlineErrors.length > 0}
              onClick={() => setMode("preview")}
              title={wallOutlineErrors.length ? "Сначала исправьте контур стен." : undefined}
              type="button"
              variant="ghost"
            >
              Просмотр 3D
            </Button>
          </div>
          <Button
            aria-pressed={wallEditing}
            className={`warehouse-layout-wall-toggle${wallEditing ? " is-active" : ""}`}
            onClick={toggleWallEditing}
            type="button"
            variant={wallEditing ? "default" : "outline"}
          >
            <PencilRuler size={15} /> {wallEditing ? "Готово со стенами" : "Форма стен"}
          </Button>
          <Button className="warehouse-layout-add-column" disabled={wallEditing} onClick={addColumn} type="button" variant="outline">
            <Box size={15} /> Добавить колонну
          </Button>
        </div>
      </div>

      <div className="warehouse-layout-editor-grid">
        <div className="warehouse-layout-editor-grid__main">
          {mode === "plan" ? (
            <PlanCanvas
              layout={layout}
              placementMode={placementMode}
              unplacedRackPreview={unplacedRackPreview}
              onChooseUnplacedPosition={chooseUnplacedPosition}
              onMove={moveObject}
              onSelect={setSelection}
              onAddPointOnWall={addPointOnWall}
              onMoveWallPoint={moveWallPoint}
              onSelectWallEdge={setSelectedWallEdge}
              onSelectWallPoint={setSelectedWallPoint}
              racks={racks}
              selection={selection}
              selectedWallEdge={selectedWallEdge}
              selectedWallPoint={selectedWallPoint}
              wallEditing={wallEditing}
              hiddenWallIndex={layout.hiddenWallIndex ?? null}
            />
          ) : (
            <div className="warehouse-layout-preview">
              <WarehouseScene
                cameraApiRef={cameraApiRef}
                layout={layout}
                onCellSelect={(_rack: Rack, _cell: Cell) => undefined}
                racks={racks}
                selectedCellId={null}
              />
            </div>
          )}
          <div className="warehouse-layout-rack-list">
            {racks.map((rack) => {
              const selected = selection?.kind === "rack" && selection.id === rack.id;
              const isPlaced = layout.racks.some((item) => item.rackId === rack.id);
              return (
                <button
                  aria-pressed={selected}
                  className={`warehouse-layout-rack-chip${selected ? " is-selected" : ""}${isPlaced ? "" : " is-unplaced"}`}
                  key={rack.id}
                  onClick={() => {
                    setWallEditing(false);
                    setWallEditStartLayout(null);
                    setSelectedWallPoint(null);
                    setSelectedWallEdge(null);
                    setSelection({ kind: "rack", id: rack.id });
                    if (!isPlaced) {
                      setUnplacedDimensions(makeDefaultRackLayout(rack, layout.room).dimensions);
                      setUnplacedPosition({ x: 0, z: 0 });
                      setUnplacedPositionChosen(false);
                      setUnplacedRotation(0);
                      setPlacementMode(false);
                    }
                    setPlacementNotice(null);
                  }}
                  type="button"
                >
                  <span className="warehouse-layout-rack-chip__mark" />
                  {rack.code}
                  <span className="warehouse-layout-rack-chip__meta">{isPlaced ? `${rack.levels_count} ур.` : "не размещён"}</span>
                </button>
              );
            })}
            {layout.columns.map((column, index) => {
              const selected = selection?.kind === "column" && selection.id === column.id;
              return (
                <button
                  aria-pressed={selected}
                  className={`warehouse-layout-rack-chip warehouse-layout-rack-chip--column${selected ? " is-selected" : ""}`}
                  key={column.id}
                  onClick={() => {
                    setWallEditing(false);
                    setWallEditStartLayout(null);
                    setSelectedWallPoint(null);
                    setSelectedWallEdge(null);
                    setSelection({ kind: "column", id: column.id });
                  }}
                  type="button"
                >
                  <span className="warehouse-layout-rack-chip__mark" />
                  Колонна {index + 1}
                </button>
              );
            })}
          </div>
        </div>
        {wallEditing ? (
          <WallInspector
            layout={layout}
            hiddenWallIndex={layout.hiddenWallIndex ?? null}
            onAddPointOnWall={addPointOnWall}
            onCancel={cancelWallEditing}
            onDeletePoint={deleteWallPoint}
            onSetHiddenWallIndex={selectHiddenWall}
            onSelectWallPoint={setSelectedWallPoint}
            onUpdatePoint={(index, point) => moveWallPoint(index, point.x, point.z)}
            selectedWallEdge={selectedWallEdge}
            selectedWallPoint={selectedWallPoint}
          />
        ) : (
          <ObjectInspector
            layout={layout}
            onChange={updateLayout}
            onPlaceRack={placeUnplacedRack}
            onUnplacedRotationChange={setUnplacedRotation}
            onRemoveColumn={removeColumn}
            onUnplacedDimensionsChange={(dimensions) => {
              setUnplacedDimensions(dimensions);
              setPlacementNotice(null);
            }}
            racks={racks}
            selection={selection}
            unplacedDimensions={unplacedDimensions}
            unplacedPosition={unplacedPosition}
            unplacedPositionChosen={unplacedPositionChosen}
            unplacedRotation={unplacedRotation}
            placementMode={placementMode}
            placementError={unplacedPreviewError}
            onStartPlacement={() => {
              setPlacementMode(true);
              setPlacementNotice(null);
            }}
            onUnplacedPositionChange={changeUnplacedPosition}
          />
        )}
      </div>

      {(placementNotice || unplacedRackCodes.length > 0) && (
        <p aria-live="polite" className="warehouse-layout-placement-notice" role="status">
          {placementNotice ?? `Не размещены стеллажи ${unplacedRackCodes.join(", ")}. Выберите стеллаж и укажите свободное место на плане; если места недостаточно, измените размеры помещения.`}
        </p>
      )}
      <div className={`warehouse-layout-validation${errors.length ? " has-errors" : " is-valid"}`} aria-live="polite">
        <span className="warehouse-layout-validation__mark" />
        <div>
          {errors.length ? (
            <>
              <p className="font-medium">Проверьте планировку перед сохранением</p>
              <ul>{errors.map((error) => <li key={error}>{error}</li>)}</ul>
            </>
          ) : (
            <p className="font-medium">Планировка готова к сохранению</p>
          )}
        </div>
      </div>

      <div className="warehouse-layout-step__footnote">
        <Label className="sr-only">Информация о координатах</Label>
        <p>Координаты указаны в метрах от центра пола. Между отдельными рядами и стеллажами с колоннами нужен проход от 1 м; секции одного ряда можно ставить с зазором от 20 см.</p>
      </div>
    </section>
  );
}
