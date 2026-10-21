// js/game/ScoreManager.js
// ScoreManager — skor, nyawa, akurasi. Menulis ke GameState (satu sumber kebenaran; HUD hanya membaca state)
// dan mencatat soal yang salah untuk layar Hasil. Tidak tahu bola, kamera, atau DOM.
//
// Aturan Mode A (blueprint 3): jawaban benar → skor naik; jawaban salah → skor turun dan nyawa berkurang.
// Skor tidak turun di bawah 0 (anak tidak melihat angka negatif), kecuali `allowNegative: true`.
// Soal yang terlewat (jawaban benar keburu keluar layar) dicatat terpisah: tidak mengurangi nyawa dan tidak
// dihitung salah, jadi tidak menurunkan akurasi.
// Nyawa 0 di awal (data/games.json `lives: 0`) berarti permainan tanpa nyawa: `outOfLives` tidak pernah true.
export const DEFAULT_SCORING = Object.freeze({ correct: 10, wrong: -5 });

export class ScoreManager {
  /**
   * @param {{ state: import('./GameState.js').GameState, scoring?: { correct: number, wrong: number }, allowNegative?: boolean }} options
   *  scoring: dari data/games.json (`scoring`); `wrong` biasanya negatif.
   */
  constructor({ state, scoring = DEFAULT_SCORING, allowNegative = false } = {}) {
    if (!state) throw new TypeError('ScoreManager: "state" (GameState) wajib diisi');
    for (const key of ['correct', 'wrong']) {
      if (typeof scoring[key] !== 'number' || !Number.isFinite(scoring[key])) {
        throw new TypeError(`ScoreManager: scoring.${key} harus angka (diterima: ${JSON.stringify(scoring[key])})`);
      }
    }
    this.state = state;
    this.scoring = { correct: scoring.correct, wrong: scoring.wrong };
    this.allowNegative = !!allowNegative;
    this.reset();
  }

  /** Mulai ronde baru. Panggil SETELAH `state.reset(config)`: nyawa awal dibaca dari state. */
  reset() {
    this.wrongItems = [];
    this.skipped = 0;
    this._livesEnabled = this.state.lives > 0;
  }

  /**
   * Catat satu jawaban.
   * @param {{ correct: boolean, item?: object|null, picked?: string|null }} hit
   *  item: soal dari QuestionBank (untuk daftar soal salah di layar Hasil); picked: teks gelembung yang dipecahkan.
   * @returns {{ delta: number, score: number, lives: number, outOfLives: boolean }}
   */
  recordHit({ correct, item = null, picked = null } = {}) {
    if (typeof correct !== 'boolean') throw new TypeError('ScoreManager.recordHit: "correct" harus boolean');
    const s = this.state;
    const before = s.score;
    if (correct) {
      s.correct += 1;
      s.score += this.scoring.correct;
    } else {
      s.wrong += 1;
      s.score += this.scoring.wrong;
      if (this._livesEnabled) s.lives = Math.max(0, s.lives - 1);
      if (item) {
        this.wrongItems.push({
          id: item.id,
          prompt: item.prompt,
          picked,
          answer: item.correct ? item.correct.join(', ') : null,
          explain: item.explain,
        });
      }
    }
    if (!this.allowNegative && s.score < 0) s.score = 0;
    return { delta: s.score - before, score: s.score, lives: s.lives, outOfLives: this.outOfLives };
  }

  /** Soal terlewat: tidak mengubah skor, nyawa, atau akurasi. */
  recordSkip() {
    this.skipped += 1;
    return this.skipped;
  }

  get outOfLives() {
    return this._livesEnabled && this.state.lives <= 0;
  }

  /** Ringkasan untuk layar Hasil. */
  summary() {
    const s = this.state;
    return {
      score: s.score,
      correct: s.correct,
      wrong: s.wrong,
      skipped: this.skipped,
      accuracy: s.accuracy,
      lives: s.lives,
      wrongItems: this.wrongItems.map((w) => ({ ...w })),
    };
  }
}
