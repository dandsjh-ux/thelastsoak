// Glossary, quiz and power comparison. Simple English, short sentences.

export const GLOSSARY = [
  { word: 'Explosion', meaning: 'A very fast burst of energy, with a loud bang and a strong push of air.' },
  { word: 'Explosive', meaning: 'A thing that can make an explosion.' },
  { word: 'Fragment', meaning: 'A small, fast piece of metal that flies out of an explosion.' },
  { word: 'Debris', meaning: 'Broken bits of things that fly around after an explosion.' },
  { word: 'Shockwave', meaning: 'A wall of pushed air that moves out from an explosion.' },
  { word: 'Blast radius', meaning: 'How far from the explosion the danger reaches.' },
  { word: 'Pressure', meaning: 'How hard the air pushes on something.' },
  { word: 'Heat flash', meaning: 'A burst of light and heat that can start fires.' },
  { word: 'Radiation', meaning: 'Invisible energy from a nuclear bomb. Thick, heavy materials block it.' },
  { word: 'Shelter', meaning: 'A safe place to stay, like a basement.' },
  { word: 'Absorb', meaning: 'To soak up energy, like a sponge soaks up water.' },
  { word: 'Durable', meaning: 'Strong, and it lasts. It does not break easily.' },
  { word: 'Fragile', meaning: 'Weak. It breaks easily.' },
];

// Each question: { q, options: [3 strings], answer: index of the right option, explain }
export const QUIZ = {
  1: [
    {
      q: 'What is the main danger from a hand grenade?',
      options: ['Radiation', 'Fast pieces of metal (fragments)', 'A huge fireball'],
      answer: 1,
      explain: 'Most of the danger from a grenade comes from fragments.',
    },
    {
      q: 'Which material is great at stopping fragments?',
      options: ['Sandbags', 'Pillows', 'Cardboard boxes'],
      answer: 0,
      explain: 'Sand soaks up the energy of fragments. Pillows and cardboard are too weak.',
    },
    {
      q: 'Fragments flew over your wall. What can you do?',
      options: ['Make the wall higher', 'Make the wall softer', 'Take the wall away'],
      answer: 0,
      explain: 'A higher wall catches fragments that fly up and over.',
    },
  ],
  2: [
    {
      q: 'How many hand grenades is a 25 kg box of TNT about the same as?',
      options: ['About 5', 'About 125', 'About 5,000'],
      answer: 1,
      explain: 'A grenade is about 0.2 kg. A 25 kg box is about 125 grenades.',
    },
    {
      q: 'Which blocks are best against a big shockwave?',
      options: ['Cardboard and pillows', 'Wooden planks', 'Heavy concrete and steel'],
      answer: 2,
      explain: 'Heavy, thick and strong blocks can take a big push of air.',
    },
    {
      q: 'You stand twice as far from a shockwave. What happens?',
      options: ['It is much weaker', 'It is the same', 'It is stronger'],
      answer: 0,
      explain: 'Distance helps a lot. Twice as far means a much weaker shockwave.',
    },
  ],
  3: [
    {
      q: 'Which threat comes from all around, not just from one side?',
      options: ['Fragments', 'Radiation', 'Heat flash'],
      answer: 1,
      explain: 'Radiation comes from all around, so walls on one side are not enough.',
    },
    {
      q: 'Which material is very good against radiation?',
      options: ['Reflective foil', 'Cardboard', 'Thick concrete or earth'],
      answer: 2,
      explain: 'Thick, heavy materials like concrete, earth and lead block radiation.',
    },
    {
      q: 'What is the official safety advice for a nuclear bomb?',
      options: ['Go in, stay in, tune in', 'Run toward it', 'Stand by a window'],
      answer: 0,
      explain: 'Go inside, stay inside, and listen to the radio or TV for news.',
    },
  ],
};

// Power chart (use a log scale). `grenades` = how many grenades it equals.
export const COMPARE = [
  { id: 'grenade', levelId: 1, name: 'Hand grenade', icon: '💣', kg: 0.2, grenades: 1, line: 'Our smallest explosion. We compare the others to it.' },
  { id: 'tnt', levelId: 2, name: 'TNT box', icon: '🧨', kg: 25, grenades: 125, line: 'TNT box = about 125 grenades' },
  {
    id: 'nuclear', levelId: 3, name: 'Nuclear bomb', icon: '☢️', kg: 15000000, grenades: 75000000,
    line: 'Nuclear bomb = about 75 million grenades',
  },
];
