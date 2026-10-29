// Warrior mode on screen: the set-up page (pick a warrior, defend or attack) and the touch controls for the fight itself,
// in the style of mobile action games: a floating stick under the left thumb, a big attack button under the right with
// a skill, a dodge and the fury round it, and a drag on the right half to turn the camera. Keyboard too (WASD, J K L I).
import { h, fmt, toast, modal } from './dom.js';
import { buzz } from './haptics.js';
import { audio } from '../game/audio.js';
import { MAPS, MAP_ORDER } from '../game/maps.js';
import { saveProfile, isMapUnlocked, loadRun, keepLevel } from '../meta/profile.js';
import { randomSeed } from '../core/rng.js';
import { mapThumb } from './screens.js';
import { CHAMP, CHAMP_IDS, CHAMP_CLASSES, champClass, masteryLevel, masteryXpFor, levelNeed, cleanChampClass } from '../game/champion.js';
import { TROOPS } from '../data/balance.js';

// Pointer capture keeps a thumb's drag on its own control even when it slides off; some browsers throw for odd pointers.
const capture = (el, id) => { try { el.setPointerCapture(id); } catch { /* not capturable */ } };

// ---------- records ----------
export function warriorRecord(p, cls) { return p.warrior?.cls?.[cls] || { xp: 0, runs: 0, kos: 0, best: 0, bestHits: 0 }; }
export function warriorBestLine(p, side = 'defend') {
  const R = p.local?.[side === 'attack' ? 'warassault' : 'warrior'];
  if (!R?.runs) return 'New · on foot in 3D';
  return side === 'attack' ? `Best: ${R.best} stronghold${R.best === 1 ? '' : 's'}` : `Best wave ${R.best}`;
}

// ---------- the set-up page ----------
export function warriorScreen(app, side) {
  const p = app.profile, screen = document.getElementById('screen');
  const pick = (p.modePicks ||= {}).warrior ||= {};
  const maps = MAP_ORDER.filter((id) => MAPS[id] && !MAPS[id].hidden && id !== 'frontier');
  const st = { side: side || pick.side || 'defend', cls: cleanChampClass(pick.cls), map: maps.includes(pick.map) && isMapUnlocked(p, pick.map) ? pick.map : 'meadow' };
  const save = () => { Object.assign(pick, { side: st.side, cls: st.cls, map: st.map }); saveProfile(p); };
  const saved = loadRun('warrior');
  const render = () => {
    const keepY = screen.scrollTop, keepX = screen.querySelector('.map-cards')?.scrollLeft || 0;
    const sideBtn = (id, icon, name, sub) => h('button', { class: 'plaque wr-side' + (st.side === id ? ' sel' : ''), 'aria-pressed': String(st.side === id), onclick: () => { st.side = id; save(); render(); } },
      h('span', { class: 'ws-ico', 'aria-hidden': 'true' }, icon), h('span', {}, h('b', {}, name), h('small', { class: 'muted' }, sub)));
    const cards = CHAMP_IDS.map((id) => {
      const C = CHAMP_CLASSES[id], R = warriorRecord(p, id), lv = masteryLevel(R.xp), next = masteryXpFor(lv + 1), prev = masteryXpFor(lv);
      const frac = lv >= CHAMP.mastery.cap ? 1 : (R.xp - prev) / Math.max(1, next - prev);
      const stat = (label, n) => h('span', { class: 'wc-stat' }, h('small', {}, label), h('i', { class: 'pips', 'aria-label': `${label} ${n} of 5` }, ...Array.from({ length: 5 }, (_, i) => h('b', { class: i < n ? 'on' : '' }))));
      return h('button', { class: 'plaque wr-class' + (st.cls === id ? ' sel' : ''), 'data-cls': id, 'aria-pressed': String(st.cls === id), onclick: () => { st.cls = id; save(); render(); } },
        h('div', { class: 'wc-head' }, h('span', { class: 'wc-ico', 'aria-hidden': 'true' }, C.icon), h('div', {}, h('b', {}, C.name), h('small', { class: 'muted' }, C.role)), h('span', { class: 'wc-lv', title: 'Mastery: lasting bonus health and damage for this warrior' }, `★${lv}`)),
        h('p', { class: 'wc-blurb' }, C.blurb),
        h('div', { class: 'wc-stats' }, stat('Attack', C.bars.atk), stat('Defence', C.bars.def), stat('Speed', C.bars.spd), stat('Reach', C.bars.reach)),
        h('div', { class: 'wc-moves' }, h('span', {}, h('b', {}, `${C.skill.icon} ${C.skill.name}`), h('small', {}, C.skill.desc)), h('span', {}, h('b', {}, `${C.fury.icon} ${C.fury.name}`), h('small', {}, C.fury.desc))),
        h('div', { class: 'wc-mastery' }, h('small', { class: 'muted' }, lv >= CHAMP.mastery.cap ? 'Mastery maxed' : `Mastery ★${lv} · +${Math.round(lv * CHAMP.mastery.per * 100)}% · ${fmt(R.kos)} slain`), h('i', { class: 'bar gold' }, h('i', { style: { width: Math.round(frac * 100) + '%' } }))));
    });
    const mapCards = maps.map((mid) => {
      const m = MAPS[mid], open = isMapUnlocked(p, mid);
      return h('button', { class: 'plaque map-card' + (st.map === mid ? ' sel' : '') + (open ? '' : ' locked'), disabled: !open, 'aria-pressed': String(st.map === mid), onclick: () => { st.map = mid; save(); render(); } },
        mapThumb(mid, 'preview', 300), h('b', {}, m.name), h('span', { class: 'muted' }, open ? m.desc : '🔒 ' + (m.unlock?.label || 'Locked')));
    });
    const C = champClass(st.cls), mastery = masteryLevel(warriorRecord(p, st.cls).xp);
    const go = () => {
      save();
      const masteries = Object.fromEntries(CHAMP_IDS.map((id) => [id, masteryLevel(warriorRecord(p, id).xp)]));
      const champion = { cls: st.cls, mastery, masteries, swap: keepLevel(p, 'unlock_swap') > 0 };   // the Keep's Armory of Arms lets you change warrior mid-run
      if (st.side === 'attack') app.startRun({ mode: 'warassault', seed: randomSeed(), mapId: 'auto', career: p.warRecord?.taken || 0, held: app.realm?.map?.held ?? p.realmMap?.held ?? 0, orders: ['firepots', 'horn', 'smoke'], champion });
      else app.startRun({ mode: 'warrior', mapId: st.map, seed: randomSeed(), modifiers: [], ascension: 0, loadout: [], champion });
    };
    screen.replaceChildren(h('div', { class: 'screen-inner setup-screen settled warrior-setup' },
      h('div', { class: 'screen-head' }, h('button', { class: 'btn small ghost', onclick: () => app.showHome(), 'aria-label': 'Back' }, '← Back'), h('h2', {}, '⚔ Warrior')),
      h('p', { class: 'muted' }, 'Leave the wall behind and take the field yourself. Pick a warrior and fight on foot in the 3D world, in the thick of the same horde, the same towers and the same war camps as every other mode. Every foe you cut down counts as your own kill for the Realm.'),
      h('div', { class: 'wr-sides' }, sideBtn('defend', '🛡', 'Hold the keep', 'Waves come; your commander builds the towers'), sideBtn('attack', '🚩', 'Storm the camps', 'March with the column; your captain sends troops')),
      saved && st.side === 'defend' ? h('div', { class: 'plaque trim' }, `A Warrior defence is saved at wave ${saved.wave}. `, h('button', { class: 'btn small gold', onclick: () => app.resumeRun(saved) }, '▶ Continue')) : null,
      h('h3', {}, 'Your warrior'), h('div', { class: 'wr-classes' }, cards),
      h('ul', { class: 'mode-rules' },
        h('li', {}, 'One thumb is enough: drag anywhere on the left to move. The camera swings in behind you by itself and your warrior strikes any foe in reach on its own (switch it off with 🖐 if you would rather swing yourself). Your other thumb has ⚔ to attack on demand, a skill, a dodge roll and your fury; drag the right half of the screen to turn the camera by hand.'),
        h('li', {}, 'Waves follow one another with hardly a pause: the commander builds and mends as you fight. Every other wave (and every 5th level) offers a Warrior boon, a pick that only this mode has. From wave 5 foot soldiers join you and fight at your side.'),
        keepLevel(p, 'unlock_swap') > 0 ? h('li', {}, 'Armory of Arms is yours: tap ⇄ in a fight to change warrior without leaving the field.') : h('li', { class: 'muted' }, '🔒 Buy the Armory of Arms in the Keep (Hero) to change warrior in the middle of a run.'),
        h('li', {}, 'Fury fills as you hit, slay and get hurt. Each kill earns experience: rise in level during the run for more health and damage, and earn lasting mastery for the warrior you play.'),
        st.side === 'attack'
          ? h('li', {}, 'Your captain sends troops and siege engines down the road and uses the field orders. You cut down raiders and defenders, smash emplacements and help break the gate. Take the camp and march on to the next, on new ground.')
          : h('li', {}, `Foes that walk into you stop to fight you, so the towers get them standing still. They lash out as they pass, bosses crush and archers shoot. Fall and you rise again at the keep a few seconds later; the run ends only if the keep falls.`),
        h('li', {}, 'Keys: WASD or arrows to move, J or Space to attack, K skill, L or Shift dodge, I fury.')),
      st.side === 'defend' ? [h('h3', {}, 'Battlefield'), h('div', { class: 'map-cards' }, mapCards)] : null,
      h('div', { class: 'setup-foot' }, h('small', { class: 'muted' }, `${C.icon} ${C.name}${mastery ? ` · Mastery ★${mastery}` : ''} · needs 3D (WebGL); without it you fight from above.`), h('span', { class: 'spacer' }),
        h('button', { class: 'btn gold big', onclick: go }, st.side === 'attack' ? 'March out' : 'Take the field'))));
    const rail = screen.querySelector('.map-cards'); if (rail) rail.scrollLeft = keepX;
    screen.scrollTop = keepY;
  };
  render();
  screen.scrollTop = 0;
}

// ---------- the fight: touch controls ----------
export class WarriorControls {
  constructor(session) {
    this.s = session;
    this.stick = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
    this.look = { id: null, x: 0, t: 0, moved: false };
    this.keys = new Set();
    this.lastLook = -9999; this.tapAtk = 0; this.cache = {}; this.born = performance.now();
    const L = session.p.local || {}, fresh = (L.warrior?.runs || 0) + (L.warassault?.runs || 0) < 2;   // first fights: two coach bubbles
    const C = this.c.cls;
    const btn = (cls, label, icon, extra) => h('button', { class: 'wr-btn ' + cls, type: 'button', 'aria-label': label, title: label }, h('i', { class: 'wb-cd', 'aria-hidden': 'true' }), h('b', { 'aria-hidden': 'true' }, icon), extra || null);
    this.el = {
      root: h('div', { class: 'wr-ui', 'aria-label': 'Warrior controls' }),
      stickZone: h('div', { class: 'wr-zone wr-stick-zone', 'aria-hidden': 'true' }),
      lookZone: h('div', { class: 'wr-zone wr-look-zone', 'aria-hidden': 'true' }),
      stick: h('div', { class: 'wr-stick idle', 'aria-hidden': 'true' }, h('i', { class: 'wr-knob' })),
      atk: btn('wr-atk', `Attack (hold): ${C.attack.kind === 'melee' ? 'swing at the nearest foe' : 'shoot the nearest foe'}`, C.icon),
      skill: btn('wr-skill', `${C.skill.name}: ${C.skill.desc}`, C.skill.icon),
      dodge: btn('wr-dodge', 'Dodge roll', '💨'),
      fury: btn('wr-fury', `${C.fury.name}: ${C.fury.desc}`, C.fury.icon, h('small', { class: 'wb-lbl' }, 'FURY')),
      plate: h('div', { class: 'wr-plate' }),
      ko: h('div', { class: 'wr-ko', 'aria-live': 'off' }),
      down: h('div', { class: 'wr-down', hidden: true, 'aria-live': 'polite' }),
      coach: fresh ? [h('div', { class: 'wr-coach wc-move' }, '👈 Drag here to move'), h('div', { class: 'wr-coach wc-atk' }, 'Skills here · foes in reach are struck for you 👉')] : [],
    };
    const E = this.el;
    E.hp = h('i', { class: 'wp-hp' }, h('i')); E.xp = h('i', { class: 'wp-xp' }, h('i')); E.lv = h('b', { class: 'wp-lv' }); E.name = h('span', { class: 'wp-name' }, `${C.icon} ${C.name}`);
    E.plate.append(h('div', { class: 'wp-top' }, E.name, E.lv), E.hp, E.xp);
    E.kos = h('b'); E.hits = h('span', { class: 'wr-hits' });
    E.ko.append(E.kos, h('small', {}, 'KO'), E.hits);
    E.btns = h('div', { class: 'wr-btns' }, E.fury, E.skill, E.atk, E.dodge);
    // two small tools under the name plate: one-hand assist (the camera follows you, the warrior strikes what is in reach) and changing warrior
    this.frameYaw = null; this.clsId = this.c.id; this.autoT = 0;
    E.assist = h('button', { class: 'wr-tool', type: 'button', 'aria-pressed': 'true', 'aria-label': 'One-hand assist', title: 'One-hand assist: the camera follows you and your warrior strikes foes in reach by itself' }, h('b', { 'aria-hidden': 'true' }, '🖐'), h('small', {}, 'Assist'));
    E.swapBtn = h('button', { class: 'wr-tool wr-swap', type: 'button', 'aria-label': 'Change warrior', title: 'Change warrior' }, h('b', { 'aria-hidden': 'true' }, this.c.swapOk ? '⇄' : '🔒'), h('small', {}, 'Swap'));
    E.assist.addEventListener('click', () => this.toggleAssist());
    E.swapBtn.addEventListener('click', () => this.openSwap());
    E.tools = h('div', { class: 'wr-tools' }, E.assist, E.swapBtn);
    E.root.append(E.stickZone, E.lookZone, E.stick, E.plate, E.tools, E.ko, E.btns, E.down, ...E.coach);
    session.wrap.append(E.root);
    this.bind();
  }
  get c() { return this.s.game.champ; }
  get on() { return !!this.c && !this.s.game.over; }

  bind() {
    const E = this.el, ac = this.ac = new AbortController(), o = { signal: ac.signal };
    const hold = (el, down, up) => {
      el.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); capture(el, e.pointerId); el.classList.add('down'); audio.init(); down(e); }, o);
      const end = (e) => { el.classList.remove('down'); up?.(e); };
      el.addEventListener('pointerup', end, o); el.addEventListener('pointercancel', end, o); el.addEventListener('lostpointercapture', end, o);
      el.addEventListener('contextmenu', (e) => e.preventDefault(), o);
    };
    hold(E.atk, () => { this.atkHeld = true; this.coachDone(1); }, () => { this.atkHeld = false; });
    hold(E.skill, () => this.press('skill'));
    hold(E.dodge, () => this.press('dodge'));
    hold(E.fury, () => this.press('fury'));
    // the stick: it appears under the thumb wherever the left half is pressed
    E.stickZone.addEventListener('pointerdown', (e) => {
      if (this.stick.id != null) return;
      e.preventDefault(); capture(E.stickZone, e.pointerId); audio.init();
      const r = this.s.wrap.getBoundingClientRect();
      Object.assign(this.stick, { id: e.pointerId, ox: e.clientX - r.left, oy: e.clientY - r.top, x: 0, y: 0 });
      E.stick.classList.remove('idle'); E.stick.style.left = this.stick.ox + 'px'; E.stick.style.top = this.stick.oy + 'px';
      this.coachDone(0);
    }, o);
    E.stickZone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.stick.id) return;
      const r = this.s.wrap.getBoundingClientRect(), R = this.stickR();
      let dx = e.clientX - r.left - this.stick.ox, dy = e.clientY - r.top - this.stick.oy;
      const d = Math.hypot(dx, dy);
      // drag past the rim and the stick follows the thumb, so it never runs out of room
      if (d > R) { const k = (d - R) / d; this.stick.ox += dx * k; this.stick.oy += dy * k; dx -= dx * k; dy -= dy * k; E.stick.style.left = this.stick.ox + 'px'; E.stick.style.top = this.stick.oy + 'px'; }
      this.stick.x = dx / R; this.stick.y = -dy / R;
      E.stick.firstChild.style.transform = `translate(${dx}px, ${dy}px)`;
    }, o);
    const stickEnd = (e) => { if (e.pointerId !== this.stick.id) return; this.stick.id = null; this.stick.x = this.stick.y = 0; E.stick.classList.add('idle'); E.stick.style.left = ''; E.stick.style.top = ''; E.stick.firstChild.style.transform = ''; };
    E.stickZone.addEventListener('pointerup', stickEnd, o); E.stickZone.addEventListener('pointercancel', stickEnd, o);
    // the camera: drag the right half to turn; a quick tap there attacks too
    E.lookZone.addEventListener('pointerdown', (e) => {
      if (this.look.id != null) return;
      e.preventDefault(); capture(E.lookZone, e.pointerId); audio.init();
      Object.assign(this.look, { id: e.pointerId, x: e.clientX, sx: e.clientX, sy: e.clientY, t: performance.now(), moved: false });
    }, o);
    E.lookZone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.look.id) return;
      const dx = e.clientX - this.look.x;
      if (!this.look.moved && Math.hypot(e.clientX - this.look.sx, e.clientY - this.look.sy) < 10) return;
      this.look.moved = true; this.look.x = e.clientX;
      const r = this.s.renderer;
      if (r.chaseBy) { r.chaseBy(-dx * 0.0085); this.lastLook = performance.now(); this.frameYaw = null; }
    }, o);
    const lookEnd = (e) => { if (e.pointerId !== this.look.id) return; this.look.id = null; if (!this.look.moved && performance.now() - this.look.t < 300) this.tapAtk = 0.18; };
    E.lookZone.addEventListener('pointerup', lookEnd, o); E.lookZone.addEventListener('pointercancel', lookEnd, o);
    // keyboard: caught before the battle's own keys, so WASD and the arrows never build or turn the view
    const KEYS = { w: 1, a: 1, s: 1, d: 1, arrowup: 1, arrowdown: 1, arrowleft: 1, arrowright: 1, ' ': 1, j: 1, k: 1, l: 1, shift: 1, i: 1, q: 1, e: 1 };
    window.addEventListener('keydown', (e) => {
      if (!this.on || document.querySelector('.modal-back') || /input|textarea/i.test(e.target?.tagName || '')) return;
      const k = e.key.toLowerCase();
      if (!KEYS[k]) return;
      e.preventDefault(); e.stopImmediatePropagation();
      if (e.repeat) return;
      this.keys.add(k); audio.init();
      if (k === 'k') this.press('skill'); else if (k === 'l' || k === 'shift') this.press('dodge'); else if (k === 'i') this.press('fury');
      else if (k === 'q') this.s.renderer.chaseBy?.(0.35); else if (k === 'e') this.s.renderer.chaseBy?.(-0.35);
    }, { capture: true, signal: ac.signal });
    window.addEventListener('keyup', (e) => { this.keys.delete(e.key.toLowerCase()); }, { capture: true, signal: ac.signal });
    window.addEventListener('blur', () => { this.keys.clear(); this.atkHeld = false; }, o);
  }
  stickR() { return Math.max(38, Math.min(64, Math.min(this.s.wrap.clientWidth, this.s.wrap.clientHeight) * 0.13)); }
  press(what) {
    const c = this.c;
    if (!this.on || this.s.paused) return;
    const ok = what === 'skill' ? c.skillReady : what === 'fury' ? c.furyReady : c.dodgeCd <= 0;
    if (!ok || c.dead) { this.nope(what); return; }
    c.input[what] = true;
    buzz(what === 'fury' ? 'art' : 'tap', 40);
  }
  nope(what) { const b = this.el[what]; if (!b) return; b.classList.remove('nope'); void b.offsetWidth; b.classList.add('nope'); }
  coachDone(i) { const el = this.el.coach[i]; if (el) { el.remove(); this.el.coach[i] = null; } }

  get assist() { return this.s.p.settings?.warAssist !== false; }
  toggleAssist() {
    const S = (this.s.p.settings ||= {});
    S.warAssist = !this.assist; saveProfile(this.s.p);
    toast(S.warAssist ? 'Assist on: the camera follows you and your warrior strikes foes in reach.' : 'Assist off: you turn the camera and hold ⚔ yourself.', { key: 'warassist', ms: 2400 });
  }

  // The stick (and keys) as a direction on the map: up on the stick is the way the camera looks.
  // With assist on, the camera swings round behind you as you run, so "up" is the way the camera looked when your thumb went
  // down (re-taken whenever the thumb lifts or the camera is turned by hand): hold the stick and you run straight, whatever the view does.
  moveVector() {
    let sx = this.stick.x, sy = this.stick.y;
    const K = this.keys;
    if (K.has('a') || K.has('arrowleft')) sx -= 1; if (K.has('d') || K.has('arrowright')) sx += 1;
    if (K.has('w') || K.has('arrowup')) sy += 1; if (K.has('s') || K.has('arrowdown')) sy -= 1;
    const m = Math.hypot(sx, sy);
    if (m < 0.08) { this.frameYaw = null; return { x: 0, y: 0, m: 0 }; }
    if (m > 1) { sx /= m; sy /= m; }
    const r = this.s.renderer, live = r.chaseOn && r.chase ? (r.chase.yaw ?? 0) : null;
    let yaw = live;
    if (live != null && this.assist) { if (this.frameYaw == null) this.frameYaw = live; yaw = this.frameYaw; } else this.frameYaw = null;
    const f = yaw != null ? { x: Math.sin(yaw), y: Math.cos(yaw) } : { x: 0, y: -1 };   // the classic view: up the screen
    const rt = yaw != null ? { x: -f.y, y: f.x } : { x: 1, y: 0 };
    // right of the camera: (-cos yaw, sin yaw) = (-f.y, f.x)
    return { x: f.x * sy + rt.x * sx, y: f.y * sy + rt.y * sx, m: Math.min(1, m) };
  }

  tick(dt) {
    const c = this.c, E = this.el;
    E.root.hidden = !this.on;
    if (!this.on) return;
    const mv = this.moveVector();
    c.input.mx = mv.x; c.input.my = mv.y;
    if (this.tapAtk > 0) this.tapAtk -= dt;
    const assist = this.assist;
    if (this.el.coach.length && performance.now() - this.born > 9000) { this.coachDone(0); this.coachDone(1); }   // the first-fight hints do not linger
    c.input.attack = !!(this.atkHeld || this.tapAtk > 0 || this.keys.has(' ') || this.keys.has('j') || (assist && c.lock && !c.dead));   // assist: anything in reach is struck without a thumb on ⚔
    if (this.clsId !== c.id) this.rebuild();
    const r = this.s.renderer, since = performance.now() - this.lastLook;
    if (r.chaseOn && r.chase && !c.dead) {
      const turn = (want, k) => { const d = Math.atan2(Math.sin(want - r.chase.yaw), Math.cos(want - r.chase.yaw)); r.chaseBy(d * Math.min(1, k)); return d; };
      if (assist) {
        // the camera goes round behind the way you run; stood still and fighting, it comes round to the foe you are hitting
        if (since > 500) {
          if (mv.m > 0.3) turn(Math.atan2(mv.x, mv.y), dt * 3.2 * mv.m);
          else if (c.lock) { const p = c.posOf(c.lock), want = Math.atan2(p.x - c.x, p.y - c.y), d = Math.atan2(Math.sin(want - r.chase.yaw), Math.cos(want - r.chase.yaw)); if (Math.abs(d) > 0.7) r.chaseBy(d * Math.min(1, dt * 2.2)); }
        }
      } else if (mv.m > 0.3 && since > 1400) {
        const want = Math.atan2(Math.cos(c.ang), Math.sin(c.ang)), d = Math.atan2(Math.sin(want - r.chase.yaw), Math.cos(want - r.chase.yaw));
        if (Math.abs(d) < 2.3) r.chaseBy(d * Math.min(1, dt * 1.5 * mv.m));   // the camera swings in behind you as you run (unless you turned it a moment ago)
      }
    }
    // assist: use the skill when a crowd (or a boss) is on you
    if (assist && !c.dead && c.skillReady && !c.busy && (this.autoT -= dt) <= 0) {
      this.autoT = 0.25;
      const H = c.host; let n = 0, big = false;
      for (const e of H.foes()) { if (!H.alive(e)) continue; const d = Math.hypot(e.x - c.x, e.y - c.y); if (d < 2.2) { n++; if (e.boss || e.duelist) big = true; } }
      if (n >= 3 || big) c.input.skill = true;
    }
    this.paint();
  }

  // A new warrior has taken the field (the Armory of Arms): new icons and names on every button.
  rebuild() {
    const c = this.c, C = c.cls, E = this.el;
    this.clsId = c.id; this.cache = {};
    const set = (b, label, icon) => { b.setAttribute('aria-label', label); b.title = label; b.querySelector('b').textContent = icon; };
    set(E.atk, `Attack (hold): ${C.attack.kind === 'melee' ? 'swing at the nearest foe' : 'shoot the nearest foe'}`, C.icon);
    set(E.skill, `${C.skill.name}: ${C.skill.desc}`, C.skill.icon);
    set(E.fury, `${C.fury.name}: ${C.fury.desc}`, C.fury.icon);
    E.name.textContent = `${C.icon} ${C.name}`;
  }

  // Change warrior in the middle of a run (the Keep's Armory of Arms): the game waits while you choose.
  openSwap() {
    const c = this.c, s = this.s;
    if (!this.on || this.swapModal) return;
    if (!c.swapOk) { toast(h('div', {}, h('b', {}, '🔒 Armory of Arms'), h('div', { class: 'muted' }, 'Buy it in the Keep (Hero tab) with Renown to change warrior in the middle of a run.')), { key: 'swaplock', ms: 4200, icon: '⇄' }); return; }
    if (s.paused) return;
    s.paused = true; audio.setPaused(true);
    const wait = Math.ceil(c.swapCd), blocked = c.dead || wait > 0;
    const cards = CHAMP_IDS.map((id) => {
      const C = CHAMP_CLASSES[id], here = id === c.id, lv = c.masteries[id] | 0;
      return h('button', { class: 'plaque wr-swapcard' + (here ? ' sel' : ''), 'data-cls': id, disabled: here || blocked, onclick: () => { if (c.swapTo(id)) this.swapModal.close(); } },
        h('span', { class: 'wc-ico', 'aria-hidden': 'true' }, C.icon),
        h('span', { class: 'ws-txt' }, h('b', {}, `${C.name}${lv ? ` ★${lv}` : ''}`), h('small', { class: 'muted' }, here ? 'Fighting now' : C.role), h('small', {}, `${C.skill.icon} ${C.skill.name} · ${C.fury.icon} ${C.fury.name}`)));
    });
    this.swapModal = modal([h('h2', {}, '⇄ Change warrior'), h('p', { class: 'muted' }, blocked ? (c.dead ? 'You can change once you have risen.' : `Rearming… ${wait}s until you may change again.`) : 'Your level, experience and fury stay with you. You start the new warrior with a short shield, and cannot change again for a little while.'),
      h('div', { class: 'wr-swapgrid' }, cards), h('button', { class: 'btn ghost', onclick: () => this.swapModal.close() }, 'Close')],
    { onClose: () => { this.swapModal = null; s.paused = false; audio.setPaused(false); s.last = performance.now(); } });
  }

  set(k, v, fn) { if (this.cache[k] !== v) { this.cache[k] = v; fn(v); } }
  paint() {
    const c = this.c, E = this.el;
    const hf = Math.max(0, c.hp / Math.max(1, c.maxHp));
    this.set('hp', Math.round(hf * 200), () => { E.hp.firstChild.style.width = (hf * 100) + '%'; E.hp.classList.toggle('low', hf < 0.3); });
    this.set('xp', Math.round(c.xp / levelNeed(c.level) * 100), (v) => { E.xp.firstChild.style.width = Math.min(100, v) + '%'; });
    this.set('lv', c.level, (v) => { E.lv.textContent = `Lv ${v}`; });
    this.set('kos', c.kos, (v) => { E.kos.textContent = fmt(v); });
    this.set('hits', c.hits, (v) => { E.hits.textContent = v >= 3 ? `${v} hits` : ''; E.hits.classList.toggle('hot', v >= 30); });
    const sk = c.skillCd > 0 ? Math.min(1, c.skillCd / c.skillCdOf()) : 0;
    this.set('sk', Math.round(sk * 40), () => { E.skill.querySelector('.wb-cd').style.height = (sk * 100) + '%'; E.skill.classList.toggle('ready', sk === 0); });
    const dg = c.dodgeCd > 0 ? Math.min(1, c.dodgeCd / c.dodgeCdOf()) : 0;
    this.set('assist', this.assist, (v) => { E.assist.classList.toggle('on', v); E.assist.setAttribute('aria-pressed', String(v)); });
    this.set('swap', c.swapOk ? Math.ceil(c.swapCd) : -1, (v) => { E.swapBtn.classList.toggle('locked', v < 0); E.swapBtn.classList.toggle('cool', v > 0); E.swapBtn.firstChild.textContent = v < 0 ? '🔒' : '⇄'; E.swapBtn.lastChild.textContent = v > 0 ? v + 's' : 'Swap'; });
    this.set('dg', Math.round(dg * 20), () => { E.dodge.querySelector('.wb-cd').style.height = (dg * 100) + '%'; });
    const fu = c.furyT > 0 ? 1 : c.fury / CHAMP.fury.max;
    this.set('fu', Math.round(fu * 50) + '|' + c.furyReady + '|' + (c.furyT > 0), () => {
      E.fury.style.setProperty('--fill', fu.toFixed(3)); E.fury.classList.toggle('ready', c.furyReady); E.fury.classList.toggle('active', c.furyT > 0);
    });
    this.set('lock', !!c.lock, (v) => E.atk.classList.toggle('armed', v));
    this.set('down', c.dead ? Math.ceil(c.respawnT) : -1, (v) => { E.down.hidden = v < 0; if (v >= 0) E.down.replaceChildren(h('b', {}, 'You have fallen'), h('span', {}, `Rising at the keep in ${v}…`)); });
    this.set('dead', c.dead, (v) => E.root.classList.toggle('dead', v));
  }

  destroy() { this.ac?.abort(); this.el.root.remove(); }
}

// ---------- the fight: sound, sparks and words for what your warrior does ----------
export function wireWarrior(session) {
  const g = session.game, fx = session.fx;
  if (!g.champ) return;
  const cls = new Proxy({}, { get: (_, k) => g.champ.cls[k] });   // always the warrior on the field now (it can change mid-run)
  g.on('champSwap', ({ champ, id }) => {
    const C = CHAMP_CLASSES[id];
    audio.play('rally'); buzz('upgrade'); fx.shake(0.1, 0.2);
    fx.ring(champ.x, champ.y, 1, 'rgba(255,214,102,0.95)', 0.6, 0.1);
    fx.text(champ.x, champ.y - 1.1, `${C.icon} ${C.name}`, { color: '#ffd666', size: 0.4, bold: true, life: 1.4 });
  });
  g.on('champPhoenix', ({ champ }) => { audio.play('fury'); buzz('record'); fx.ring(champ.x, champ.y, 1.1, 'rgba(255,160,60,0.95)', 0.7, 0.12); fx.text(champ.x, champ.y - 1, 'PHOENIX HEART!', { color: '#ffb347', size: 0.4, bold: true, life: 1.4 }); });
  g.on('champPick', ({ level }) => toast(`Level ${level}: a free Warrior boon waits for you when this wave falls.`, { key: 'champpick', ms: 3000, icon: '⭐' }));
  g.on('levy', ({ kinds }) => {
    audio.play('rally'); buzz('upgrade');
    const names = {}; for (const k of kinds) names[k] = (names[k] || 0) + 1;
    toast(`🛡 Foot soldiers join you: ${Object.entries(names).map(([k, n]) => `${n} ${TROOPS[k]?.name || k}${n > 1 ? 's' : ''}`).join(', ')}.`, { key: 'levy', ms: 3200, icon: '⚔' });
  });
  g.on('champSwing', ({ n, big, spin }) => { audio.play('swing', { big: big || spin }); if (n) { audio.play(n > 2 ? 'clangHit' : 'slash'); if (big && n) fx.shake(0.06, 0.1); } });
  g.on('champShoot', ({ kind }) => audio.play(kind === 'bow' ? 'twang' : 'orb'));
  g.on('champHit', ({ target, dmg, crit }) => {
    const x = target.cx ?? target.x, y = (target.cy ?? target.y) - 0.3;
    if (target === g.fortress) return;
    fx.burst(x, y, crit ? 6 : 3, { color: crit ? ['#fff', '#ffd25e'] : ['#fff', '#ffb3a8'], speed: 2, life: 0.22, size: 0.05, gravity: 0 });
    if (crit) fx.text(x, y - 0.25, fmt(dmg) + '!', { color: '#ffd25e', size: 0.36, bold: true, life: 0.8 });
  });
  g.on('champSkill', ({ id, x, y }) => {
    buzz('art');
    if (id === 'nova') { audio.play('frost'); fx.ring(x, y, cls.skill.r, '#d8f2ff', 0.45, 0.12); fx.burst(x, y, 18, { color: ['#e8f8ff', '#9fd8ff'], speed: 3, life: 0.5, size: 0.07, gravity: 0 }); }
    else if (id === 'volley') audio.play('volley');
    else if (id === 'charge') { audio.play('gallop'); fx.text(x, y - 0.9, 'CHARGE!', { color: '#ffd666', size: 0.32, bold: true }); }
    else if (id === 'leap') audio.play('roll');
  });
  g.on('champBoom', ({ x, y, r, kind }) => {
    if (kind === 'slam' || kind === 'meteor') { audio.play(kind === 'meteor' ? 'boom' : 'slam'); fx.shake(kind === 'meteor' ? 0.25 : 0.18, 0.25); buzz('boss', 80); }
    if (session.renderer.fx3 && kind !== 'bolt') session.renderer.fx3.boom(x, y, r, kind === 'meteor' ? 'meteor' : 'ball');
    else if (session.renderer.fx3) session.renderer.fx3.boom(x, y, r * 0.7, 'ball');
    fx.burst(x, y, kind === 'bolt' ? 8 : 20, { color: kind === 'bolt' ? ['#ffb347', '#ffdf8a'] : ['#ffb347', '#e0532f', '#8a8a8a'], speed: 3, life: 0.45, size: 0.08, gravity: 2 });
  });
  g.on('champDodge', () => audio.play('roll'));
  g.on('champFury', ({ id }) => {
    audio.play('fury'); buzz('record'); fx.shake(0.2, 0.3);
    session.banner?.(`${cls.fury.icon} ${cls.fury.name}!`, '', 'clear', 1000);
  });
  g.on('champLevel', ({ champ, level }) => {
    audio.play('rank'); buzz('upgrade');
    fx.text(champ.x, champ.y - 1.1, `LEVEL ${level}!`, { color: '#ffd666', size: 0.42, bold: true, life: 1.4 });
    fx.ring(champ.x, champ.y, 0.9, 'rgba(255,214,102,0.95)', 0.6, 0.1);
  });
  g.on('champDown', ({ respawn }) => { audio.play('fall'); buzz('leak', 300); toast(`You have fallen. You rise again at the keep in ${Math.ceil(respawn)} seconds.`, { key: 'champdown', ms: 2200 }); });
  g.on('champRise', ({ champ }) => { if (champ.deaths) { audio.play('rally'); fx.ring(champ.x, champ.y, 0.8, 'rgba(170,225,255,0.9)', 0.6, 0.1); } });
  g.on('champStruck', ({ enemy }) => { if (enemy.boss) { audio.play('stomp'); fx.shake(0.12, 0.2); buzz('leak', 200); } else buzz('tap', 250); });
  g.on('champShotAt', ({ champ, enemy }) => { session.renderer.onFoeShot?.(enemy, champ); });
  g.on('captain', ({ enemy }) => {
    audio.play('roar'); buzz('boss');
    session.banner?.(`⚔ ${enemy.champion}`, 'A horde captain comes for you. Cut them down!', 'boss', 2200);
    fx.ring(enemy.x, enemy.y, 1.4, '#ff6a4a', 0.8, 0.12);
  });
  g.on('captainSlain', ({ enemy }) => {
    audio.play('achievement'); buzz('record'); fx.shake(0.2, 0.3);
    fx.text(enemy.x, enemy.y - 1, `${enemy.champion} slain!`, { color: '#ffd666', size: 0.4, bold: true, life: 1.8 });
    fx.burst(enemy.x, enemy.y - 0.4, 26, { color: ['#f2b33d', '#ffffff', '#d9473b'], speed: 4, life: 1.1, size: 0.08, gravity: 3, shape: 'star' });
  });
}
