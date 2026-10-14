// Mossbottom Manor layout: a 3×3 grid of rooms, foyer in the middle,
// garden + pond along the south side. Shared by server (hearing) and client (3D).

export const CELL = 6; // world units per room

// Hearing ratios from the design doc.
export const HEAR = {
  adjacent: 0.65,
  diagonal: 0.5,
  far: 0.35,
  station: 1,
};

/** Fraction of answer words a listener in roomA hears from roomB. */
export function hearingRatio(cellA, cellB) {
  const dx = Math.abs(cellA[0] - cellB[0]);
  const dz = Math.abs(cellA[1] - cellB[1]);
  if (dx + dz === 1) return HEAR.adjacent;
  if (dx === 1 && dz === 1) return HEAR.diagonal;
  return HEAR.far;
}

/** Centre of a cell in world space (x east, z south). */
export function cellCenter([cx, cz]) {
  return { x: (cx - 1) * CELL, z: (cz - 1) * CELL };
}

/** Grid path (orthogonal steps) between two cells, inclusive of both ends. */
export function cellPath(from, to) {
  const path = [from.slice()];
  const cur = from.slice();
  // Always route through the foyer column/row so the corgi walks the hallways.
  while (cur[0] !== to[0] || cur[1] !== to[1]) {
    if (cur[1] !== 1 && cur[0] !== to[0]) cur[1] += cur[1] < 1 ? 1 : -1;
    else if (cur[0] !== to[0]) cur[0] += cur[0] < to[0] ? 1 : -1;
    else cur[1] += cur[1] < to[1] ? 1 : -1;
    path.push(cur.slice());
  }
  return path;
}
