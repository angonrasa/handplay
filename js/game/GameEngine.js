// js/game/GameEngine.js
// GameEngine — menyatukan satu ronde: loop per frame, timer, mode aktif, apit → skor, dan kondisi selesai
// (waktu habis / nyawa habis / soal habis). Tidak menggambar, tidak menyentuh DOM, tidak tahu MediaPipe:
// masukannya `gestures` (pasangan jari sudah diperbarui app.js), keluarannya `GameState` + event lewat callback.
//
// Fase mengikuti GameState (satu sumber kebenaran):
//   masuk `playing` dari fase selain `paused` → ronde baru (reset state + skor, buat mode, mulai loop)
//   `playing` → `paused`                      → loop berhenti, waktu tidak berjalan
//   `paused` → `playing`                      → loop lanjut dari keadaan yang sama
//   `result` / `calibration` / `home`         → loop berhenti
// Layar diputar di tengah permainan (M4.3c): `setArea()` menjeda otomatis; pemain melanjutkan lewat `resume()`.

import { Phase } from './GameState.js';
import { ScoreManager } from './ScoreManager.js';
import { findPinched } from './Collision.js';

const MAX_DT = 0.1; // detik; frame yang tertahan lama (tab tersembunyi, GC) tidak boleh menghabiskan waktu pemain

const defaultNow = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export class GameEngine {
  /**
   * @param {{
   *   state: import('./GameState.js').GameState,
   *   registry: import('./ModeRegistry.js').ModeRegistry,
   *   gestures: { match: Function },
   *   getItems: (config: object) => object[],   soal untuk satu ronde (urutan = urutan main)
   *   getArea: () => ({width:number,height:number}|null),   biasanya () => layout.viewport
   *   config?: object,                          satu entri data/games.json
   *   sizeScale?: number,
   *   onEvent?: (event: object) => void,        event mode + hasil skor (HUD, FeedbackPanel, suara)
   *   onFrame?: (time: number) => void,         dipanggil tiap frame loop (untuk menggambar ulang)
   *   now?: () => number, requestFrame?: Function, cancelFrame?: Function
   * }} options
   */
  constructor({
    state, registry, gestures, getItems, getArea,
    config = null, sizeScale = 1, onEvent = null, onFrame = null,
    now = defaultNow, requestFrame, cancelFrame,
  } = {}) {
    if (!state || !registry || !gestures || typeof getItems !== 'function' || typeof getArea !== 'function') {
      throw new TypeError('GameEngine: state, registry, gestures, getItems, dan getArea wajib diisi');
    }
    this.state = state;
    this.registry = registry;
    this.gestures = gestures;
    this.getItems = getItems;
    this.getArea = getArea;
    this.config = config;
    this.sizeScale = sizeScale;
    this.onEvent = onEvent;
    this.onFrame = onFrame;
    this._now = now;
    this._request = requestFrame || (typeof requestAnimationFrame === 'function' ? (cb) => requestAnimationFrame(cb) : null);
    this._cancel = cancelFrame || (typeof cancelAnimationFrame === 'function' ? (id) => cancelAnimationFrame(id) : () => {});

    this.mode = null;
    this.score = null;
    this.result = null;   // ringkasan ronde terakhir: { reason, ...ScoreManager.summary() }
    this.progress = { index: 0, total: 0 };
    this._running = false;
    this._raf = 0;
    this._last = 0;
    this._loop = this._loop.bind(this);
    this._off = state.onPhase((phase, previous) => this._onPhase(phase, previous));
  }

  /** Ganti konfigurasi mode (entri data/games.json). Berlaku mulai ronde berikutnya. */
  setConfig(config) {
    this.config = config;
  }

  /** Gelembung perlu digambar (bermain atau dijeda). */
  get visible() {
    return !!this.mode && (this.state.phase === Phase.PLAYING || this.state.phase === Phase.PAUSED);
  }

  getBubbles() {
    return this.mode ? this.mode.getBubbles() : [];
  }

  /** Gambaran singkat untuk HUD. `questionTime` = `{ left, total }` (detik) bila mode punya batas waktu per soal, selain itu null. */
  snapshot() {
    const s = this.state;
    return {
      phase: s.phase,
      prompt: this.mode ? this.mode.getPrompt() : null,
      score: s.score,
      lives: s.lives,
      timeLeft: s.timeLeft,
      timed: !!this.config && this.config.duration > 0,
      index: this.progress.index,
      total: this.progress.total,
      questionTime: this.mode && typeof this.mode.getQuestionTime === 'function' ? this.mode.getQuestionTime() : null,
    };
  }

  pause() {
    if (this.state.phase === Phase.PLAYING) this.state.go(Phase.PAUSED);
  }

  resume() {
    if (this.state.phase === Phase.PAUSED) this.state.go(Phase.PLAYING);
  }

  /**
   * Ukuran area berubah. Orientasi berganti di tengah permainan → jeda otomatis (M4.3c);
   * gelembung sudah ditata ulang oleh BubbleManager.
   */
  setArea(area) {
    if (!this.mode || !area || !(area.width > 0) || !(area.height > 0)) return;
    const res = this.mode.setArea(area);
    if (res && res.orientationChanged && this.state.phase === Phase.PLAYING) this.pause();
  }

  /** Akhiri ronde sekarang. `reason`: 'time' | 'lives' | 'questions' | 'manual'. */
  finish(reason = 'manual') {
    if (this.state.phase !== Phase.PLAYING && this.state.phase !== Phase.PAUSED) return;
    this.result = this._buildResult(reason);
    this.state.go(Phase.RESULT);
  }

  destroy() {
    this._stopLoop();
    this._off();
  }

  // ---------- fase ----------

  _onPhase(phase, previous) {
    if (phase === Phase.PLAYING) {
      if (previous === Phase.PAUSED) this._startLoop();
      else this._startRound();
      return;
    }
    this._stopLoop();
    // Pindah ke Hasil lewat jalur lain (mis. tombol "Selesai"): tetap simpan ringkasannya.
    if (phase === Phase.RESULT && !this.result && this.score) this.result = this._buildResult('manual');
  }

  _startRound() {
    const config = this.config;
    if (!config) throw new Error('GameEngine: konfigurasi mode belum dimuat (data/games.json)');
    this.result = null;
    this.state.reset(config);
    this.score = new ScoreManager({ state: this.state, scoring: config.scoring });
    this.mode = this.registry.create(config.id, {
      config,
      items: this.getItems(config),
      sizeScale: this.sizeScale,
    });
    this.progress = { index: 0, total: 0 };
    const area = this.getArea();
    this.mode.start({ area: area && area.width > 0 && area.height > 0 ? area : undefined });
    this._startLoop();
  }

  // ---------- loop ----------

  _startLoop() {
    if (!this._request) return;
    this._stopLoop();
    this._running = true;
    this._last = this._now();
    this._raf = this._request(this._loop);
  }

  _stopLoop() {
    this._running = false;
    if (this._raf) this._cancel(this._raf);
    this._raf = 0;
  }

  _loop() {
    this._raf = 0;
    if (!this._running) return;
    const t = this._now();
    const dt = Math.min(MAX_DT, Math.max(0, (t - this._last) / 1000));
    this._last = t;
    this.step(dt, t);
    if (!this._running) return; // step() bisa mengakhiri ronde
    if (this.onFrame) this.onFrame(t);
    this._raf = this._request(this._loop);
  }

  /**
   * Satu langkah permainan (dipisah dari loop supaya bisa diuji tanpa requestAnimationFrame).
   * @param {number} dt  detik
   * @param {number} time  ms (jam yang sama dengan waktu yang diberikan ke GestureDetector)
   */
  step(dt, time = this._now()) {
    const s = this.state;
    if (s.phase !== Phase.PLAYING || !this.mode) return;

    const pinched = findPinched(this.gestures, this.mode.getBubbles(), time);
    const events = this.mode.update(dt, { pinched });
    for (const event of events) this._handle(event);

    if (this.config.duration > 0) s.timeLeft = Math.max(0, s.timeLeft - dt);

    // Urutan: nyawa dan waktu didahulukan dari "soal habis"; semua event frame ini sudah dihitung di atas.
    if (this.score.outOfLives) this.finish('lives');
    else if (this.config.duration > 0 && s.timeLeft <= 0) this.finish('time');
    else if (this.mode.isFinished()) this.finish('questions');
  }

  _handle(event) {
    let outcome = null;
    if (event.type === 'question') {
      this.progress = { index: event.index + 1, total: event.total };
    } else if (event.type === 'correct' || event.type === 'wrong') {
      outcome = this.score.recordHit({ correct: event.type === 'correct', item: event.item, picked: event.picked });
    } else if (event.type === 'timeout') {
      this.score.recordSkip(); // waktu soal habis: terlewat, tanpa mengurangi nyawa dan akurasi
    }
    if (this.onEvent) this.onEvent(outcome ? { ...event, outcome } : event);
  }

  _buildResult(reason) {
    return { reason, ...(this.score ? this.score.summary() : {}) };
  }
}
