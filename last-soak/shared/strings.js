// Text that lives in code rather than in the scenario file, at two reading levels.
// Used by the server (toasts) and the client (panels, hints, card headings).
//
//   standard  the original wording (kept word for word)
//   rookie    Year 6 reading level: short, simple sentences. Anything not listed under
//             `rookie` falls back to the standard text, because it is already simple.

export const MODES = ['standard', 'rookie'];
export const DEFAULT_MODE = 'standard';

export const MODE_INFO = {
  standard: {
    label: 'Standard',
    note: 'The full story, with richer words and longer lines.',
  },
  rookie: {
    label: '🎒 Rookie Mode',
    note: 'The same game for Year 6 readers: short, simple sentences and clearer reasons for what everyone does.',
  },
};

const standard = {
  // server toasts
  stationToast: "You've been taken to the station. You can hear everything clearly now.",
  whisperToast: 'You hear faint whispering somewhere in the mansion…',

  // lobby + offer
  lobbyHintHost: (n, hasLead) =>
    `${n} players. Choose roles (up to 2 detectives and 2 murderers), or leave them on 🎲 Random.${hasLead ? '' : ' A random player gets offered the lead detective badge.'}`,
  offerText: "Chief Inspector Prickles needs someone to crack the case of Mr. Dan's last soak.",

  // HUD + panels
  briefingBanner: (time) => `📞 The detective is on the phone with the Chief… (starts in ≤ ${time})`,
  answerNote: '<b>[S]</b> lines cost your <b>Secret Kept</b> badge. Confessing is not an arrest.',
  tagLegend: '',
  stationStatus: "🚓 You're at the station. You hear everything clearly now, but you can't answer.",
  logEmptySuspect: "Snippets of every interrogation drift through the walls. They'll show up here.",
  logEmptyDetective: 'Answers you hear will be noted here.',
  whisperClosed: 'No whispering from the station.',

  // story card
  headWho: 'Who you are',
  headWithDan: 'You and Mr. Dan',
  headMotive: 'Your motive',
  headEvening: 'Your evening',
  labelSecret: 'Your secret [S]:',
  headWatchOut: 'Watch out',
  headGoal: 'Goal',
  headGossip: 'Useful gossip',
  labelPartner: 'Your partner in crime:',
  partnerNote: 'Use the 🤫 whisper chat to keep your stories straight.',
  headToast: 'The toast (everyone knows)',

  // case file + reveal
  caseToast: 'The toast',
  whodunit: 'Whodunit',
};

const rookie = {
  stationToast: 'You are at the police station now. You can hear everything clearly.',
  whisperToast: 'You hear quiet whispering somewhere in the manor…',

  lobbyHintHost: (n, hasLead) =>
    `${n} players. Pick roles (up to 2 detectives and 2 murderers) or leave everyone on 🎲 Random.${hasLead ? '' : ' Nobody is the lead detective yet. A random player will be asked.'}`,
  offerText: "Chief Inspector Prickles needs a detective to solve the case of Mr. Dan's last soak.",

  briefingBanner: (time) => `📞 The detective is on the phone with the Chief… (starts in ${time} or less)`,
  answerNote:
    '<b>[S]</b> lines give away your secret, so you lose your <b>Secret Kept</b> badge. If you confess, you are not arrested. The detective still has to ACCUSE you.',
  tagLegend: '<b>T</b> = Truth · <b>L</b> = Lie · <b>D</b> = Dodge (avoid the question) · <b>S</b> = Secret',
  stationStatus: '🚓 You are at the police station. You can hear everything clearly, but you cannot answer.',
  logEmptySuspect: 'You will hear bits of every interview through the walls. They will show up here.',
  logEmptyDetective: 'Answers you hear will be saved here.',
  whisperClosed: 'You cannot whisper from the station.',

  headWho: 'Who you are',
  headWithDan: 'You and Mr. Dan',
  headMotive: 'Your motive (why you might be angry with him)',
  headEvening: 'Your evening',
  labelSecret: 'Your secret [S]:',
  headWatchOut: 'What could give you away',
  headGoal: 'Your goal',
  headGossip: 'Things you know about other people',
  labelPartner: 'Your partner in crime:',
  partnerNote: 'Use the 🤫 whisper chat to tell the same story.',
  headToast: "Mr. Dan's speech (everyone heard it)",

  caseToast: "Mr. Dan's speech",
  whodunit: 'Who did it',
};

/** A lookup for one mode: t('key', ...args). Functions are called with the args. */
export function makeT(mode = DEFAULT_MODE) {
  const table = mode === 'rookie' ? { ...standard, ...rookie } : standard;
  return (key, ...args) => {
    const v = table[key];
    if (v === undefined) return key;
    return typeof v === 'function' ? v(...args) : v;
  };
}

export const isMode = (m) => MODES.includes(m);
