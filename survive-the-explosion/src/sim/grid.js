// Grid constants and helpers shared by the simulation and the client.
// Units are metres. Ground plane y = 0. North is -z. The house is centred on the origin.

export const GRID = 20; // 20 x 20 cells
export const CELL = 1; // one cell = 1 m
export const MAX_STACK = 3; // layers 0, 1, 2 (each 1 m tall)
export const HOUSE = { gx0: 8, gz0: 8, size: 4, height: 3 }; // cells 8..11 x 8..11

export function cellToWorld(gx, gz) {
  return { x: gx - GRID / 2 + 0.5, z: gz - GRID / 2 + 0.5 };
}

export function worldToCell(x, z) {
  return { gx: Math.floor(x + GRID / 2), gz: Math.floor(z + GRID / 2) };
}

export function inGrid(gx, gz) {
  return Number.isInteger(gx) && Number.isInteger(gz) && gx >= 0 && gz >= 0 && gx < GRID && gz < GRID;
}

export function isHouseCell(gx, gz) {
  return (
    gx >= HOUSE.gx0 && gx < HOUSE.gx0 + HOUSE.size && gz >= HOUSE.gz0 && gz < HOUSE.gz0 + HOUSE.size
  );
}

// Can a block be put on this cell? Not outside the yard, not on the house,
// and not inside the clear zone around a point blast.
export function canBuildAt(level, gx, gz) {
  if (!inGrid(gx, gz) || isHouseCell(gx, gz)) return false;
  const b = level && level.blast;
  if (b && b.type === 'point') {
    const c = cellToWorld(gx, gz);
    const d = Math.hypot(c.x - b.x, c.z - b.z);
    if (d < (b.clearRadius || 0)) return false;
  }
  return true;
}
