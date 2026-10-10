import type { WarehouseLayout } from "@/features/warehouse/types";

export const demoWarehouseLayout: WarehouseLayout = {
  version: 1,
  room: {
    width: 24,
    length: 18,
    height: 5.8,
  },
  walls: [
    {
      id: "rear-wall",
      start: { x: -12, z: -9 },
      end: { x: 12, z: -9 },
      height: 5.8,
      thickness: 0.24,
    },
    {
      id: "left-wall",
      start: { x: -12, z: -9 },
      end: { x: -12, z: 9 },
      height: 5.8,
      thickness: 0.24,
    },
    {
      id: "right-wall",
      start: { x: 12, z: 9 },
      end: { x: 12, z: -9 },
      height: 5.8,
      thickness: 0.24,
    },
  ],
  columns: [
    {
      id: "column-west",
      position: { x: -3.6, z: -3.35 },
      dimensions: { width: 0.55, depth: 0.55, height: 5.5 },
    },
    {
      id: "column-east",
      position: { x: 4.1, z: 3.85 },
      dimensions: { width: 0.55, depth: 0.55, height: 5.5 },
    },
  ],
  racks: [
    {
      rackId: 11,
      position: { x: -7, z: -5.35 },
      rotation: 0,
      dimensions: { width: 4.4, depth: 0.95, height: 3.55 },
    },
    {
      rackId: 12,
      position: { x: -7, z: -1.45 },
      rotation: 0,
      dimensions: { width: 4.4, depth: 0.95, height: 3.55 },
    },
    {
      rackId: 13,
      position: { x: -7, z: 2.45 },
      rotation: 0,
      dimensions: { width: 4.4, depth: 0.95, height: 3.55 },
    },
    {
      rackId: 14,
      position: { x: 1.1, z: -5.35 },
      rotation: 0,
      dimensions: { width: 3.55, depth: 1, height: 3.3 },
    },
    {
      rackId: 15,
      position: { x: 1.1, z: -1.45 },
      rotation: 0,
      dimensions: { width: 3.55, depth: 1, height: 3.3 },
    },
    {
      rackId: 16,
      position: { x: 8, z: 2.1 },
      rotation: Math.PI / 2,
      dimensions: { width: 3.75, depth: 0.9, height: 3.45 },
    },
  ],
};
