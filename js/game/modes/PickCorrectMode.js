// js/game/modes/PickCorrectMode.js
// PickCorrectMode — mode A "Pecahkan yang Benar". Mengikuti kontrak di ModeRegistry.js.
//
// Satu soal aktif pada satu waktu. Semua pilihan (jawaban benar + pengecoh) muncul SEKALIGUS lewat
// BubbleManager.place(), diam di tempat dan bergoyang pelan. Pemain memecahkan satu gelembung dengan apit;
// soal langsung selesai:
//   benar   → event 'correct'
//   salah   → event 'wrong'   (membawa penjelasan soal untuk FeedbackPanel)
//   timeout → event 'timeout' (batas waktu per soal habis; soal dilewati, tanpa hukuman)
// Setelah itu ada jeda singkat tanpa gelembung, lalu soal berikutnya. Soal habis → isFinished().
//
// Mode TIDAK tahu skor, nyawa, waktu ronde, kamera, atau MediaPipe: ia hanya mengembalikan event. GameEngine
// meneruskannya ke ScoreManager dan FeedbackPanel, dan yang memutuskan permainan berakhir karena waktu/nyawa.
// Batas waktu per soal (`questionTime`) milik mode ini; `questionTime: 0` = tanpa batas.
import { BubbleManager } from '../BubbleManager.js';
import { shuffle } from '../QuestionBank.js';

export const PICK_DEFAULTS = Object.freeze({
  bubbleCount: 4,       // satu benar + (bubbleCount - 1) pengecoh (dibatasi kapasitas area)
  wobble: 1,            // kekuatan goyang "goo" (0 = diam total)
  questionTime: 10,     // detik per soal; 0 = tanpa batas
  startDelay: 0.6,      // jeda sebelum soal pertama
  gapSeconds: 0.8,      // jeda tanpa gelembung antar soal
});

export class PickCorrectMode {
  /**
   * @param {{ config?: object, items: object[], rng?: () => number, sizeScale?: number }} options
   *  config: satu entri `data/games.json`; items: soal dari QuestionBank (yang bukan 'pick-correct' diabaikan).
   */
  constructor({ config = {}, items = [], rng = Math.random, sizeScale = 1 } = {}) {
    this.config = { ...PICK_DEFAULTS, ...config };
    this.rng = rng;
    this.items = items.filter((it) => it && it.type === 'pick-correct');
    this.manager = new BubbleManager({ rng, wobble: this.config.wobble, sizeScale });
    this._reset();
  }

  _reset() {
    this.index = -1;      // soal aktif (-1 = belum mulai)
    this.item = null;
    this.phase = 'idle';  // 'idle' | 'gap' | 'asking' | 'finished'
    this._timer = 0;      // hitung mundur jeda (fase 'gap')
    this._placed = false; // gelembung soal aktif sudah ditempatkan?
    this._qTimer = 0;     // sisa waktu soal aktif
    this._qTotal = 0;
    this.manager.clear();
  }

  /** Ukuran area tampilan (`layout.viewport`). Boleh dipanggil kapan saja, termasuk saat layar diputar. */
  setArea(area) {
    return this.manager.setArea(area);
  }

  /** Mulai ronde dari soal pertama (soal tidak diacak ulang di sini: urutan `items` adalah urutan main). */
  start({ area } = {}) {
    this._reset();
    if (area) this.manager.setArea(area);
    if (!this.items.length) {
      this.phase = 'finished';
      return;
    }
    this.phase = 'gap';
    this._timer = this.config.startDelay;
  }

  // Tempatkan semua pilihan. Gagal (belum ada area) = dicoba lagi di frame berikutnya; waktu soal baru mulai
  // berjalan setelah gelembung benar-benar tampil.
  _placeBubbles() {
    if (!this.manager.area) return;
    const n = Math.max(2, Math.min(Math.floor(this.config.bubbleCount), this.manager.capacity));
    const distractors = shuffle(this.item.distractors, this.rng).slice(0, n - 1);
    // Jawaban benar di depan: bila kapasitas kurang, pengecoh yang dibuang, bukan jawabannya.
    const placed = this.manager.place([
      { text: this.item.correct[0], kind: 'correct' },
      ...distractors.map((text) => ({ text, kind: 'distractor' })),
    ]);
    if (!placed.length) return;
    this._placed = true;
    this._qTotal = this.config.questionTime > 0 ? this.config.questionTime : 0;
    this._qTimer = this._qTotal;
  }

  _beginQuestion() {
    this.index += 1;
    this.item = this.items[this.index];
    this._placed = false;
    this.phase = 'asking';
    this._placeBubbles();
    return { type: 'question', item: this.item, index: this.index, total: this.items.length, timeLimit: this.config.questionTime > 0 ? this.config.questionTime : 0 };
  }

  _resolve(event) {
    this.manager.clear();
    this._placed = false;
    if (this.index + 1 >= this.items.length) {
      this.phase = 'finished';
    } else {
      this.phase = 'gap';
      this._timer = this.config.gapSeconds;
    }
    return event;
  }

  /**
   * Maju satu langkah.
   * @param {number} dt  detik
   * @param {{ pinched?: { bubble: object }[] }} [input]  gelembung yang diapit frame ini (`Collision.findPinched`)
   * @returns {object[]}  event urut: { type: 'question' | 'correct' | 'wrong' | 'timeout', item, ... }
   */
  update(dt, { pinched = [] } = {}) {
    const events = [];
    if (this.phase === 'idle' || this.phase === 'finished') return events;
    const step = Number.isFinite(dt) && dt > 0 ? dt : 0;

    if (this.phase === 'gap') {
      this._timer -= step;
      if (this._timer <= 0) events.push(this._beginQuestion());
      return events;
    }

    // phase === 'asking'
    if (!this._placed) {
      this._placeBubbles();
      return events;
    }
    this.manager.update(step);

    // 1) Apitan. Bila benar dan salah terapit bersamaan, yang benar dihitung (tidak menghukum pemain karena kebetulan).
    const live = pinched.filter((h) => h && h.bubble && this.manager.bubbles.some((b) => b.id === h.bubble.id));
    const hit = live.find((h) => h.bubble.kind === 'correct') || live[0];
    if (hit) {
      const { bubble } = hit;
      this.manager.remove(bubble.id);
      if (bubble.kind === 'correct') {
        events.push(this._resolve({ type: 'correct', item: this.item, bubble, picked: bubble.text }));
      } else {
        events.push(this._resolve({ type: 'wrong', item: this.item, bubble, picked: bubble.text, answer: this.item.correct[0], explain: this.item.explain }));
      }
      return events;
    }

    // 2) Waktu soal habis: soal dilewati, tanpa hukuman.
    if (this._qTotal > 0) {
      this._qTimer -= step;
      if (this._qTimer <= 0) {
        events.push(this._resolve({ type: 'timeout', item: this.item, answer: this.item.correct[0], explain: this.item.explain }));
      }
    }
    return events;
  }

  /** Gelembung untuk digambar dan dicocokkan dengan apit. */
  getBubbles() {
    return this.manager.bubbles;
  }

  /** Teks soal aktif; null saat jeda antar soal atau setelah selesai. */
  getPrompt() {
    return this.phase === 'asking' && this.item ? this.item.prompt : null;
  }

  /** Sisa waktu soal aktif `{ left, total }` (detik); null bila tidak ada batas atau sedang jeda. */
  getQuestionTime() {
    if (this.phase !== 'asking' || !this._placed || !(this._qTotal > 0)) return null;
    return { left: Math.max(0, this._qTimer), total: this._qTotal };
  }

  /** Soal habis. (Waktu habis / nyawa habis diputuskan GameEngine.) */
  isFinished() {
    return this.phase === 'finished';
  }
}
