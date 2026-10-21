// js/audio/SoundManager.js
// SoundManager — efek suara untuk event game. Bunyi dibuat langsung dengan Web Audio (tanpa file audio),
// jadi ikut jalan offline dan tidak menambah ukuran aplikasi. Tidak tahu aturan game: hanya menerima nama
// bunyi (`play`) atau event GameEngine (`handle`).
//
// Browser menolak suara sebelum ada sentuhan pemain. `unlock()` dipanggil dari klik/sentuh pertama
// (tombol "Mulai"); sebelum itu `play()` diam saja.
//
// Bunyi (sengaja tenang, sejalan dengan "pecah = menghembuskan napas", blueprint 13.2):
//   correct = pecah + dua nada lonceng naik     wrong  = pecah lembut + nada rendah turun
//   skip    = desah pendek (soal terlewat)       finish = empat nada lonceng naik (ronde selesai)

const EVENT_TO_SOUND = { correct: 'correct', wrong: 'wrong', timeout: 'skip', missed: 'skip' };
const MIN_GAP_S = 0.04; // bunyi sama tidak ditumpuk lebih rapat dari ini

export class SoundManager {
  /** @param {{ enabled?: boolean, volume?: number, AudioContextClass?: Function }} [options] */
  constructor({ enabled = true, volume = 0.6, AudioContextClass = null } = {}) {
    this.enabled = !!enabled;
    this.volume = volume;
    this._Ctx = AudioContextClass
      || (typeof window !== 'undefined' ? window.AudioContext || window.webkitAudioContext : null);
    this.ctx = null;
    this._out = null;
    this._noise = null;
    this._lastAt = {};
  }

  setEnabled(on) {
    this.enabled = !!on;
  }

  /** Panggil dari gestur pemain (klik/sentuh). Membuat dan membangunkan AudioContext. */
  unlock() {
    if (!this.enabled || !this._Ctx) return;
    if (!this.ctx) {
      try {
        this.ctx = new this._Ctx();
        const master = this.ctx.createGain();
        master.gain.value = this.volume;
        const comp = this.ctx.createDynamicsCompressor(); // speaker TV keras: jaga agar tidak pecah
        master.connect(comp);
        comp.connect(this.ctx.destination);
        this._out = master;
      } catch (err) {
        console.warn('[handplay] audio tidak tersedia:', err?.message || err);
        this.ctx = null;
        this._Ctx = null;
        return;
      }
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  /** Terima event GameEngine.onEvent. */
  handle(event) {
    const name = event && EVENT_TO_SOUND[event.type];
    if (name) this.play(name);
  }

  play(name) {
    const ctx = this.ctx;
    if (!this.enabled || !ctx) return;
    if (ctx.state !== 'running') {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return;
    }
    const now = ctx.currentTime;
    if (now - (this._lastAt[name] ?? -1) < MIN_GAP_S) return;
    this._lastAt[name] = now;
    const t = now + 0.005;
    try {
      switch (name) {
        case 'correct':
          this._pop(t, 1);
          this._bell(784, t + 0.04, 0.45, 0.3);
          this._bell(1175, t + 0.13, 0.6, 0.26);
          break;
        case 'wrong':
          this._pop(t, 0.7);
          this._tone({ type: 'triangle', freq: 233, freqEnd: 150, start: t + 0.03, dur: 0.3, peak: 0.3 });
          break;
        case 'skip':
          this._tone({ type: 'sine', freq: 520, freqEnd: 380, start: t, dur: 0.24, peak: 0.12 });
          break;
        case 'finish':
          [523, 659, 784, 1047].forEach((f, i) => this._bell(f, t + i * 0.14, 0.7, 0.26));
          break;
        default:
      }
    } catch (err) {
      console.warn('[handplay] bunyi gagal:', name, err?.message || err);
    }
  }

  // ---------- pembangun bunyi ----------

  // Gelembung pecah: klik derau pendek + nada meluncur turun cepat.
  _pop(start, gain) {
    const ctx = this.ctx;
    if (!this._noise) {
      const len = Math.round(ctx.sampleRate * 0.1);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
      this._noise = buf;
    }
    const src = ctx.createBufferSource();
    src.buffer = this._noise;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 2200;
    band.Q.value = 0.9;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(0.5 * gain, start + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, start + 0.07);
    src.connect(band);
    band.connect(g);
    g.connect(this._out);
    src.onended = () => { src.disconnect(); band.disconnect(); g.disconnect(); };
    src.start(start);
    src.stop(start + 0.08);
    this._tone({ type: 'sine', freq: 1000, freqEnd: 320, start, dur: 0.06, peak: 0.28 * gain });
  }

  // Lonceng lembut: dasar + dua harmonik yang cepat hilang.
  _bell(freq, start, dur, peak) {
    this._tone({ type: 'sine', freq, start, dur, peak });
    this._tone({ type: 'sine', freq: freq * 2, start, dur: dur * 0.6, peak: peak * 0.3 });
    this._tone({ type: 'sine', freq: freq * 3, start, dur: dur * 0.3, peak: peak * 0.1 });
  }

  _tone({ type = 'sine', freq, freqEnd = 0, start, dur, peak, attack = 0.008 }) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (freqEnd > 0) osc.frequency.exponentialRampToValueAtTime(freqEnd, start + dur);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(peak, start + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(g);
    g.connect(this._out);
    osc.onended = () => { osc.disconnect(); g.disconnect(); }; // lepas node agar tidak menumpuk di memori
    osc.start(start);
    osc.stop(start + dur + 0.02);
  }
}
