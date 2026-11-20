import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { WarehouseLayout } from "@/features/warehouse/types";
import { createRectangularOutline } from "@/features/warehouse/utils/wall-outline";
import { WarehouseModelReadError } from "@/features/warehouse-creation/services/warehouse-model-read-error";

export { WarehouseModelReadError } from "@/features/warehouse-creation/services/warehouse-model-read-error";

export async function readWarehouseModelLayout(url: string): Promise<Pick<WarehouseLayout, "room" | "columns" | "wallOutline" | "hiddenWallIndex">> {
  const modelUrl = new URL(url, window.location.href);
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 12_000);
  let modelFile: Response;
  try {
    modelFile = await fetch(modelUrl, { signal: controller.signal });
  } catch {
    if (controller.signal.aborted) throw new WarehouseModelReadError("timeout");
    throw new WarehouseModelReadError("network");
  } finally {
    window.clearTimeout(timeoutId);
  }
  if (!modelFile.ok) throw new WarehouseModelReadError("http", modelFile.status);

  let gltf: Awaited<ReturnType<GLTFLoader["parseAsync"]>>;
  try {
    const modelData = await modelFile.arrayBuffer();
    gltf = await new GLTFLoader().parseAsync(modelData, new URL(".", modelUrl).href);
  } catch {
    throw new WarehouseModelReadError("format");
  }

  let metadata = gltf.scene.userData.warehouseLayout as
    | {
      room?: WarehouseLayout["room"];
      columns?: WarehouseLayout["columns"];
      wallOutline?: WarehouseLayout["wallOutline"];
      hiddenWallIndex?: unknown;
    }
    | undefined;
  if (!metadata) {
    gltf.scene.traverse((object) => {
      metadata ??= object.userData.warehouseLayout as typeof metadata;
    });
  }
  if (metadata?.room && Array.isArray(metadata.columns)) {
    const wallOutline = metadata.wallOutline ?? createRectangularOutline(metadata.room.width, metadata.room.length);
    const hiddenWallIndex = typeof metadata.hiddenWallIndex === "number" &&
      Number.isInteger(metadata.hiddenWallIndex) &&
      metadata.hiddenWallIndex >= 0 &&
      metadata.hiddenWallIndex < wallOutline.length
      ? metadata.hiddenWallIndex
      : null;
    return {
      room: metadata.room,
      columns: metadata.columns,
      wallOutline,
      hiddenWallIndex,
    };
  }

  const bounds = new THREE.Box3().setFromObject(gltf.scene);
  const size = bounds.getSize(new THREE.Vector3());
  if (size.x <= 0 || size.y <= 0 || size.z <= 0) throw new WarehouseModelReadError("format");
  return {
    room: { width: size.x, length: size.z, height: size.y },
    columns: [],
    wallOutline: createRectangularOutline(size.x, size.z),
    hiddenWallIndex: null,
  };
}
