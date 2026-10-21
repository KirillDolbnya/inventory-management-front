import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { Rack, WarehouseLayout } from "@/features/warehouse/types";

export const DEFAULT_ROOM = { width: 14.4, length: 8.2, height: 5.2 };

function createWalls(width: number, length: number, height: number): WarehouseLayout["walls"] {
  const halfWidth = width / 2;
  const halfLength = length / 2;
  return [
    { id: "north", start: { x: -halfWidth, z: -halfLength }, end: { x: halfWidth, z: -halfLength }, height, thickness: 0.16 },
    { id: "east", start: { x: halfWidth, z: -halfLength }, end: { x: halfWidth, z: halfLength }, height, thickness: 0.16 },
    { id: "south", start: { x: halfWidth, z: halfLength }, end: { x: -halfWidth, z: halfLength }, height, thickness: 0.16 },
    { id: "west", start: { x: -halfWidth, z: halfLength }, end: { x: -halfWidth, z: -halfLength }, height, thickness: 0.16 },
  ];
}

export function makeDefaultLayout(
  racks: Rack[],
  room = DEFAULT_ROOM,
): WarehouseLayout {
  const count = Math.max(racks.length, 1);
  const columnsCount = Math.max(1, Math.ceil(Math.sqrt(count * room.width / room.length)));
  const rowsCount = Math.ceil(count / columnsCount);
  const slotWidth = room.width / columnsCount;
  const slotLength = room.length / rowsCount;

  return {
    room: { ...room },
    walls: createWalls(room.width, room.length, room.height),
    columns: [],
    racks: racks.map((rack, index) => {
      const column = index % columnsCount;
      const row = Math.floor(index / columnsCount);
      return {
        rackId: rack.id,
        position: {
          x: -room.width / 2 + slotWidth * (column + 0.5),
          y: 0,
          z: -room.length / 2 + slotLength * (row + 0.5),
        },
        rotation_y_deg: 0,
        dimensions: {
          width: Math.min(3.2, slotWidth * 0.78),
          depth: Math.min(0.95, slotLength * 0.5),
          height: Math.min(room.height * 0.78, Math.max(2.2, rack.levels_count * 0.65)),
        },
      };
    }),
  };
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
    columns: layout.columns,
    coordinateSystem: { origin: "floor-center", up: "Y", unit: "m" },
  };
  model.userData.warehouseLayout = warehouseLayoutMetadata;
  scene.userData.warehouseLayout = warehouseLayoutMetadata;
  scene.add(model);

  const floorMaterial = new THREE.MeshStandardMaterial({ color: "#e5e9ee", roughness: 0.88 });
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

  addBox(
    model,
    "warehouse-floor",
    [layout.room.width, 0.11, layout.room.length],
    [0, -0.055, 0],
    floorMaterial,
  );

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

export async function readWarehouseModelLayout(url: string): Promise<Pick<WarehouseLayout, "room" | "columns">> {
  const gltf = await new GLTFLoader().loadAsync(url);
  let metadata = gltf.scene.userData.warehouseLayout as
    | { room?: WarehouseLayout["room"]; columns?: WarehouseLayout["columns"] }
    | undefined;
  if (!metadata) {
    gltf.scene.traverse((object) => {
      metadata ??= object.userData.warehouseLayout as typeof metadata;
    });
  }
  if (metadata?.room && Array.isArray(metadata.columns)) {
    return { room: metadata.room, columns: metadata.columns };
  }

  const bounds = new THREE.Box3().setFromObject(gltf.scene);
  const size = bounds.getSize(new THREE.Vector3());
  return {
    room: {
      width: size.x || DEFAULT_ROOM.width,
      length: size.z || DEFAULT_ROOM.length,
      height: size.y || DEFAULT_ROOM.height,
    },
    columns: [],
  };
}
