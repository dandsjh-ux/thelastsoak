// The three levels. Threat powers are in "sim units" at the yard (see src/sim/blast.js).
// For a point blast, `threats` is the power measured 5 m from the blast.
// `limits` is the most of each threat that may reach the house for the house to be safe.
// `dangerRadius` / `dangerRadiusOuter` (metres) are for the faint danger circles in the client:
//   inner = very dangerous, outer = still dangerous.

export const LEVELS = [
  {
    id: 1,
    key: 'grenade',
    name: 'Level 1: Hand grenade',
    difficulty: 'Easy',
    icon: '💣',
    budget: 100,
    tntKg: 0.2,
    blast: { type: 'point', x: 0, z: -7, clearRadius: 2.5 },
    dangerRadius: 5,
    dangerRadiusOuter: 15,
    threats: { fragments: 6, blast: 2 },
    limits: { fragments: 1.0, blast: 1.2 },
    waveSpeed: 25,
    facts: [
      'A hand grenade is small, but it throws out fast pieces of metal. They are called fragments.',
      'It is very dangerous within about 5 metres. It is still dangerous up to about 15 metres.',
      'Most of the danger comes from fragments. Sandbags are great at stopping them.',
    ],
    winTip: 'Well done! Sand soaks up fragments. A wall close to the grenade stops the most pieces.',
    loseTips: {
      fragments:
        'Fragments got through. Build a wall between the grenade and the house. Sandbags are great at stopping fragments.',
      blast: 'The shockwave pushed too hard. Use heavier blocks, like sandbags or bricks.',
      heat: 'Heat got through. Water and thick walls help against heat.',
      radiation: 'Radiation got through. Thick, heavy walls help.',
    },
  },
  {
    id: 2,
    key: 'tnt',
    name: 'Level 2: TNT',
    difficulty: 'Medium',
    icon: '🧨',
    budget: 300,
    tntKg: 25,
    blast: { type: 'point', x: 0, z: -8, clearRadius: 2.5 },
    dangerRadius: 25,
    dangerRadiusOuter: 75,
    threats: { blast: 60, fragments: 4 },
    limits: { blast: 5, fragments: 0.9 },
    waveSpeed: 40,
    facts: [
      'Scientists measure other explosions in "tonnes of TNT". TNT is the measuring stick.',
      'The shockwave moves faster than sound.',
      'A big shockwave can smash windows and knock down walls.',
      'Heavy, thick materials and distance help the most.',
      'If you are twice as far away, the shockwave is much weaker.',
      'This box of TNT is about 125 hand grenades.',
    ],
    winTip: 'Great work! Heavy, thick blocks like concrete and steel can take a big shockwave.',
    loseTips: {
      fragments: 'Pieces of debris got through. Build a tall wall between the TNT and the house.',
      blast:
        'The shockwave broke through. Use heavy, strong blocks like concrete and steel. Two rows are better than one.',
      heat: 'Heat got through. Water and thick walls help against heat.',
      radiation: 'Radiation got through. Thick, heavy walls help.',
    },
  },
  {
    id: 3,
    key: 'nuke',
    name: 'Level 3: Nuclear bomb',
    difficulty: 'Hard',
    icon: '☢️',
    budget: 700,
    tntKg: 15000000,
    blast: { type: 'far', dirX: 0, dirZ: 1, distanceM: 3000 },
    threats: { heat: 10, blast: 40, radiation: 10 },
    limits: { heat: 3.6, blast: 9, radiation: 1.3 },
    waveSpeed: 60,
    facts: [
      'The energy of a nuclear bomb comes from splitting atoms.',
      'The Hiroshima bomb in 1945 was about 15,000 tonnes of TNT.',
      'It makes a flash of heat and light, a huge shockwave, and radiation.',
      'Close to a nuclear bomb nothing can survive. Our house is 3 km away.',
      'Thick concrete, earth and basements block radiation.',
      'The official safety advice is "Go in, stay in, tune in".',
      'In 1945 many people died. This is why countries work to stop nuclear weapons.',
    ],
    note: 'Close to a nuclear bomb nothing can survive. Our house is 3 km away.',
    winTip: 'Excellent! Thick walls, a basement and earth on the roof keep radiation out.',
    loseTips: {
      fragments: 'Pieces of debris got through. Build a tall wall on the north side.',
      blast: 'The shockwave was too strong. Use thick concrete or earth, and add a basement.',
      heat: 'The heat flash got through. Reflective foil and thick walls block heat. The roof needs help too.',
      radiation:
        'Radiation got through. It comes from all around. Build thick walls on every side, and add a basement and earth on the roof.',
    },
  },
];

export function getLevel(id) {
  return LEVELS.find((l) => l.id === id || l.key === id) || null;
}
