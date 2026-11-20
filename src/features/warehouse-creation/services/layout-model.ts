import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import type { LayoutColumn, LayoutRack, Rack, WarehouseLayout } from "@/features/warehouse/types";
import { createRectangularOutline, createWallsFromOutline, getOutlineBounds } from "@/features/warehouse/utils/wall-outline";
import { validateWarehouseLayout } from "@/features/warehouse-creation/services/layout-validation";

export const DEFAULT_ROOM = { width: 14.4, length: 8.2, height: 5.2 };
const DEFAULT_RACK_WIDTH = 3.6;
const DEFAULT_RACK_DEPTH = 1.2;
const DEFAULT_RACK_LEVEL_SPACING = 1.05;
const MINIMUM_DEFAULT_RACK_HEIGHT = 2.8;
const AUTO_PLACEMENT_STEP = 0.25;

function makePlacementCoordinates(min: number, max: number) {
  const values: number[] = [];
  for (let value = min; value <= max + 0.0001; value += AUTO_PLACEMENT_STEP) {
    values.push(Number(value.toFixed(2)));
  }
  if (!values.length || max - values[values.length - 1] > 0.0001) {
    values.push(Number(max.toFixed(2)));
  }
  return values;
}

export function makeDefaultRackLayout(rack: Rack, room: WarehouseLayout["room"] = DEFAULT_ROOM): LayoutRack {
  const targetHeight = Math.max(
    MINIMUM_DEFAULT_RACK_HEIGHT,
    0.92 + Math.max(0, rack.levels_count - 1) * DEFAULT_RACK_LEVEL_SPACING,
  );

  return {
    rackId: rack.id,
    position: { x: 0, y: 0, z: 0 },
    rotation_y_deg: 0,
    dimensions: {
      width: DEFAULT_RACK_WIDTH,
      depth: DEFAULT_RACK_DEPTH,
      height: Math.min(room.height, targetHeight),
    },
  };
}

export function findAvailableRackPlacement(
  layout: WarehouseLayout,
  rack: Rack,
  racks: Rack[],
  dimensions = makeDefaultRackLayout(rack, layout.room).dimensions,
): LayoutRack | null {
  const outlineBounds = getOutlineBounds(layout.wallOutline);
  const wallClearance = Math.max(0.1, ...layout.walls.map((wall) => wall.thickness / 2 + 0.02));
  const candidates = [0, 90];
  const knownRacks = new Map(racks.map((item) => [item.id, item]));
  const placedRacks = layout.racks
    .map((item) => knownRacks.get(item.rackId))
    .filter((item): item is Rack => Boolean(item));

  for (const rotation of candidates) {
    const radians = THREE.MathUtils.degToRad(rotation);
    const halfX = Math.abs(Math.cos(radians)) * dimensions.width / 2 +
      Math.abs(Math.sin(radians)) * dimensions.depth / 2;
    const halfZ = Math.abs(Math.sin(radians)) * dimensions.width / 2 +
      Math.abs(Math.cos(radians)) * dimensions.depth / 2;
    const minX = outlineBounds.minX + wallClearance + halfX;
    const maxX = outlineBounds.maxX - wallClearance - halfX;
    const minZ = outlineBounds.minZ + wallClearance + halfZ;
    const maxZ = outlineBounds.maxZ - wallClearance - halfZ;
    if (minX > maxX || minZ > maxZ || dimensions.height > layout.room.height) continue;

    const candidateXs = makePlacementCoordinates(minX, maxX);
    const candidateZs = makePlacementCoordinates(minZ, maxZ);

    for (const z of candidateZs) {
      for (const x of candidateXs) {
        const candidate: LayoutRack = {
          rackId: rack.id,
          position: {
            x,
            y: 0,
            z,
          },
          rotation_y_deg: rotation,
          dimensions,
        };
        const testLayout = { ...layout, racks: [...layout.racks, candidate] };
        if (validateWarehouseLayout(testLayout, [...placedRacks, rack]).length === 0) return candidate;
      }
    }
  }

  return null;
}

export function findAvailableColumnPosition(
  layout: WarehouseLayout,
  racks: Rack[],
  width = 0.4,
  depth = 0.4,
): LayoutColumn["position"] | null {
  const wallClearance = Math.max(0.1, ...layout.walls.map((wall) => wall.thickness / 2 + 0.02));
  const outlineBounds = getOutlineBounds(layout.wallOutline);
  const minX = outlineBounds.minX + wallClearance + (width + 0.08) / 2;
  const maxX = outlineBounds.maxX - wallClearance - (width + 0.08) / 2;
  const minZ = outlineBounds.minZ + wallClearance + (depth + 0.08) / 2;
  const maxZ = outlineBounds.maxZ - wallClearance - (depth + 0.08) / 2;
  if (minX > maxX || minZ > maxZ) return null;

  const candidateXs = makePlacementCoordinates(minX, maxX);
  const candidateZs = makePlacementCoordinates(minZ, maxZ);
  const knownRacks = new Map(racks.map((rack) => [rack.id, rack]));
  const placedRacks = layout.racks
    .map((item) => knownRacks.get(item.rackId))
    .filter((item): item is Rack => Boolean(item));
  const candidateId = "placement-candidate-column";

  for (const z of candidateZs) {
    for (const x of candidateXs) {
      const position = {
        x,
        z,
      };
      const candidate: LayoutColumn = {
        id: candidateId,
        position,
        dimensions: { width, depth, height: layout.room.height },
      };
      if (validateWarehouseLayout({ ...layout, columns: [...layout.columns, candidate] }, placedRacks).length === 0) {
        return position;
      }
    }
  }

  return null;
}

export function makeDefaultLayout(
  racks: Rack[],
  room = DEFAULT_ROOM,
): WarehouseLayout {
  const layout: WarehouseLayout = {
    room: { ...room },
    wallOutline: createRectangularOutline(room.width, room.length),
    hiddenWallIndex: null,
    walls: createWallsFromOutline(createRectangularOutline(room.width, room.length), room.height),
    columns: [],
    racks: [],
  };

  racks.forEach((rack) => {
    const rackLayout = findAvailableRackPlacement(layout, rack, racks);
    if (rackLayout) layout.racks.push(rackLayout);
  });
  return layout;
}

function addBox(
  parent: THREE.Group,
  name: string,
  dimensions: [number, number, number],
  position: [number, number, number],
  material: THREE.Material,
) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...dimensions), material);
  mesh.name = name;
  mesh.position.set(...position);
  parent.add(mesh);
  return mesh;
}

function buildWarehouseScene(layout: WarehouseLayout) {
  const scene = new THREE.Scene();
  scene.name = "Warehouse";
  const model = new THREE.Group();
  model.name = "warehouse-layout";
  const warehouseLayoutMetadata = {
    room: layout.room,
    wallOutline: layout.wallOutline,
    hiddenWallIndex: layout.hiddenWallIndex,
    columns: layout.columns,
    coordinateSystem: { origin: "floor-center", up: "Y", unit: "m" },
  };
  model.userData.warehouseLayout = warehouseLayoutMetadata;
  scene.userData.warehouseLayout = warehouseLayoutMetadata;
  scene.add(model);

  const floorMaterial = new THREE.MeshStandardMaterial({ color: "#e5e9ee", roughness: 0.88, side: THREE.DoubleSide });
  const wallMaterial = new THREE.MeshStandardMaterial({
    color: "#dce3eb",
    transparent: true,
    opacity: 0.34,
    roughness: 0.92,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const trimMaterial = new THREE.MeshStandardMaterial({ color: "#c5d0dc", roughness: 0.75 });
  const columnMaterial = new THREE.MeshStandardMaterial({ color: "#aeb9c6", roughness: 0.78 });

  const floorShape = new THREE.Shape();
  layout.wallOutline.forEach((point, index) => {
    if (index === 0) floorShape.moveTo(point.x, -point.z);
    else floorShape.lineTo(point.x, -point.z);
  });
  floorShape.closePath();
  const floorGeometry = new THREE.ExtrudeGeometry(floorShape, { depth: 0.11, bevelEnabled: false });
  floorGeometry.rotateX(-Math.PI / 2);
  const floor = new THREE.Mesh(floorGeometry, floorMaterial);
  floor.name = "warehouse-floor";
  floor.position.y = -0.11;
  model.add(floor);

  layout.walls.forEach((wall) => {
    const dx = wall.end.x - wall.start.x;
    const dz = wall.end.z - wall.start.z;
    const length = Math.hypot(dx, dz);
    const centerX = (wall.start.x + wall.end.x) / 2;
    const centerZ = (wall.start.z + wall.end.z) / 2;
    const group = new THREE.Group();
    group.name = `wall-${wall.id}`;
    group.position.set(centerX, wall.height / 2, centerZ);
    group.rotation.y = -Math.atan2(dz, dx);
    addBox(group, `wall-${wall.id}-surface`, [length, wall.height, wall.thickness], [0, 0, 0], wallMaterial);
    addBox(group, `wall-${wall.id}-trim`, [length, 0.16, wall.thickness + 0.04], [0, wall.height / 2 - 0.08, 0], trimMaterial);
    model.add(group);
  });

  layout.columns.forEach((column) => {
    const group = new THREE.Group();
    group.name = `column-${column.id}`;
    group.userData.column = column;
    group.position.set(column.position.x, 0, column.position.z);
    addBox(
      group,
      `column-${column.id}-body`,
      [column.dimensions.width, column.dimensions.height, column.dimensions.depth],
      [0, column.dimensions.height / 2, 0],
      columnMaterial,
    );
    addBox(
      group,
      `column-${column.id}-base`,
      [column.dimensions.width + 0.08, 0.16, column.dimensions.depth + 0.08],
      [0, 0.08, 0],
      trimMaterial,
    );
    model.add(group);
  });

  return scene;
}

export async function createWarehouseModelFile(layout: WarehouseLayout): Promise<File> {
  const scene = buildWarehouseScene(layout);
  const exporter = new GLTFExporter();
  const binary = await new Promise<ArrayBuffer>((resolve, reject) => {
    exporter.parse(
      scene,
      (result) => {
        if (result instanceof ArrayBuffer) resolve(result);
        else reject(new Error("The GLB exporter returned a non-binary model."));
      },
      (error) => reject(error),
      { binary: true },
    );
  });
  return new File([binary], "warehouse-layout.glb", { type: "model/gltf-binary" });
}
