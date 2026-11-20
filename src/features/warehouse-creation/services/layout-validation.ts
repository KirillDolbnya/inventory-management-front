import type { Rack, WarehouseLayout } from "@/features/warehouse/types";
import { getWallOutlineErrors, isPolygonWithinOutline } from "@/features/warehouse/utils/wall-outline";

type Point = { x: number; z: number };
type Rectangle = {
  x: number;
  z: number;
  width: number;
  depth: number;
  rotation_y_deg: number;
};

const MINIMUM_OBJECT_CLEARANCE = 0.2;
const MINIMUM_AISLE_WIDTH = 1;

function rectangleCorners(rectangle: Rectangle, padding = 0): Point[] {
  const angle = rectangle.rotation_y_deg * Math.PI / 180;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const halfWidth = rectangle.width / 2 + padding;
  const halfDepth = rectangle.depth / 2 + padding;
  return [
    [-halfWidth, -halfDepth],
    [halfWidth, -halfDepth],
    [halfWidth, halfDepth],
    [-halfWidth, halfDepth],
  ].map(([localX, localZ]) => ({
    x: rectangle.x + localX * cosine + localZ * sine,
    z: rectangle.z - localX * sine + localZ * cosine,
  }));
}

function areRackSectionsInSameRow(first: Rectangle, second: Rectangle) {
  const firstAngle = first.rotation_y_deg * Math.PI / 180;
  const secondAngle = second.rotation_y_deg * Math.PI / 180;
  const angleDifference = Math.abs(Math.atan2(Math.sin(firstAngle - secondAngle), Math.cos(firstAngle - secondAngle)));
  if (Math.min(angleDifference, Math.PI - angleDifference) > Math.PI / 18) return false;

  const widthAxis = { x: Math.cos(firstAngle), z: -Math.sin(firstAngle) };
  const depthAxis = { x: Math.sin(firstAngle), z: Math.cos(firstAngle) };
  const delta = { x: second.x - first.x, z: second.z - first.z };
  const alongRow = Math.abs(delta.x * widthAxis.x + delta.z * widthAxis.z);
  const acrossRow = Math.abs(delta.x * depthAxis.x + delta.z * depthAxis.z);
  const rowGap = alongRow - (first.width + second.width) / 2;
  const depthOverlap = (first.depth + second.depth) / 2 - acrossRow;

  return rowGap >= -0.02 && depthOverlap >= Math.min(first.depth, second.depth) * 0.7;
}

function polygonsOverlap(first: Point[], second: Point[]) {
  const polygons = [first, second];
  for (const polygon of polygons) {
    for (let index = 0; index < polygon.length; index += 1) {
      const start = polygon[index];
      const end = polygon[(index + 1) % polygon.length];
      const axis = { x: -(end.z - start.z), z: end.x - start.x };
      const project = (points: Point[]) => points.map((point) => point.x * axis.x + point.z * axis.z);
      const firstProjection = project(first);
      const secondProjection = project(second);
      const firstMin = Math.min(...firstProjection);
      const firstMax = Math.max(...firstProjection);
      const secondMin = Math.min(...secondProjection);
      const secondMax = Math.max(...secondProjection);
      if (firstMax <= secondMin + 0.0001 || secondMax <= firstMin + 0.0001) return false;
    }
  }
  return true;
}

export function validateWarehouseLayout(layout: WarehouseLayout, racks: Rack[]): string[] {
  const errors: string[] = [];
  const { width, length, height } = layout.room;
  const wallErrors = getWallOutlineErrors(layout.wallOutline);
  if (wallErrors.length) return wallErrors;
  if (![width, length, height].every((value) => Number.isFinite(value) && value > 0)) {
    errors.push("Укажите положительные размеры помещения.");
    return errors;
  }

  const rackById = new Map(racks.map((rack) => [rack.id, rack]));
  if (layout.racks.length !== racks.length || layout.racks.some((rack) => !rackById.has(rack.rackId))) {
    errors.push("Планировка должна содержать все стеллажи склада.");
  }

  const wallClearance = Math.max(0, ...layout.walls.map((wall) => wall.thickness / 2 + 0.02));
  const objects: Array<{ label: string; kind: "rack" | "column"; rectangle: Rectangle; polygon: Point[] }> = [];
  layout.racks.forEach((rackLayout) => {
    const rack = rackById.get(rackLayout.rackId);
    if (!rack) return;
    const { x, y, z } = rackLayout.position;
    const dimensions = rackLayout.dimensions;
    if (![x, y, z, rackLayout.rotation_y_deg, dimensions.width, dimensions.depth, dimensions.height]
      .every(Number.isFinite) ||
      dimensions.width <= 0 || dimensions.depth <= 0 || dimensions.height <= 0) {
      errors.push(`Проверьте положение и размеры стеллажа ${rack.code}.`);
      return;
    }
    if (y < 0 || y + dimensions.height > height + 0.0001) {
      errors.push(`Стеллаж ${rack.code} выходит за высоту помещения.`);
    }
    const polygon = rectangleCorners({
      x,
      z,
      width: dimensions.width,
      depth: dimensions.depth,
      rotation_y_deg: rackLayout.rotation_y_deg,
    });
    if (!isPolygonWithinOutline(polygon, layout.wallOutline, wallClearance)) {
      errors.push(`Стеллаж ${rack.code} выходит за контур помещения или задевает стену.`);
    }
    objects.push({
      label: `Стеллаж ${rack.code}`,
      kind: "rack",
      rectangle: { x, z, width: dimensions.width, depth: dimensions.depth, rotation_y_deg: rackLayout.rotation_y_deg },
      polygon,
    });
  });

  layout.columns.forEach((column) => {
    const { width: columnWidth, depth, height: columnHeight } = column.dimensions;
    if (![column.position.x, column.position.z, columnWidth, depth, columnHeight].every(Number.isFinite) ||
      columnWidth <= 0 || depth <= 0 || columnHeight <= 0 || columnHeight > height) {
      errors.push(`Проверьте положение и размеры колонны ${column.id}.`);
      return;
    }
    const rectangle = {
      x: column.position.x,
      z: column.position.z,
      width: columnWidth + 0.08,
      depth: depth + 0.08,
      rotation_y_deg: 0,
    };
    const polygon = rectangleCorners(rectangle);
    if (!isPolygonWithinOutline(polygon, layout.wallOutline, wallClearance)) {
      errors.push(`Колонна ${column.id} выходит за контур помещения или задевает стену.`);
    }
    objects.push({ label: `Колонна ${column.id}`, kind: "column", rectangle, polygon });
  });

  for (let first = 0; first < objects.length; first += 1) {
    for (let second = first + 1; second < objects.length; second += 1) {
      const objectA = objects[first];
      const objectB = objects[second];
      const sameRow = objectA.kind === "rack" && objectB.kind === "rack" &&
        areRackSectionsInSameRow(objectA.rectangle, objectB.rectangle);
      const requiredClearance = objectA.kind === "column" && objectB.kind === "column"
        ? MINIMUM_OBJECT_CLEARANCE
        : sameRow ? MINIMUM_OBJECT_CLEARANCE : MINIMUM_AISLE_WIDTH;
      const firstWithClearance = rectangleCorners(objectA.rectangle, requiredClearance / 2);
      const secondWithClearance = rectangleCorners(objectB.rectangle, requiredClearance / 2);
      const otherLabel = objectB.kind === "rack"
        ? `стеллаж ${objectB.label.slice("Стеллаж ".length)}`
        : objectB.label.toLocaleLowerCase("ru-RU");
      if (polygonsOverlap(firstWithClearance, secondWithClearance)) {
        errors.push(sameRow
          ? `${objectA.label} расположен слишком близко к ${otherLabel}; между секциями одного ряда оставьте не менее 20 см.`
          : `${objectA.label} расположен слишком близко к ${otherLabel}; оставьте проход не менее ${MINIMUM_AISLE_WIDTH} м.`);
      }
    }
  }

  return [...new Set(errors)];
}
