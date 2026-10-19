// Haptics: short buzzes on phones that support them (Android Chrome and most Android browsers; iOS Safari ignores
// navigator.vibrate). Off with Settings → Vibration. Every pattern is tiny so it reads as a "thunk", not a phone call.
let enabled = true;
let last = 0;

const PATTERNS = {
  tap: 8,
  build: 12,
  upgrade: [10, 30, 14],
  art: 14,
  hit: 18,
  leak: 30,
  clear: [12, 40, 12],
  boss: [40, 60, 40, 60, 80],
  bossDown: [30, 40, 30, 40, 120],
  record: [20, 40, 20, 40, 20, 40, 90],
  reward: [15, 30, 15, 30, 60],
  achievement: [15, 35, 25],
  gameOver: [80, 60, 140],
};

export function setHaptics(on) { enabled = !!on; }

// `kind` is a name from PATTERNS (or a raw pattern). `gap` keeps rapid events (leaks, hits) from merging into a long rattle.
export function buzz(kind, gap = 0) {
  if (!enabled || typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return false;
  const now = Date.now();
  if (gap && now - last < gap) return false;
  last = now;
  try { return navigator.vibrate(PATTERNS[kind] ?? kind); } catch { return false; }
}

export const canVibrate = () => typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
