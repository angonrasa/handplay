// js/game/modes/PickCorrectMode.js
// PickCorrectMode — mode A "Pecahkan yang Benar". Mengikuti kontrak di ModeRegistry.js.
//
// Tata letak: pilihan berderet rata tengah DI BAWAH teks soal (urutan diacak, jadi jawaban benar tidak selalu di kiri).
// Terlalu lebar untuk satu baris = turun ke baris berikutnya. Posisi dihitung di sini dan dipasang tiap frame, bukan oleh
// BubbleManager.place(). Batas atas deretan = tinggi HUD yang DIUKUR app.js dari tampilan nyata (`setTopInset`, piksel),
// jadi berlaku untuk soal sependek atau sepanjang apa pun. Sebelum ada ukuran, dipakai perkiraan `rowTop*` (satuan u).
// Di dalam ruang kosong antara HUD dan tepi bawah, deretan diletakkan sesuai `rowAnchor` (0 = menempel HUD, 1 = menempel batas bawah):
// pilihan yang menempel HUD berada di atas layar, jauh dari tangan pemain yang berdiri di depan TV.
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
  rowTopLandscape: 28,  // perkiraan batas atas deretan (u) bila tinggi HUD belum terukur, landscape
  rowTopPortrait: 42,   // idem, portrait (HUD lebih padat)
  rowBelowHud: 2.5,     // jarak minimum deretan di bawah HUD terukur (u)
  rowAnchor: 0.6,       // posisi deretan di ruang kosong bawah HUD: 0 = menempel HUD, 1 = menempel batas bawah (?row= di alamat)
  rowBottomU: 16,       // ruang kosong di tepi bawah (u): tombol Selesai dan jari yang menjangkau
  rowGap: 0.55,         // jarak antar gelembung (× radius terbesar)
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
    this._topInset = 0;    // tinggi HUD terukur (px dari tepi atas area); 0 = belum terukur
    this._rowOrder = null; // urutan id gelembung di deretan (diacak sekali per soal)
    this._row = new Map(); // id → { x, y }
    this.manager.clear();
  }

  /** Ukuran area tampilan (`layout.viewport`). Boleh dipanggil kapan saja, termasuk saat layar diputar. */
  setArea(area) {
    const res = this.manager.setArea(area);
    if (this._placed) {
      this._computeRow();
      this._applyRow();
    }
    return res;
  }

  /** Batas bawah HUD/teks soal (px dari tepi atas area), diukur dari tampilan nyata. Deretan selalu di bawahnya. */
  setTopInset(px) {
    const v = Number.isFinite(px) && px > 0 ? px : 0;
    if (Math.abs(v - this._topInset) < 1) return;
    this._topInset = v;
    if (this._placed) {
      this._computeRow();
      this._applyRow();
    }
  }

  // Hitung posisi deretan: rata tengah, baris baru bila tidak muat. Urutan acak dipertahankan selama soal yang sama.
  _computeRow() {
    const area = this.manager.area;
    const bubbles = this.manager.bubbles;
    this._row.clear();
    if (!area || !bubbles.length) return;
    if (!this._rowOrder) this._rowOrder = shuffle(bubbles.map((b) => b.id), this.rng);
    const byId = new Map(bubbles.map((b) => [b.id, b]));
    const order = this._rowOrder.map((id) => byId.get(id)).filter(Boolean);
    const u = Math.min(area.width, area.height) / 100;
    const portrait = area.height > area.width;
    const top = this._topInset > 0
      ? this._topInset + u * this.config.rowBelowHud
      : u * (portrait ? this.config.rowTopPortrait : this.config.rowTopLandscape);
    const maxR = Math.max(...order.map((b) => b.r));
    const gap = maxR * this.config.rowGap;
    const maxWidth = area.width - u * 6;

    const rows = [];
    let row = [];
    let width = 0;
    for (const b of order) {
      const need = 2 * b.r + (row.length ? gap : 0);
      if (row.length && width + need > maxWidth) {
        rows.push(row);
        row = [];
        width = 0;
      }
      width += 2 * b.r + (row.length ? gap : 0);
      row.push(b);
    }
    if (row.length) rows.push(row);

    // Tinggi seluruh deretan, lalu geser ke bawah menurut rowAnchor di ruang antara HUD dan batas bawah (tidak pernah di atas `top`).
    const rowHeights = rows.map((r) => 2 * Math.max(...r.map((b) => b.r)));
    const block = rowHeights.reduce((sum, h) => sum + h, 0) + gap * (rows.length - 1);
    const bottom = area.height - u * this.config.rowBottomU;
    const anchor = Math.min(1, Math.max(0, Number.isFinite(this.config.rowAnchor) ? this.config.rowAnchor : 0));
    let y = top + Math.max(0, bottom - top - block) * anchor;
    for (const r of rows) {
      const rowR = Math.max(...r.map((b) => b.r));
      const total = r.reduce((sum, b) => sum + 2 * b.r, 0) + gap * (r.length - 1);
      let x = (area.width - total) / 2;
      for (const b of r) {
        this._row.set(b.id, { x: x + b.r, y: y + rowR });
        x += 2 * b.r + gap;
      }
      y += 2 * rowR + gap;
    }
  }

  // Pasang posisi deretan ke gelembung (tiap frame, supaya tidak bergeser oleh BubbleManager).
  _applyRow() {
    for (const b of this.manager.bubbles) {
      const p = this._row.get(b.id);
      if (p) {
        b.x = p.x;
        b.y = p.y;
      }
    }
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
    this._rowOrder = null;
    this._computeRow();
    this._applyRow();
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
    this._applyRow();

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
