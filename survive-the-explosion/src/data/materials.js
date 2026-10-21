// Threats and materials. Resistance numbers are 0..10 (shown to students as 0..5 bars).
// A block lets through (1 - resist / 10) of a threat's energy (never less than 2 percent).
// For the shockwave, `hp` is how much blast energy a block can take before it breaks.

export const THREATS = {
  fragments: {
    id: 'fragments',
    name: 'Fragments',
    icon: '🔩',
    short: 'Small pieces of metal that fly out very fast.',
  },
  blast: {
    id: 'blast',
    name: 'Shockwave',
    icon: '💨',
    short: 'A wall of pushed air that hits like a giant hand.',
  },
  heat: {
    id: 'heat',
    name: 'Heat flash',
    icon: '🔥',
    short: 'A burst of light and heat that can start fires.',
  },
  radiation: {
    id: 'radiation',
    name: 'Radiation',
    icon: '☢️',
    short: 'Invisible energy that can make people sick. Thick, heavy materials block it.',
  },
};

export const MATERIALS = [
  // ---- Level 1 ----
  {
    id: 'pillow', name: 'Pillows', emoji: '🛏️', color: 0xf48fb1, cost: 2, unlockLevel: 1, kind: 'block',
    resist: { blast: 1, fragments: 1, heat: 1, radiation: 0 }, hp: 4,
    fact: 'Pillows are soft and funny, but they do not stop fragments at all.',
  },
  {
    id: 'cardboard', name: 'Cardboard boxes', emoji: '📦', color: 0xc9a26b, cost: 3, unlockLevel: 1, kind: 'block',
    resist: { blast: 1, fragments: 2, heat: 1, radiation: 0 }, hp: 6,
    fact: 'Cardboard is very weak. Fragments go straight through it.',
  },
  {
    id: 'wood', name: 'Wooden planks', emoji: '🪵', color: 0x9c6b3f, cost: 5, unlockLevel: 1, kind: 'block',
    resist: { blast: 2, fragments: 4, heat: 2, radiation: 1 }, hp: 20,
    fact: 'Wood stops small fragments a little, but it burns and a shockwave can break it.',
  },
  {
    id: 'sandbag', name: 'Sandbags', emoji: '🎒', color: 0xd9c38a, cost: 8, unlockLevel: 1, kind: 'block',
    resist: { blast: 3, fragments: 9, heat: 5, radiation: 4 }, hp: 30,
    fact: 'Sand soaks up the energy of fragments. Sandbags are great at stopping them.',
  },
  {
    id: 'brick', name: 'Bricks', emoji: '🧱', color: 0xb5523b, cost: 10, unlockLevel: 1, kind: 'block',
    resist: { blast: 5, fragments: 7, heat: 6, radiation: 4 }, hp: 34,
    fact: 'Bricks are good all round, but they can crack in a strong shockwave.',
  },
  // ---- Level 2 ----
  {
    id: 'water', name: 'Water barrels', emoji: '🛢️', color: 0x4aa3df, cost: 12, unlockLevel: 2, kind: 'block',
    resist: { blast: 3, fragments: 6, heat: 8, radiation: 3 }, hp: 36,
    fact: 'Water soaks up fragments and heat very well.',
  },
  {
    id: 'concrete', name: 'Concrete blocks', emoji: '⬜', color: 0xa7a9ac, cost: 16, unlockLevel: 2, kind: 'block',
    resist: { blast: 8, fragments: 8, heat: 7, radiation: 6 }, hp: 110,
    fact: 'Concrete is strong and heavy. It is very good against a shockwave.',
  },
  {
    id: 'steel', name: 'Steel plates', emoji: '🔩', color: 0x6c7a89, cost: 22, unlockLevel: 2, kind: 'block',
    resist: { blast: 8, fragments: 10, heat: 6, radiation: 2 }, hp: 150,
    fact: 'Steel is the best at stopping fragments. It is thin, so it is weak against radiation.',
  },
  {
    id: 'windows', name: 'Board up windows', emoji: '🪟', color: 0x8d6e63, cost: 20, unlockLevel: 2, kind: 'upgrade',
    resist: { blast: 3, fragments: 3, heat: 3, radiation: 0 }, hp: 0,
    fact: 'Boards stop glass from breaking. This helps against a shockwave and heat.',
  },
  // ---- Level 3 ----
  {
    id: 'earth', name: 'Packed earth', emoji: '🟫', color: 0x7a5230, cost: 10, unlockLevel: 3, kind: 'block',
    resist: { blast: 7, fragments: 7, heat: 7, radiation: 8 }, hp: 100,
    fact: 'Earth is cheap and heavy. It is very good against radiation and a shockwave.',
  },
  {
    id: 'thickconcrete', name: 'Thick concrete', emoji: '🏛️', color: 0x8e9196, cost: 30, unlockLevel: 3, kind: 'block',
    resist: { blast: 10, fragments: 10, heat: 9, radiation: 9 }, hp: 260,
    fact: 'Thick concrete is very strong against everything.',
  },
  {
    id: 'lead', name: 'Lead sheets', emoji: '⬛', color: 0x4b4f58, cost: 40, unlockLevel: 3, kind: 'block',
    resist: { blast: 6, fragments: 8, heat: 5, radiation: 10 }, hp: 80,
    fact: 'Lead is the best at blocking radiation, but it is expensive.',
  },
  {
    id: 'foil', name: 'Reflective foil', emoji: '✨', color: 0xe8eef2, cost: 6, unlockLevel: 3, kind: 'block',
    resist: { blast: 0, fragments: 0, heat: 10, radiation: 0 }, hp: 5,
    fact: 'Shiny foil reflects the heat flash. It does nothing against anything else.',
  },
  {
    id: 'basement', name: 'Basement shelter', emoji: '🕳️', color: 0x5d4037, cost: 150, unlockLevel: 3, kind: 'upgrade',
    resist: { blast: 6, fragments: 6, heat: 0, radiation: 9 }, hp: 0,
    fact: 'An underground room has earth all around it. It helps a lot against radiation and a shockwave.',
  },
  {
    id: 'roof', name: 'Earth on the roof', emoji: '🏠', color: 0x6d4c2f, cost: 80, unlockLevel: 3, kind: 'upgrade',
    resist: { blast: 0, fragments: 0, heat: 4, radiation: 7 }, hp: 0,
    fact: 'A thick layer of earth on the roof blocks radiation that comes from above.',
  },
];

export function getMaterial(id) {
  return MATERIALS.find((m) => m.id === id) || null;
}

export function materialsForLevel(levelId) {
  return MATERIALS.filter((m) => m.unlockLevel <= levelId);
}
