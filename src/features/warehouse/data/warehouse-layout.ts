import type { WarehouseLayout } from "@/features/warehouse/types";

export const demoWarehouseLayout: WarehouseLayout = {
  version: 1,
  room: {
    width: 14.4,
    length: 8.2,
    height: 5.2,
  },
  walls: [
    {
      id: "rear-wall",
      start: { x: -7.2, z: -4.1 },
      end: { x: 7.2, z: -4.1 },
      height: 5.2,
      thickness: 0.24,
    },
    {
      id: "left-wall",
      start: { x: -7.2, z: -4.1 },
      end: { x: -7.2, z: 4.1 },
      height: 5.2,
      thickness: 0.24,
    },
    {
      id: "right-wall",
      start: { x: 7.2, z: 4.1 },
      end: { x: 7.2, z: -4.1 },
      height: 5.2,
      thickness: 0.24,
    },
  ],
  columns: [
    {
      id: "column-west",
      position: { x: -6.65, z: 0 },
      dimensions: { width: 0.42, depth: 0.42, height: 4.95 },
    },
    {
      id: "column-east",
      position: { x: 6.65, z: 0 },
      dimensions: { width: 0.42, depth: 0.42, height: 4.95 },
    },
  ],
  racks: [
    {
      rackId: 11,
      position: { x: -4.2, z: -2.45 },
      rotation: 0,
      dimensions: { width: 4.05, depth: 0.9, height: 3.45 },
    },
    {
      rackId: 12,
      position: { x: 0, z: -2.45 },
      rotation: 0,
      dimensions: { width: 4.05, depth: 0.9, height: 3.45 },
    },
    {
      rackId: 13,
      position: { x: 4.2, z: -2.45 },
      rotation: 0,
      dimensions: { width: 4.05, depth: 0.9, height: 3.45 },
    },
    {
      rackId: 14,
      position: { x: -2.1, z: 1.95 },
      rotation: Math.PI,
      dimensions: { width: 4.05, depth: 0.9, height: 3.45 },
    },
    {
      rackId: 15,
      position: { x: 2.1, z: 1.95 },
      rotation: Math.PI,
      dimensions: { width: 4.05, depth: 0.9, height: 3.45 },
    },
    {
      rackId: 16,
      position: { x: 5.35, z: 1.9 },
      rotation: -Math.PI / 2,
      dimensions: { width: 3.75, depth: 0.9, height: 3.45 },
    },
  ],
};
