// App controller: screens, runs, settings, online sync.
import { loadProfile, saveProfile, loadRun, clearRun, recordRun, runBonus, checkAchievements } from './meta/profile.js';
import { Api, decodeChallenge } from './net/api.js';
import { audio } from './game/audio.js';
import { PlaySession } from './ui/play.js';
import { homeScreen, setupScreen, summaryScreen, keepScreen, achievementsScreen, statsScreen, settingsModal, socialScreen } from './ui/screens.js';
import { toast, h, confirmBox, fmt } from './ui/dom.js';
import { hashStr } from './core/rng.js';
import { VERSION } from './data/balance.js';

class App {
  constructor() {
    this.profile = loadProfile();
    this.api = new Api(this.profile);
    this.session = null;
    this.clan = null; this.siege = null; this.rival = null; this.inboxCount = 0;
    this.lastMap = 'meadow';
    this.where = 'home';
    this.applySettings();
    const m = location.hash.match(/#c=([\w-]+)/);
    if (m) { this.pendingChallenge = decodeChallenge(m[1]); history.replaceState(null, '', location.pathname); }
    window.addEventListener('pointerdown', () => audio.init(), { once: true });
    this.showHome();
    this.refreshOnline();
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

  runBonus() { return runBonus(this.profile, this.clan); }

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
  showSocial() { this.where = 'social'; socialScreen(this); }
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
      box.textContent = r.accepted ? (bits.length ? bits.join(' · ') : 'Run recorded online.') : (r.reason ? `Not ranked: ${r.reason}` : '');
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
