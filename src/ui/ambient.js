// A living backdrop behind every menu: soft particles that follow the Realm theme (embers for the default oak-and-gold,
// snow for Frostfair, bats for the Haunted Siege, petals, leaves, fireflies, stars, rain...). It sits under the menus,
// never catches a tap, idles at ~30 fps, and stops completely while a run is on screen, the tab is hidden, or the player
// has picked Reduced motion or Light graphics.
const TAU = Math.PI * 2;
const EMOJI = { bats: '🦇', leaves: '🍁', greenleaves: '🍃', hearts: '💗', petals: '🌸' };

let cv = null, ctx = null, raf = 0, parts = [], kind = 'embers', last = 0, running = false, W = 0, H = 0, dpr = 1;
const sprites = {};

function sprite(ch, px) {
  const key = ch + px;
  if (sprites[key]) return sprites[key];
  const c = document.createElement('canvas');
  c.width = c.height = Math.ceil(px * 1.4);
  const x = c.getContext('2d');
  x.font = `${px}px serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(ch, c.width / 2, c.height / 2 + px * 0.05);
  return (sprites[key] = c);
}

// Rising kinds start at the bottom and drift up; falling kinds start at the top; floaters wander anywhere.
const RISING = new Set(['embers', 'sparks', 'motes']);
const FLOATING = new Set(['fireflies', 'stars']);

function spawn(p, fresh) {
  const depth = 0.35 + Math.random() * 0.65;   // far particles are smaller, slower and fainter: a cheap parallax
  p.d = depth;
  p.x = Math.random() * W;
  p.y = fresh ? Math.random() * H : RISING.has(kind) ? H + 10 : -20;
  p.sway = Math.random() * TAU; p.swaySp = 0.4 + Math.random() * 0.9;
  p.spin = (Math.random() - 0.5) * 1.6; p.rot = Math.random() * TAU;
  p.life = 0; p.max = 6 + Math.random() * 10;
  const sp = kind === 'rain' ? 520 : kind === 'snow' ? 34 : kind === 'embers' || kind === 'sparks' ? 38 : kind === 'motes' ? 14 : kind === 'bats' ? 60 : 30;
  p.v = sp * (0.55 + depth * 0.7) * (0.8 + Math.random() * 0.4);
  if (kind === 'bats') { p.y = H * (0.05 + Math.random() * 0.45); p.x = fresh ? Math.random() * W : -30; }
  return p;
}

function count() {
  const area = (W * H) / (390 * 844);
  const base = kind === 'rain' ? 70 : kind === 'bats' ? 6 : kind === 'stars' ? 46 : kind === 'fireflies' ? 18 : EMOJI[kind] ? 14 : 34;
  return Math.max(4, Math.round(base * Math.min(2.2, Math.max(0.6, area))));
}

function resize() {
  if (!cv) return;
  dpr = Math.min(2, window.devicePixelRatio || 1);
  W = window.innerWidth; H = window.innerHeight;
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  cv.style.width = W + 'px'; cv.style.height = H + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function gold() { return getComputedStyle(document.documentElement).getPropertyValue('--gold').trim() || '#f2b33d'; }

function frame(t) {
  raf = 0;
  if (!running) return;
  raf = requestAnimationFrame(frame);
  if (t - last < 32) return;   // ~30 fps is plenty for drifting dust and saves battery
  const dt = Math.min(0.05, (t - last) / 1000 || 0.016); last = t;
  ctx.clearRect(0, 0, W, H);
  const T = t / 1000, accent = gold();
  if (kind === 'rain') { ctx.strokeStyle = 'rgba(190,215,235,0.28)'; ctx.lineWidth = 1.1; ctx.beginPath(); }
  for (const p of parts) {
    p.life += dt; p.rot += p.spin * dt;
    const sway = Math.sin(T * p.swaySp + p.sway);
    if (RISING.has(kind)) { p.y -= p.v * dt; p.x += sway * 12 * dt; if (p.y < -12) spawn(p); }
    else if (kind === 'bats') { p.x += p.v * dt; p.y += Math.sin(T * 3 + p.sway) * 18 * dt; if (p.x > W + 30) spawn(p); }
    else if (FLOATING.has(kind)) { p.x += Math.cos(T * 0.3 * p.swaySp + p.sway) * 10 * dt; p.y += Math.sin(T * 0.25 * p.swaySp + p.sway * 2) * 8 * dt; }
    else if (kind === 'rain') { p.y += p.v * dt; p.x -= p.v * 0.18 * dt; if (p.y > H + 20) spawn(p); }
    else { p.y += p.v * dt; p.x += sway * 26 * p.d * dt; if (p.y > H + 24) spawn(p); }
    if (p.x < -40) p.x += W + 80; else if (p.x > W + 40 && kind !== 'bats') p.x -= W + 80;

    if (kind === 'rain') { ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - 3, p.y + 10 + p.d * 6); continue; }
    if (EMOJI[kind]) {
      const s = sprite(EMOJI[kind], Math.round(10 + p.d * 12));
      ctx.save(); ctx.globalAlpha = 0.28 + p.d * 0.45; ctx.translate(p.x, p.y);
      if (kind !== 'bats') ctx.rotate(p.rot); else ctx.scale(1, 0.85 + 0.15 * Math.sin(T * 14 + p.sway));
      ctx.drawImage(s, -s.width / 2, -s.height / 2); ctx.restore();
      continue;
    }
    let a, r, col;
    if (kind === 'stars') { const tw = 0.5 + 0.5 * Math.sin(T * (0.8 + p.swaySp) + p.sway * 3); a = 0.15 + 0.6 * tw * p.d; r = 0.6 + p.d * 1.6; col = '#ffffff'; }
    else if (kind === 'fireflies') { const g = 0.5 + 0.5 * Math.sin(T * 2.1 + p.sway * 4); a = (0.2 + 0.65 * g) * p.d; r = 1.4 + p.d * 1.6; col = '#e9ff9a'; ctx.globalAlpha = a * 0.3; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(p.x, p.y, r * 4, 0, TAU); ctx.fill(); }
    else if (kind === 'snow') { a = 0.35 + p.d * 0.5; r = 0.9 + p.d * 2.4; col = '#ffffff'; }
    else {   // embers, sparks and motes rise and fade at both ends of their climb
      const k = Math.max(0, Math.min(1, 1 - p.y / H)); const fade = Math.sin(Math.PI * Math.max(0.05, Math.min(0.95, k)));
      a = (kind === 'motes' ? 0.45 : 0.75) * fade * p.d; r = (kind === 'motes' ? 1 : 0.8) + p.d * (kind === 'motes' ? 2 : 1.8);
      col = kind === 'motes' ? '#fff3c8' : (p.sway > 3 ? accent : '#ff9a3c');
      if (kind !== 'motes') { ctx.globalAlpha = a * 0.25; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(p.x, p.y, r * 3.2, 0, TAU); ctx.fill(); }
    }
    ctx.globalAlpha = a; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.fill();
  }
  if (kind === 'rain') ctx.stroke();
  ctx.globalAlpha = 1;
}

function want(profile) {
  const s = profile?.settings || {};
  if (s.reducedMotion || s.quality === 'low') return false;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false;
  return true;
}

// Called whenever the theme or settings change. `theme` is the active theme object or null for the default look.
export function setAmbient(profile, theme) {
  const next = theme?.fall || 'embers';
  if (!cv) {
    cv = document.createElement('canvas');
    cv.id = 'ambient'; cv.setAttribute('aria-hidden', 'true');
    document.getElementById('app')?.prepend(cv);
    ctx = cv.getContext('2d');
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', () => (document.hidden ? stop() : sync()));
    // Start and stop with the battlefield: the game view's hidden flag flips when a run starts or ends.
    const gv = document.getElementById('game-view');
    if (gv && typeof MutationObserver !== 'undefined') new MutationObserver(sync).observe(gv, { attributes: true, attributeFilter: ['hidden'] });
    resize();
  }
  cv.hidden = !want(profile);
  if (next !== kind || !parts.length) { kind = next; parts = Array.from({ length: count() }, () => spawn({}, true)); }
  cv.dataset.on = String(!cv.hidden);
  sync();
}

// Runs only while a menu is showing (the battlefield has its own weather), the page is visible, and motion is allowed.
export function sync() {
  if (!cv) return;
  const inGame = !document.getElementById('game-view')?.hidden;
  const go = !cv.hidden && !inGame && !document.hidden;
  if (go && !running) { running = true; last = performance.now(); raf = requestAnimationFrame(frame); }
  else if (!go) stop();
}

function stop() { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; }
