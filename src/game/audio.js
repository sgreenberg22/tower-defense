// Synthesized sound and music, no audio files. Two halves:
//  · A small adaptive "orchestra": drone, lute, flute or bells, war drums, marching strings and brass, composed per land
//    (Meadow in Dorian, Dunes in Phrygian dominant, Frostlands in Aeolian, Ashlands in Phrygian, Shadowfen in a dark mode).
//    The build phase is calm and melodic; the wave phase adds drums and strings that follow how hot the fight is.
//  · Medieval-flavoured effects (steel, shields, hooves, horns, anvils, wind) plus weather ambience.
// Everything is scheduled on the audio clock, so it stays in time however busy the page is.

const MODES = {
  meadow: { root: 146.83, scale: [0, 2, 3, 5, 7, 9, 10], prog: [0, 6, 3, 0, 0, 5, 6, 4], bpm: 84, lead: 'flute' },   // D Dorian
  dunes:  { root: 164.81, scale: [0, 1, 4, 5, 7, 8, 10], prog: [0, 1, 0, 6, 0, 1, 5, 0], bpm: 92, lead: 'flute', hand: true }, // E Phrygian dominant
  frost:  { root: 220.0,  scale: [0, 2, 3, 5, 7, 8, 10], prog: [0, 5, 3, 4, 0, 5, 6, 4], bpm: 72, lead: 'bell' },     // A Aeolian
  ash:    { root: 123.47, scale: [0, 1, 3, 5, 7, 8, 10], prog: [0, 1, 0, 6, 0, 1, 3, 1], bpm: 88, lead: 'horn' },     // B Phrygian
  shadow: { root: 138.59, scale: [0, 2, 3, 6, 7, 8, 11], prog: [0, 3, 0, 4, 0, 5, 3, 0], bpm: 70, lead: 'bell' },     // C# harmonic-ish
  menu:   { root: 146.83, scale: [0, 2, 3, 5, 7, 9, 10], prog: [0, 3, 6, 0, 0, 5, 3, 4], bpm: 76, lead: 'flute' },
};

const hz = (root, semis) => root * Math.pow(2, semis / 12);
// Tiny deterministic generator so each phrase repeats the same way on every loop (it sounds composed, not random).
const lcg = (seed) => { let s = (seed >>> 0) || 1; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); };
const hash = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619); return h >>> 0; };

// Busy combat sounds that are merged. base: volume of a single one; double: how many in a window earns a second voice.
const BATCH = {
  arrow: { base: 0.7, double: 9 }, twang: { base: 0.7, double: 9, minor: 1 }, kill: { base: 0.7, double: 8, gain: 1.1 },
  clangHit: { base: 0.7, double: 8 }, thud: { base: 0.7, double: 8 }, orb: { base: 0.7, double: 9, minor: 1 }, zap: { base: 0.7, double: 9, minor: 1 },
  bolt: { base: 0.75, double: 5 }, frost: { base: 0.8, double: 12, minor: 1 }, coin: { base: 0.75, double: 9, minor: 1 },
  boom: { base: 0.75, double: 4 }, cannon: { base: 0.8, double: 4 },
};

export class Audio {
  constructor() {
    this.ctx = null;
    this.master = 0.8; this.sfx = 0.55; this.music = 0.4; this.muted = true;   // sound is opt-in; profile.settings.muted decides once the profile loads
    this.last = {};
    this.musicOn = false;
    this.want = null;                // music requested before the audio context existed
    this.voices = 0;
    this.mood = { phase: 'menu', intensity: 0, boss: false, danger: 0, biome: 'meadow' };
    this.layerGoal = {};
    this.paused = false;
    this.vm = 1; this.pv = 1;       // volume and pitch multipliers for the voice being played right now
    this.queue = {};                // busy combat sounds waiting to be merged (see play / flush)
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
    if (!AC) return;
    this.build(new AC());
    if (this.want) { const w = this.want; this.want = null; this.startMusic(w); }
  }

  // Wire the graph on any context (a real one, or an OfflineAudioContext in tests).
  build(ctx) {
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 24; comp.ratio.value = 3.5; comp.attack.value = 0.012; comp.release.value = 0.3;
    this.out = ctx.createGain(); this.out.connect(comp); comp.connect(ctx.destination);
    this.sfxBus = ctx.createGain(); this.sfxBus.connect(this.out);
    this.musicFilter = ctx.createBiquadFilter(); this.musicFilter.type = 'lowpass'; this.musicFilter.frequency.value = 18000;
    this.musicBus = ctx.createGain(); this.musicBus.connect(this.musicFilter); this.musicFilter.connect(this.out);
    this.ambBus = ctx.createGain(); this.ambBus.connect(this.out);
    // A hall: decaying noise as an impulse response, fed by the music and a little of the effects.
    const len = Math.floor(ctx.sampleRate * 2.2), ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
    this.verb = ctx.createConvolver(); this.verb.buffer = ir;
    this.verbIn = ctx.createGain(); this.verbIn.gain.value = 0.5;
    this.verbOut = ctx.createGain(); this.verbOut.gain.value = 0.55;
    this.verbIn.connect(this.verb); this.verb.connect(this.verbOut); this.verbOut.connect(this.out);
    const nl = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, nl, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < nl; i++) d[i] = Math.random() * 2 - 1;
    // One gain per music layer, so the mood can fade them in and out.
    this.layers = {};
    for (const k of ['pad', 'lute', 'lead', 'drums', 'strings', 'brass', 'tension', 'hand']) {
      const g = ctx.createGain(); g.gain.value = 0; g.connect(this.musicBus); g.connect(this.verbIn); this.layers[k] = g;
    }
    this.apply();
    clearInterval(this.flushTimer);
    this.flushTimer = setInterval(() => this.flush(), 90);
  }

  set(o) { Object.assign(this, o); this.apply(); }
  apply() {
    if (!this.ctx) return;
    this.out.gain.value = this.muted ? 0 : this.master;
    this.sfxBus.gain.value = this.sfx * 1.5;
    this.musicBus.gain.value = this.music * 1.5;
    this.ambBus.gain.value = this.sfx * 0.6;
  }
  setPaused(on) {
    this.paused = !!on;
    if (!this.ctx) return;
    this.musicFilter.frequency.setTargetAtTime(on ? 500 : 18000, this.ctx.currentTime, 0.12);
  }

  // Rate-limit identical sounds so 40 arrows don't make a wall of noise.
  ok(name, gap = 0.04) {
    if (!this.ctx || this.muted) return false;
    const t = this.ctx.currentTime;
    if (this.last[name] && t - this.last[name] < gap) return false;
    if (this.voices > 90) return false;
    this.last[name] = t; return true;
  }

  // ---------- voices ----------
  tone({ f = 440, f2 = null, type = 'sine', dur = 0.15, vol = 0.3, attack = 0.005, bus = this.sfxBus, when = 0, detune = 0, lp = 0, verb = 0, vib = 0 }) {
    const c = this.ctx, t = c.currentTime + when;
    vol *= this.vm; f *= this.pv; if (f2) f2 *= this.pv;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); o.detune.value = detune;
    if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let tail = o;
    if (lp) { const fl = c.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = lp; o.connect(fl); tail = fl; }
    tail.connect(g); g.connect(bus);
    if (verb) { const s = c.createGain(); s.gain.value = verb; g.connect(s); s.connect(this.verbIn); }
    if (vib) { const l = c.createOscillator(), lg = c.createGain(); l.frequency.value = 5.2; lg.gain.value = vib; l.connect(lg); lg.connect(o.frequency); l.start(t + 0.1); l.stop(t + dur + 0.05); }
    this.voices++; o.onended = () => { this.voices--; };
    o.start(t); o.stop(t + dur + 0.05);
  }
  noiseHit({ dur = 0.2, vol = 0.3, freq = 1200, q = 1, type = 'lowpass', f2 = null, when = 0, bus = this.sfxBus, attack = 0, verb = 0 }) {
    const c = this.ctx, t = c.currentTime + when;
    vol *= this.vm;
    const s = c.createBufferSource(); s.buffer = this.noise;
    const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(freq, t); fl.Q.value = q;
    if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const g = c.createGain();
    if (attack) { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + attack); } else g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(bus);
    if (verb) { const v = c.createGain(); v.gain.value = verb; g.connect(v); v.connect(this.verbIn); }
    this.voices++; s.onended = () => { this.voices--; };
    s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.02);
  }

  // Instruments. `f` in Hz, `when` seconds from now (on the audio clock), `bus` defaults to the effects.
  pluck(f, when, { vol = 0.12, bus = this.sfxBus, dur = 0.7, verb = 0.25 } = {}) {   // lute / harp
    this.tone({ f, type: 'triangle', dur, vol, attack: 0.003, when, bus, lp: 3200, verb });
    this.tone({ f: f * 2.005, type: 'sine', dur: dur * 0.45, vol: vol * 0.35, attack: 0.002, when, bus });
    this.noiseHit({ dur: 0.03, vol: vol * 0.5, freq: 3000, type: 'bandpass', q: 1.2, when, bus });
  }
  flute(f, when, dur, { vol = 0.08, bus = this.sfxBus } = {}) {
    this.tone({ f, type: 'sine', dur, vol, attack: Math.min(0.09, dur * 0.4), when, bus, vib: f * 0.006, verb: 0.5 });
    this.tone({ f: f * 2, type: 'sine', dur, vol: vol * 0.15, attack: 0.1, when, bus });
    this.noiseHit({ dur: Math.min(dur, 0.3), vol: vol * 0.22, freq: f * 3, type: 'bandpass', q: 3, when, bus, attack: 0.04 });
  }
  bell(f, when, { vol = 0.08, bus = this.sfxBus, dur = 1.8 } = {}) {
    [[1, 1], [2.76, 0.4], [5.4, 0.2], [8.93, 0.1]].forEach(([m, a]) => this.tone({ f: f * m, type: 'sine', dur: dur / m ** 0.4, vol: vol * a, attack: 0.002, when, bus, verb: 0.45 }));
  }
  brass(f, when, dur, { vol = 0.1, bus = this.sfxBus, open = 2200 } = {}) {
    const c = this.ctx, t = c.currentTime + when;
    for (const dt of [-6, 6]) {
      const o = c.createOscillator(), fl = c.createBiquadFilter(), g = c.createGain();
      o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = dt;
      fl.type = 'lowpass'; fl.Q.value = 2; fl.frequency.setValueAtTime(f * 1.5, t); fl.frequency.linearRampToValueAtTime(open, t + Math.min(0.2, dur * 0.4)); fl.frequency.linearRampToValueAtTime(f * 2, t + dur);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.06); g.gain.setValueAtTime(vol, t + Math.max(0.07, dur - 0.1)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(fl); fl.connect(g); g.connect(bus);
      const v = c.createGain(); v.gain.value = 0.3; g.connect(v); v.connect(this.verbIn);
      this.voices++; o.onended = () => { this.voices--; };
      o.start(t); o.stop(t + dur + 0.05);
    }
  }
  drum(kind, when, { vol = 0.3, bus = this.sfxBus, pitch = 1 } = {}) {
    switch (kind) {
      case 'taiko': this.tone({ f: 95 * pitch, f2: 48 * pitch, type: 'sine', dur: 0.4, vol, attack: 0.002, when, bus, verb: 0.3 }); this.noiseHit({ dur: 0.12, vol: vol * 0.5, freq: 500, f2: 150, when, bus }); break;
      case 'snare': this.noiseHit({ dur: 0.13, vol: vol * 0.55, freq: 2200, type: 'bandpass', q: 0.8, when, bus }); this.tone({ f: 190, f2: 140, type: 'triangle', dur: 0.08, vol: vol * 0.4, when, bus }); break;
      case 'tom': this.tone({ f: 150 * pitch, f2: 90 * pitch, type: 'sine', dur: 0.22, vol: vol * 0.8, attack: 0.002, when, bus, verb: 0.2 }); break;
      case 'hand': this.tone({ f: 260 * pitch, f2: 170, type: 'triangle', dur: 0.1, vol: vol * 0.7, attack: 0.002, when, bus }); this.noiseHit({ dur: 0.05, vol: vol * 0.3, freq: 1800, type: 'bandpass', q: 2, when, bus }); break;
      case 'tick': this.noiseHit({ dur: 0.03, vol: vol * 0.3, freq: 7000, type: 'highpass', when, bus }); break;
    }
  }
  clang(when = 0, { vol = 0.2, pitch = 1 } = {}) {   // steel on steel
    this.noiseHit({ dur: 0.05, vol: vol * 0.7, freq: 4500, type: 'highpass', when });
    [1, 1.52, 2.43, 3.17].forEach((m, i) => this.tone({ f: 1250 * pitch * m, type: 'sine', dur: 0.28 / (1 + i * 0.35), vol: vol * 0.3 / (1 + i * 0.5), attack: 0.001, when, verb: 0.2 }));
  }

  // In a big fight dozens of arrows, hits and kills land every second. Played one by one they smear into noise and starve the
  // browser of voices, so the busy sounds are collected and merged every 70ms: one voice per kind (two when it is really crowded),
  // a little louder the more of them there were, with a touch of pitch variation so it never sounds mechanical.
  play(name, opt = {}) {
    if (!this.ctx || this.muted) return;
    if (BATCH[name]) { const q = this.queue[name] || (this.queue[name] = { n: 0, opt }); q.n++; return; }
    this.playNow(name, opt);
  }
  flush() {
    if (!this.ctx || this.muted) { this.queue = {}; return; }
    const Q = this.queue; this.queue = {};
    for (const [name, q] of Object.entries(Q)) {
      const B = BATCH[name], n = q.n;
      const loud = (B.base + (0.95 - B.base) * Math.min(1, Math.log2(1 + n) / 3)) * 0.62;   // 1 hit: base volume, ~7+: full, then trimmed for headroom
      if (this.voices > 40 && B.minor) continue;                                       // when it is very busy, drop the lesser sounds first
      const voices = n >= B.double ? 2 : 1;
      for (let i = 0; i < voices; i++) {
        this.vm = loud * (voices > 1 ? 0.8 : 1) * (B.gain || 1); this.pv = 0.92 + Math.random() * 0.16;
        this.last[name] = 0;
        this.playNow(name, q.opt, i * 0.035);
      }
      this.vm = 1; this.pv = 1;
    }
  }
  playNow(name, opt = {}, delay = 0) {
    if (delay) {
      const vm = this.vm, pv = this.pv;
      setTimeout(() => { this.vm = vm; this.pv = pv; this.last[name] = 0; this.playNow(name, opt); this.vm = 1; this.pv = 1; }, delay * 1000);
      return;
    }
    switch (name) {
      case 'bow': if (this.ok(name, 0.03)) { this.noiseHit({ dur: 0.09, vol: 0.5, freq: 2500, type: 'bandpass', q: 2, f2: 800 }); this.tone({ f: 330, f2: 110, type: 'triangle', dur: 0.1, vol: 0.14 }); } break;
      case 'twang': if (this.ok(name, 0.05)) { this.tone({ f: 420 + Math.random() * 60, f2: 200, type: 'triangle', dur: 0.12, vol: 0.09, lp: 2500 }); this.noiseHit({ dur: 0.06, vol: 0.2, freq: 3000, type: 'bandpass', q: 3, f2: 1000 }); } break;
      case 'charge': if (this.ok(name, 0.1)) this.tone({ f: 200 + 500 * (opt.k || 0), type: 'triangle', dur: 0.08, vol: 0.06 }); break;
      case 'heroHit': if (this.ok(name, 0.02)) { this.tone({ f: 520 + Math.min(12, opt.combo || 0) * 40, f2: 260, type: 'triangle', dur: 0.08, vol: 0.09 }); this.noiseHit({ dur: 0.05, vol: 0.14, freq: 3000, type: 'highpass' }); } break;
      case 'headshot': this.tone({ f: 1200, f2: 1800, type: 'triangle', dur: 0.12, vol: 0.16 }); this.bell(1568, 0.04, { vol: 0.07, dur: 0.7 }); break;
      case 'miss': if (this.ok(name, 0.1)) this.noiseHit({ dur: 0.12, vol: 0.14, freq: 1800, f2: 500, type: 'bandpass', q: 1 }); break;
      case 'arrow': if (this.ok(name, 0.06)) { this.noiseHit({ dur: 0.07, vol: 0.2, freq: 3200, type: 'bandpass', q: 3, f2: 1400 }); } break;
      case 'cannon': if (this.ok(name, 0.08)) { this.noiseHit({ dur: 0.35, vol: 0.35, freq: 700, f2: 70 }); this.tone({ f: 120, f2: 38, type: 'sine', dur: 0.3, vol: 0.32 }); this.noiseHit({ dur: 0.6, vol: 0.08, freq: 400, f2: 100, when: 0.05, verb: 0.5 }); } break;
      case 'boom': if (this.ok(name, 0.06)) { this.noiseHit({ dur: 0.4, vol: 0.3, freq: 900, f2: 60 }); this.tone({ f: 80, f2: 35, type: 'sine', dur: 0.3, vol: 0.22 }); } break;
      case 'zap': if (this.ok(name, 0.07)) { this.tone({ f: 1100, f2: 250, type: 'sawtooth', dur: 0.14, vol: 0.05, lp: 4000 }); this.noiseHit({ dur: 0.1, vol: 0.1, freq: 5000, type: 'highpass' }); } break;
      case 'orb': if (this.ok(name, 0.07)) { this.tone({ f: 660, f2: 990, type: 'sine', dur: 0.2, vol: 0.06, verb: 0.4 }); this.tone({ f: 1320, f2: 1980, type: 'sine', dur: 0.15, vol: 0.025, when: 0.03 }); } break;
      case 'frost': if (this.ok(name, 0.15)) { this.noiseHit({ dur: 0.4, vol: 0.12, freq: 6000, type: 'highpass' }); this.bell(2093, 0, { vol: 0.04, dur: 0.6 }); } break;
      case 'bolt': if (this.ok(name, 0.08)) { this.tone({ f: 170, f2: 80, type: 'triangle', dur: 0.14, vol: 0.18 }); this.noiseHit({ dur: 0.09, vol: 0.14, freq: 1500, type: 'bandpass' }); } break;
      case 'kill': if (this.ok(name, 0.03)) { this.tone({ f: 340 + Math.random() * 80, f2: 120, type: 'triangle', dur: 0.12, vol: 0.06, lp: 1800 }); this.noiseHit({ dur: 0.05, vol: 0.05, freq: 900, f2: 300 }); } break;
      case 'coin': if (this.ok(name, 0.05)) { this.tone({ f: 1568, type: 'sine', dur: 0.12, vol: 0.05, verb: 0.3 }); this.tone({ f: 2093, type: 'sine', dur: 0.2, vol: 0.05, when: 0.05, verb: 0.3 }); this.noiseHit({ dur: 0.03, vol: 0.03, freq: 7000, type: 'highpass' }); } break;
      case 'build': this.noiseHit({ dur: 0.1, vol: 0.28, freq: 700, f2: 250 }); this.tone({ f: 180, f2: 90, type: 'triangle', dur: 0.1, vol: 0.2 }); this.noiseHit({ dur: 0.1, vol: 0.24, freq: 650, f2: 220, when: 0.13 }); this.tone({ f: 200, f2: 100, type: 'triangle', dur: 0.1, vol: 0.18, when: 0.13 }); this.clang(0.26, { vol: 0.07, pitch: 0.7 }); break;
      case 'upgrade': [0, 4, 7].forEach((s, i) => this.pluck(hz(392, s), i * 0.07, { vol: 0.12, dur: 0.6 })); this.brass(hz(392, 12), 0.2, 0.3, { vol: 0.05 }); break;
      case 'sell': this.tone({ f: 784, type: 'triangle', dur: 0.1, vol: 0.09 }); this.tone({ f: 523, type: 'triangle', dur: 0.14, vol: 0.09, when: 0.07 }); this.noiseHit({ dur: 0.05, vol: 0.05, freq: 6000, type: 'highpass', when: 0.1 }); break;
      case 'repair': [0, 1, 2, 3].forEach((i) => { this.noiseHit({ dur: 0.05, vol: 0.14, freq: 900 + i * 90, type: 'bandpass', q: 4, when: i * 0.08 }); this.tone({ f: 260 + (i % 2) * 40, f2: 120, type: 'triangle', dur: 0.06, vol: 0.08, when: i * 0.08 }); }); break;
      case 'leak': if (this.ok(name, 0.1)) { this.tone({ f: 130, f2: 50, type: 'triangle', dur: 0.3, vol: 0.2 }); this.noiseHit({ dur: 0.25, vol: 0.22, freq: 450, f2: 120 }); this.clang(0.02, { vol: 0.07, pitch: 0.55 }); } break;
      case 'horn': [0, 7].forEach((s, i) => this.brass(hz(146.83, s), i * 0.28, i ? 0.9 : 0.34, { vol: 0.1 })); this.brass(hz(146.83, 12), 0.28, 0.9, { vol: 0.05 }); break;
      case 'boss': [0, -1, -2].forEach((s, i) => this.brass(hz(73.4, s), i * 0.4, 0.7, { vol: 0.14, open: 1200 })); this.noiseHit({ dur: 1.4, vol: 0.18, freq: 220, f2: 90, verb: 0.4 }); this.drum('taiko', 0, { vol: 0.4 }); this.drum('taiko', 0.4, { vol: 0.4 }); this.drum('taiko', 0.8, { vol: 0.5, pitch: 0.8 }); break;
      case 'roar': this.noiseHit({ dur: 1.0, vol: 0.28, freq: 300, f2: 900, type: 'bandpass', q: 2.5, attack: 0.1, verb: 0.3 }); this.tone({ f: 80, f2: 55, type: 'sawtooth', dur: 1.0, vol: 0.14, attack: 0.08, lp: 600 }); break;
      case 'clear': { const r = 293.66; [[0, 0], [4, 0.14], [7, 0.28], [12, 0.42]].forEach(([s, w], i) => this.brass(hz(r, s), w, i === 3 ? 0.9 : 0.2, { vol: 0.08 })); this.bell(hz(r, 24), 0.42, { vol: 0.06 }); this.drum('taiko', 0, { vol: 0.25 }); break; }
      case 'boon': [0, 4, 7, 12].forEach((s, i) => this.bell(hz(523.25, s), i * 0.08, { vol: 0.07, dur: 1.2 })); break;
      case 'achievement': { const r = 392; [[0, 0], [4, 0.1], [7, 0.2], [12, 0.34]].forEach(([s, w], i) => this.brass(hz(r, s), w, i === 3 ? 0.8 : 0.16, { vol: 0.07 })); [0, 4, 7, 12, 16].forEach((s, i) => this.bell(hz(r * 2, s), 0.34 + i * 0.07, { vol: 0.045, dur: 1.1 })); break; }
      case 'gameover': [0, -2, -4, -7].forEach((s, i) => this.brass(hz(196, s), i * 0.5, 0.9, { vol: 0.08, open: 900 })); this.bell(98, 0, { vol: 0.2, dur: 3 }); this.bell(98, 1.6, { vol: 0.15, dur: 3 }); this.drum('taiko', 0, { vol: 0.4, pitch: 0.7 }); this.drum('taiko', 1.0, { vol: 0.35, pitch: 0.6 }); break;
      case 'click': if (this.ok(name, 0.03)) this.tone({ f: 760, type: 'triangle', dur: 0.04, vol: 0.05, lp: 3000 }); break;
      case 'error': if (this.ok(name, 0.1)) { this.tone({ f: 170, f2: 130, type: 'triangle', dur: 0.14, vol: 0.09, lp: 900 }); this.noiseHit({ dur: 0.06, vol: 0.05, freq: 400 }); } break;
      case 'stomp': this.tone({ f: 70, f2: 28, type: 'sine', dur: 0.55, vol: 0.4 }); this.noiseHit({ dur: 0.45, vol: 0.32, freq: 320, f2: 80 }); this.noiseHit({ dur: 0.5, vol: 0.12, freq: 200, f2: 80, when: 0.08, verb: 0.5 }); break;
      case 'volley': [0, 0.06, 0.12, 0.19, 0.26].forEach((w) => this.noiseHit({ dur: 0.14, vol: 0.14, freq: 2800, type: 'bandpass', q: 2, f2: 900, when: w })); [0.7, 0.8, 0.9, 1.0].forEach((w) => this.noiseHit({ dur: 0.08, vol: 0.1, freq: 600, f2: 300, when: w })); break;
      case 'oil': this.noiseHit({ dur: 1.0, vol: 0.26, freq: 1300, f2: 300, verb: 0.2 }); this.tone({ f: 140, f2: 70, type: 'sawtooth', dur: 0.6, vol: 0.07, lp: 500 }); for (let i = 0; i < 6; i++) this.noiseHit({ dur: 0.04, vol: 0.06, freq: 4000 + i * 200, type: 'bandpass', q: 4, when: 0.2 + i * 0.1 }); break;
      case 'claim': [0, 1, 2].forEach((i) => { this.noiseHit({ dur: 0.07, vol: 0.2, freq: 600 + i * 140, type: 'bandpass', q: 3, when: i * 0.08 }); this.tone({ f: 120, f2: 70, type: 'triangle', dur: 0.08, vol: 0.12, when: i * 0.08 }); }); this.pluck(392, 0.26, { vol: 0.1 }); this.pluck(587, 0.32, { vol: 0.1 }); break;
      case 'combo': if (this.ok(name, 0.15)) this.tone({ f: 600 + (opt.n || 0) * 30, type: 'sine', dur: 0.12, vol: 0.06, verb: 0.3 }); break;

      // ----- Warrior mode -----
      case 'swing': if (this.ok(name, 0.08)) this.noiseHit({ dur: opt.big ? 0.22 : 0.14, vol: opt.big ? 0.2 : 0.13, freq: opt.big ? 1300 : 2200, f2: opt.big ? 260 : 600, type: 'bandpass', q: 1.4 }); break;
      case 'slash': if (this.ok(name, 0.05)) { this.noiseHit({ dur: 0.06, vol: 0.16, freq: 2600, f2: 900, type: 'bandpass', q: 2 }); this.tone({ f: 180, f2: 90, type: 'triangle', dur: 0.07, vol: 0.12 }); } break;
      case 'slam': this.tone({ f: 90, f2: 30, type: 'sine', dur: 0.45, vol: 0.38 }); this.noiseHit({ dur: 0.35, vol: 0.3, freq: 500, f2: 90 }); break;
      case 'roll': if (this.ok(name, 0.2)) this.noiseHit({ dur: 0.2, vol: 0.1, freq: 700, f2: 250, type: 'bandpass', q: 1 }); break;
      case 'fury': this.brass(hz(146.83, 0), 0, 0.3, { vol: 0.12 }); this.brass(hz(146.83, 7), 0.12, 0.5, { vol: 0.12 }); this.drum('taiko', 0, { vol: 0.45 }); this.noiseHit({ dur: 0.5, vol: 0.14, freq: 1200, f2: 300, verb: 0.4 }); break;

      // ----- the garrison -----
      case 'clangHit': if (this.ok(name, 0.07)) this.clang(0, { vol: 0.12, pitch: 0.9 + Math.random() * 0.3 }); break;
      case 'thud': if (this.ok(name, 0.06)) { this.tone({ f: 110, f2: 50, type: 'sine', dur: 0.14, vol: 0.2 }); this.noiseHit({ dur: 0.07, vol: 0.12, freq: 600, f2: 200 }); } break;
      case 'gallop': for (let i = 0; i < 5; i++) { this.tone({ f: 85 + (i % 2) * 15, f2: 55, type: 'sine', dur: 0.09, vol: 0.18, when: i * 0.07 }); this.noiseHit({ dur: 0.05, vol: 0.1, freq: 900, f2: 300, when: i * 0.07 }); } break;
      case 'screech': if (this.ok(name, 0.4)) { this.tone({ f: 900, f2: 1700, type: 'sawtooth', dur: 0.35, vol: 0.06, lp: 3500, vib: 40 }); this.tone({ f: 1700, f2: 800, type: 'sawtooth', dur: 0.3, vol: 0.05, lp: 3500, when: 0.3, vib: 40 }); } break;
      case 'heal': if (this.ok(name, 0.2)) [0, 4, 7].forEach((s, i) => this.bell(hz(880, s), i * 0.06, { vol: 0.04, dur: 0.9 })); break;
      case 'trained': this.noiseHit({ dur: 0.05, vol: 0.18, freq: 4000, type: 'highpass' }); this.clang(0, { vol: 0.14, pitch: 1.2 }); this.bell(hz(587, 0), 0.12, { vol: 0.07 }); this.bell(hz(587, 7), 0.2, { vol: 0.07 }); break;
      case 'rally': [0, 0.09, 0.18, 0.27].forEach((w, i) => this.drum('snare', w, { vol: 0.26 + i * 0.04 })); this.drum('taiko', 0.38, { vol: 0.4 }); this.brass(hz(146.83, 0), 0.38, 0.28, { vol: 0.1 }); this.brass(hz(146.83, 7), 0.66, 0.7, { vol: 0.1 }); break;
      case 'fall': this.tone({ f: 200, f2: 60, type: 'triangle', dur: 0.5, vol: 0.12, lp: 900 }); this.noiseHit({ dur: 0.2, vol: 0.16, freq: 500, f2: 120 }); this.bell(110, 0.15, { vol: 0.1, dur: 2.2 }); break;
      case 'rank': { const r = 349.23; [[0, 0], [7, 0.1], [12, 0.2]].forEach(([s, w], i) => this.brass(hz(r, s), w, i === 2 ? 0.6 : 0.12, { vol: 0.07 })); this.bell(hz(r, 24), 0.2, { vol: 0.05 }); break; }
      case 'mark': if (this.ok(name, 0.15)) { this.tone({ f: 1000, f2: 1500, type: 'triangle', dur: 0.1, vol: 0.07 }); this.tone({ f: 1500, type: 'sine', dur: 0.14, vol: 0.05, when: 0.09 }); } break;
      case 'muster': [0, 7, 12].forEach((s, i) => this.brass(hz(196, s), i * 0.13, i === 2 ? 0.7 : 0.14, { vol: 0.08 })); this.drum('snare', 0, { vol: 0.2 }); this.drum('snare', 0.13, { vol: 0.2 }); break;

      // ----- the land -----
      case 'whistle': this.tone({ f: 1400, f2: 300, type: 'sine', dur: 0.7, vol: 0.06, verb: 0.2 }); break;
      case 'weatherWarn': this.brass(hz(110, 0), 0, 0.5, { vol: 0.07, open: 700 }); this.bell(110, 0.05, { vol: 0.1, dur: 2 }); break;
    }
  }

  // ---------- ambience (weather and the land's wind) ----------
  // Looping noise through a moving filter. kind: sandstorm | blizzard | meteors | stealth | null.
  weather(kind) {
    if (!this.ctx) return;
    if (this.wx && this.wx.kind === kind) return;
    const c = this.ctx, now = c.currentTime;
    if (this.wx) { const w = this.wx; w.gain.gain.cancelScheduledValues(now); w.gain.gain.setTargetAtTime(0, now, 0.6); setTimeout(() => { try { w.src.stop(); w.lfo.stop(); } catch (e) { /* already stopped */ } }, 2500); this.wx = null; }
    if (!kind) return;
    const src = c.createBufferSource(); src.buffer = this.noise; src.loop = true;
    const fl = c.createBiquadFilter(), g = c.createGain(), lfo = c.createOscillator(), lg = c.createGain();
    const P = {
      sandstorm: { type: 'bandpass', f: 650, q: 0.9, lfo: 0.23, depth: 380, vol: 0.5 },
      blizzard: { type: 'bandpass', f: 1500, q: 4.5, lfo: 0.37, depth: 800, vol: 0.38 },
      meteors: { type: 'lowpass', f: 160, q: 1, lfo: 0.8, depth: 60, vol: 0.55 },
      stealth: { type: 'bandpass', f: 2600, q: 7, lfo: 5.5, depth: 700, vol: 0.14 },
    }[kind];
    if (!P) return;
    fl.type = P.type; fl.frequency.value = P.f; fl.Q.value = P.q;
    lfo.frequency.value = P.lfo; lg.gain.value = P.depth; lfo.connect(lg); lg.connect(fl.frequency);
    g.gain.setValueAtTime(0, now); g.gain.linearRampToValueAtTime(P.vol, now + 1.2);
    src.connect(fl); fl.connect(g); g.connect(this.ambBus);
    src.start(); lfo.start();
    this.wx = { kind, src, lfo, gain: g };
    if (kind === 'stealth') this.tone({ f: 55, type: 'sawtooth', dur: 6, vol: 0.05, lp: 200, attack: 1.5, bus: this.ambBus, detune: 12 });
  }

  // ---------- music ----------
  // mode: a biome id, or 'menu'. The scheduler looks a fraction of a second ahead on the audio clock.
  startMusic(mode) {
    if (!this.ctx) { this.want = mode || this.want || 'menu'; return; }
    if (mode && mode !== 'menu') { this.mood.biome = mode; this.mood.phase = 'build'; }
    if (mode === 'menu') { this.mood.phase = 'menu'; this.mood.intensity = 0; this.mood.boss = false; this.mood.danger = 0; }
    if (this.musicOn) { this.applyMood(); return; }
    this.musicOn = true;
    this.nextT = this.ctx.currentTime + 0.15;
    this.stepNo = 0;
    this.applyMood();
    this.timer = setInterval(() => this.schedule(), 90);
  }
  stopMusic() {
    this.musicOn = false; this.want = null;
    clearInterval(this.timer);
    if (this.ctx) { const t = this.ctx.currentTime; for (const g of Object.values(this.layers)) g.gain.setTargetAtTime(0, t, 0.25); }
    this.weather(null);
    this.stopPad();
  }
  // Called by the play screen a few times a second.
  setMood(m) { Object.assign(this.mood, m); this.applyMood(); }

  applyMood() {
    if (!this.ctx) return;
    const m = this.mood, t = this.ctx.currentTime, I = Math.max(0, Math.min(1, m.intensity));
    const fight = m.phase === 'wave', menu = m.phase === 'menu';
    const goal = {
      pad: 1,
      lute: fight ? 0.35 - 0.2 * I : 1,
      lead: fight ? (m.boss ? 0 : 0.25 * (1 - I)) : menu ? 0.9 : 1,
      drums: fight ? 0.55 + 0.45 * I : 0,
      strings: fight ? 0.35 + 0.65 * I : 0,
      brass: fight && (m.boss || I > 0.7) ? 0.5 + 0.5 * I : 0,
      tension: Math.max(0, m.danger - 0.3) * 1.4,
      hand: fight ? 1 : 0.3,
    };
    for (const [k, v] of Object.entries(goal)) this.layers[k].gain.setTargetAtTime(v * ({ pad: 0.55, lute: 0.9, lead: 1, drums: 1, strings: 0.8, brass: 0.7, tension: 0.6, hand: 0.8 }[k]), t, fight ? 0.4 : 1.2);
    this.musicFilter.frequency.setTargetAtTime(this.paused ? 500 : 18000, t, 0.12);
  }

  stopPad() { if (this.padNodes) { for (const n of this.padNodes) { try { n.stop(); } catch (e) { /* ended */ } } this.padNodes = null; } }

  schedule() {
    if (!this.musicOn || !this.ctx) return;
    const c = this.ctx;
    if (this.muted || this.music <= 0) { this.nextT = Math.max(this.nextT, c.currentTime + 0.1); return; }
    this.scheduleUntil(c.currentTime + 0.35);
  }
  // Schedule every sixteenth that starts before `horizon` (audio-clock seconds). Also used to render offline in tests.
  scheduleUntil(horizon) {
    const c = this.ctx;
    let guard = 0;
    while (this.nextT < horizon && guard++ < 4000) {
      const m = this.mood, mode = MODES[m.phase === 'menu' ? 'menu' : m.biome] || MODES.meadow;
      const fight = m.phase === 'wave', I = Math.max(0, Math.min(1, m.intensity));
      const bpm = mode.bpm + (fight ? 14 + 26 * I + (m.boss ? 10 : 0) : 0);
      const sp = 60 / bpm / 4;                         // seconds per sixteenth
      this.playStep(this.stepNo, this.nextT - c.currentTime, sp, mode, fight, I, m);
      this.nextT += sp; this.stepNo++;
    }
  }

  chordAt(mode, bar) {
    const deg = mode.prog[bar % mode.prog.length], S = mode.scale;
    const n = (i) => S[(deg + i) % 7] + 12 * Math.floor((deg + i) / 7);
    return [n(0), n(2), n(4)];
  }

  // One sixteenth-note step. `w` = seconds from now when it sounds.
  playStep(step, w, sp, mode, fight, I, m) {
    const bar = Math.floor(step / 16), s = step % 16, loop = Math.floor(bar / mode.prog.length);
    const chord = this.chordAt(mode, bar), root = mode.root, L = this.layers;
    const sc = mode.scale;
    // Drone and pad: one long chord per bar, two detuned saws, soft and slow.
    if (s === 0) {
      const dur = sp * 16 * 1.05;
      for (const [semi, v] of [[chord[0] - 12, 0.5], [chord[2] - 12, 0.28], [chord[1], 0.16]]) {
        this.tone({ f: hz(root, semi), type: 'sawtooth', dur, vol: 0.05 * v * 2, attack: Math.min(1.2, dur * 0.35), when: w, bus: L.pad, detune: -7, lp: 700 });
        this.tone({ f: hz(root, semi), type: 'sawtooth', dur, vol: 0.05 * v * 2, attack: Math.min(1.2, dur * 0.35), when: w, bus: L.pad, detune: 7, lp: 700 });
      }
    }
    // Lute: broken chord in eighths, a different pattern on the odd bars.
    if (s % 2 === 0) {
      const pat = bar % 2 ? [0, 2, 1, 2, 0, 1, 2, 1] : [0, 1, 2, 1, 0, 2, 1, 2];
      const ci = pat[s / 2];
      if (!(fight && (s / 2) % 2 === 1)) this.pluck(hz(root, chord[ci] + (ci === 0 ? 12 : 12)), w, { vol: ci === 0 ? 0.16 : 0.11, bus: L.lute, dur: 0.9 });
    }
    // Lead: a two-bar phrase on the chord tones and the scale, composed from the bar number so it repeats.
    if (!(m.boss && fight)) this.leadStep(step, w, sp, mode, chord, bar, loop, s);
    // Hand drum on the desert, a shaker everywhere else, soft heartbeat of the march
    if (mode.hand && [0, 3, 6, 10, 12].includes(s)) this.drum('hand', w, { vol: fight ? 0.2 : 0.12, bus: L.hand, pitch: s === 0 ? 0.8 : 1 + (s % 3) * 0.12 });
    // War drums and march (fight only; the layer fades with intensity)
    if (fight) {
      if (s === 0 || s === 8) this.drum('taiko', w, { vol: 0.34, bus: L.drums, pitch: s === 0 ? 1 : 0.9 });
      if (s === 4 || s === 12) this.drum('snare', w, { vol: 0.2 + 0.12 * I, bus: L.drums });
      if (I > 0.35 && (s === 6 || s === 14)) this.drum('tom', w, { vol: 0.2, bus: L.drums, pitch: 1.1 });
      if (I > 0.6 && s % 2 === 1) this.drum('tick', w, { vol: 0.2, bus: L.drums });
      if (I > 0.5 && s >= 12 && bar % 4 === 3) this.drum('snare', w, { vol: 0.14 + (s - 12) * 0.03, bus: L.drums });   // roll into the next phrase
      // Marching strings: palm-muted root and fifth in eighths with an accent on the beat
      if (s % 2 === 0) {
        const semi = (s % 8 === 4 ? chord[2] : chord[0]) - 12;
        this.tone({ f: hz(root, semi), type: 'sawtooth', dur: sp * 1.8, vol: s % 4 === 0 ? 0.1 : 0.06, attack: 0.008, when: w, bus: L.strings, lp: 650 + 900 * I, detune: 5 });
        if (I > 0.55) this.tone({ f: hz(root, chord[1]), type: 'sawtooth', dur: sp * 1.6, vol: 0.035, attack: 0.008, when: w, bus: L.strings, lp: 900, detune: -5 });
      }
      // Brass: long low chord stabs at the top of each phrase when the fight is hot or a boss is near
      if (s === 0 && (m.boss || I > 0.7) && bar % 2 === 0) {
        for (const semi of [chord[0] - 12, chord[2] - 12]) this.brass(hz(root, semi), w, sp * 10, { vol: 0.07, bus: L.brass, open: 1500 });
      }
    } else if (s === 0 || s === 8) {
      if (m.phase !== 'menu') this.drum('tom', w, { vol: 0.07, bus: L.drums, pitch: 0.8 });
    }
    // Tension: a thin, dissonant tremolo above the chord when the keep is in danger
    if (s === 0 && m.danger > 0.3) this.tone({ f: hz(root, chord[0] + 12 + 1), type: 'sawtooth', dur: sp * 16, vol: 0.045, attack: 1, when: w, bus: L.tension, lp: 1400, vib: 6 });
    void sc;
  }

  leadStep(step, w, sp, mode, chord, bar, loop, s) {
    const rng = lcg(hash(mode.root + ':' + (bar % 8) + ':' + (Math.floor(loop / 2) % 2)));
    // Rhythm template for this bar: which sixteenths start a note, and for how long (in sixteenths)
    const templates = [
      [[0, 6], [6, 2], [8, 4], [12, 4]], [[0, 4], [4, 4], [8, 8]], [[2, 4], [6, 2], [8, 6]], [[0, 8], [8, 4], [12, 2], [14, 2]],
      [[0, 3], [3, 3], [6, 2], [8, 8]], [[4, 4], [8, 4], [12, 4]],
    ];
    const tpl = templates[Math.floor(rng() * templates.length)];
    const rest = bar % 4 === 3 || rng() < 0.18;               // breathe at the end of each phrase
    const sc = mode.scale;
    let idx = 7 + [0, 2, 4][Math.floor(rng() * 3)];            // start on a chord tone, then walk the scale
    for (const [at, len] of tpl) {
      idx = at === 0 ? idx : Math.max(5, Math.min(13, idx + [-2, -1, -1, 0, 1, 1, 2][Math.floor(rng() * 7)]));
      if (at === s && !rest) this.leadNote(mode, idx, w, len * sp);
    }
    void sc; void chord; void step;
  }

  leadNote(mode, idx, w, dur) {
    const S = mode.scale, semi = S[idx % 7] + 12 * Math.floor(idx / 7) + 12;
    const f = hz(mode.root, semi - 12);
    const L = this.layers.lead;
    if (mode.lead === 'bell') this.bell(f * 2, w, { vol: 0.05, bus: L, dur: 2.2 });
    else if (mode.lead === 'horn') this.brass(f, w, Math.max(0.3, dur), { vol: 0.04, bus: L, open: 1100 });
    else this.flute(f, w, Math.max(0.25, dur * 0.95), { vol: 0.07, bus: L });
  }
}

export const audio = new Audio();
