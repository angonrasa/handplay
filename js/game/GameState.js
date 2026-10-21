// js/game/GameState.js
// GameState — satu sumber kebenaran untuk keadaan permainan: fase, skor, nyawa, waktu.
// Tidak tahu DOM, kamera, atau MediaPipe. Fase hanya boleh berpindah lewat `go()` sesuai tabel TRANSITIONS;
// perpindahan yang tidak sah dilempar sebagai galat, bukan diabaikan diam-diam.
export const Phase = Object.freeze({
  HOME: 'home',
  CALIBRATION: 'calibration',
  PLAYING: 'playing',
  PAUSED: 'paused',
  RESULT: 'result',
});

// Perpindahan fase yang sah. Alur utama: home → calibration → playing → result.
//  - playing ↔ paused: jeda (mis. layar diputar) dan lanjut.
//  - playing/paused → calibration: kamera terputus di tengah permainan.
//  - result → playing: "main lagi" (ronde baru; GameEngine mereset skor lewat reset()).
export const TRANSITIONS = Object.freeze({
  [Phase.HOME]: Object.freeze([Phase.CALIBRATION]),
  [Phase.CALIBRATION]: Object.freeze([Phase.HOME, Phase.PLAYING]),
  [Phase.PLAYING]: Object.freeze([Phase.PAUSED, Phase.RESULT, Phase.CALIBRATION]),
  [Phase.PAUSED]: Object.freeze([Phase.PLAYING, Phase.RESULT, Phase.CALIBRATION, Phase.HOME]),
  [Phase.RESULT]: Object.freeze([Phase.PLAYING, Phase.HOME]),
});

export class GameStateError extends Error {
  /** @param {'transition'|'config'} code  @param {string} message */
  constructor(code, message) {
    super(message);
    this.name = 'GameStateError';
    this.code = code;
  }
}

export class GameState {
  constructor() {
    this.phase = Phase.HOME;
    this.score = 0;
    this.lives = 0;
    this.timeLeft = 0;
    this.correct = 0; // jawaban benar ronde ini (diisi ScoreManager, M4.7)
    this.wrong = 0;   // jawaban salah ronde ini
    this._listeners = [];
  }

  /** Akurasi 0..1, atau null bila belum ada jawaban. */
  get accuracy() {
    const total = this.correct + this.wrong;
    return total === 0 ? null : this.correct / total;
  }

  // config berasal dari data/games.json: { duration, lives, ... }. Tidak mengubah fase.
  reset(config) {
    const { lives, duration } = config || {};
    if (!Number.isInteger(lives) || lives < 0) throw new GameStateError('config', `"lives" harus bilangan bulat ≥ 0 (diterima: ${JSON.stringify(lives)})`);
    if (typeof duration !== 'number' || !Number.isFinite(duration) || duration < 0) throw new GameStateError('config', `"duration" harus angka ≥ 0 (diterima: ${JSON.stringify(duration)})`);
    this.score = 0;
    this.lives = lives;
    this.timeLeft = duration;
    this.correct = 0;
    this.wrong = 0;
  }

  /** Apakah perpindahan ke `next` sah dari fase sekarang? (fase yang sama dianggap sah: tidak berbuat apa-apa) */
  can(next) {
    return next === this.phase || (TRANSITIONS[this.phase] || []).includes(next);
  }

  /**
   * Pindah fase. Fase yang sama = tidak berbuat apa-apa (false).
   * @param {string} next  salah satu nilai Phase
   * @returns {boolean} true bila fase benar-benar berubah
   * @throws {GameStateError} bila perpindahan tidak sah
   */
  go(next) {
    if (!Object.values(Phase).includes(next)) throw new GameStateError('transition', `Fase tidak dikenal: ${JSON.stringify(next)}`);
    if (next === this.phase) return false;
    if (!this.can(next)) {
      const allowed = (TRANSITIONS[this.phase] || []).join(', ');
      throw new GameStateError('transition', `Perpindahan fase tidak sah: ${this.phase} → ${next} (dari ${this.phase} hanya boleh ke: ${allowed})`);
    }
    const previous = this.phase;
    this.phase = next;
    for (const fn of this._listeners.slice()) {
      try {
        fn(next, previous);
      } catch (err) {
        console.error('[handplay] pendengar fase gagal:', err); // satu pendengar rusak tidak boleh menghentikan yang lain
      }
    }
    return true;
  }

  /**
   * Dengarkan perubahan fase. Ronde baru = masuk `playing` dari fase selain `paused`.
   * @param {(phase: string, previous: string) => void} fn
   * @returns {() => void} fungsi untuk berhenti mendengar
   */
  onPhase(fn) {
    this._listeners.push(fn);
    return () => {
      const i = this._listeners.indexOf(fn);
      if (i >= 0) this._listeners.splice(i, 1);
    };
  }
}
