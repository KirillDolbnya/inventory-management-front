import type { Rack, WarehouseLayout } from "@/features/warehouse/types";

type Point = { x: number; z: number };
type Rectangle = {
  x: number;
  z: number;
  width: number;
  depth: number;
  rotation_y_deg: number;
};

function rectangleCorners(rectangle: Rectangle): Point[] {
  const angle = rectangle.rotation_y_deg * Math.PI / 180;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return [
    [-rectangle.width / 2, -rectangle.depth / 2],
    [rectangle.width / 2, -rectangle.depth / 2],
    [rectangle.width / 2, rectangle.depth / 2],
    [-rectangle.width / 2, rectangle.depth / 2],
  ].map(([localX, localZ]) => ({
    x: rectangle.x + localX * cosine + localZ * sine,
    z: rectangle.z - localX * sine + localZ * cosine,
  }));
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

function isWithinRoom(points: Point[], width: number, length: number) {
  const halfWidth = width / 2;
  const halfLength = length / 2;
  const epsilon = 0.0001;
  return points.every((point) =>
    point.x >= -halfWidth - epsilon &&
    point.x <= halfWidth + epsilon &&
    point.z >= -halfLength - epsilon &&
    point.z <= halfLength + epsilon,
  );
}

export function validateWarehouseLayout(layout: WarehouseLayout, racks: Rack[]): string[] {
  const errors: string[] = [];
  const { width, length, height } = layout.room;
  if (![width, length, height].every((value) => Number.isFinite(value) && value > 0)) {
    errors.push("Укажите положительные размеры помещения.");
    return errors;
  }

  const rackById = new Map(racks.map((rack) => [rack.id, rack]));
  if (layout.racks.length !== racks.length || layout.racks.some((rack) => !rackById.has(rack.rackId))) {
    errors.push("Планировка должна содержать все стеллажи склада.");
  }

  const objects: Array<{ label: string; polygon: Point[] }> = [];
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
    if (!isWithinRoom(polygon, width, length)) {
      errors.push(`Стеллаж ${rack.code} выходит за границы помещения.`);
    }
    objects.push({ label: `Стеллаж ${rack.code}`, polygon });
  });

  layout.columns.forEach((column) => {
    const { width: columnWidth, depth, height: columnHeight } = column.dimensions;
    if (![column.position.x, column.position.z, columnWidth, depth, columnHeight].every(Number.isFinite) ||
      columnWidth <= 0 || depth <= 0 || columnHeight <= 0 || columnHeight > height) {
      errors.push("Проверьте положение и размеры колонн.");
      return;
    }
    const polygon = rectangleCorners({
      x: column.position.x,
      z: column.position.z,
      width: columnWidth,
      depth,
      rotation_y_deg: 0,
    });
    if (!isWithinRoom(polygon, width, length)) {
      errors.push("Колонна выходит за границы помещения.");
    }
    objects.push({ label: "Колонна", polygon });
  });

  for (let first = 0; first < objects.length; first += 1) {
    for (let second = first + 1; second < objects.length; second += 1) {
      if (polygonsOverlap(objects[first].polygon, objects[second].polygon)) {
        errors.push(`${objects[first].label} пересекается с ${objects[second].label.toLowerCase()}.`);
      }
    }
  }

  return [...new Set(errors)];
}
