// Synthesized sound effects + a gentle generative march. No audio files needed.

export class Audio {
  constructor() {
    this.ctx = null;
    this.master = 0.8; this.sfx = 0.8; this.music = 0.4; this.muted = false;
    this.last = {};
    this.musicOn = false;
  }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.out = this.ctx.createGain(); this.out.connect(this.ctx.destination);
    this.sfxBus = this.ctx.createGain(); this.sfxBus.connect(this.out);
    this.musicBus = this.ctx.createGain(); this.musicBus.connect(this.out);
    const len = this.ctx.sampleRate * 1;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.apply();
  }
  set(o) { Object.assign(this, o); this.apply(); }
  apply() {
    if (!this.ctx) return;
    this.out.gain.value = this.muted ? 0 : this.master;
    this.sfxBus.gain.value = this.sfx;
    this.musicBus.gain.value = this.music * 0.5;
  }

  // Rate-limit identical sounds so 40 arrows don't make a wall of noise.
  ok(name, gap = 0.04) {
    if (!this.ctx || this.muted) return false;
    const t = this.ctx.currentTime;
    if (this.last[name] && t - this.last[name] < gap) return false;
    this.last[name] = t; return true;
  }

  tone({ f = 440, f2 = null, type = 'sine', dur = 0.15, vol = 0.3, attack = 0.005, bus = this.sfxBus, when = 0 }) {
    const c = this.ctx, t = c.currentTime + when;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(bus); o.start(t); o.stop(t + dur + 0.02);
  }
  noiseHit({ dur = 0.2, vol = 0.3, freq = 1200, q = 1, type = 'lowpass', f2 = null, when = 0 }) {
    const c = this.ctx, t = c.currentTime + when;
    const s = c.createBufferSource(); s.buffer = this.noise;
    const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(freq, t); fl.Q.value = q;
    if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(this.sfxBus); s.start(t); s.stop(t + dur + 0.02);
  }

  play(name, opt = {}) {
    if (!this.ctx || this.muted) return;
    switch (name) {
      case 'bow': if (this.ok(name, 0.03)) { this.noiseHit({ dur: 0.09, vol: 0.25, freq: 2500, type: 'bandpass', q: 2, f2: 800 }); this.tone({ f: 300, f2: 120, type: 'triangle', dur: 0.08, vol: 0.15 }); } break;
      case 'charge': if (this.ok(name, 0.1)) this.tone({ f: 200 + 500 * (opt.k || 0), type: 'triangle', dur: 0.08, vol: 0.06 }); break;
      case 'heroHit': if (this.ok(name, 0.02)) { this.tone({ f: 520 + Math.min(12, opt.combo || 0) * 40, f2: 260, type: 'square', dur: 0.07, vol: 0.08 }); this.noiseHit({ dur: 0.05, vol: 0.15, freq: 3000, type: 'highpass' }); } break;
      case 'headshot': this.tone({ f: 1200, f2: 1800, type: 'triangle', dur: 0.12, vol: 0.18 }); this.tone({ f: 1800, type: 'sine', dur: 0.2, vol: 0.1, when: 0.05 }); break;
      case 'miss': if (this.ok(name, 0.1)) this.tone({ f: 200, f2: 120, type: 'sawtooth', dur: 0.12, vol: 0.06 }); break;
      case 'arrow': if (this.ok(name, 0.06)) this.noiseHit({ dur: 0.05, vol: 0.06, freq: 3500, type: 'bandpass', q: 3 }); break;
      case 'cannon': if (this.ok(name, 0.08)) { this.noiseHit({ dur: 0.3, vol: 0.35, freq: 600, f2: 80 }); this.tone({ f: 110, f2: 40, type: 'sine', dur: 0.25, vol: 0.3 }); } break;
      case 'boom': if (this.ok(name, 0.06)) { this.noiseHit({ dur: 0.35, vol: 0.3, freq: 900, f2: 60 }); } break;
      case 'zap': if (this.ok(name, 0.07)) { this.tone({ f: 900, f2: 300, type: 'sawtooth', dur: 0.12, vol: 0.06 }); this.noiseHit({ dur: 0.1, vol: 0.1, freq: 5000, type: 'highpass' }); } break;
      case 'orb': if (this.ok(name, 0.07)) this.tone({ f: 660, f2: 990, type: 'sine', dur: 0.15, vol: 0.06 }); break;
      case 'frost': if (this.ok(name, 0.15)) { this.noiseHit({ dur: 0.4, vol: 0.12, freq: 6000, type: 'highpass' }); this.tone({ f: 1400, f2: 2000, type: 'sine', dur: 0.3, vol: 0.04 }); } break;
      case 'bolt': if (this.ok(name, 0.08)) { this.tone({ f: 180, f2: 90, type: 'triangle', dur: 0.12, vol: 0.18 }); this.noiseHit({ dur: 0.08, vol: 0.12, freq: 1500, type: 'bandpass' }); } break;
      case 'kill': if (this.ok(name, 0.03)) this.tone({ f: 380 + Math.random() * 60, f2: 160, type: 'triangle', dur: 0.1, vol: 0.06 }); break;
      case 'coin': if (this.ok(name, 0.05)) { this.tone({ f: 1320, type: 'square', dur: 0.06, vol: 0.04 }); this.tone({ f: 1760, type: 'square', dur: 0.08, vol: 0.04, when: 0.05 }); } break;
      case 'build': this.noiseHit({ dur: 0.15, vol: 0.25, freq: 400, f2: 200 }); this.tone({ f: 220, f2: 330, type: 'triangle', dur: 0.15, vol: 0.15 }); break;
      case 'upgrade': [523, 659, 784].forEach((f, i) => this.tone({ f, type: 'triangle', dur: 0.14, vol: 0.12, when: i * 0.06 })); break;
      case 'sell': [784, 523].forEach((f, i) => this.tone({ f, type: 'triangle', dur: 0.12, vol: 0.1, when: i * 0.07 })); break;
      case 'repair': [330, 440, 330, 440].forEach((f, i) => this.noiseHit({ dur: 0.05, vol: 0.15, freq: 1000 + f, type: 'bandpass', q: 4, when: i * 0.07 })); break;
      case 'leak': if (this.ok(name, 0.1)) { this.tone({ f: 160, f2: 60, type: 'square', dur: 0.25, vol: 0.12 }); this.noiseHit({ dur: 0.2, vol: 0.2, freq: 500 }); } break;
      case 'horn': [196, 196, 294].forEach((f, i) => this.tone({ f, type: 'sawtooth', dur: i === 2 ? 0.6 : 0.18, vol: 0.09, attack: 0.03, when: i * 0.2 })); break;
      case 'boss': [110, 104, 98].forEach((f, i) => this.tone({ f, type: 'sawtooth', dur: 0.5, vol: 0.12, attack: 0.05, when: i * 0.35 })); this.noiseHit({ dur: 1.2, vol: 0.2, freq: 200 }); break;
      case 'clear': [523, 659, 784, 1046].forEach((f, i) => this.tone({ f, type: 'triangle', dur: 0.25, vol: 0.1, when: i * 0.09 })); break;
      case 'boon': [659, 880, 1175].forEach((f, i) => this.tone({ f, type: 'sine', dur: 0.4, vol: 0.1, when: i * 0.08 })); break;
      case 'achievement': [784, 988, 1175, 1568].forEach((f, i) => this.tone({ f, type: 'triangle', dur: 0.3, vol: 0.1, when: i * 0.08 })); break;
      case 'gameover': [392, 330, 262, 196].forEach((f, i) => this.tone({ f, type: 'sawtooth', dur: 0.5, vol: 0.08, attack: 0.02, when: i * 0.3 })); break;
      case 'click': if (this.ok(name, 0.03)) this.tone({ f: 800, type: 'triangle', dur: 0.04, vol: 0.06 }); break;
      case 'error': if (this.ok(name, 0.1)) this.tone({ f: 180, f2: 140, type: 'square', dur: 0.12, vol: 0.06 }); break;
      case 'stomp': this.tone({ f: 70, f2: 30, type: 'sine', dur: 0.5, vol: 0.4 }); this.noiseHit({ dur: 0.4, vol: 0.3, freq: 300 }); break;
      case 'combo': if (this.ok(name, 0.15)) this.tone({ f: 600 + (opt.n || 0) * 30, type: 'sine', dur: 0.1, vol: 0.07 }); break;
    }
  }

  // Very small generative march: pentatonic melody over a drum pulse.
  startMusic() {
    if (!this.ctx || this.musicOn) return;
    this.musicOn = true;
    const scale = [0, 2, 4, 7, 9, 12, 14];
    let step = 0;
    const base = 196;
    const tick = () => {
      if (!this.musicOn) return;
      if (this.music > 0 && !this.muted) {
        const beat = step % 8;
        if (beat % 4 === 0) this.tone({ f: 70, f2: 45, type: 'sine', dur: 0.2, vol: 0.25, bus: this.musicBus });
        if (beat % 4 === 2) this.tone({ f: 2000, type: 'square', dur: 0.02, vol: 0.02, bus: this.musicBus });
        if (beat % 2 === 0) {
          const deg = scale[(Math.floor(step / 2) * 3 + (step % 5)) % scale.length];
          this.tone({ f: base * Math.pow(2, deg / 12), type: 'triangle', dur: 0.32, vol: 0.06, attack: 0.02, bus: this.musicBus });
        }
        if (beat === 0) this.tone({ f: base / 2 * Math.pow(2, scale[(step / 8) % 4 | 0] / 12), type: 'sine', dur: 1.2, vol: 0.08, attack: 0.1, bus: this.musicBus });
      }
      step++;
      this.musicTimer = setTimeout(tick, 230);
    };
    tick();
  }
  stopMusic() { this.musicOn = false; clearTimeout(this.musicTimer); }
}

export const audio = new Audio();
