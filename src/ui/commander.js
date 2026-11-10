// Commander Mode on screen: the command deck in an arc round the FIRE button, the ⚡ bar, the Ultimate, the active
// reload on the FIRE ring, Fever, the quest and bounty strip, arrows to threats out of view, perk cards, the
// engineers' orders and keys. Rules in src/game/commander.js; the first-person aim and FIRE button in herocontrols.js.
import { h, toast, modal, fmt } from './dom.js';
import { buzz } from './haptics.js';
import { audio } from '../game/audio.js';
import { saveProfile } from '../meta/profile.js';
import { COMMANDER, COMMANDS, DOCTRINES, ULTS, PERKS, BUILD_ORDERS, perkTip } from '../game/commander.js';

const CMD_KEYS = ['1', '2', '3', '4'];
// How FIRE picks its target when your crosshair is not on anyone.
export const PRIORITIES = [
  { id: 'aim', icon: '⌖', name: 'Crosshair' },
  { id: 'gate', icon: '🏰', name: 'Nearest gate' },
  { id: 'tough', icon: '🐘', name: 'Toughest' },
  { id: 'air', icon: '🦅', name: 'Flyers first' },
];

export class CommanderControls {
  constructor(session) {
    this.s = session;
    const g = session.game, C = g.cmdr;
    this.g = g; this.C = C;
    this.cache = {};
    document.body.classList.add('cmdr-mode');
    // the command deck, in an arc round FIRE
    this.btns = C.deck.map((id, i) => {
      const D = COMMANDS[id];
      const b = h('button', { class: `cm-btn c${i}`, type: 'button', 'aria-label': `${D.name} (${CMD_KEYS[i]}), ${D.cost} command points. ${D.blurb}`, title: `${D.name} (${CMD_KEYS[i]}) · ⚡${D.cost} · ${D.blurb}` },
        h('span', { class: 'ic', 'aria-hidden': 'true' }, D.icon), h('span', { class: 'cost', 'aria-hidden': 'true' }, '⚡' + D.cost), h('i', { class: 'cd' }), h('span', { class: 'cdn', 'aria-hidden': 'true' }), h('span', { class: 'k', 'aria-hidden': 'true' }, CMD_KEYS[i]));
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); this.use(id, b); });
      b.addEventListener('contextmenu', (e) => e.preventDefault());
      return b;
    });
    const U = ULTS[C.D.ult];
    this.ultBtn = h('button', { class: 'cm-ult', type: 'button', 'aria-label': `Ultimate: ${U.name}. ${U.blurb}`, title: `${U.name} (T): ${U.blurb}` },
      h('span', { class: 'ic', 'aria-hidden': 'true' }, U.icon), h('small', {}, U.name), h('i', { class: 'fill' }));
    this.ultBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); this.ult(); });
    // the ⚡ bar and the Commander's level
    this.cpPips = Array.from({ length: COMMANDER.cp.max + 6 }, () => h('i'));
    this.cpNum = h('b');
    this.lvEl = h('span', { class: 'cm-lv' });
    this.xpEl = h('i', { class: 'cm-xp' });
    this.cpBar = h('div', { class: 'cm-cp', 'aria-label': 'Command points' }, h('span', { class: 'bolt', 'aria-hidden': 'true' }, '⚡'), h('div', { class: 'pips' }, this.cpPips), this.cpNum);
    this.lvBox = h('div', { class: 'cm-lvbox', title: 'Commander level: slay foes by hand to level up and choose a perk' }, this.lvEl, h('div', { class: 'cm-xpbar' }, this.xpEl));
    // the strip: quest, bounty, what is armed or running
    this.quest = h('div', { class: 'cm-pill cm-quest' });
    this.bounty = h('div', { class: 'cm-pill cm-bounty', hidden: true });
    this.buffs = h('div', { class: 'cm-buffs' });
    this.strip = h('div', { class: 'cm-strip' }, this.quest, this.bounty, this.buffs);
    // where FIRE aims when the crosshair is on no one, and the engineers' orders
    const st = session.p.settings;
    if (!PRIORITIES.some((x) => x.id === st.cmdPrio)) st.cmdPrio = 'aim';
    this.prioBtn = h('button', { class: 'cm-chip cm-prio', type: 'button', title: 'Target priority: who FIRE locks on to when your crosshair is on no one' });
    this.prioBtn.addEventListener('click', (e) => { e.stopPropagation(); const i = PRIORITIES.findIndex((x) => x.id === st.cmdPrio); st.cmdPrio = PRIORITIES[(i + 1) % PRIORITIES.length].id; saveProfile(session.p); this.cache.prio = null; audio.play('click'); toast(`Target: ${PRIORITIES.find((x) => x.id === st.cmdPrio).name}`, { key: 'prio', ms: 900 }); });
    this.orderBtn = h('button', { class: 'cm-chip cm-order', type: 'button', title: 'Orders for your engineers: what they spend the treasury on' });
    this.orderBtn.addEventListener('click', (e) => { e.stopPropagation(); this.showOrders(); });
    this.perkBtn = h('button', { class: 'cm-chip cm-perks', type: 'button', title: 'The perks you carry, with their stacks' });
    this.perkBtn.addEventListener('click', (e) => { e.stopPropagation(); this.showBuild(); });
    this.questBtn = h('button', { class: 'cm-chip cm-request', type: 'button', title: 'Swap this wave\'s quest for another (once a run)' }, '↻ Quest');
    this.questBtn.addEventListener('click', (e) => { e.stopPropagation(); if (C.rerollQuest()) { audio.play('rank'); toast('New quest: ' + C.quest.text, { key: 'qrr', ms: 1400 }); this.cache.quest = null; } else audio.play('error'); });
    // arrows at the edge of the view for threats you cannot see
    this.arrows = [0, 1, 2].map(() => h('div', { class: 'cm-arrow', hidden: true }, h('i'), h('span')));
    this.reloadTxt = h('span', { class: 'cm-tap', hidden: true }, 'TAP!');
    this.vig = h('div', { class: 'cm-vig', 'aria-hidden': 'true' });
    this.els = [...this.btns, this.ultBtn, this.cpBar, this.lvBox, this.strip, this.prioBtn, this.orderBtn, this.perkBtn, this.questBtn, ...this.arrows];
    session.wrap.append(this.vig, ...this.els);
    session.heroCtl?.fire.prepend(this.reloadTxt);   // (the ammo count stays the button's last child: HeroControls writes it there)
    this.onKey = (e) => {
      if (e.target.closest?.('input, textarea') || document.querySelector('.modal-back') || e.ctrlKey || e.metaKey || e.altKey) return;
      const i = CMD_KEYS.indexOf(e.key);
      if (i >= 0 && C.deck[i]) { e.preventDefault(); e.stopImmediatePropagation(); this.use(C.deck[i], this.btns[i]); return; }
      const k = e.key.toLowerCase();
      if (k === 't') { e.preventDefault(); e.stopImmediatePropagation(); this.ult(); }
      else if (k === 'o') { e.preventDefault(); e.stopImmediatePropagation(); this.showOrders(); }
    };
    window.addEventListener('keydown', this.onKey, true);
    this.wire();
  }

  // shown in the wall view, and in the classic view when 3D is not available (not in the other 3D views)
  get on() { const r = this.s.renderer; return !this.g.over && !this.s.tutorial && (!!r?.isWall || !r?.proj); }

  // ---------- actions ----------
  use(id, b) {
    const g = this.g, C = this.C, D = COMMANDS[id], ctl = this.s.heroCtl;
    const why = C.cmdBlock(id);
    if (why) {
      audio.play('error'); this.shake(b);
      if (why === 'cp') toast(`Not enough ⚡ for ${D.name} (${D.cost})`, { key: 'cmdcp', ms: 900 });
      else if (why === 'wave') toast('Commands work while a wave is on', { key: 'cmdw', ms: 900 });
      return false;
    }
    const lock = ctl?.lock && !ctl.lock.dead ? ctl.lock : ctl?.pick?.() || null;
    let pt = null;
    if (D.aim) { pt = ctl?.artPoint?.() || (lock ? { x: lock.x, y: lock.y } : null); if (!pt) { audio.play('error'); toast('Aim at the horde first', { key: 'cmdaim', ms: 900 }); return false; } }
    if (D.foe && !lock) { audio.play('error'); toast('Lock on to a foe first', { key: 'cmdaim', ms: 900 }); return false; }
    const ok = C.command(id, pt, lock);
    if (ok) { buzz('tap', 50); b?.classList.remove('pop'); void b?.offsetWidth; b?.classList.add('pop'); }
    return ok;
  }
  ult() {
    const C = this.C;
    if (!C.useUlt()) { audio.play('error'); this.shake(this.ultBtn); if (C.ult < COMMANDER.ult.need) toast(`Ultimate ${Math.floor(100 * C.ult / COMMANDER.ult.need)}%: hit, kill and land perfect reloads to charge it`, { key: 'ult', ms: 1200 }); }
  }
  shake(b) { if (!b) return; b.classList.remove('nope'); void b.offsetWidth; b.classList.add('nope'); }
  showOrders() {
    const C = this.C;
    if (this.orderModal) return;
    const pick = (id) => { C.setOrder(id); this.orderModal?.close(); };
    this.orderModal = modal([h('h2', {}, '🛠 Orders for the engineers'), h('p', { class: 'muted' }, 'They build and mend by themselves. Tell them what matters most this stretch.'),
      h('div', { class: 'opt-list' }, Object.entries(BUILD_ORDERS).map(([id, O]) => h('button', { class: 'opt', 'aria-pressed': String(C.order === id), onclick: () => pick(id) },
        h('span', { class: 'box' }, C.order === id ? '✓' : ''), h('span', {}, h('b', {}, `${O.icon} ${O.name}`), h('small', {}, O.blurb)), h('span', {}))))],
    { onClose: () => { this.orderModal = null; } });
  }
  // Every perk you carry, with its stack count and what it does.
  showBuild() {
    const C = this.C;
    if (this.buildModal) return;
    const have = Object.entries(C.perks).filter(([id, n]) => n > 0 && PERKS[id]);
    this.buildModal = modal([h('h2', {}, `🎖 Your build · level ${C.lv}`),
      have.length ? h('div', { class: 'opt-list' }, have.map(([id, n]) => h('div', { class: 'opt' }, h('span', { class: 'box' }, `${n}`), h('span', {}, h('b', {}, `${PERKS[id].icon} ${PERKS[id].name} ${n}/${PERKS[id].max}`), h('small', {}, PERKS[id].desc)), h('span', {}))))
        : h('p', { class: 'muted' }, 'No perks yet. Slay foes by hand to level up and choose one.'),
      h('button', { class: 'btn ghost', onclick: () => this.buildModal?.close() }, 'Close')], { onClose: () => { this.buildModal = null; } });
  }
  showPerks() {
    const C = this.C;
    if (!C.offer || this.perkModal || this.s.boonModal) return;
    const pick = (id) => { C.choosePerk(id); this.perkModal?.close(); };
    const cards = C.offer.map((id, i) => {
      const P = PERKS[id], have = C.perk(id);
      return h('button', { class: 'boon rare cm-perk', style: { animationDelay: i * 0.07 + 's' }, onclick: () => pick(id) },
        h('span', { class: 'r' }, `${P.icon} COMMANDER PERK`), h('span', { class: 'n' }, P.name), h('span', { class: 'd' }, P.desc), perkTip(id, C) ? h('span', { class: 'd tip' }, '💡 ' + perkTip(id, C)) : null, have ? h('span', { class: 'stk' }, `You have ${have}/${P.max}`) : null);
    });
    const cost = C.rerollCost(), canRe = !C.rerolled && this.g.gold >= cost;
    const reroll = h('button', { class: 'btn small', disabled: C.rerolled || this.g.gold < cost, title: C.rerolled ? 'Already rerolled this level' : `Costs ${cost} gold from the treasury`, onclick: () => { if (C.rerollPerks()) { this.perkModal?.close(); } } }, C.rerolled ? '↻ Rerolled' : `↻ Reroll · ${cost} gold${canRe ? '' : ' (not enough)'}`);
    this.perkModal = modal([h('h2', {}, `🎖 Commander level ${C.lv - C.pending + 1}`), h('p', { class: 'muted' }, 'Choose a perk. It lasts for the rest of the run.'), h('div', { class: 'boons' }, cards), h('div', { class: 'row', style: { justifyContent: 'center', marginTop: '.5rem' } }, reroll)],
      { wide: true, dismiss: false, onClose: () => { this.perkModal = null; } });
  }

  // ---------- events ----------
  wire() {
    const g = this.g, s = this.s, fx = s.fx;
    const once = (key, ms) => { const now = performance.now(); if (now - (this['_' + key] || 0) < ms) return false; this['_' + key] = now; return true; };
    const at = (x, y, t, o) => fx.text(x, y, t, { size: 0.3, bold: true, life: 1, ...o });
    g.on('command', ({ id, x, y }) => {
      const D = COMMANDS[id];
      audio.play(id === 'overcharge' ? 'zap' : id === 'shield' ? 'repair' : id === 'muster' ? 'muster' : id === 'plunder' ? 'coin' : id === 'frost' ? 'frost' : 'volley');
      if (x != null) { fx.ring(x, y, id === 'firebomb' || id === 'volley' ? 1.1 : 0.6, 'rgba(255,214,102,0.9)', 0.5, 0.08); at(x, y - 0.8, `${D.icon} ${D.name}`, { color: '#ffd666', size: 0.26 }); }
      else { const c = g.map.castle; at(c.x, c.y - 1.2, `${D.icon} ${D.name}!`, { color: '#ffd666' }); }
      if (id === 'overcharge') for (const t of g.towers) if (!t.ruined) fx.ring(t.cx, t.cy, 0.5, 'rgba(140,220,255,0.9)', 0.4, 0.06);
    });
    g.on('cmdrStrike', ({ x, y, kind, r }) => {
      s.renderer.fx3?.boom?.(x, y, Math.max(0.35, r || 0.3), 'ball');
      fx.burst(x, y - 0.2, kind === 'storm' ? 4 : 8, { color: ['#fff', '#ffd666', '#b0a080'], speed: 2, life: 0.3, size: 0.06, gravity: 2 });
      if (kind === 'volley' || Math.random() < 0.3) audio.play('arrow');
    });
    g.on('perfectReload', () => { audio.play('rank'); buzz('art'); this.flashFire('perfect'); const c = g.map.castle; at(c.x, c.y - 1.5, '✨ PERFECT RELOAD', { color: '#ffd666', size: 0.32 }); });
    g.on('jam', () => { audio.play('error'); buzz('leak', 80); this.flashFire('jam'); });
    g.on('fever', ({ on }) => {
      s.wrap.classList.toggle('cm-fever', on);
      if (on) { audio.play('fury'); buzz('record'); s.banner('🔥 FEVER!', 'Every shot is free: hold FIRE!', 'record', 1300); }
    });
    g.on('ultimate', ({ kind }) => {
      const U = ULTS[kind];
      audio.play('boss'); buzz('boss'); fx.shake(0.3, 0.5); s.wrap.classList.add('cm-ulting');
      s.banner(`${U.icon} ${U.name}!`, '', 'record', 1400);
      if (kind === 'warp') s.wrap.classList.add('cm-warp');
    });
    g.on('ultimateEnd', () => s.wrap.classList.remove('cm-ulting', 'cm-warp'));
    g.on('weakPoint', ({ enemy }) => { if (once('weak', 2000)) at(enemy.x, enemy.y - 1.3, '◎ Weak point! Shoot it!', { color: '#ff9a6a', size: 0.28 }); audio.play('mark'); });
    g.on('weakHit', ({ enemy }) => { at(enemy.x, enemy.y - 1.1, 'WEAK SPOT!', { color: '#ff7a4a', size: 0.34 }); audio.play('clangHit'); fx.shake(0.08, 0.12); s.hitStop = 0.06; });
    g.on('bounty', ({ enemy }) => { audio.play('coin'); toast(h('div', {}, h('b', {}, `💰 Bounty: ${enemy.def.name}`), h('div', { class: 'muted' }, 'Slay it by hand for gold and ⚡.')), { key: 'bounty', ms: 2200, icon: '💰' }); });
    g.on('bountySlain', ({ enemy, gold }) => { audio.play('coin'); audio.play('achievement'); buzz('record'); at(enemy.x, enemy.y - 1, `💰 Bounty! +${fmt(gold)}`, { color: '#ffd666', size: 0.36 }); for (let i = 0; i < 5; i++) s.renderer.addLoot?.(enemy.x, enemy.y, 1, i % 2 ? 'coin' : 'gem'); });
    g.on('bountyLost', () => toast('The bounty got away', { key: 'bounty', ms: 1200 }));
    g.on('questDone', ({ quest, gold }) => { audio.play('achievement'); s.banner(`${quest.icon} Quest complete`, `${quest.text} · +${fmt(gold)} gold, +3 ⚡`, 'clear', 1600); });
    g.on('cmdrLevel', ({ lv }) => { audio.play('rank'); const c = g.map.castle; at(c.x, c.y - 1.7, `🎖 Commander level ${lv}!`, { color: '#9fd8ff', size: 0.32 }); });
    g.on('perk', ({ id }) => toast(`${PERKS[id].icon} ${PERKS[id].name}: ${PERKS[id].desc}`, { key: 'perk', ms: 1600 }));
    g.on('cmdrStreak', ({ n }) => { audio.play('combo'); s.banner(n >= 50 ? '☠ UNSTOPPABLE' : n >= 25 ? '🔥 RAMPAGE' : '⚔ KILLING SPREE', `${n} by hand without a breach · +2 ⚡`, 'record', 1300); });
    g.on('streakEnd', ({ n }) => toast(`Streak ended at ${n}`, { key: 'streak', ms: 1000 }));
    g.on('buildOrder', ({ id }) => toast(`${BUILD_ORDERS[id].icon} Engineers: ${BUILD_ORDERS[id].name}`, { key: 'order', ms: 1200 }));
    g.on('frosted', ({ enemy }) => fx.burst(enemy.x, enemy.y - 0.3, 4, { color: ['#bfefff', '#fff'], speed: 1, life: 0.35, size: 0.06, gravity: 0 }));
  }
  flashFire(kind) { const f = this.s.heroCtl?.fire; if (!f) return; f.classList.remove('cm-perfect', 'cm-jam'); void f.offsetWidth; f.classList.add('cm-' + kind); clearTimeout(this._ff); this._ff = setTimeout(() => f.classList.remove('cm-' + kind), 500); }

  set(key, val, fn) { if (this.cache[key] !== val) { this.cache[key] = val; fn(val); } }

  // ---------- every frame ----------
  tick() {
    const g = this.g, C = this.C, show = this.on;
    this.set('show', show, (v) => { for (const el of this.els) if (!el.classList.contains('cm-arrow')) el.hidden = !v; this.s.wrap.classList.toggle('cm-on', v); });
    if (C.offer && !this.perkModal && !this.s.boonModal && !document.querySelector('.modal-back')) this.showPerks();
    if (!show) { for (const a of this.arrows) a.hidden = true; return; }
    // the deck
    C.deck.forEach((id, i) => {
      const D = COMMANDS[id], b = this.btns[i], cd = Math.max(0, C.cds[id]), frac = cd / Math.max(0.01, C.cmdCd(id));
      const armed = (id === 'frost' && C.frostShots > 0) || (id === 'pierce' && C.pierceShots > 0) || (id === 'overcharge' && C.overT > 0) || (id === 'shield' && C.shieldT > 0) || (id === 'plunder' && C.plunderT > 0) || (id === 'mark' && C.mark);
      this.set('b' + i, `${Math.round(frac * 30)}|${Math.ceil(cd)}|${C.cp >= D.cost ? 1 : 0}|${armed ? 1 : 0}|${g.phase}`, () => {
        b.querySelector('.cd').style.height = (frac * 100) + '%';
        b.querySelector('.cdn').textContent = cd > 0 ? String(Math.ceil(cd)) : '';
        b.classList.toggle('ready', !frac && C.cp >= D.cost && g.phase === 'wave');
        b.classList.toggle('poor', C.cp < D.cost);
        b.classList.toggle('armed', !!armed);
      });
    });
    // ⚡ and level
    const max = C.cpMax();
    this.set('cp', Math.floor(C.cp * 4) + '|' + max + '|' + C.cpRegen().toFixed(1), () => {
      this.cpPips.forEach((p, i) => { p.hidden = i >= max; p.className = C.cp >= i + 1 ? 'on' : C.cp > i ? 'part' : ''; if (C.cp > i && C.cp < i + 1) p.style.setProperty('--f', (C.cp - i).toFixed(2)); });
      this.cpNum.textContent = `${Math.floor(C.cp)}/${max} · +${C.cpRegen().toFixed(1)}/s`;
    });
    const need = COMMANDER.xp.need(C.lv);
    this.set('lv', C.lv + '|' + Math.round(20 * C.xp / need), () => { this.lvEl.textContent = `Lv ${C.lv}`; this.xpEl.style.width = (100 * C.xp / need) + '%'; });
    const uf = C.ult / COMMANDER.ult.need, ready = C.ultReady(), running = C.ultT > 0 || C.ultQueue.length > 0;
    this.set('ult', Math.round(uf * 50) + '|' + ready + '|' + running, () => { this.ultBtn.style.setProperty('--u', uf.toFixed(3)); this.ultBtn.classList.toggle('ready', ready); this.ultBtn.classList.toggle('running', running); });
    // the active reload, drawn on the FIRE ring
    const w = C.reloadWindow(), f = this.s.heroCtl?.fire;
    if (f) {
      this.set('rw', w ? `${Math.round(w.p * 60)}|${w.jammed}` : 'none', () => {
        f.classList.toggle('cm-reloading', !!w); f.classList.toggle('cm-jammed', !!w?.jammed);
        if (w) { f.style.setProperty('--wa', w.a.toFixed(3)); f.style.setProperty('--wb', w.b.toFixed(3)); f.style.setProperty('--wp', w.p.toFixed(3)); }
        const inWin = w && !w.jammed && w.p >= w.a && w.p <= w.b;
        this.reloadTxt.hidden = !inWin; f.classList.toggle('cm-window', !!inWin);
      });
      f.classList.toggle('cm-free', C.feverT > 0);
    }
    // the strip
    const Q = C.quest;
    this.set('quest', Q ? `${Q.id}|${Q.prog}|${Q.done}|${Q.failed}` : '', () => {
      this.quest.hidden = !Q;
      if (Q) { this.quest.replaceChildren(...[h('span', {}, Q.done ? '✅ ' : Q.failed ? '✖ ' : Q.icon + ' '), h('span', { class: 'tx' }, Q.text), !Q.done && !Q.failed && Q.goal > 1 ? h('small', {}, ` ${Math.min(Q.prog, Q.goal)}/${Q.goal}`) : null].filter(Boolean)); this.quest.classList.toggle('done', Q.done); this.quest.classList.toggle('failed', !!Q.failed); }
    });
    const B = C.bounty && !C.bounty.dead ? C.bounty : null;
    this.set('bounty', B ? B.uid || B.type : '', () => { this.bounty.hidden = !B; if (B) this.bounty.textContent = `💰 Bounty: ${B.def.name}`; });
    const buffs = [C.feverT > 0 && `🔥 Fever ${Math.ceil(C.feverT)}s`, C.perfectT > 0 && `✨ +25% ${Math.ceil(C.perfectT)}s`, C.frostShots > 0 && `❄ ×${C.frostShots}`, C.pierceShots > 0 && '💥 armed', C.overT > 0 && `⚡ Overcharge ${Math.ceil(C.overT)}s`, C.shieldT > 0 && `🛡 ${Math.ceil(C.shieldT)}s`, C.plunderT > 0 && `💰 ×2 ${Math.ceil(C.plunderT)}s`, C.mark && !C.mark.dead && '🎯 marked'].filter(Boolean);
    this.set('buffs', buffs.join('|'), () => this.buffs.replaceChildren(...buffs.map((t) => h('span', { class: 'cm-buff' }, t))));
    const P = PRIORITIES.find((x) => x.id === this.s.p.settings.cmdPrio) || PRIORITIES[0];
    this.set('prio', P.id, () => { this.prioBtn.textContent = `${P.icon} ${P.name}`; });
    const nPerk = Object.values(C.perks).reduce((a, b) => a + b, 0);
    this.set('perkbtn', nPerk, (n) => { this.perkBtn.textContent = `🎖 Perks ${n}`; });
    const canQ = !!C.quest && !C.quest.done && !C.questRerolled && g.phase === 'wave';
    this.set('qbtn', canQ, (v) => { this.questBtn.hidden = !v || !this.on; });
    this.set('order', C.order, (id) => { this.orderBtn.textContent = `${BUILD_ORDERS[id].icon} ${BUILD_ORDERS[id].name}`; });
    this.arrowsTick();
  }

  // Arrows at the edge of the view: foes about to breach, bosses and the bounty, when the view does not show them.
  arrowsTick() {
    const g = this.g, r = this.s.renderer, c = g.map.castle;
    if (!r?.proj || !r.isWall || g.phase !== 'wave') { for (const a of this.arrows) a.hidden = true; return; }
    const list = [];
    for (const e of g.enemies) {
      if (e.dead || e.burrowT > 0) continue;
      const near = Math.hypot(e.x - c.x, e.y - c.y) < 2.6;
      if (near || e.boss || e.bounty || e.champion) list.push({ e, k: near ? 0 : e.boss ? 1 : 2 });
    }
    list.sort((a, b) => a.k - b.k);
    r.matrices?.();
    const W = r.w, H = r.h, pad = 30;
    let n = 0;
    for (const { e, k } of list) {
      if (n >= this.arrows.length) break;
      const p = r.proj(e.x, e.y, 0.3);
      if (p && p.x > 0 && p.x < W && p.y > 0 && p.y < H) continue;
      // off screen (or behind): point from the middle towards where it is, in the direction it lies on the ground
      let dx, dy;
      if (p) { dx = p.x - W / 2; dy = p.y - H / 2; }
      else if (r.vp) {   // behind the camera: clip-space x still says which way to turn; such arrows sit low on the screen
        const m = r.vp.elements, h0 = 0.3, cx = m[0] * e.x + m[4] * h0 + m[8] * e.y + m[12];
        dx = (cx >= 0 ? 1 : -1) * W; dy = H * 0.35;
      } else continue;
      const kk = Math.min((W / 2 - pad) / Math.abs(dx || 1e-6), (H / 2 - pad) / Math.abs(dy || 1e-6));
      const ax = W / 2 + dx * kk, ay = H / 2 + dy * kk, ang = Math.atan2(dy, dx);
      const el = this.arrows[n++];
      el.hidden = false; el.style.transform = `translate(${ax.toFixed(0)}px, ${ay.toFixed(0)}px)`;
      el.firstChild.style.transform = `rotate(${ang.toFixed(3)}rad)`;
      el.lastChild.textContent = k === 0 ? '🏰' : e.boss ? '👑' : e.bounty ? '💰' : '⭐';
      el.className = 'cm-arrow ' + (k === 0 ? 'gate' : e.boss ? 'boss' : 'bounty');
    }
    for (; n < this.arrows.length; n++) this.arrows[n].hidden = true;
  }

  destroy() {
    window.removeEventListener('keydown', this.onKey, true);
    for (const el of this.els) el.remove();
    this.reloadTxt.remove(); this.vig.remove();
    this.orderModal?.close(); this.perkModal?.close(); this.buildModal?.close();
    this.s.wrap.classList.remove('cm-fever', 'cm-ulting', 'cm-warp', 'cm-on');
    document.body.classList.remove('cmdr-mode');
  }
}

export { DOCTRINES };
