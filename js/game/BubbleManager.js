// js/game/BubbleManager.js
// BubbleManager — penempatan dan siklus hidup gelembung. Murni logika: tidak menggambar, tidak tahu
// MediaPipe, kamera, atau aturan soal (mode yang memutuskan teks dan jenis gelembung).
//
// Gelembung DIAM di tempat (tidak lagi naik/bergeser). Semua pilihan ditempatkan sekaligus lewat `place(specs)`
// pada grid yang rapi di bawah area HUD; tiap gelembung hanya hanyut sangat pelan di sekitar titiknya
// ("goo"). Bentuk blob yang bergoyang digambar BubbleRenderer; lingkaran apit (x, y, r) tetap lingkaran biasa.
//
// Ukuran relatif ke sisi terpendek layar (1u = 1% sisi terpendek), bukan piksel tetap, jadi sama baiknya di HP dan TV.
// Radius mengecil otomatis bila area sempit atau pilihan banyak. Satuan waktu: `update(dt)` memakai DETIK.
// Koordinat: piksel layar (sama dengan `layout.viewport`).

export const BUBBLE = Object.freeze({
  radiusU: 9,              // radius dasar = 9u (sama dengan lingkaran uji ?apittest)
  minRadiusU: 6,           // di bawah ini dianggap tidak muat; kapasitas dikurangi
  driftU: 0.9,             // hanyut maksimum dari titik tempat (u), dikali `wobble`
  driftHz: 0.18,           // kecepatan hanyut (putaran per detik)
  gapRatio: 0.12,          // jarak aman antar gelembung (× radius)
  jitter: 0.3,             // geser acak titik tempat (0 = grid persis, 1 = sepenuh ruang sisa)
  edgeMarginU: 3,          // jarak minimum ke tepi layar (u)
  topInsetPortraitU: 24,   // ruang HUD di atas (portrait: soal turun ke baris kedua)
  topInsetLandscapeU: 18,  // ruang HUD di atas (landscape)
  maxCount: 8,
  maxDt: 0.1,              // dt lebih besar (tab tertidur, patah-patah) dipotong
});

// Teks dalam gelembung: semua ukuran dalam satuan radius (r), jadi tata letak tidak berubah saat layar berubah ukuran.
export const TEXT = Object.freeze({
  maxFont: 0.42,                                  // font maksimum = 0,42 r
  charEm: 0.58,                                   // lebar rata-rata satu huruf (em), sedikit longgar
  lineHeight: 1.15,
  widthR: Object.freeze({ 1: 1.6, 2: 1.5, 3: 1.3 }), // lebar aman per jumlah baris (× r)
  heightR: 1.5,                                   // tinggi aman seluruh teks (× r)
});

/** Semua cara membagi `words` menjadi n baris berurutan; kembalikan yang baris terpanjangnya paling pendek. */
function splitBalanced(words, n) {
  const len = (a, b) => words.slice(a, b).join(' ').length;
  let best = null;
  const walk = (start, left, cuts) => {
    if (left === 1) {
      const bounds = [0, ...cuts, words.length];
      const lines = [];
      for (let i = 0; i < bounds.length - 1; i += 1) lines.push(words.slice(bounds[i], bounds[i + 1]).join(' '));
      const longest = Math.max(...lines.map((l) => l.length));
      if (!best || longest < best.longest) best = { lines, longest };
      return;
    }
    for (let cut = start + 1; cut <= words.length - (left - 1); cut += 1) walk(cut, left - 1, [...cuts, cut]);
  };
  if (n <= 1) return { lines: [words.join(' ')], longest: len(0, words.length) };
  walk(0, n, []);
  return best;
}

/**
 * Pecah teks menjadi 1–3 baris dan pilih yang memberi font terbesar yang masih muat di lingkaran.
 * Hasilnya bebas ukuran: `fontScale` adalah font dibagi radius (0,42 = 42% radius).
 * @returns {{ lines: string[], fontScale: number }}
 */
export function fitText(text) {
  const words = String(text).trim().split(/\s+/).filter(Boolean);
  if (!words.length) return { lines: [''], fontScale: TEXT.maxFont };
  let best = null;
  for (let n = 1; n <= Math.min(3, words.length); n += 1) {
    const { lines, longest } = splitBalanced(words, n);
    const fontScale = Math.min(
      TEXT.maxFont,
      TEXT.widthR[n] / (longest * TEXT.charEm),
      TEXT.heightR / (n * TEXT.lineHeight),
    );
    if (!best || fontScale > best.fontScale + 1e-9) best = { lines, fontScale };
  }
  return best;
}

function shuffled(list, rng) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export class BubbleManager {
  /**
   * @param {{ rng?: () => number, wobble?: number, sizeScale?: number }} [options]
   *  rng: pengacak (bisa diganti agar hasil uji tetap); wobble: pengali goyang/hanyut (0 = diam total, data/games.json `wobble`);
   *  sizeScale: pengali ukuran (opsi "Ukuran besar" untuk TV, M5.10).
   */
  constructor({ rng = Math.random, wobble = 1, sizeScale = 1 } = {}) {
    this.rng = rng;
    this.wobble = 1;
    this.sizeScale = Number.isFinite(sizeScale) && sizeScale > 0 ? sizeScale : 1;
    this.setWobble(wobble);
    this.area = null;   // { width, height, u, orientation }
    this.bubbles = [];
    this._nextId = 1;   // id tidak pernah dipakai ulang, supaya state GestureDetector per target tidak bentrok
    this._layout = null;
    this._count = 0;    // jumlah gelembung pada penempatan terakhir (titik tempat tetap walau ada yang pecah)
  }

  setWobble(wobble) {
    if (!Number.isFinite(wobble) || wobble < 0) throw new RangeError(`BubbleManager: wobble harus ≥ 0 (diterima: ${wobble})`);
    this.wobble = wobble;
    if (this.area && this._count) this._relayout();
  }

  /** 'portrait' | 'landscape' | null (belum ada area). */
  get orientation() {
    return this.area ? this.area.orientation : null;
  }

  /** Jumlah gelembung terbanyak yang masih muat pada radius minimum untuk area dan ukuran saat ini. */
  get capacity() {
    if (!this.area) return 0;
    for (let n = BUBBLE.maxCount; n > 1; n -= 1) {
      const fit = this._fit(n);
      if (fit && fit.ok) return n;
    }
    return 1;
  }

  /**
   * Beri tahu ukuran area tampilan (`layout.viewport`). Panggil saat ukuran berubah.
   * Ukuran sama = tidak berbuat apa-apa. Berubah: seluruh gelembung ditata ulang ke grid area baru
   * (orientasi berganti di tengah permainan: permainan sebaiknya dijeda dulu, M4.3c).
   * @returns {{ changed: boolean, orientationChanged: boolean }}
   */
  setArea({ width, height }) {
    if (!(width > 0) || !(height > 0)) throw new RangeError(`BubbleManager.setArea: ukuran harus > 0 (diterima: ${width}×${height})`);
    const prev = this.area;
    if (prev && prev.width === width && prev.height === height) return { changed: false, orientationChanged: false };
    this.area = { width, height, u: Math.min(width, height) / 100, orientation: width >= height ? 'landscape' : 'portrait' };
    if (!prev) return { changed: true, orientationChanged: false };
    this._relayout();
    return { changed: true, orientationChanged: prev.orientation !== this.area.orientation };
  }

  // Grid terbaik untuk n gelembung: pilih jumlah kolom yang memberi radius terbesar.
  _fit(n) {
    const { width, height, u, orientation } = this.area;
    const margin = BUBBLE.edgeMarginU * u;
    const top = (orientation === 'portrait' ? BUBBLE.topInsetPortraitU : BUBBLE.topInsetLandscapeU) * u;
    const uw = width - 2 * margin;
    const uh = height - top - margin;
    if (uw <= 0 || uh <= 0) return null;
    const pad = BUBBLE.driftU * u * this.wobble;
    const rBase = BUBBLE.radiusU * this.sizeScale * u;
    let best = null;
    for (let cols = 1; cols <= n; cols += 1) {
      const rows = Math.ceil(n / cols);
      const cw = uw / cols;
      const ch = uh / rows;
      const r = Math.max(1, Math.min(rBase, (Math.min(cw, ch) / 2 - pad) / (1 + BUBBLE.gapRatio)));
      if (!best || r > best.r + 1e-9) best = { cols, rows, cw, ch, r, pad, n, x0: margin, y0: top };
    }
    best.ok = best.r >= BUBBLE.minRadiusU * u;
    return best;
  }

  _slotCenter(L, slot) {
    const row = Math.floor(slot / L.cols);
    const col = slot % L.cols;
    const inRow = Math.min(L.cols, L.n - row * L.cols);
    const offset = ((L.cols - inRow) * L.cw) / 2; // baris terakhir yang pendek dipusatkan
    return { x: L.x0 + offset + (col + 0.5) * L.cw, y: L.y0 + (row + 0.5) * L.ch };
  }

  /** Hitung x, y, r dari titik tempat + hanyut pelan. */
  _place(b) {
    const L = this._layout;
    const { u } = this.area;
    b.r = L.r;
    b.rU = L.r / u;
    const c = this._slotCenter(L, b._slot);
    const room = Math.max(0, Math.min(L.cw, L.ch) / 2 - L.r * (1 + BUBBLE.gapRatio) - L.pad);
    const w = 2 * Math.PI * BUBBLE.driftHz;
    b.x = c.x + b._jx * room * BUBBLE.jitter + L.pad * Math.sin(b.phase + b.age * w);
    b.y = c.y + b._jy * room * BUBBLE.jitter + L.pad * Math.cos(b.phase * 1.3 + b.age * w * 0.8);
  }

  _relayout() {
    if (!this.area || !this._count) return;
    this._layout = this._fit(this._count);
    for (const b of this.bubbles) this._place(b);
  }

  /**
   * Tempatkan semua gelembung sekaligus (gelembung lama dihapus). Posisi tiap pilihan diacak di antara titik grid.
   * Bila `specs` lebih banyak dari `capacity`, yang di belakang dibuang: taruh jawaban penting di depan.
   * @param {{ text: string, kind?: string }[]} specs  `kind` dipakai mode (mis. 'correct' / 'distractor'); tidak mempengaruhi tampilan
   * @returns {object[]}  gelembung yang ditempatkan (kosong bila belum ada area)
   */
  place(specs) {
    this.clear();
    if (!this.area || !Array.isArray(specs) || !specs.length) return [];
    const n = Math.min(specs.length, this.capacity);
    this._layout = this._fit(n);
    this._count = n;
    const slots = shuffled([...Array(n).keys()], this.rng);
    specs.slice(0, n).forEach((spec, i) => {
      const { text, kind = 'distractor' } = spec || {};
      if (typeof text !== 'string' || !text.trim()) throw new TypeError('BubbleManager.place: "text" harus teks tidak kosong');
      const { lines, fontScale } = fitText(text);
      const bubble = {
        id: `b${this._nextId++}`,
        text: text.trim(),
        kind,
        x: 0,
        y: 0,
        r: 0,
        rU: 0,
        lines,
        fontScale,
        wobble: this.wobble,   // dibaca BubbleRenderer untuk kekuatan goyang bentuk
        phase: this.rng() * 2 * Math.PI,
        age: 0,
        _slot: slots[i],
        _jx: this.rng() * 2 - 1,
        _jy: this.rng() * 2 - 1,
      };
      this._place(bubble);
      this.bubbles.push(bubble);
    });
    return this.bubbles.slice();
  }

  /**
   * Majukan waktu gelembung (hanyut pelan + animasi muncul). Tidak ada gelembung yang bergerak keluar layar.
   * @param {number} dt  detik
   */
  update(dt) {
    if (!this.area || !this._layout) return;
    const step = Number.isFinite(dt) ? Math.min(BUBBLE.maxDt, Math.max(0, dt)) : 0;
    for (const b of this.bubbles) {
      b.age += step;
      this._place(b);
    }
  }

  /** Hapus satu gelembung (mis. karena pecah). Mengembalikan gelembungnya, atau null bila tidak ada. */
  remove(id) {
    const i = this.bubbles.findIndex((b) => b.id === id);
    return i < 0 ? null : this.bubbles.splice(i, 1)[0];
  }

  clear() {
    this.bubbles = [];
    this._layout = null;
    this._count = 0;
  }
}
