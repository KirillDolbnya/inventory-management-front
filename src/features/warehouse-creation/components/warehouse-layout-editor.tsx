import { useMemo, useRef, useState } from "react";
import { Box, RotateCw, Ruler, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { WarehouseScene } from "@/features/warehouse/components/warehouse-scene";
import type { Cell, Rack } from "@/features/warehouse/types";
import type { WarehouseCameraApi } from "@/features/warehouse/components/warehouse-scene";
import type { LayoutColumn, LayoutRack, WarehouseLayout } from "@/features/warehouse/types";
import { validateWarehouseLayout } from "@/features/warehouse-creation/services/layout-validation";

type Selection = { kind: "rack"; id: number } | { kind: "column"; id: string } | null;
type EditorMode = "plan" | "preview";
type DragTarget = { selection: Exclude<Selection, null>; offsetX: number; offsetZ: number; pointerId: number };

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

function getPlanFrame(width: number, length: number) {
  const safeWidth = Number.isFinite(width) && width > 0 ? width : 0.1;
  const safeLength = Number.isFinite(length) && length > 0 ? length : 0.1;
  const scale = Math.min((SVG_WIDTH - PAD_X * 2) / safeWidth, (SVG_HEIGHT - PAD_Y * 2) / safeLength);
  const drawWidth = safeWidth * scale;
  const drawLength = safeLength * scale;
  return {
    scale,
    x: (SVG_WIDTH - drawWidth) / 2,
    y: (SVG_HEIGHT - drawLength) / 2,
    width: drawWidth,
    height: drawLength,
  };
}

function clampObjectPosition(
  x: number,
  z: number,
  width: number,
  depth: number,
  rotation: number,
  roomWidth: number,
  roomLength: number,
) {
  const angle = rotation * Math.PI / 180;
  const halfX = Math.abs(Math.cos(angle)) * width / 2 + Math.abs(Math.sin(angle)) * depth / 2;
  const halfZ = Math.abs(Math.sin(angle)) * width / 2 + Math.abs(Math.cos(angle)) * depth / 2;
  return {
    x: Math.min(roomWidth / 2 - halfX, Math.max(-roomWidth / 2 + halfX, x)),
    z: Math.min(roomLength / 2 - halfZ, Math.max(-roomLength / 2 + halfZ, z)),
  };
}

function PlanCanvas({
  layout,
  racks,
  selection,
  onSelect,
  onMove,
}: {
  layout: WarehouseLayout;
  racks: Rack[];
  selection: Selection;
  onSelect: (selection: Selection) => void;
  onMove: (selection: Exclude<Selection, null>, x: number, z: number) => void;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<DragTarget | null>(null);
  const frame = getPlanFrame(layout.room.width, layout.room.length);
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
      x: (clampedX - frame.x) / frame.scale - layout.room.width / 2,
      z: layout.room.length / 2 - (clampedY - frame.y) / frame.scale,
    };
  };

  const objectCenter = (selected: Exclude<Selection, null>) => {
    if (selected.kind === "rack") {
      return layout.racks.find((rack) => rack.rackId === selected.id)?.position;
    }
    return layout.columns.find((column) => column.id === selected.id)?.position;
  };

  const handlePointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    const element = (event.target as Element).closest<SVGGElement>("[data-layout-kind]");
    if (!element) {
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
      layout.room.width,
      layout.room.length,
    );
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
        <span className="warehouse-layout-plan__drag-hint">Выберите и перетащите · шаг сетки 0,25 м</span>
      </div>
      <svg
        aria-label={`План помещения ${layout.room.width} на ${layout.room.length} метров`}
        className="warehouse-layout-plan__svg"
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
        <rect
          className="warehouse-layout-plan__floor"
          height={frame.height}
          rx="5"
          width={frame.width}
          x={frame.x}
          y={frame.y}
        />
        <rect
          className="warehouse-layout-plan__outline"
          height={frame.height}
          rx="5"
          width={frame.width}
          x={frame.x}
          y={frame.y}
        />
        {layout.racks.map((rackLayout) => {
          const rack = rackById.get(rackLayout.rackId);
          if (!rack) return null;
          const x = frame.x + (rackLayout.position.x + layout.room.width / 2) * frame.scale;
          const y = frame.y + (layout.room.length / 2 - rackLayout.position.z) * frame.scale;
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
          const x = frame.x + (column.position.x + layout.room.width / 2) * frame.scale;
          const y = frame.y + (layout.room.length / 2 - column.position.z) * frame.scale;
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
  onChange,
  onRemoveColumn,
}: {
  selection: Selection;
  layout: WarehouseLayout;
  racks: Rack[];
  onChange: (next: WarehouseLayout) => void;
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
    if (!layoutRack || !rack) return null;
    const update = (changes: Partial<LayoutRack>) => onChange({
      ...layout,
      model: undefined,
      racks: layout.racks.map((item) => item.rackId === rack.id ? { ...item, ...changes } : item),
    });
    const updatePosition = (axis: "x" | "z", value: number) =>
      update({ position: { ...layoutRack.position, [axis]: value } });
    const updateDimension = (key: "width" | "depth" | "height", value: number) =>
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
            {numberField("Высота, м", layoutRack.dimensions.height, (value) => updateDimension("height", value))}
          </div>
        </div>
        <p className="warehouse-layout-inspector__note">Здесь можно настроить положение и размеры стеллажа.</p>
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
          {numberField("Высота, м", column.dimensions.height, (value) => updateDimension("height", value))}
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
  const cameraApiRef = useRef<WarehouseCameraApi | null>(null);
  const errors = useMemo(() => validateWarehouseLayout(layout, racks), [layout, racks]);

  const updateLayout = (next: WarehouseLayout) => {
    onLayoutChange(next);
    onDirty();
  };

  const updateRoom = (key: "width" | "length" | "height", value: number) => {
    const nextRoom = { ...layout.room, [key]: value };
    const halfWidth = nextRoom.width / 2;
    const halfLength = nextRoom.length / 2;
    const walls: WarehouseLayout["walls"] = [
      { id: "north", start: { x: -halfWidth, z: -halfLength }, end: { x: halfWidth, z: -halfLength }, height: nextRoom.height, thickness: 0.16 },
      { id: "east", start: { x: halfWidth, z: -halfLength }, end: { x: halfWidth, z: halfLength }, height: nextRoom.height, thickness: 0.16 },
      { id: "south", start: { x: halfWidth, z: halfLength }, end: { x: -halfWidth, z: halfLength }, height: nextRoom.height, thickness: 0.16 },
      { id: "west", start: { x: -halfWidth, z: halfLength }, end: { x: -halfWidth, z: -halfLength }, height: nextRoom.height, thickness: 0.16 },
    ];
    updateLayout({ ...layout, room: nextRoom, walls, model: undefined });
  };

  const moveObject = (target: Exclude<Selection, null>, x: number, z: number) => {
    if (target.kind === "rack") {
      updateLayout({
        ...layout,
        model: undefined,
        racks: layout.racks.map((rack) => rack.rackId === target.id
          ? { ...rack, position: { ...rack.position, x, z } }
          : rack),
      });
      return;
    }
    updateLayout({
      ...layout,
      model: undefined,
      columns: layout.columns.map((column) => column.id === target.id
        ? { ...column, position: { x, z } }
        : column),
    });
  };

  const addColumn = () => {
    const column: LayoutColumn = {
      id: `column-${Date.now()}`,
      position: { x: -layout.room.width / 2 + 0.45, z: -layout.room.length / 2 + 0.45 },
      dimensions: { width: 0.4, depth: 0.4, height: layout.room.height },
    };
    updateLayout({ ...layout, model: undefined, columns: [...layout.columns, column] });
    setSelection({ kind: "column", id: column.id });
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
          {numberField("Высота, м", layout.room.height, (value) => updateRoom("height", value))}
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
              onClick={() => setMode("preview")}
              type="button"
              variant="ghost"
            >
              Просмотр 3D
            </Button>
          </div>
          <Button className="warehouse-layout-add-column" onClick={addColumn} type="button" variant="outline">
            <Box size={15} /> Добавить колонну
          </Button>
        </div>
      </div>

      <div className="warehouse-layout-editor-grid">
        <div className="warehouse-layout-editor-grid__main">
          {mode === "plan" ? (
            <PlanCanvas
              layout={layout}
              onMove={moveObject}
              onSelect={setSelection}
              racks={racks}
              selection={selection}
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
              return (
                <button
                  aria-pressed={selected}
                  className={`warehouse-layout-rack-chip${selected ? " is-selected" : ""}`}
                  key={rack.id}
                  onClick={() => setSelection({ kind: "rack", id: rack.id })}
                  type="button"
                >
                  <span className="warehouse-layout-rack-chip__mark" />
                  {rack.code}
                  <span className="warehouse-layout-rack-chip__meta">{rack.levels_count} ур.</span>
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
                  onClick={() => setSelection({ kind: "column", id: column.id })}
                  type="button"
                >
                  <span className="warehouse-layout-rack-chip__mark" />
                  Колонна {index + 1}
                </button>
              );
            })}
          </div>
        </div>
        <ObjectInspector
          layout={layout}
          onChange={updateLayout}
          onRemoveColumn={removeColumn}
          racks={racks}
          selection={selection}
        />
      </div>

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
        <p>Координаты указаны в метрах от центра пола: X и Z — по плану, Y — высота.</p>
      </div>
    </section>
  );
}
