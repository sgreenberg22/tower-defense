// App controller: screens, runs, settings, online sync.
import { touchStreak, ensureQuests } from './meta/quests.js';
import { loadProfile, saveProfile, loadRun, clearRun, recordRun, runBonus, checkAchievements } from './meta/profile.js';
import { Api, decodeChallenge } from './net/api.js';
import { audio } from './game/audio.js';
import { PlaySession } from './ui/play.js';
import { homeScreen, setupScreen, summaryScreen, keepScreen, achievementsScreen, statsScreen, settingsModal, socialScreen } from './ui/screens.js';
import { toast, h, confirmBox, fmt, modal } from './ui/dom.js';
import { realmGain } from './ui/realm.js';
import { hashStr, weekKey, monthKey } from './core/rng.js';
import { VERSION } from './data/balance.js';

class App {
  constructor() {
    this.profile = loadProfile();
    this.api = new Api(this.profile);
    this.session = null;
    this.clan = null; this.siege = null; this.rival = null; this.inboxCount = 0; this.realm = null;
    this.lastMap = 'meadow';
    this.where = 'home';
    this.applySettings();
    this.dailyLogin();
    const m = location.hash.match(/#c=([\w-]+)/);
    if (m) { this.pendingChallenge = decodeChallenge(m[1]); history.replaceState(null, '', location.pathname); }
    window.addEventListener('pointerdown', () => audio.init(), { once: true });
    this.showHome();
    this.refreshOnline();
    this.askName();
  }

  // Everyone needs a real name so they show up on the Realm roll and leaderboards.
  askName() {
    const p = this.profile;
    if (p.nameSet) return;
    const input = h('input', { type: 'text', maxlength: 20, placeholder: 'Your commander name', value: p.online ? p.name : '', 'aria-label': 'Commander name', style: { width: '100%' } });
    const err = h('div', { class: 'muted', style: { minHeight: '1.2em', color: '#ffb3a8' } });
    const go = async () => {
      const n = input.value.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim();
      if (n.length < 2) { err.textContent = 'Pick a name of at least 2 characters.'; return; }
      p.name = n.slice(0, 20); p.nameSet = true; saveProfile(p);
      box.close(); this.showHome();
      if (p.online) { try { const r = await this.api.rename(p.name); if (r?.name && r.name !== p.name) { p.name = r.name; saveProfile(p); toast(`That name was changed to ${r.name}`); this.showHome(); } } catch { /* offline: kept locally */ } }
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    const box = modal([
      h('h2', { style: { marginTop: 0 } }, 'Welcome to the Realm'),
      h('p', {}, 'Choose the name your fellow citizens will see on the leaderboards.'),
      input, err,
      h('div', { class: 'row', style: { justifyContent: 'flex-end', marginTop: '.6rem' } }, h('button', { class: 'btn gold', onclick: go }, 'Enter the Realm')),
    ], { dismiss: false });
  }

  dailyLogin() {
    const r = touchStreak(this.profile);
    ensureQuests(this.profile);
    saveProfile(this.profile);
    if (r.fresh) setTimeout(() => toast(`🔥 Day ${r.n} streak! +${r.bonus} Renown`), 800);
  }

  async refreshOnline() {
    const ok = await this.api.health();
    if (!ok) { if (this.where === 'home') this.showHome(); return; }
    try {
      if (!this.profile.online) { if (this.where === 'home') this.showHome(); return; }
      const me = await this.api.me();
      this.inboxCount = me.inbox || 0;
      this.clan = me.clan ? { ...me.clan, color: clanColor(me.clan.tag) } : null;
      this.siege = me.siege || null;
      this.rival = me.rival || null;
      try {
        await this.refreshRealm();
        if (this.realm.claimable && !this.realmNudged) { this.realmNudged = true; toast(`The Realm has spoils waiting: ✦ ${this.realm.claimable} Renown`, { kind: 'ach', icon: '👑', ms: 4500 }); }
      } catch { /* the Realm tab shows its own errors */ }
      if (me.name && me.name !== this.profile.name) { this.profile.name = me.name; saveProfile(this.profile); }
      if (me.seasonReward) {
        try {
          const c = await this.api.seasonClaim();
          if (c.title && !this.profile.titles.includes(c.title)) { this.profile.titles.push(c.title); saveProfile(this.profile); toast(`Season reward: the title "${c.title}"!`, { kind: 'ach', icon: '👑', ms: 5000 }); }
        } catch { /* ignore */ }
      }
    } catch { /* stay quiet; social screen shows errors */ }
    if (this.where === 'home') this.showHome();
  }

  // Blessings the whole Realm has earned so far this campaign. Remembered between visits, but only while the
  // week / month they were earned in is still current.
  realmPerks() {
    const r = this.profile.realmBlessing;
    if (!r) return {};
    const perks = {};
    for (const [k, v] of Object.entries(r.perks || {})) perks[k] = v;
    if (r.week !== weekKey() || r.month !== monthKey()) return {};
    return perks;
  }

  async refreshRealm() {
    const r = await this.api.realm();
    this.realm = r;
    this.profile.realmBlessing = { week: r.blessing.week, month: r.blessing.month, perks: r.blessing.perks };
    saveProfile(this.profile);
    return r;
  }

  runBonus() { return runBonus(this.profile, this.clan, this.realmPerks()); }

  applySettings() {
    const s = this.profile.settings;
    const root = document.documentElement;
    root.style.setProperty('--ui-scale', s.uiScale);
    root.dataset.colorblind = String(!!s.colorblind);
    root.dataset.reducedMotion = String(!!s.reducedMotion);
    audio.set({ master: s.master, sfx: s.sfx, music: s.music, muted: s.muted });
    if (this.session) {
      const r = this.session.renderer, fx = this.session.fx;
      r.colorblind = s.colorblind; r.bgKey = '';
      r.quality = s.quality; r.reduced = !!s.reducedMotion;
      fx.setQuality(s.quality); fx.reduced = s.reducedMotion; fx.shakeOn = s.shake;
    }
    saveProfile(this.profile);
  }

  checkAch() {
    for (const a of checkAchievements(this.profile)) { toast(h('div', {}, h('b', {}, a.name), h('div', { class: 'muted' }, a.desc)), { kind: 'ach', icon: '🏆', ms: 3600 }); audio.play('achievement'); }
  }

  showHome() { this.where = 'home'; homeScreen(this); }
  showSetup(pre) { this.where = 'setup'; setupScreen(this, pre); }
  showKeep() { this.where = 'keep'; keepScreen(this); }
  showStats() { this.where = 'stats'; statsScreen(this); }
  showAchievements() { this.where = 'ach'; achievementsScreen(this); }
  showSocial(tab) { this.where = 'social'; socialScreen(this, tab); }
  openSettings(inGame) { settingsModal(this, inGame); }

  async startRun(opts) {
    const saved = loadRun();
    if (saved && !opts.save && !saved.tutorial) {
      const ok = await confirmBox(`Starting a new run replaces your saved run (wave ${saved.wave}). Continue?`, 'Start new run');
      if (!ok) return;
    }
    if (!opts.save) clearRun();
    const p = this.profile;
    const tutorial = !p.tutorialDone && !opts.save && (opts.mapId || 'meadow') === 'meadow' && (opts.mode || 'normal') === 'normal';
    this.where = 'game';
    audio.init();
    this.session = new PlaySession(this, { ...opts, tutorial });
    this.session.start();
  }

  resumeRun(save) {
    this.startRun({ save, seed: save.seed, mapId: save.mapId, mode: save.mode, modifiers: save.modifiers, ascension: save.ascension, weapon: save.weapon.id, challenge: save.challenge });
  }

  exitToHome() {
    this.session?.destroy();
    this.session = null;
    audio.stopMusic();
    this.showHome();
  }

  async finishRun(summary) {
    this.session = null;
    audio.stopMusic();
    const p = this.profile;
    const clanBonus = 0;
    const result = recordRun(p, summary, { clanBonus });
    this.where = 'summary';
    const box = summaryScreen(this, summary, result);
    for (const a of result.newAchievements) audio.play('achievement');
    // Online submission (best effort).
    if (!(await this.api.health())) { box.textContent = ''; return; }
    try {
      await this.api.ensureAccount();
      const r = await this.api.submitRun({
        v: VERSION, seed: summary.seed, map: summary.map, mode: summary.mode, modifiers: summary.modifiers, ascension: summary.ascension,
        wave: summary.wave, wavesCleared: summary.wavesCleared, score: summary.score, kills: summary.kills, heroKills: summary.heroKills,
        duration: summary.duration, bossDmg: summary.bossDmg, weapon: summary.weapon, title: p.title,
      });
      const bits = [];
      if (r.ranks?.wave) bits.push(`#${r.ranks.wave} this week by wave`);
      if (r.ranks?.daily) bits.push(`#${r.ranks.daily} in today's daily`);
      if (r.siege?.damage) { bits.push(`${fmt(r.siege.damage)} damage to the World Siege`); p.social.siegeDamage = (p.social.siegeDamage || 0) + r.siege.damage; saveProfile(p); }
      if (r.clan?.xp) bits.push(`+${fmt(r.clan.xp)} clan XP`);
      const kids = [];
      if (!r.accepted) kids.push(r.reason ? `Not ranked: ${r.reason}` : '');
      else {
        kids.push(bits.length ? bits.join(' · ') : 'Run recorded online.');
        if (r.realm) {
          const g = realmGain(this, r.realm);
          if (g) kids.push(g);
          const up = (c) => c.reached > c.reachedBefore;
          if (up(r.realm.week) || up(r.realm.month)) { audio.play('achievement'); this.profile.realmBlessing = null; }
        }
      }
      box.replaceChildren(...kids.map((k) => (typeof k === 'string' ? h('div', {}, k) : k)));
      this.checkAch();
      this.refreshOnline();
    } catch (e) {
      box.textContent = 'Could not reach the leaderboards. Your progress is saved on this device.';
    }
  }
}

function clanColor(tag) {
  const palette = ['#d9473b', '#3d7bd9', '#7fb24a', '#8a4fd8', '#e2b33c', '#2fb6c9', '#e07a3a', '#c94f8a'];
  return palette[hashStr(tag || '') % palette.length];
}

window.bastion = new App();
