// App controller: screens, runs, settings, online sync.
import { touchStreak, ensureQuests } from './meta/quests.js';
import { rallyStandard } from './meta/campaign.js';
import { loadProfile, saveProfile, loadRun, clearRun, runSlot, recordRun, runBonus, checkAchievements, loadoutFor, isMapUnlocked, isSquire, SQUIRE } from './meta/profile.js';
import { MAPS, MAP_ORDER } from './game/maps.js';
import { Api, decodeChallenge } from './net/api.js';
import { audio } from './game/audio.js';
import { isVanguardStart } from './meta/adaptive.js';
import { PlaySession } from './ui/play.js';
import { setupScreen, summaryScreen, keepScreen, achievementsScreen, statsScreen, settingsModal, socialScreen } from './ui/screens.js';
import { homeScreen, helpScreen } from './ui/home.js';
import { codexScreen } from './ui/codex.js';
import { prestigeScreen } from './ui/prestige.js';
import { lockZoom } from './ui/nozoom.js';
import { worldScreen } from './ui/world.js';
import { buildUsage } from './game/worldstats.js';
import { toast, h, confirmBox, fmt, modal } from './ui/dom.js';
import { realmGain, frontierLine } from './ui/realm.js';
import { togetherSummary } from './ui/together.js';
import { hashStr, weekKey, monthKey, seasonKey } from './core/rng.js';
import { isLivingMode, warlordFor } from './game/living.js';
import { settleDominion } from './ui/dominion.js';
import { sharedWorksPerks } from './ui/living.js';
import { VERSION } from './data/balance.js';
import { mapPerks, PROVINCES, scoutFoe } from './game/realmmap.js';
import { currentTheme, blessingFor } from './meta/events.js';
import { syncShowcase } from './ui/profile.js';
import { modesScreen } from './ui/modes.js';
import { isNewMode, isLocalMode } from './game/modes.js';
import { isAssaultMode } from './game/assault.js';
import { AssaultSession } from './ui/assault.js';
import { setAmbient } from './ui/ambient.js';
import { setHaptics, buzz } from './ui/haptics.js';
import { showSupplies } from './ui/supplies.js';
import { supplyToday } from './meta/supplies.js';
import { localDateKey } from './core/rng.js';

class App {
  constructor() {
    this.profile = loadProfile();
    this.api = new Api(this.profile);
    this.session = null;
    this.clan = null; this.siege = null; this.front = null; this.chronicle = null; this.rival = null; this.inboxCount = 0; this.realm = null;
    this.lastMap = 'meadow';
    this.where = 'home';
    this.applySettings();
    this.applyTheme();
    this.dailyLogin();
    const m = location.hash.match(/#c=([\w-]+)/);
    if (m) { this.pendingChallenge = decodeChallenge(m[1]); history.replaceState(null, '', location.pathname); }
    window.addEventListener('pointerdown', () => audio.init(), { once: true });
    // Screens animate in once. A screen that re-renders in place (a tab, a purchase, online data arriving) should not
    // replay its entrance, so each new screen is marked settled once its entrance has played.
    new MutationObserver(() => {
      for (const el of document.querySelectorAll('#screen > .screen-inner:not(.settled), #screen > .home.v2:not(.settled)')) if (!el._settle) el._settle = setTimeout(() => el.classList.add('settled'), 700);
    }).observe(document.getElementById('screen'), { childList: true });
    lockZoom();
    this.showHome();
    this.refreshOnline();
    this.askName();
    if (this.profile.nameSet && !this.pendingChallenge) setTimeout(() => this.offerSupplies(), 700);
  }

  // The day's supply chest pops up once, on the home screen, the first time the game opens each day.
  offerSupplies() {
    if (this.supplyOffered || this.where !== 'home' || document.querySelector('.modal-back')) return;
    if (!supplyToday(this.profile).ready) return;
    this.supplyOffered = true;
    showSupplies(this, { onDone: () => { if (this.where === 'home') this.showHome(); } });
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
      setTimeout(() => this.offerSupplies(), 500);
      if (!p.online) { this.refreshOnline(); return; }
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

  // Counts a run's progress toward the Realm mid-run (after waves, on Save and quit) so the goals move right away.
  async syncRealm(g, tries = 0) {
    const p = this.profile;
    if (!p.online || !g) return;
    // One sync at a time: a wave clear and a "hundred" event landing together must not send the same kills twice.
    if (this.syncing) { this.syncAgain = g; return; }
    let rs = p.runSync;
    if (!rs || rs.seed !== g.seed || g.stats.kills < rs.kills) rs = p.runSync = { seed: g.seed, kills: 0, waves: 0, hero: 0 };
    const d = { kills: g.stats.kills - rs.kills, waves: g.stats.wavesCleared - rs.waves, hero: g.stats.heroKills - rs.hero };
    if (d.kills <= 0 && d.waves <= 0) return;
    this.syncing = true;
    try {
      const r = await this.api.realmSync({ ...d, mode: g.mode === 'march' || g.mode === 'conquest' ? g.mode : undefined, standard: rallyStandard(this.profile) });
      if (r && r.ok) { rs.kills += r.added.kills; rs.waves += r.added.waves; rs.hero += r.added.hero; saveProfile(p); this.refreshRealm?.().catch(() => {}); }
      else if (r && r.limited && tries < 3) setTimeout(() => this.syncRealm(g, tries + 1), 6500);   // too soon after the last sync: send again shortly instead of waiting for the run to end
    } catch { /* the finished run submits whatever is left */ }
    finally {
      this.syncing = false;
      const again = this.syncAgain; this.syncAgain = null;
      if (again) setTimeout(() => this.syncRealm(again), 100);
    }
  }

  dailyLogin() {
    const r = touchStreak(this.profile);
    // Before Daily Supplies the streak Renown was paid on load; a player who already got it today has nothing to open.
    if (!r.fresh && this.profile.supplyDay === undefined) this.profile.supplyDay = localDateKey();
    ensureQuests(this.profile);
    saveProfile(this.profile);
  }

  // Sends runs that never reached the server (offline, closed tab, rate limit), oldest first.
  async flushPendingRuns() {
    const p = this.profile;
    if (this.flushing || !p.online || !(p.pendingRuns || []).length) return;
    this.flushing = true;
    try {
      let sent = 0;
      for (const item of [...p.pendingRuns]) {
        try {
          let r;
          try { r = await this.api.submitRun(item.payload); }
          catch (e) { if (e.status !== 429) throw e; await new Promise((res) => setTimeout(res, 21000)); r = await this.api.submitRun(item.payload); }
          p.pendingRuns = p.pendingRuns.filter((x) => x.id !== item.id); saveProfile(p);
          if (r?.accepted) sent++;
        } catch (e) {
          if (e.status && e.status < 500 && e.status !== 429 && e.status !== 408) { p.pendingRuns = p.pendingRuns.filter((x) => x.id !== item.id); saveProfile(p); }
          else break;
        }
      }
      if (sent) { toast(`📨 ${sent === 1 ? 'An earlier run was' : sent + ' earlier runs were'} sent to the Realm and the boards.`); this.refreshRealm?.().catch(() => {}); }
    } finally { this.flushing = false; }
  }

  async refreshOnline() {
    const ok = await this.api.health();
    if (!ok) { if (this.where === 'home') this.showHome(); return; }
    try {
      // Register as soon as the player has chosen a name, so the Realm and boards work before their first run ends.
      if (!this.profile.online && this.profile.nameSet) await this.api.ensureAccount();
      if (!this.profile.online) { if (this.where === 'home') this.showHome(); return; }
      const me = await this.api.me();
      this.flushPendingRuns().catch(() => {});
      this.inboxCount = me.inbox || 0; this.requestCount = me.requests || 0;
      syncShowcase(this);
      this.clan = me.clan ? { ...me.clan, color: clanColor(me.clan.tag) } : null;
      this.siege = me.siege || null;
      try { this.front = await this.api.front(); this.siege = this.front.siege; } catch { /* the home card falls back to its quiet state */ }
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
    const [r, f] = await Promise.all([this.api.realm(), this.api.front().catch(() => null)]);
    this.realm = r;
    if (f) { this.front = f; this.siege = f.siege; }   // the Rally bars on Home and Together read the front, so keep it as fresh as the Realm
    this.profile.realmBlessing = { week: r.blessing.week, month: r.blessing.month, perks: r.blessing.perks };
    if (r.decrees?.blessing) this.profile.decreeBlessing = { week: r.decrees.blessing.week, perks: r.decrees.blessing.perks || {}, names: r.decrees.blessing.names || [] };
    if (r.wonder) this.profile.wonders = { built: r.wonder.built | 0, at: Date.now() };
    if (r.map) {
      const prev = this.profile.realmMap || {};
      this.profile.realmMap = { ...prev, held: r.map.held, bulwark: r.map.bulwark, at: Date.now() };
      // Tell the player once when the border has moved since they last saw it (the map itself shows the details).
      const was = prev.toasted ?? prev.seen ?? prev.held;
      if (was != null && was !== r.map.held) {
        const gained = r.map.held > was, list = (gained ? PROVINCES.slice(was, r.map.held) : PROVINCES.slice(r.map.held, was)).map((p) => p.name);
        const names = list.length > 2 ? `${list.slice(0, 2).join(', ')} and ${list.length - 2} more` : list.join(' and ');
        toast(gained ? `🗺 The Realm took ${names}!` : `🗺 The horde took ${names}. Win the Rally to march back.`, { kind: gained ? 'ach' : '', icon: gained ? '🏰' : '⚠', ms: 5000, key: 'mapmove' });
      }
      this.profile.realmMap.toasted = r.map.held;
    }
    saveProfile(this.profile);
    return r;
  }

  // Realm blessings and today's weekday blessing stack.
  runBonus(extra = null) {
    const perks = { ...this.realmPerks() };
    // A Dominion battle adds the campaign's research and forts (see src/game/dominion.js battlePerks).
    for (const [k, v] of Object.entries(extra || {})) if (Number.isFinite(v)) perks[k] = (perks[k] || 0) + v;
    // Every province the Realm holds blesses the run; the last known map is kept for offline play.
    if (this.profile.realmMap?.held) for (const [k, v] of Object.entries(mapPerks(this.profile.realmMap.held))) perks[k] = (perks[k] || 0) + v;
    for (const [k, v] of Object.entries(blessingFor().perk || {})) perks[k] = (perks[k] || 0) + v;
    // The Realm's shared works: last week's fulfilled Royal Decrees and every Wonder that stands.
    for (const [k, v] of Object.entries(sharedWorksPerks(this.profile))) perks[k] = (perks[k] || 0) + v;
    const b = runBonus(this.profile, this.clan, perks);
    if (isSquire(this.profile)) { b.secondWind = true; b.startGold += SQUIRE.gold; b.squire = true; }
    return b;
  }

  // Seasonal look: palette variables on the page. The battlefield reads the same theme.
  applyTheme() {
    const root = document.documentElement;
    for (const k of this.themeVars || []) root.style.removeProperty(k);
    const t = currentTheme(this.profile);
    this.themeVars = t ? Object.keys(t.css) : [];
    if (t) for (const [k, v] of Object.entries(t.css)) root.style.setProperty(k, v);
    root.dataset.theme = t ? t.id : '';
    setAmbient(this.profile, t);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t ? t.theme : '#1b2140');
    if (this.session) this.session.renderer.theme = t;
  }

  // One switch for every sound and the music; the HUD and the home screen share it.
  toggleMute() {
    this.profile.settings.muted = !this.profile.settings.muted;
    this.applySettings();
    return this.profile.settings.muted;
  }

  muteButton(cls = '') {
    const b = h('button', { class: 'btn small mute-btn ' + cls, onclick: () => { this.toggleMute(); } });
    const paint = () => {
      const m = !!this.profile.settings.muted;
      b.textContent = (m ? '🔇' : '🔊') + (cls.includes('labelled') ? (m ? ' Sound off · tap to turn on' : ' Sound on') : '');
      b.title = m ? 'Sound is off. Click to turn it on (N)' : 'Turn off music and sounds (N)';
      b.setAttribute('aria-label', m ? 'Turn sound on' : 'Turn sound off');
      b.setAttribute('aria-pressed', String(m));
    };
    paint();
    (this.muteBtns ||= new Set()).add({ b, paint });
    return b;
  }

  applySettings() {
    const s = this.profile.settings;
    const root = document.documentElement;
    root.style.setProperty('--ui-scale', s.uiScale);
    root.dataset.colorblind = String(!!s.colorblind);
    root.dataset.reducedMotion = String(!!s.reducedMotion);
    setHaptics(s.haptics !== false);
    if (this.themeVars) this.applyTheme();
    audio.set({ master: s.master, sfx: s.sfx, music: s.music, muted: s.muted });
    if (this.session) {
      const r = this.session.renderer, fx = this.session.fx;
      r.colorblind = s.colorblind; r.bgKey = '';
      r.quality = s.quality; r.reduced = !!s.reducedMotion;
      fx.setQuality(s.quality); fx.reduced = s.reducedMotion; fx.shakeOn = s.shake;
    }
    for (const m of this.muteBtns || []) { if (m.b.isConnected) m.paint(); else this.muteBtns.delete(m); }
    saveProfile(this.profile);
  }

  checkAch() {
    for (const a of checkAchievements(this.profile)) { toast(h('div', {}, h('b', {}, a.name), h('div', { class: 'muted' }, a.desc)), { kind: 'ach', icon: '🏆', ms: 3600 }); audio.play('achievement'); buzz('achievement'); }
  }

  showHome() { this.where = 'home'; if (!audio.musicOn || audio.mood.phase === 'menu') audio.startMusic('menu'); homeScreen(this); }
  showSetup(pre) { this.where = 'setup'; setupScreen(this, pre); }
  showKeep() { this.where = 'keep'; keepScreen(this); }
  showStats() { this.where = 'stats'; statsScreen(this); }
  showAchievements(tab) { this.where = 'ach'; achievementsScreen(this, tab); }
  showSocial(tab) { this.where = 'social'; socialScreen(this, tab); }
  showCodex(tab) { this.where = 'codex'; codexScreen(this, tab); }
  showPrestige() { this.where = 'prestige'; prestigeScreen(this); }
  showWorld(period) { this.where = 'world'; worldScreen(this, period); }
  showHelp() { this.where = 'help'; helpScreen(this); }
  showModes() { this.where = 'modes'; modesScreen(this); }
  openSettings(inGame) { settingsModal(this, inGame); }

  async startRun(opts) {
    // Assault and the Daily Raid run on their own engine and screen (src/ui/assault.js); they are never saved mid-run.
    if (isAssaultMode(opts.mode)) {
      this.where = 'game'; audio.init();
      this.session = new AssaultSession(this, opts);
      this.session.start();
      return;
    }
    opts = { loadout: loadoutFor(this.profile), ...opts };
    // The living world: this week's warlord leads the horde in the ordinary runs (from a player's third run on, so the
    // first lessons stay plain; the Daily always has it, so its board stays the same contest for everyone). A Daily belongs
    // to the week of its own date, so everyone meets the same warlord in it.
    if (!opts.save && isLivingMode(opts.mode) && ((this.profile.stats.runs || 0) >= 2 || opts.mode === 'daily')) {
      const day = opts.mode === 'daily' ? String(opts.seed || '').replace(/^daily-/, '') : '';
      opts.living = true;
      opts.warlord = warlordFor(/^\d{4}-\d{2}-\d{2}$/.test(day) ? seasonKey(new Date(day + 'T12:00:00Z')) : seasonKey()).id;
    }
    const slot = runSlot(opts.mode || 'normal');
    const saved = loadRun(slot);
    if (saved && !opts.save && !saved.tutorial) {
      const ok = await confirmBox(`Starting a new run replaces your saved run (wave ${saved.wave}). Continue?`, 'Start new run');
      if (!ok) return;
    }
    if (!opts.save) clearRun(slot);
    const p = this.profile;
    // Scouts from the land the Realm has not yet taken join an ordinary run's waves (the Daily Challenge stays identical for everyone).
    if (!opts.save && opts.scout === undefined && (opts.mode || 'normal') === 'normal' && p.realmMap?.held) opts.scout = scoutFoe(p.realmMap.held) || undefined;
    // A Vanguard run began at or above the adaptive wave (picked automatically or by hand). Orders and event rewards ask for them.
    if (!opts.save && opts.vanguard === undefined) opts.vanguard = !isLocalMode(opts.mode) && (!!opts.adaptive || isVanguardStart(p, opts.mapId || 'meadow', opts.startWave || 1, opts.mode || 'normal'));
    // Remember the setup for the home screen's Quick run (daily and challenge runs have their own buttons).
    if (!opts.save && !opts.hero && !isLocalMode(opts.mode) && (opts.mode || 'normal') !== 'daily' && opts.mode !== 'challenge' && opts.mode !== 'march' && !isNewMode(opts.mode)) { p.lastRun = { mapId: opts.mapId || 'meadow', modifiers: opts.modifiers || [], ascension: opts.ascension || 0, startWave: opts.startWave || 1, adaptive: !!opts.adaptive }; saveProfile(p); }
    const tutorial = !p.tutorialDone && !opts.save && !(opts.startWave > 1) && (opts.mapId || 'meadow') === 'meadow' && (opts.mode || 'normal') === 'normal';
    this.where = 'game';
    audio.init();
    this.session = new PlaySession(this, { ...opts, tutorial });
    this.session.start();
  }

  resumeRun(save) {
    this.startRun({ save, seed: save.seed, mapId: save.mapId, mode: save.mode, level: save.level, hero: save.hero, modifiers: save.modifiers, ascension: save.ascension, weapon: save.weapon.id, challenge: save.challenge, march: save.march || undefined, scout: save.scout || undefined, vanguard: !!save.vanguard, dominion: save.dominion || undefined, startWave: save.start });
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
    const clanBonus = sharedWorksPerks(p).renownBonus || 0;   // the Great Beacon: +5% Renown on every run
    const bestBefore = Math.max(0, ...Object.values(p.best.wave || {}));
    const result = recordRun(p, summary, { clanBonus });
    // A Dominion battle settles its province on the campaign map.
    if (summary.mode === 'dominion') { result.dominion = settleDominion(p, summary); saveProfile(p); }
    // Battlefields this run opened up (each map unlocks at a best wave on any map).
    result.mapsUnlocked = MAP_ORDER.filter((id) => MAPS[id].unlock && MAPS[id].unlock.wave > bestBefore && isMapUnlocked(p, id));
    this.where = 'summary';
    const box = summaryScreen(this, summary, result);
    for (const a of result.newAchievements) audio.play('achievement');
    // Online submission. The run is kept in an outbox on this device until the server has it, so a dropped
    // connection, a backgrounded phone or a closed tab can't lose a long run's score, kills and waves.
    const payload = {
      v: VERSION, seed: summary.seed, map: summary.map, mode: summary.mode, modifiers: summary.modifiers, ascension: summary.ascension,
      wave: summary.wave, wavesCleared: summary.wavesCleared, score: summary.score, kills: summary.kills, heroKills: summary.heroKills,
      duration: summary.duration, bossDmg: summary.bossDmg, weapon: summary.weapon, title: p.title, start: summary.start || 1,
      clock: summary.clock || 0, victory: !!summary.victory, level: summary.level || undefined, standard: rallyStandard(p),
      usage: isAssaultMode(summary.mode) ? undefined : buildUsage(summary), province: summary.province || undefined,
      dominion: result.dominion ? { broke: result.dominion.eliminated || undefined, won: !!result.dominion.over?.won, turns: result.dominion.over?.turn || undefined } : undefined,
      realmSynced: p.runSync && p.runSync.seed === summary.seed ? { kills: p.runSync.kills, waves: p.runSync.waves, hero: p.runSync.hero } : undefined,
    };
    const outboxId = Date.now() + ':' + summary.seed;
    if (p.online) { p.pendingRuns = [...(p.pendingRuns || []), { id: outboxId, payload }].slice(-5); saveProfile(p); }
    const settle = () => { p.pendingRuns = (p.pendingRuns || []).filter((x) => x.id !== outboxId); saveProfile(p); };
    if (!(await this.api.health())) { box.textContent = p.online ? 'Offline: this run will be sent to the Realm and the boards when you are back online.' : ''; return; }
    try {
      await this.api.ensureAccount();
      // Two runs inside 20 seconds hit the server's pace limit: wait it out once rather than dropping the run's kills.
      let r;
      try { r = await this.api.submitRun(payload); }
      catch (e) {
        if (e.status !== 429) throw e;
        box.textContent = 'Recording your run in a moment…';
        await new Promise((res) => setTimeout(res, 21000));
        r = await this.api.submitRun(payload);
      }
      p.runSync = null; settle();
      const bits = [];
      if (r.ranks?.wave) bits.push(`#${r.ranks.wave} this week by wave`);
      for (const id of ['warfront', 'gauntlet', 'endurance', 'laststand', 'sprint', 'sprint_recruit', 'sprint_veteran', 'sprint_legend']) if (r.ranks?.[id]) bits.push(`#${r.ranks[id]} this week in ${id === 'laststand' ? 'Last Stand' : id === 'warfront' ? 'the Warfront' : id === 'gauntlet' ? 'the Gauntlet' : id === 'endurance' ? 'Endurance' : id === 'sprint' ? 'the Sprint' : 'the ' + id.slice(7)[0].toUpperCase() + id.slice(8) + ' Sprint'}`);
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
          const fl = frontierLine(this, r.rally, summary);
          if (fl) kids.push(fl);
          const tg = togetherSummary(this, r);
          if (tg) kids.push(tg);
          if (r.rally?.done && r.rally.mine?.rewarded) audio.play('achievement');
          const up = (c) => c.reached > c.reachedBefore;
          if (up(r.realm.week) || up(r.realm.month)) { audio.play('achievement'); this.profile.realmBlessing = null; }
        }
      }
      box.replaceChildren(...kids.map((k) => (typeof k === 'string' ? h('div', {}, k) : k)));
      this.checkAch();
      this.refreshOnline();
    } catch (e) {
      if (e.status && e.status < 500 && e.status !== 429 && e.status !== 408) settle();   // the server refused it outright: do not retry forever
      box.textContent = 'Could not reach the leaderboards. Your run is saved on this device and will be sent next time you are online.';
    }
  }
}

function clanColor(tag) {
  const palette = ['#d9473b', '#3d7bd9', '#7fb24a', '#8a4fd8', '#e2b33c', '#2fb6c9', '#e07a3a', '#c94f8a'];
  return palette[hashStr(tag || '') % palette.length];
}

window.bastion = new App();
