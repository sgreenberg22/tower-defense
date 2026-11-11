// Keeps a phone's screen awake while a battle is on. A tower-defence wave is mostly watching, so without this the
// screen dims and locks mid-wave. Uses the Screen Wake Lock API where the browser has it (Android Chrome, iOS 16.4+);
// everywhere else it quietly does nothing. The lock is dropped on every menu, so the game never drains a battery idly.
let want = false;
let lock = null;
let wired = false;

async function acquire() {
  if (!want || lock || typeof navigator === 'undefined' || !navigator.wakeLock || document.visibilityState !== 'visible') return;
  try {
    const l = await navigator.wakeLock.request('screen');
    if (!want) { l.release().catch(() => {}); return; }   // the run ended while the request was in flight
    lock = l;
    l.addEventListener('release', () => { if (lock === l) lock = null; });
  } catch { /* refused (battery saver, no permission): the game plays on */ }
}

// The browser drops a wake lock whenever the page is hidden, so it is taken again each time the game comes back.
function wire() {
  if (wired || typeof document === 'undefined') return;
  wired = true;
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') acquire(); });
}

export function setAwake(on) {
  want = !!on;
  wire();
  if (want) acquire();
  else if (lock) { const l = lock; lock = null; l.release().catch(() => {}); }
}
export const awakeState = () => ({ want, held: !!lock });
