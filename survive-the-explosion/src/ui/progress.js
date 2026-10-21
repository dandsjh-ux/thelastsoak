// Saved progress (stars, teacher unlock). localStorage only, always in try/catch.
const KEY = 'survive-the-explosion-v1';

let data = { stars: {}, teacher: false };

export function loadProgress() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw);
      data = { stars: p.stars || {}, teacher: !!p.teacher };
    }
  } catch (e) { /* storage may be blocked */ }
  return data;
}

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* ignore */ }
}

export function getStars(levelId) { return data.stars[levelId] || 0; }
export function isPassed(levelId) { return (data.stars[levelId] || 0) > 0; }
export function setStars(levelId, stars) {
  if (stars > (data.stars[levelId] || 0)) { data.stars[levelId] = stars; save(); }
  else if (stars > 0 && !data.stars[levelId]) { data.stars[levelId] = stars; save(); }
}
export function isUnlocked(levelId) {
  return data.teacher || levelId === 1 || isPassed(levelId - 1);
}
export function isTeacher() { return data.teacher; }
export function setTeacher(v) { data.teacher = !!v; save(); }
export function resetProgress() { data = { stars: {}, teacher: data.teacher }; save(); }
