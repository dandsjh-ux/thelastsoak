// Full screens: title, how to play, words, level select, briefing, results, quiz, final.
import { h, fmtKg } from './dom.js';
import { LEVELS } from '../data/levels.js';
import { MATERIALS, THREATS, getMaterial } from '../data/materials.js';
import { GLOSSARY, QUIZ, COMPARE } from '../data/facts.js';
import { getStars, isUnlocked, isTeacher, setTeacher } from './progress.js';

const hex = (n) => '#' + n.toString(16).padStart(6, '0');

export function stars(n, total = 3) {
  return h('span', { class: 'stars', 'aria-label': `${n} of ${total} stars` },
    Array.from({ length: total }, (_, i) => h('span', { class: i < n ? 'star on' : 'star' }, '★')));
}

function btn(label, onClick, cls = '') {
  return h('button', { class: 'btn ' + cls, type: 'button', onclick: onClick }, label);
}

function screen(cls, ...kids) {
  return h('div', { class: 'screen ' + cls }, ...kids);
}

// ------------------------------------------------------------ logo
function houseSvg() {
  return h('div', {
    class: 'logo-house',
    html: `<svg viewBox="0 0 200 150" width="100%" aria-hidden="true">
      <ellipse cx="100" cy="140" rx="86" ry="9" fill="rgba(0,0,0,.14)"/>
      <rect x="40" y="62" width="120" height="76" rx="6" fill="#fff0cf" stroke="#c9a76a" stroke-width="4"/>
      <polygon points="26,66 100,12 174,66" fill="#d9453b" stroke="#a52e26" stroke-width="4" stroke-linejoin="round"/>
      <rect x="132" y="22" width="16" height="30" fill="#b3532f"/>
      <rect x="58" y="88" width="30" height="50" rx="4" fill="#b5651d"/>
      <circle cx="80" cy="114" r="3" fill="#ffd34d"/>
      <rect x="104" y="82" width="42" height="34" rx="4" fill="#ffd98a" stroke="#7b4a24" stroke-width="4"/>
      <ellipse cx="118" cy="104" rx="10" ry="8" fill="#b98a55"/><circle cx="114" cy="101" r="1.8" fill="#2b1b10"/><circle cx="122" cy="101" r="1.8" fill="#2b1b10"/>
      <ellipse cx="136" cy="108" rx="6" ry="5" fill="#b98a55"/>
      <path d="M92 40 l6 -10 l5 8 l8 -6 l-3 13z" fill="#ffd23f" stroke="#ff8a1f" stroke-width="2"/>
    </svg>`,
  });
}

// ------------------------------------------------------------ title
export function titleScreen({ onPlay, onHow, onWords }) {
  return screen('title',
    h('div', { class: 'title-card' },
      houseSvg(),
      h('h1', { class: 'logo' }, h('span', { text: 'Survive' }), h('span', { text: 'The Explosion' })),
      h('p', { class: 'tagline' }, 'Build a safe shelter for the capybara family!'),
      h('div', { class: 'title-buttons' },
        btn('▶ Play', onPlay, 'big primary'),
        btn('How to play', onHow, 'soft'),
        btn('Words to know', onWords, 'soft'))));
}

// ------------------------------------------------------------ how to play
export function howToScreen({ onBack, onTeacher }) {
  const sw = h('input', { type: 'checkbox', id: 'teacher-sw' });
  sw.checked = isTeacher();
  sw.addEventListener('change', () => { setTeacher(sw.checked); if (onTeacher) onTeacher(sw.checked); });
  const keys = [
    ['Walk', 'W A S D or arrow keys', 'Joystick (bottom left)'],
    ['Place a block', 'Space, Enter, or click a square', 'Place button, or tap a square'],
    ['Remove top block', 'X, Backspace, or right-click', 'Remove button'],
    ['Pick a material', '1 to 9, or click a card', 'Tap a card'],
    ['Turn the camera', 'Q and E, or drag the mouse', 'Drag with one finger'],
    ['Zoom', 'Mouse wheel, or Z and C', 'Pinch'],
    ['Start the explosion', 'R', 'Ready! button'],
  ];
  return screen('howto',
    h('div', { class: 'card wide' },
      h('h2', {}, 'How to play'),
      h('ol', { class: 'steps' },
        h('li', {}, h('b', {}, 'Learn. '), 'Read how strong the explosion is and what dangers it makes.'),
        h('li', {}, h('b', {}, 'Build. '), 'Use your coins to build walls around the house. Stack blocks up to 3 high.'),
        h('li', {}, h('b', {}, 'Boom! '), 'Press Ready! and watch the explosion. Nobody is hurt in this game.'),
        h('li', {}, h('b', {}, 'Check. '), 'Is the house safe? Try again with a better plan, then do the quiz.')),
      h('div', { class: 'keytable' },
        h('div', { class: 'kt head' }, h('span', {}, 'Action'), h('span', {}, 'Keyboard and mouse'), h('span', {}, 'Touch')),
        keys.map(([a, k, t]) => h('div', { class: 'kt' }, h('b', {}, a), h('span', {}, k), h('span', {}, t)))),
      h('label', { class: 'teacher', for: 'teacher-sw' }, sw, h('span', {}, ' Teacher mode: unlock all levels')),
      h('p', { class: 'small' }, 'This is a game. Real explosions are very dangerous. If you ever see something dangerous, stay far away and tell an adult.'),
      h('div', { class: 'row' }, btn('← Back', onBack, 'soft'))));
}

// ------------------------------------------------------------ glossary
export function glossaryScreen({ onBack }) {
  return screen('glossary',
    h('div', { class: 'card wide' },
      h('h2', {}, 'Words to know'),
      h('div', { class: 'gloss' },
        GLOSSARY.map((g) => h('div', { class: 'gl' }, h('b', {}, g.word), h('span', {}, g.meaning)))),
      h('div', { class: 'row' }, btn('← Back', onBack, 'soft'))));
}

// ------------------------------------------------------------ level select
export function levelSelectScreen({ onPick, onBack }) {
  return screen('levels',
    h('div', { class: 'card wide' },
      h('h2', {}, 'Choose a level'),
      h('div', { class: 'level-cards' },
        LEVELS.map((lv) => {
          const open = isUnlocked(lv.id);
          const s = getStars(lv.id);
          return h('button', {
            class: 'level-card d-' + lv.difficulty.toLowerCase() + (open ? '' : ' locked'),
            type: 'button', disabled: !open, onclick: () => onPick(lv),
            'data-level': lv.id,
          },
            h('div', { class: 'lc-icon' }, lv.icon),
            h('div', { class: 'lc-name' }, lv.name.replace(/^Level \d: /, '')),
            h('div', { class: 'lc-diff' }, lv.difficulty),
            h('div', { class: 'lc-budget' }, `🪙 ${lv.budget} coins`),
            stars(s),
            !open && h('div', { class: 'lock' }, '🔒 Pass the last level first'));
        })),
      h('div', { class: 'row' }, btn('← Back', onBack, 'soft'))));
}

// ------------------------------------------------------------ power chart
export function powerChart(highlightLevelId) {
  const lo = -1.5, hi = 7.5;
  const rows = COMPARE.map((r) => {
    const pct = Math.max(5, Math.min(100, ((Math.log10(r.kg) - lo) / (hi - lo)) * 100)) * 0.68;
    const cur = r.levelId === highlightLevelId;
    return h('div', { class: 'bar-row' + (cur ? ' current' : '') },
      h('div', { class: 'bar-label' }, h('span', { class: 'bi' }, r.icon), ' ', r.name),
      h('div', { class: 'bar-track' }, h('div', { class: 'bar-fill', style: { width: pct + '%' } },
        h('span', {}, fmtKg(r.kg)))),
      h('div', { class: 'bar-line' }, r.line));
  });
  return h('div', { class: 'chart' },
    h('div', { class: 'chart-title' }, 'How strong is it?'),
    rows,
    h('div', { class: 'chart-note' }, 'Each step on this chart is 10 times bigger. The nuclear bar would be too long to draw on a normal chart!'));
}

// ------------------------------------------------------------ briefing
export function threatChips(level) {
  return Object.keys(level.threats).map((id) => {
    const t = THREATS[id];
    return h('div', { class: 'threat' }, h('span', { class: 'ti' }, t.icon), h('div', {}, h('b', {}, t.name), h('span', {}, t.short)));
  });
}

export function briefingScreen({ level, onStart, onBack }) {
  const fresh = MATERIALS.filter((m) => m.unlockLevel === level.id);
  return screen('briefing',
    h('div', { class: 'card wide' },
      h('div', { class: 'brief-head' },
        h('div', { class: 'big-icon' }, level.icon),
        h('div', {}, h('h2', {}, level.name), h('div', { class: 'sub' }, `${level.difficulty} · 🪙 ${level.budget} coins to spend`))),
      h('div', { class: 'brief-grid' },
        h('div', { class: 'col' },
          powerChart(level.id),
          level.note && h('div', { class: 'note' }, '⚠️ ' + level.note)),
        h('div', { class: 'col' },
          h('h3', {}, 'Facts'),
          h('ul', { class: 'facts' }, level.facts.map((f) => h('li', {}, f))),
          h('h3', {}, 'Dangers in this level'),
          h('div', { class: 'threats' }, threatChips(level)),
          h('h3', {}, level.id === 1 ? 'Your materials' : 'New materials!'),
          h('div', { class: 'chips' }, fresh.map((m) => h('span', { class: 'chip', style: { borderColor: hex(m.color) } }, `${m.emoji} ${m.name} · 🪙${m.cost}`))))),
      h('div', { class: 'row' }, btn('← Back', onBack, 'soft'), btn('Start building →', onStart, 'big primary'))));
}

// ------------------------------------------------------------ results
export function resultsPanel({ level, result, brokenSummary, hasNext, onTry, onQuiz, onLevels }) {
  const ok = result.survived;
  const rows = Object.keys(level.threats).map((id) => {
    const t = THREATS[id], r = result.threats[id];
    return h('div', { class: 'tr ' + (r.safe ? 'good' : 'bad') },
      h('span', { class: 'ti' }, t.icon),
      h('span', { class: 'tn' }, t.name),
      h('span', { class: 'bar-mini' }, h('i', { style: { width: r.blockedPct + '%' } })),
      h('span', { class: 'tp' }, `${r.blockedPct}% blocked ${r.safe ? '✅' : '❌'}`));
  });
  const tips = ok ? [level.winTip] : (result.tips && result.tips.length ? result.tips : [level.loseTips.fragments]);
  return h('div', { class: 'screen results ' + (ok ? 'win' : 'lose') },
    h('div', { class: 'card' },
      h('h2', { class: 'verdict' }, ok ? 'You survived! 🎉' : 'Not safe this time!'),
      !ok && h('p', { class: 'kind' }, 'The capybara family is fine. They just need a better shelter. Try again!'),
      ok && h('p', { class: 'kind' }, 'The capybara family is safe and happy! 🐹'),
      h('div', { class: 'score' },
        h('div', { class: 'safety' }, h('b', {}, result.safety + '%'), h('span', {}, 'safety')),
        stars(result.stars)),
      h('div', { class: 'trs' }, rows),
      brokenSummary && h('div', { class: 'broke' }, '💥 Broke: ' + brokenSummary),
      h('div', { class: 'tips' }, tips.map((t) => h('p', {}, '💡 ' + t))),
      h('div', { class: 'row wrap' },
        btn('↺ Try again', onTry, ok ? 'soft' : 'primary big'),
        ok && btn('Quick quiz →', onQuiz, 'primary big'),
        btn('Levels', onLevels, 'soft'))));
}

// ------------------------------------------------------------ quiz
export function quizScreen({ level, onDone }) {
  const qs = QUIZ[level.id] || [];
  let i = 0, score = 0;
  const card = h('div', { class: 'card quiz' });
  const wrap = screen('quiz', card);
  function show() {
    card.innerHTML = '';
    if (i >= qs.length) {
      card.append(
        h('h2', {}, 'Quiz done!'),
        h('div', { class: 'quiz-score' }, `You got ${score} of ${qs.length} right.`),
        h('p', {}, score === qs.length ? 'Perfect! You are a safety star! ⭐' : 'Good job! Learning is the goal.'),
        h('div', { class: 'row' }, btn(level.id >= LEVELS.length ? 'Finish →' : 'Next level →', () => onDone(score), 'primary big')));
      return;
    }
    const q = qs[i];
    let answered = false;
    const exp = h('div', { class: 'explain hidden' });
    const next = btn(i === qs.length - 1 ? 'See score' : 'Next question →', () => { i++; show(); }, 'primary hidden');
    const opts = q.options.map((o, idx) => {
      const b = h('button', { class: 'opt', type: 'button' }, h('span', { class: 'letter' }, 'ABC'[idx]), h('span', {}, o));
      b.addEventListener('click', () => {
        if (answered) return;
        answered = true;
        const right = idx === q.answer;
        if (right) score++;
        b.classList.add(right ? 'right' : 'wrong');
        wrap.querySelectorAll('.opt')[q.answer].classList.add('right');
        exp.textContent = (right ? '✅ Correct! ' : '❌ Not quite. ') + q.explain;
        exp.classList.remove('hidden'); next.classList.remove('hidden');
        wrap.querySelectorAll('.opt').forEach((x) => (x.disabled = true));
      });
      return b;
    });
    card.append(
      h('div', { class: 'qprog' }, `Question ${i + 1} of ${qs.length}`),
      h('h2', {}, q.q),
      h('div', { class: 'opts' }, opts),
      exp,
      h('div', { class: 'row' }, next));
  }
  show();
  return wrap;
}

// ------------------------------------------------------------ final
export function finalScreen({ totalStars, onWords, onLevels }) {
  const learned = [
    'We measure explosions in "tonnes of TNT". A nuclear bomb is millions of times stronger than a hand grenade.',
    'Fragments are small, fast pieces of metal. Sandbags and steel stop them best.',
    'A shockwave is a wall of pushed air. Heavy, thick blocks and distance help the most.',
    'A nuclear bomb also makes a heat flash and radiation. Thick concrete, earth and a basement block radiation.',
    'The official safety advice is: Go in, stay in, tune in.',
    'Real explosions are very dangerous. Stay away and tell an adult.',
  ];
  return screen('final',
    h('div', { class: 'card wide' },
      h('h2', {}, '🏆 You did it!'),
      h('p', { class: 'kind' }, `You finished all three levels. Stars: ${totalStars} of 9`),
      h('div', { class: 'brief-grid' },
        h('div', { class: 'col' }, h('h3', {}, 'What we learned'), h('ul', { class: 'facts' }, learned.map((t) => h('li', {}, t)))),
        h('div', { class: 'col' }, powerChart(0))),
      h('div', { class: 'row wrap' }, btn('Words to know', onWords, 'soft'), btn('Play levels again', onLevels, 'primary big'))));
}

export { getMaterial };
