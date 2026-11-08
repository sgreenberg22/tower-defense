// Keeps the page from zooming on phones while you play a run. CSS (touch-action on every element) stops double-tap zoom, but iOS Safari
// ignores user-scalable=no, so pinch is stopped here as well. Nothing in this file cancels a tap, so quick taps on buttons still count.
// Menus can be pinch-zoomed (WCAG 1.4.4): the lock only applies while a run is on screen (App.where === 'game').
// Desktop zoom (Ctrl +/-, Ctrl + wheel) is left alone on purpose.
export const isPlaying = () => (typeof window !== 'undefined' && window.bastion?.where) === 'game';

export function lockZoom(playing = isPlaying) {
  const opt = { passive: false };
  const stop = (e) => { if (playing() && e.cancelable) e.preventDefault(); };
  // iOS Safari's own pinch events.
  for (const t of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(t, stop, opt);
  // Two fingers moving anywhere is a pinch. A lone tap or drag is never affected.
  document.addEventListener('touchmove', (e) => { if (e.touches.length > 1 || (typeof e.scale === 'number' && e.scale !== 1)) stop(e); }, opt);
}
