import type { Rack } from "@/features/warehouse/types";

type CellOverride = { id: number; number: number; level: number; position: number };

function createCells(
  rackId: number,
  cellsPerLevel: number,
  overrides: CellOverride[] = [],
  missing: Array<{ level: number; position: number }> = [],
) {
  const cells = [];

  for (let level = 1; level <= 3; level += 1) {
    for (let position = 1; position <= cellsPerLevel; position += 1) {
      if (missing.some((slot) => slot.level === level && slot.position === position)) continue;
      const override = overrides.find((cell) => cell.level === level && cell.position === position);
      const slotNumber = (level - 1) * cellsPerLevel + position;
      cells.push({
        id: override?.id ?? rackId * 1000 + slotNumber,
        number: override?.number ?? slotNumber,
        level,
        position,
      });
    }
  }

  return cells;
}

const layoutRackTemplates = [
  { cells_per_level: 4, missing: [] },
  { cells_per_level: 4, missing: [] },
  { cells_per_level: 4, missing: [] },
  { cells_per_level: 3, missing: [] },
  { cells_per_level: 3, missing: [] },
  { cells_per_level: 3, missing: [{ level: 3, position: 2 }] },
] as const;

const rackSets: Record<number, Rack[]> = {
  1: createRackSet(
    [11, 12, 13, 14, 15, 16],
    ["A-01", "A-02", "A-03", "B-01", "B-02", "C-01"],
    [
      [{ id: 111, number: 4, level: 2, position: 1 }],
      [{ id: 121, number: 2, level: 1, position: 3 }],
      [{ id: 131, number: 5, level: 2, position: 3 }],
      [{ id: 141, number: 8, level: 1, position: 2 }],
      [{ id: 151, number: 9, level: 3, position: 1 }],
      [{ id: 161, number: 3, level: 2, position: 3 }],
    ],
  ),
  2: createRackSet(
    [21, 22, 23, 24, 25, 26],
    ["B-04", "B-05", "B-06", "C-02", "C-03", "C-04"],
    [
      [{ id: 211, number: 7, level: 1, position: 2 }],
      [{ id: 221, number: 3, level: 2, position: 2 }],
      [],
      [],
      [],
      [],
    ],
  ),
  3: createRackSet(
    [31, 32, 33, 34, 35, 36],
    ["C-03", "C-04", "C-05", "D-01", "D-02", "D-03"],
    [[{ id: 311, number: 9, level: 3, position: 1 }], [], [], [], [], []],
  ),
  4: createRackSet(
    [41, 42, 43, 44, 45, 46],
    ["D-01", "D-02", "D-03", "E-01", "E-02", "E-03"],
    [[{ id: 411, number: 1, level: 1, position: 1 }], [], [], [], [], []],
  ),
};

function createRackSet(ids: number[], codes: string[], overrides: CellOverride[][]): Rack[] {
  return layoutRackTemplates.map((template, index) => {
    const id = ids[index];
    const cellsPerLevel = template.cells_per_level;
    return {
      id,
      code: codes[index],
      levels_count: 3,
      cells_per_level: cellsPerLevel,
      cells: createCells(id, cellsPerLevel, overrides[index], [...template.missing]),
    };
  });
}

export function getMockRacks(warehouseId: number): Rack[] {
  return rackSets[warehouseId] ?? [];
}

export const mockRacks: Rack[] = rackSets[1];
