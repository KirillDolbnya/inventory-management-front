import type { LayoutPoint, LayoutWall, WarehouseLayout } from "@/features/warehouse/types";

export const DEFAULT_WALL_THICKNESS = 0.16;
const EPSILON = 0.0001;

export function createRectangularOutline(width: number, length: number): LayoutPoint[] {
  const halfWidth = width / 2;
  const halfLength = length / 2;
  return [
    { x: -halfWidth, z: -halfLength },
    { x: halfWidth, z: -halfLength },
    { x: halfWidth, z: halfLength },
    { x: -halfWidth, z: halfLength },
  ];
}

export function createWallsFromOutline(
  outline: LayoutPoint[],
  height: number,
  thickness = DEFAULT_WALL_THICKNESS,
): LayoutWall[] {
  return outline.map((start, index) => ({
    id: `wall-${index}`,
    start: { ...start },
    end: { ...outline[(index + 1) % outline.length] },
    height,
    thickness,
  }));
}

export function applyWallOutline(layout: WarehouseLayout, outline: LayoutPoint[]): WarehouseLayout {
  const bounds = getOutlineBounds(outline);
  return {
    ...layout,
    room: {
      ...layout.room,
      width: Math.max(0.1, bounds.width),
      length: Math.max(0.1, bounds.length),
    },
    wallOutline: outline.map((point) => ({ ...point })),
    walls: createWallsFromOutline(outline, layout.room.height),
  };
}

export function getOutlineBounds(outline: LayoutPoint[]) {
  if (!outline.length) return { minX: 0, maxX: 0, minZ: 0, maxZ: 0, width: 0, length: 0 };
  const xs = outline.map((point) => point.x);
  const zs = outline.map((point) => point.z);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  return { minX, maxX, minZ, maxZ, width: maxX - minX, length: maxZ - minZ };
}

function cross(a: LayoutPoint, b: LayoutPoint, c: LayoutPoint) {
  return (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
}

function pointOnSegment(point: LayoutPoint, start: LayoutPoint, end: LayoutPoint) {
  return Math.abs(cross(start, end, point)) <= EPSILON &&
    point.x >= Math.min(start.x, end.x) - EPSILON &&
    point.x <= Math.max(start.x, end.x) + EPSILON &&
    point.z >= Math.min(start.z, end.z) - EPSILON &&
    point.z <= Math.max(start.z, end.z) + EPSILON;
}

function segmentsIntersect(a: LayoutPoint, b: LayoutPoint, c: LayoutPoint, d: LayoutPoint) {
  const abC = cross(a, b, c);
  const abD = cross(a, b, d);
  const cdA = cross(c, d, a);
  const cdB = cross(c, d, b);
  if (((abC > EPSILON && abD < -EPSILON) || (abC < -EPSILON && abD > EPSILON)) &&
      ((cdA > EPSILON && cdB < -EPSILON) || (cdA < -EPSILON && cdB > EPSILON))) return true;
  return pointOnSegment(c, a, b) || pointOnSegment(d, a, b) ||
    pointOnSegment(a, c, d) || pointOnSegment(b, c, d);
}

function distanceBetweenSegments(a: LayoutPoint, b: LayoutPoint, c: LayoutPoint, d: LayoutPoint) {
  if (segmentsIntersect(a, b, c, d)) return 0;
  const pointToSegment = (point: LayoutPoint, start: LayoutPoint, end: LayoutPoint) => {
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const lengthSquared = dx * dx + dz * dz;
    if (lengthSquared <= EPSILON * EPSILON) return Math.hypot(point.x - start.x, point.z - start.z);
    const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.z - start.z) * dz) / lengthSquared));
    return Math.hypot(point.x - (start.x + t * dx), point.z - (start.z + t * dz));
  };
  return Math.min(
    pointToSegment(a, c, d),
    pointToSegment(b, c, d),
    pointToSegment(c, a, b),
    pointToSegment(d, a, b),
  );
}

export function getWallOutlineErrors(outline: LayoutPoint[]): string[] {
  if (outline.length < 3) return ["Контур помещения должен содержать не менее 3 точек."];
  if (outline.length > 10) return ["Layout API поддерживает не более 10 точек контура."];
  if (outline.some(({ x, z }) => !Number.isFinite(x) || !Number.isFinite(z))) {
    return ["Координаты всех точек должны быть числами."];
  }
  const outsideLimitIndex = outline.findIndex(({ x, z }) => Math.abs(x) > 10000 || Math.abs(z) > 10000);
  if (outsideLimitIndex >= 0) return [`Координаты точки ${outsideLimitIndex + 1} должны быть в диапазоне от −10 000 до 10 000 м.`];

  for (let index = 0; index < outline.length; index += 1) {
    const current = outline[index];
    const next = outline[(index + 1) % outline.length];
    if (Math.hypot(current.x - next.x, current.z - next.z) < EPSILON) {
      return [`Стена ${index + 1} имеет нулевую длину: соседние точки совпадают.`];
    }
  }

  let signedArea = 0;
  for (let index = 0; index < outline.length; index += 1) {
    const current = outline[index];
    const next = outline[(index + 1) % outline.length];
    signedArea += current.x * next.z - next.x * current.z;
  }
  if (Math.abs(signedArea) / 2 < 0.01) return ["Контур помещения должен иметь площадь не менее 0,01 м²."];

  for (let index = 0; index < outline.length; index += 1) {
    const previous = outline[(index + outline.length - 1) % outline.length];
    const current = outline[index];
    const next = outline[(index + 1) % outline.length];
    const incoming = { x: current.x - previous.x, z: current.z - previous.z };
    const outgoing = { x: next.x - current.x, z: next.z - current.z };
    if (Math.abs(incoming.x * outgoing.z - incoming.z * outgoing.x) < EPSILON &&
        incoming.x * outgoing.x + incoming.z * outgoing.z < 0) {
      return [`Стены накладываются около точки ${index + 1}.`];
    }
  }

  for (let first = 0; first < outline.length; first += 1) {
    const firstEnd = (first + 1) % outline.length;
    for (let second = first + 2; second < outline.length; second += 1) {
      if (first === 0 && second === outline.length - 1) continue;
      const secondEnd = (second + 1) % outline.length;
      if (segmentsIntersect(outline[first], outline[firstEnd], outline[second], outline[secondEnd])) {
        return [`Стены пересекаются между участками ${first + 1} и ${second + 1}.`];
      }
    }
  }
  return [];
}

export function isPointInOutline(point: LayoutPoint, outline: LayoutPoint[]) {
  let inside = false;
  for (let index = 0, previous = outline.length - 1; index < outline.length; previous = index, index += 1) {
    const start = outline[previous];
    const end = outline[index];
    if (pointOnSegment(point, start, end)) return true;
    const intersects = (start.z > point.z) !== (end.z > point.z) &&
      point.x < ((end.x - start.x) * (point.z - start.z)) / (end.z - start.z) + start.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function isPolygonWithinOutline(
  polygon: LayoutPoint[],
  outline: LayoutPoint[],
  clearance: number,
) {
  if (outline.length < 3 || polygon.some((point) => !isPointInOutline(point, outline))) return false;
  for (let objectIndex = 0; objectIndex < polygon.length; objectIndex += 1) {
    const objectStart = polygon[objectIndex];
    const objectEnd = polygon[(objectIndex + 1) % polygon.length];
    for (let wallIndex = 0; wallIndex < outline.length; wallIndex += 1) {
      const wallStart = outline[wallIndex];
      const wallEnd = outline[(wallIndex + 1) % outline.length];
      if (distanceBetweenSegments(objectStart, objectEnd, wallStart, wallEnd) < clearance - EPSILON) return false;
    }
  }
  return true;
}

export function insertPointOnWall(outline: LayoutPoint[], wallIndex: number): LayoutPoint[] {
  const start = outline[wallIndex];
  const end = outline[(wallIndex + 1) % outline.length];
  if (!start || !end) return outline;
  const point = { x: (start.x + end.x) / 2, z: (start.z + end.z) / 2 };
  return [...outline.slice(0, wallIndex + 1), point, ...outline.slice(wallIndex + 1)];
}

export function resizeOutline(outline: LayoutPoint[], width: number, length: number): LayoutPoint[] {
  const bounds = getOutlineBounds(outline);
  if (bounds.width <= EPSILON || bounds.length <= EPSILON) return outline.map((point) => ({ ...point }));
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerZ = (bounds.minZ + bounds.maxZ) / 2;
  const scaleX = width / bounds.width;
  const scaleZ = length / bounds.length;
  return outline.map((point) => ({
    x: centerX + (point.x - centerX) * scaleX,
    z: centerZ + (point.z - centerZ) * scaleZ,
  }));
}
