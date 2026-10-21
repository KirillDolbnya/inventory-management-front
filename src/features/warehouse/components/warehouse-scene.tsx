import { Grid, OrbitControls, useGLTF } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { Cell, Rack, WarehouseLayout } from "@/features/warehouse/types";

const SHELF_BASE_Y = 0.36;
const SHELF_BOARD_CENTER_OFFSET = 0.075;
const SHELF_BOARD_THICKNESS = 0.065;
const RACK_POST_WIDTH = 0.09;
const EMPTY_OCCUPIED_CELL_IDS = new Set<number>();

function getRackShelfY(level: number, levelSpacing: number) {
  return SHELF_BASE_Y + (level - 1) * levelSpacing;
}

export interface WarehouseCameraApi {
  reset: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  focusCell: (rackId: number, cellId: number) => boolean;
}

type WarehouseSceneProps = {
  layout: WarehouseLayout;
  racks: Rack[];
  selectedCellId: number | null;
  focusCellRequest?: { rackId: number; cellId: number } | null;
  targetCellId?: number | null;
  occupiedCellIds?: Set<number>;
  cameraApiRef: React.MutableRefObject<WarehouseCameraApi | null>;
  onCellSelect: (rack: Rack, cell: Cell) => void;
};

export function WarehouseScene({
  layout,
  racks,
  selectedCellId,
  focusCellRequest = null,
  targetCellId = null,
  occupiedCellIds = EMPTY_OCCUPIED_CELL_IDS,
  cameraApiRef,
  onCellSelect,
}: WarehouseSceneProps) {
  const [modelRoom, setModelRoom] = useState<WarehouseLayout["room"] | null>(null);
  const [cameraInitVersion, setCameraInitVersion] = useState(0);
  const markCameraInitialized = useCallback(() => {
    setCameraInitVersion((version) => version + 1);
  }, []);
  const cameraLayout = useMemo(
    () => modelRoom ? { ...layout, room: modelRoom } : layout,
    [layout, modelRoom],
  );

  return (
    <Canvas
      camera={{ fov: 38, near: 0.1, far: 180, position: [31, 24, 31] }}
      dpr={[1, 1.5]}
      gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
      shadows={false}
      className="warehouse-canvas"
    >
      <color attach="background" args={["#f1f5f9"]} />
      <ambientLight intensity={1.55} />
      <hemisphereLight args={["#ffffff", "#cad3df", 1.15]} />
      <directionalLight
        intensity={2.1}
        position={[16, 24, 15]}
      />
      <WarehouseRoom
        layout={layout}
        modelUrl={layout.model?.url}
        onModelRoomChange={setModelRoom}
        racks={racks}
        selectedCellId={selectedCellId}
        targetCellId={targetCellId}
        occupiedCellIds={occupiedCellIds}
        onCellSelect={onCellSelect}
      />
      <WarehouseCameraControls
        cameraApiRef={cameraApiRef}
        cameraInitVersion={cameraInitVersion}
        focusCellRequest={focusCellRequest}
        layout={cameraLayout}
        racks={racks}
        onCameraInitialized={markCameraInitialized}
      />
    </Canvas>
  );
}

function WarehouseRoom({
  layout,
  modelUrl,
  onModelRoomChange,
  racks,
  selectedCellId,
  targetCellId,
  occupiedCellIds,
  onCellSelect,
}: Pick<WarehouseSceneProps, "layout" | "racks" | "selectedCellId" | "targetCellId" | "onCellSelect"> & {
  occupiedCellIds: Set<number>;
  modelUrl?: string;
  onModelRoomChange: (room: WarehouseLayout["room"]) => void;
}) {
  const rackLayouts = useMemo(
    () => new Map(layout.racks.map((rackLayout) => [rackLayout.rackId, rackLayout])),
    [layout.racks],
  );

  return (
    <>
      <Grid
        args={[120, 120]}
        cellColor="#bec9d6"
        cellSize={1}
        cellThickness={0.45}
        fadeDistance={42}
        fadeStrength={1.35}
        followCamera={false}
        infiniteGrid
        position={[0, -0.13, 0]}
        sectionColor="#a9b7c7"
        sectionSize={5}
        sectionThickness={0.7}
      />

      {modelUrl ? (
        <Suspense fallback={null}>
          <WarehouseModel modelUrl={modelUrl} onRoomChange={onModelRoomChange} />
        </Suspense>
      ) : (
        <>
          <mesh position={[0, -0.055, 0]}>
            <boxGeometry args={[layout.room.width, 0.11, layout.room.length]} />
            <meshStandardMaterial color="#e5e9ee" roughness={0.88} />
          </mesh>

          {layout.walls.map((wall) => (
            <WarehouseWall key={wall.id} wall={wall} />
          ))}

          {layout.columns.map((column) => (
            <group key={column.id} position={[column.position.x, 0, column.position.z]}>
              <mesh position={[0, column.dimensions.height / 2, 0]}>
                <boxGeometry
                  args={[column.dimensions.width, column.dimensions.height, column.dimensions.depth]}
                />
                <meshStandardMaterial color="#aeb9c6" roughness={0.78} />
              </mesh>
              <mesh position={[0, 0.08, 0]}>
                <boxGeometry args={[column.dimensions.width + 0.08, 0.16, column.dimensions.depth + 0.08]} />
                <meshStandardMaterial color="#d4dbe3" roughness={0.7} />
              </mesh>
            </group>
          ))}
        </>
      )}

      {racks.map((rack) => {
        const rackLayout = rackLayouts.get(rack.id);
        if (!rackLayout) return null;
        return (
          <WarehouseRack
            key={rack.id}
            layout={rackLayout}
            rack={rack}
            selectedCellId={selectedCellId}
            targetCellId={targetCellId ?? null}
            occupiedCellIds={occupiedCellIds}
            onCellSelect={onCellSelect}
          />
        );
      })}
    </>
  );
}

function WarehouseModel({
  modelUrl,
  onRoomChange,
}: {
  modelUrl: string;
  onRoomChange: (room: WarehouseLayout["room"]) => void;
}) {
  const { scene } = useGLTF(modelUrl);
  const modelScene = useMemo(() => scene.clone(true), [scene]);

  useEffect(() => {
    const bounds = new THREE.Box3().setFromObject(modelScene);
    const size = bounds.getSize(new THREE.Vector3());
    if (size.x > 0 && size.y > 0 && size.z > 0) {
      onRoomChange({ width: size.x, height: size.y, length: size.z });
    }
  }, [modelScene, onRoomChange]);

  return <primitive object={modelScene} />;
}

function WarehouseWall({ wall }: { wall: WarehouseLayout["walls"][number] }) {
  const dx = wall.end.x - wall.start.x;
  const dz = wall.end.z - wall.start.z;
  const length = Math.hypot(dx, dz);
  const centerX = (wall.start.x + wall.end.x) / 2;
  const centerZ = (wall.start.z + wall.end.z) / 2;
  const rotationY = -Math.atan2(dz, dx);

  return (
    <group position={[centerX, wall.height / 2, centerZ]} rotation={[0, rotationY, 0]}>
      <mesh>
        <boxGeometry args={[length, wall.height, wall.thickness]} />
        <meshStandardMaterial
          color="#dce3eb"
          depthWrite={false}
          opacity={0.34}
          roughness={0.92}
          transparent
        />
      </mesh>
      <mesh position={[0, wall.height / 2 - 0.08, 0]}>
        <boxGeometry args={[length, 0.16, wall.thickness + 0.04]} />
        <meshStandardMaterial color="#c5d0dc" roughness={0.75} />
      </mesh>
    </group>
  );
}

function WarehouseRack({
  layout,
  rack,
  selectedCellId,
  targetCellId,
  occupiedCellIds,
  onCellSelect,
}: {
  layout: WarehouseLayout["racks"][number];
  rack: Rack;
  selectedCellId: number | null;
  targetCellId: number | null;
  occupiedCellIds: Set<number>;
  onCellSelect: (rack: Rack, cell: Cell) => void;
}) {
  const { width, depth, height } = layout.dimensions;
  const levelSpacing = rack.levels_count > 1 ? (height - 0.92) / (rack.levels_count - 1) : 0;
  const shelfY = (level: number) => getRackShelfY(level, levelSpacing);
  const bayWidth = width / rack.cells_per_level;

  return (
    <group
      position={[layout.position.x, layout.position.y, layout.position.z]}
      rotation={[0, THREE.MathUtils.degToRad(layout.rotation_y_deg), 0]}
    >
      <mesh position={[-width / 2 + 0.045, height / 2, -depth / 2 + 0.045]}>
        <boxGeometry args={[RACK_POST_WIDTH, height, RACK_POST_WIDTH]} />
        <meshStandardMaterial color="#526171" metalness={0.42} roughness={0.5} />
      </mesh>
      <mesh position={[width / 2 - 0.045, height / 2, -depth / 2 + 0.045]}>
        <boxGeometry args={[RACK_POST_WIDTH, height, RACK_POST_WIDTH]} />
        <meshStandardMaterial color="#526171" metalness={0.42} roughness={0.5} />
      </mesh>
      <mesh position={[-width / 2 + 0.045, height / 2, depth / 2 - 0.045]}>
        <boxGeometry args={[RACK_POST_WIDTH, height, RACK_POST_WIDTH]} />
        <meshStandardMaterial color="#526171" metalness={0.42} roughness={0.5} />
      </mesh>
      <mesh position={[width / 2 - 0.045, height / 2, depth / 2 - 0.045]}>
        <boxGeometry args={[RACK_POST_WIDTH, height, RACK_POST_WIDTH]} />
        <meshStandardMaterial color="#526171" metalness={0.42} roughness={0.5} />
      </mesh>

      {Array.from({ length: rack.cells_per_level + 1 }, (_, index) => {
        const dividerX = -width / 2 + index * bayWidth;
        return (
          <mesh
            key={`divider-${index}`}
            position={[dividerX, height / 2, -depth / 2 + 0.11]}
          >
            <boxGeometry args={[0.035, height - 0.18, 0.035]} />
            <meshStandardMaterial color="#8592a0" metalness={0.32} roughness={0.54} />
          </mesh>
        );
      })}

      {Array.from({ length: rack.levels_count }, (_, index) => {
        const level = index + 1;
        const y = shelfY(level);
        return (
          <group key={`level-${level}`}>
            <mesh position={[0, y, -depth / 2 + 0.03]}>
              <boxGeometry args={[width - 0.07, 0.095, 0.11]} />
              <meshStandardMaterial color="#bd7a42" metalness={0.15} roughness={0.62} />
            </mesh>
            <mesh position={[0, y, depth / 2 - 0.03]}>
              <boxGeometry args={[width - 0.07, 0.095, 0.11]} />
              <meshStandardMaterial color="#bd7a42" metalness={0.15} roughness={0.62} />
            </mesh>
            {Array.from({ length: rack.cells_per_level }, (_, bayIndex) => (
              <mesh
                key={`shelf-${level}-${bayIndex}`}
                position={[
                  -width / 2 + bayWidth * (bayIndex + 0.5),
                  y + SHELF_BOARD_CENTER_OFFSET,
                  0,
                ]}
              >
                <boxGeometry args={[bayWidth - 0.055, SHELF_BOARD_THICKNESS, depth - 0.12]} />
                <meshStandardMaterial color="#d7dee6" metalness={0.16} roughness={0.62} />
              </mesh>
            ))}
          </group>
        );
      })}

      <mesh position={[0, height * 0.48, -depth / 2 + 0.055]} rotation={[0, 0, -0.34]}>
        <boxGeometry args={[width * 0.85, 0.035, 0.035]} />
        <meshStandardMaterial color="#7c8997" metalness={0.35} roughness={0.55} />
      </mesh>
      <mesh position={[0, height * 0.48, -depth / 2 + 0.055]} rotation={[0, 0, 0.34]}>
        <boxGeometry args={[width * 0.85, 0.035, 0.035]} />
        <meshStandardMaterial color="#7c8997" metalness={0.35} roughness={0.55} />
      </mesh>

      <CellMarkers
        cells={rack.cells}
        cellsPerLevel={rack.cells_per_level}
        height={height}
        levelSpacing={levelSpacing}
        levelsCount={rack.levels_count}
        selectedCellId={selectedCellId}
        targetCellId={targetCellId}
        occupiedCellIds={occupiedCellIds}
        width={width}
        onCellSelect={(cell) => onCellSelect(rack, cell)}
      />

      <WarehouseRackLabel code={rack.code} height={height} />
    </group>
  );
}

function CellMarkers({
  cells,
  cellsPerLevel,
  width,
  height,
  levelSpacing,
  levelsCount,
  selectedCellId,
  targetCellId,
  occupiedCellIds,
  onCellSelect,
}: {
  cells: Cell[];
  cellsPerLevel: number;
  width: number;
  height: number;
  levelSpacing: number;
  levelsCount: number;
  selectedCellId: number | null;
  targetCellId: number | null;
  occupiedCellIds: Set<number>;
  onCellSelect: (cell: Cell) => void;
}) {
  const markersRef = useRef<THREE.InstancedMesh>(null);
  const hitTargetsRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const markerColor = useMemo(() => new THREE.Color(), []);
  const [hoveredCellId, setHoveredCellId] = useState<number | null>(null);
  const cellByInstance = useMemo(() => cells, [cells]);

  const updateInstances = useCallback(() => {
    const mesh = markersRef.current;
    const hitTargets = hitTargetsRef.current;
    if (!mesh && !hitTargets) return;
    const bayWidth = width / cellsPerLevel;

    cells.forEach((cell, index) => {
      const scale = cell.id === targetCellId ? 1.46 : cell.id === selectedCellId ? 1.34 : cell.id === hoveredCellId ? 1.2 : 1;
      const bayLeft = cell.position === 1
        ? -width / 2 + RACK_POST_WIDTH
        : -width / 2 + bayWidth * (cell.position - 1);
      const bayRight = cell.position === cellsPerLevel
        ? width / 2 - RACK_POST_WIDTH
        : -width / 2 + bayWidth * cell.position;
      const x = (bayLeft + bayRight) / 2;
      const cellBottom = getRackShelfY(cell.level, levelSpacing) +
        SHELF_BOARD_CENTER_OFFSET + SHELF_BOARD_THICKNESS / 2;
      const cellTop = cell.level < levelsCount
        ? getRackShelfY(cell.level + 1, levelSpacing) +
          SHELF_BOARD_CENTER_OFFSET - SHELF_BOARD_THICKNESS / 2
        : height - 0.12;
      const y = cellBottom + Math.max(0, cellTop - cellBottom) * 0.46;
      dummy.position.set(x, y, 0);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      mesh?.setMatrixAt(index, dummy.matrix);
      hitTargets?.setMatrixAt(index, dummy.matrix);
      markerColor.set(
        cell.id === targetCellId
          ? "#d97706"
          : cell.id === selectedCellId
            ? "#1d4ed8"
            : cell.id === hoveredCellId
            ? "#60a5fa"
            : occupiedCellIds.has(cell.id)
              ? "#3f9b72"
              : "#a1a1aa",
      );
      mesh?.setColorAt(index, markerColor);
    });

    if (mesh) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    if (hitTargets) hitTargets.instanceMatrix.needsUpdate = true;
  }, [cells, cellsPerLevel, dummy, height, hoveredCellId, levelSpacing, levelsCount, markerColor, occupiedCellIds, selectedCellId, targetCellId, width]);

  useLayoutEffect(updateInstances, [updateInstances]);

  const getCell = (instanceId: number | undefined) =>
    instanceId === undefined ? undefined : cellByInstance[instanceId];

  return (
    <>
      <instancedMesh
        args={[undefined, undefined, cells.length]}
        ref={markersRef}
      >
        <sphereGeometry args={[0.155, 16, 12]} />
        <meshStandardMaterial roughness={0.3} />
      </instancedMesh>
      <instancedMesh
        args={[undefined, undefined, cells.length]}
        onClick={(event) => {
          const cell = getCell(event.instanceId);
          if (!cell || event.delta > 8) return;
          event.stopPropagation();
          onCellSelect(cell);
        }}
        onPointerMove={(event) => {
          const cell = getCell(event.instanceId);
          if (cell) {
            event.stopPropagation();
            setHoveredCellId(cell.id);
          }
        }}
        onPointerOut={() => setHoveredCellId(null)}
        ref={hitTargetsRef}
      >
        <sphereGeometry args={[0.22, 12, 8]} />
        <meshBasicMaterial colorWrite={false} depthWrite={false} opacity={0} transparent />
      </instancedMesh>
    </>
  );
}

function WarehouseRackLabel({ code, height }: { code: string; height: number }) {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 96;
    const context = canvas.getContext("2d");
    if (context) {
      context.fillStyle = "#27313d";
      context.fillRect(4, 4, 248, 88);
      context.fillStyle = "#ffffff";
      context.font = "600 48px Inter, system-ui, sans-serif";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(code, 128, 49);
    }
    const nextTexture = new THREE.CanvasTexture(canvas);
    nextTexture.colorSpace = THREE.SRGBColorSpace;
    return nextTexture;
  }, [code]);

  useEffect(() => () => texture.dispose(), [texture]);

  return (
    <sprite position={[0, height + 0.48, 0]} renderOrder={4} scale={[1.12, 0.42, 1]}>
      <spriteMaterial depthTest={false} map={texture} toneMapped={false} transparent />
    </sprite>
  );
}

function WarehouseCameraControls({
  layout,
  racks,
  focusCellRequest,
  cameraInitVersion,
  onCameraInitialized,
  cameraApiRef,
}: Pick<WarehouseSceneProps, "layout" | "racks" | "focusCellRequest" | "cameraApiRef"> & {
  cameraInitVersion: number;
  onCameraInitialized: () => void;
}) {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const { camera } = useThree();
  const connectControls = useCallback((controls: OrbitControlsImpl | null) => {
    controlsRef.current = controls;
    if (!controls) {
      cameraApiRef.current = null;
      return;
    }
    cameraApiRef.current = {
      reset: () => controls.reset(),
      zoomIn: () => {
        controls.dollyOut(1.2);
        controls.update();
      },
      zoomOut: () => {
        controls.dollyIn(1.2);
        controls.update();
      },
      focusCell: (rackId, cellId) => {
        if (!(camera instanceof THREE.PerspectiveCamera)) return false;
        const point = getCellWorldPosition(layout, racks, rackId, cellId);
        if (!point) return false;

        const direction = camera.getWorldDirection(new THREE.Vector3());
        const depth = point.clone().sub(camera.position).dot(direction);
        if (depth <= 0) return false;

        const shift = point.sub(controls.target);
        camera.position.add(shift);
        controls.target.add(shift);
        controls.update();
        return true;
      },
    };
  }, [camera, cameraApiRef, layout, racks]);

  useEffect(() => {
    if (!focusCellRequest) return;
    cameraApiRef.current?.focusCell(focusCellRequest.rackId, focusCellRequest.cellId);
  }, [cameraApiRef, cameraInitVersion, focusCellRequest?.cellId, focusCellRequest?.rackId]);

  return (
    <>
      <OrbitControls
        enableDamping
        enablePan={false}
        makeDefault
        maxDistance={92}
        maxPolarAngle={Math.PI / 2 - 0.08}
        minDistance={12}
        minPolarAngle={0.22}
        ref={connectControls}
        target={[0, 1.35, 0]}
      />
      <InitialCamera
        layout={layout}
        controlsRef={controlsRef}
        onInitialized={onCameraInitialized}
      />
    </>
  );
}

function InitialCamera({
  layout,
  controlsRef,
  onInitialized,
}: {
  layout: WarehouseLayout;
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
  onInitialized: () => void;
}) {
  const { camera, size } = useThree();

  useEffect(() => {
    const target = new THREE.Vector3(0, 1.35, 0);
    const aspect = size.width / Math.max(size.height, 1);
    const fov = THREE.MathUtils.degToRad("fov" in camera ? camera.fov : 38);
    const tangent = Math.tan(fov / 2);
    const elevation = 0.58;
    const elevationAngle = Math.atan(elevation);
    const portrait = aspect < 0.82;
    const azimuth = THREE.MathUtils.degToRad(portrait ? 22 : 45);
    const horizontalSpan =
      layout.room.width * Math.sin(azimuth) + layout.room.length * Math.cos(azimuth);
    const verticalSpan =
      (layout.room.width * Math.cos(azimuth) + layout.room.length * Math.sin(azimuth)) *
        Math.sin(elevationAngle) +
      layout.room.height * Math.cos(elevationAngle);
    const viewDistance = Math.max(
      horizontalSpan / (2 * tangent * aspect),
      verticalSpan / (2 * tangent),
    ) * 1.12;
    const horizontalDistance = viewDistance * Math.cos(elevationAngle);

    camera.position.set(
      horizontalDistance * Math.cos(azimuth),
      horizontalDistance * elevation,
      horizontalDistance * Math.sin(azimuth),
    );
    camera.lookAt(target);
    const controls = controlsRef.current;
    if (controls) {
      controls.target.copy(target);
      controls.update();
      controls.saveState();
    }
    onInitialized();
  }, [camera, controlsRef, layout.room.height, layout.room.length, layout.room.width, onInitialized, size.height, size.width]);

  return null;
}

function getCellWorldPosition(
  layout: WarehouseLayout,
  racks: Rack[],
  rackId: number,
  cellId: number,
) {
  const rack = racks.find((candidate) => candidate.id === rackId);
  const rackLayout = layout.racks.find((candidate) => candidate.rackId === rackId);
  const cell = rack?.cells.find((candidate) => candidate.id === cellId);
  if (!rack || !rackLayout || !cell || rack.cells_per_level < 1) return null;

  const { width, height } = rackLayout.dimensions;
  const bayWidth = width / rack.cells_per_level;
  const bayLeft = cell.position === 1
    ? -width / 2 + RACK_POST_WIDTH
    : -width / 2 + bayWidth * (cell.position - 1);
  const bayRight = cell.position === rack.cells_per_level
    ? width / 2 - RACK_POST_WIDTH
    : -width / 2 + bayWidth * cell.position;
  const levelSpacing = rack.levels_count > 1 ? (height - 0.92) / (rack.levels_count - 1) : 0;
  const cellBottom = getRackShelfY(cell.level, levelSpacing) +
    SHELF_BOARD_CENTER_OFFSET + SHELF_BOARD_THICKNESS / 2;
  const cellTop = cell.level < rack.levels_count
    ? getRackShelfY(cell.level + 1, levelSpacing) + SHELF_BOARD_CENTER_OFFSET - SHELF_BOARD_THICKNESS / 2
    : height - 0.12;
  const localPosition = new THREE.Vector3(
    (bayLeft + bayRight) / 2,
    cellBottom + Math.max(0, cellTop - cellBottom) * 0.46,
    0,
  );
  localPosition.applyAxisAngle(
    new THREE.Vector3(0, 1, 0),
    THREE.MathUtils.degToRad(rackLayout.rotation_y_deg),
  );
  localPosition.add(new THREE.Vector3(
    rackLayout.position.x,
    rackLayout.position.y,
    rackLayout.position.z,
  ));
  return localPosition;
}
