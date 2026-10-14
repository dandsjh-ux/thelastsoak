// Text helpers: snippet masking, brace stripping, profanity filter.

/** Split a line into word tokens; words inside {braces} are flagged as key words. */
export function tokenize(line) {
  const tokens = [];
  const re = /\{([^}]*)\}([^\s{]*)|([^\s{]+)/g;
  let m;
  while ((m = re.exec(line))) {
    if (m[3] !== undefined) {
      tokens.push({ w: m[3], key: false });
      continue;
    }
    const words = m[1].split(/\s+/).filter(Boolean);
    words.forEach((w, i) => tokens.push({ w, key: true, suffix: i === words.length - 1 ? m[2] : '' }));
  }
  return tokens;
}

/** Remove braces for the full, natural version of a line. */
export function plain(line) {
  return line.replace(/[{}]/g, '');
}

/**
 * Mask a line so the listener hears roughly `ratio` of the ordinary words.
 * Key words always come through and stay wrapped in braces so the client can highlight them.
 * Hidden runs collapse into "…".
 */
export function maskLine(line, ratio, rng = Math.random) {
  if (ratio >= 1) return line;
  const tokens = tokenize(line);
  const normal = tokens.map((t, i) => (t.key ? -1 : i)).filter((i) => i >= 0);
  const keepCount = Math.max(tokens.some((t) => t.key) ? 0 : 1, Math.round(normal.length * ratio));
  // Fisher–Yates pick of which ordinary words survive.
  const shuffled = normal.slice();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const keep = new Set(shuffled.slice(0, keepCount));
  const out = [];
  let gap = false;
  let prevKey = false;
  tokens.forEach((t, i) => {
    const visible = t.key || keep.has(i);
    if (!visible) {
      if (!gap) out.push('…');
      gap = true;
      prevKey = false;
      return;
    }
    gap = false;
    const word = t.w + (t.suffix || '');
    if (t.key) {
      if (prevKey) {
        // extend the previous {group}
        const last = out.pop();
        out.push(last.replace(/\}([^}]*)$/, ` ${t.w}}$1`) + (t.suffix || ''));
      } else out.push(`{${t.w}}${t.suffix || ''}`);
      prevKey = !t.suffix; // punctuation ends a group
    } else {
      out.push(word);
      prevKey = false;
    }
  });
  return out.join(' ');
}

const BAD = [
  'fuck', 'shit', 'bitch', 'cunt', 'dick', 'cock', 'pussy', 'asshole', 'bastard', 'slut', 'whore',
  'fag', 'nigger', 'nigga', 'retard', 'twat', 'wanker', 'bollocks', 'prick', 'motherfucker',
];
const BAD_RE = new RegExp(`\\b\\w*(${BAD.join('|')})\\w*\\b`, 'gi');

/** Very basic profanity filter for whisper chat. */
export function cleanChat(s, max = 200) {
  const text = String(s ?? '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
  return text.replace(BAD_RE, (w) => '#$%!@&*'.repeat(3).slice(0, Math.max(3, Math.min(w.length, 8))));
}

export function cleanName(s, max = 16) {
  return String(s ?? '').replace(/[<>&"'`{}]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
}

export function fill(template, vars) {
  return template.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? vars[k] : `{${k}}`));
}
