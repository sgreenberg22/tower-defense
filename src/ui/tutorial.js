// First-run onboarding: placement, personal weapon, build phase. Non-blocking, skippable.
import { h } from './dom.js';
import { saveProfile } from '../meta/profile.js';
import { isBuildable } from '../game/maps.js';

export class Tutorial {
  constructor(session) {
    this.s = session;
    this.step = 0;
    this.shots = 0;
    this.root = document.getElementById('app');
    this.bubble = h('div', { class: 'tut' });
    this.pulse = h('div', { class: 'tut-pulse' });
    this.root.append(this.pulse, this.bubble);
    this.steps = [
      { text: 'Welcome, commander. Pick the Archer Tower from the build bar.', target: () => this.s.el.tbtns.archer, on: 'select' },
      { text: 'Now tap the glowing tile beside the road to build it. On a touch screen, tap twice.', tile: () => this.bestTile(), on: 'build' },
      { text: 'Good. Add one or two more towers if you like, then press Start wave.', target: () => this.s.el.start, on: 'waveStart' },
      { text: 'Tap enemies to fire your own bow. Aim for heads, and hold to charge a power shot. Land three hits.', target: null, on: 'shot', count: 3 },
      { text: 'Nice shooting! Your hits build a combo for bonus points. Finish the wave.', target: null, on: 'waveClear' },
      { text: 'Between waves, tap a tower to upgrade it, or open the War Room to repair and upgrade your bow.', target: () => this.s.el.war, on: 'selectTower', next: true },
      { text: 'Start waves early for bonus gold. Every few waves you pick a boon. Hold the line!', target: () => this.s.el.start, next: true, done: true },
    ];
    this.render();
  }

  bestTile() {
    const g = this.s.game;
    let best = null, bc = -1;
    for (const [k, c] of g.map.coverage) {
      const x = k % g.map.cols, y = Math.floor(k / g.map.cols);
      if (isBuildable(g.map, x, y) && !g.towerAt(x, y) && c > bc) { bc = c; best = { x, y }; }
    }
    return best;
  }

  render() {
    const st = this.steps[this.step];
    if (!st) return this.finish();
    const kids = [h('p', {}, st.text)];
    const row = h('div', { class: 'row' });
    if (st.next) row.append(h('button', { class: 'btn small gold', onclick: () => (st.done ? this.finish() : this.advance()) }, st.done ? 'Got it' : 'Next'));
    row.append(h('button', { class: 'btn small ghost', onclick: () => this.finish() }, 'Skip tutorial'));
    kids.push(row);
    this.bubble.replaceChildren(h('div', { class: 'plaque' }, kids));
    this.place();
  }

  place() {
    const st = this.steps[this.step];
    if (!st) return;
    // During a wave the bubble becomes fully click-through so it never blocks a shot.
    this.bubble.classList.toggle('passive', this.s.game.phase === 'wave');
    const wr = { width: window.innerWidth, height: window.innerHeight };
    let rect = null;
    if (st.target) {
      const el = st.target();
      if (el) { const r = el.getBoundingClientRect(); rect = { x: r.left, y: r.top, w: r.width, h: r.height }; }
    } else if (st.tile) {
      const t = st.tile();
      if (t) { const R = this.s.renderer; const cr = this.s.canvas.getBoundingClientRect(); rect = { x: cr.left + R.ox + t.x * R.ts, y: cr.top + R.oy + t.y * R.ts, w: R.ts, h: R.ts }; }
    }
    if (rect) {
      Object.assign(this.pulse.style, { left: rect.x - 4 + 'px', top: rect.y - 4 + 'px', width: rect.w + 8 + 'px', height: rect.h + 8 + 'px', display: 'block' });
      const bw = Math.min(300, wr.width - 16);
      let bx = Math.min(Math.max(8, rect.x + rect.w / 2 - bw / 2), wr.width - bw - 8);
      let by = rect.y > wr.height / 2 ? Math.max(8, rect.y - 150) : Math.min(wr.height - 150, rect.y + rect.h + 12);
      Object.assign(this.bubble.style, { left: bx + 'px', top: by + 'px', width: bw + 'px' });
    } else {
      this.pulse.style.display = 'none';
      Object.assign(this.bubble.style, { left: '50%', top: '64px', transform: 'translateX(-50%)', width: Math.min(320, wr.width - 16) + 'px' });
      return;
    }
    this.bubble.style.transform = '';
  }

  tick() { if (this.step < this.steps.length) this.place(); }

  event(name) {
    const st = this.steps[this.step];
    if (!st || st.on !== name) return;
    if (st.count) { this.shots++; if (this.shots < st.count) return; }
    this.advance();
  }
  advance() { this.step++; this.render(); }

  finish() {
    this.s.p.tutorialDone = true;
    saveProfile(this.s.p);
    this.destroy();
    this.s.tutorial = null;
    this.s.game.tutorial = false;
    if (!Number.isFinite(this.s.game.buildTimer) && this.s.game.wave > 1) this.s.game.buildTimer = 30;
  }
  destroy() { this.bubble.remove(); this.pulse.remove(); this.step = 99; }
}
