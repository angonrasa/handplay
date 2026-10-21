// js/gesture/GestureDetector.js
// GestureDetector — dari posisi ujung jari (layar) menjadi gestur. Tidak tahu aturan game dan tidak menggambar.
//
// Alur per frame:  detector.update(fingertips, t)   → memperbarui `pairs`, memancarkan 'hand' / 'no-hand'
//                  detector.match(targets, t)       → daftar target yang sedang diapit, memancarkan 'apit'
//
// Dua cara memecahkan target (`input.mode`, data/settings.json):
//   'tusuk' (bawaan) : ujung jari MANA PUN menyentuh target (jarak pusat ≤ r × touchRadius) dan bertahan ≥ touchHoldMs.
//   'apit'           : lihat di bawah. Lebih ketat, tapi sulit dilakukan di depan kamera.
// `match()` memilih cara sesuai mode dan hasilnya sama bentuknya, jadi Collision, GameEngine, dan mode game tidak berubah.
// Event yang dipancarkan tetap bernama 'apit' (kontrak lama), baik untuk apit maupun tusuk.
//
// Apit (blueprint 7): satu target (bola; pusat C, radius r) diapit pasangan ujung jari A dan B bila
//   1. C dekat ruas garis A–B:  jarak(C, AB) ≤ r × centerTolerance   (target ada di antara kedua jari)
//   2. kedua jari MENUTUP, diukur terhadap ukuran tangan: jarak(A, B) ≤ ukuranTangan × pinchRatio
//      (ukuran tangan = pergelangan → pangkal jari tengah, dari LandmarkMapper). Tanpa ukuran tangan (data uji): jarak(A, B) ≤ r × closeRatio.
//      Ukuran gelembung TIDAK dipakai untuk menilai "menutup": gelembung besar membuat tangan terbuka yang sekadar lewat dianggap apit.
//   3. salah satu jari adalah ibu jari (`thumbOnly`, bawaan nyala): dua jari bersebelahan hampir selalu berdekatan, itu bukan apit
//   4. bertahan ≥ holdMs DAN terlihat di ≥ minFrames hasil deteksi berurutan. Syarat kedua penting di TV lemah: deteksi hanya 5–6 kali per
//      detik, jadi satu hasil deteksi yang meleset tetap "berlaku" lebih lama dari holdMs; tanpa minFrames, satu frame meleset saja sudah memecahkan gelembung.
// Pasangan jari bebas selama memenuhi (3) (4 pasangan: ibu jari + telunjuk/tengah/manis/kelingking). Satu target hanya memancarkan 'apit' sekali
// sampai apitan dilepas. Angka dibaca dari `data/settings.json` (kunci `apit`) lewat `setApit()`; DEFAULT_APIT hanya cadangan bila berkas gagal dimuat.

export const DEFAULT_APIT = { centerTolerance: 0.7, closeRatio: 1.7, holdMs: 80, pinchRatio: 0.4, minFrames: 2, thumbOnly: true };
export const DEFAULT_INPUT = { mode: 'tusuk', touchRadius: 1, touchHoldMs: 60 };

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** Jarak titik P ke ruas garis AB. */
export function distanceToSegment(p, a, b) {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const len2 = abx * abx + aby * aby;
  let t = len2 === 0 ? 0 : ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * abx), p.y - (a.y + t * aby));
}

export class GestureDetector {
  /** @param {{ apit?: Partial<typeof DEFAULT_APIT>, input?: Partial<typeof DEFAULT_INPUT> }} [options] */
  constructor({ apit = {}, input = {} } = {}) {
    this.apit = { ...DEFAULT_APIT, ...apit };
    this.input = { ...DEFAULT_INPUT, ...input };
    this.tips = [];      // semua ujung jari frame terakhir: { id, x, y, hand }
    this.pairs = [];     // pasangan ujung jari frame terakhir
    this.hasHand = false;
    this._listeners = { hand: [], 'no-hand': [], apit: [] };
    this._since = new Map(); // "target|tangan" → waktu mulai memenuhi syarat
    this._fired = new Set(); // kunci yang sudah memancarkan 'apit' dan belum dilepas
    this._frames = new Map(); // "target|tangan" → { n: hasil deteksi berurutan yang memenuhi syarat, last: nomor deteksi terakhir yang dihitung }
    this._frame = 0;         // nomor hasil deteksi (naik tiap update())
  }

  /**
   * Ganti parameter apit saat berjalan. Nilai yang bukan angka valid diabaikan (parameter lama tetap).
   * centerTolerance, closeRatio, pinchRatio harus > 0, holdMs harus ≥ 0, minFrames ≥ 1 (dibulatkan), thumbOnly boolean.
   * @param {Partial<typeof DEFAULT_APIT>|null|undefined} params
   * @returns {typeof DEFAULT_APIT} parameter yang berlaku sekarang
   */
  setApit(params) {
    const min = { centerTolerance: 1e-6, closeRatio: 1e-6, holdMs: 0, pinchRatio: 1e-6, minFrames: 1 };
    for (const key of Object.keys(min)) {
      const v = params && params[key];
      if (typeof v === 'number' && Number.isFinite(v) && v >= min[key]) this.apit[key] = key === 'minFrames' ? Math.round(v) : v;
    }
    if (params && typeof params.thumbOnly === 'boolean') this.apit.thumbOnly = params.thumbOnly;
    this._reset();
    return { ...this.apit };
  }

  /**
   * Ganti cara input saat berjalan. mode: 'tusuk' | 'apit'; touchRadius > 0 (× radius target); touchHoldMs ≥ 0.
   * Nilai tidak valid diabaikan. @returns {typeof DEFAULT_INPUT} parameter yang berlaku sekarang
   */
  setInput(params) {
    const p = params || {};
    if (p.mode === 'tusuk' || p.mode === 'apit') this.input.mode = p.mode;
    if (typeof p.touchRadius === 'number' && Number.isFinite(p.touchRadius) && p.touchRadius > 0) this.input.touchRadius = p.touchRadius;
    if (typeof p.touchHoldMs === 'number' && Number.isFinite(p.touchHoldMs) && p.touchHoldMs >= 0) this.input.touchHoldMs = p.touchHoldMs;
    this._reset();
    return { ...this.input };
  }

  /** @param {'hand'|'no-hand'|'apit'} type  @param {(payload?: object) => void} fn  @returns {() => void} fungsi untuk berhenti mendengar */
  on(type, fn) {
    const list = this._listeners[type];
    if (!list) throw new Error(`GestureDetector: event tidak dikenal "${type}"`);
    list.push(fn);
    return () => {
      const i = list.indexOf(fn);
      if (i >= 0) list.splice(i, 1);
    };
  }

  _emit(type, payload) {
    for (const fn of this._listeners[type].slice()) fn(payload);
  }

  /**
   * @param {{id:string,x:number,y:number}[][]} fingertips  `input.fingertips`: satu daftar 5 ujung jari per tangan
   * @param {number} [time]  ms
   */
  update(fingertips, time = now()) {
    const hands = fingertips || [];
    const pairs = [];
    this._frame += 1;
    hands.forEach((tips, hand) => {
      const span = Number.isFinite(tips.span) && tips.span > 0 ? tips.span : 0; // ukuran tangan di layar (px); 0 = tidak diketahui
      for (let i = 0; i < tips.length; i += 1) {
        for (let j = i + 1; j < tips.length; j += 1) {
          const a = tips[i];
          const b = tips[j];
          const gap = Math.hypot(a.x - b.x, a.y - b.y);
          pairs.push({
            id: `${a.id}-${b.id}`,
            hand,
            a,
            b,
            mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
            gap,
            span,
            ratio: span ? gap / span : null, // jarak dua jari ÷ ukuran tangan (≈ 0 = bertemu, ≈ 1 = tangan terbuka lebar)
            thumb: a.id === 'thumb' || b.id === 'thumb',
          });
        }
      }
    });
    this.pairs = pairs;
    this.tips = hands.flatMap((tips, hand) => tips.map((tip) => ({ ...tip, hand })));

    const has = pairs.length > 0;
    if (has !== this.hasHand) {
      this.hasHand = has;
      if (!has) this._reset();
      this._emit(has ? 'hand' : 'no-hand', { time });
    }
  }

  /**
   * Cocokkan pasangan jari dengan target.
   * @param {{id:string|number,x:number,y:number,r:number}[]} targets  lingkaran dalam koordinat layar (mis. bola)
   * @param {number} [time]  ms
   * @returns {{ target: object, pair: object, mid: {x:number,y:number}, gap: number }[]}  target yang BARU saja dianggap diapit pada frame ini
   */
  match(targets, time = now()) {
    if (this.input.mode === 'tusuk') return this._matchTouch(targets, time);
    const { centerTolerance, closeRatio, holdMs, pinchRatio, minFrames, thumbOnly } = this.apit;
    const seen = new Set();
    const hits = [];

    for (const target of targets) {
      let best = null; // bila beberapa pasangan memenuhi syarat, pakai yang paling dekat ke pusat
      for (const pair of this.pairs) {
        if (thumbOnly && !pair.thumb) continue;
        if (pair.span) {
          if (pair.gap > pair.span * pinchRatio) continue; // belum menutup (ukuran tangan sebagai pembanding)
        } else if (pair.gap > target.r * closeRatio) {
          continue; // ukuran tangan tidak diketahui: cadangan lama
        }
        const d = distanceToSegment(target, pair.a, pair.b);
        if (d > target.r * centerTolerance) continue;
        if (!best || d < best.d) best = { pair, d };
      }
      if (!best) continue;

      // Kunci per target + tangan (bukan per pasangan jari): berganti pasangan saat masih menempel tidak mengulang hitungan.
      const key = `${target.id}|${best.pair.hand}`;
      seen.add(key);
      if (!this._since.has(key)) this._since.set(key, time);
      const f = this._frames.get(key) || { n: 0, last: -1 };
      if (f.last !== this._frame) {
        f.n += 1; // satu hasil deteksi baru yang masih memenuhi syarat
        f.last = this._frame;
      }
      this._frames.set(key, f);
      if (time - this._since.get(key) < holdMs || f.n < minFrames || this._fired.has(key)) continue;

      this._fired.add(key);
      const hit = { target, pair: best.pair, mid: best.pair.mid, gap: best.pair.gap };
      hits.push(hit);
      this._emit('apit', hit);
    }

    // Yang tidak lagi memenuhi syarat dilupakan, jadi apitan berikutnya dihitung dari awal.
    for (const key of [...this._since.keys()]) if (!seen.has(key)) this._since.delete(key);
    for (const key of [...this._frames.keys()]) if (!seen.has(key)) this._frames.delete(key);
    for (const key of [...this._fired]) if (!seen.has(key)) this._fired.delete(key);
    return hits;
  }

  // Tusuk: ujung jari mana pun di dalam lingkaran target. Hasil seperti apit (`pair` null, `mid` = ujung jarinya, `gap` 0).
  // Kuncinya per target + tangan (bukan per jari), jadi pindah jari saat masih menempel tidak mengulang hitungan tahan.
  _matchTouch(targets, time) {
    const { touchRadius, touchHoldMs } = this.input;
    const seen = new Set();
    const hits = [];
    for (const target of targets) {
      let best = null;
      for (const tip of this.tips) {
        const d = Math.hypot(tip.x - target.x, tip.y - target.y);
        if (d > target.r * touchRadius) continue;
        if (!best || d < best.d) best = { tip, d };
      }
      if (!best) continue;
      const key = `${target.id}|${best.tip.hand}`;
      seen.add(key);
      if (!this._since.has(key)) this._since.set(key, time);
      if (time - this._since.get(key) < touchHoldMs || this._fired.has(key)) continue;
      this._fired.add(key);
      const hit = { target, pair: null, tip: best.tip, mid: { x: best.tip.x, y: best.tip.y }, gap: 0 };
      hits.push(hit);
      this._emit('apit', hit);
    }
    for (const key of [...this._since.keys()]) if (!seen.has(key)) this._since.delete(key);
    for (const key of [...this._fired]) if (!seen.has(key)) this._fired.delete(key);
    return hits;
  }

  _reset() {
    this._since.clear();
    this._fired.clear();
    this._frames.clear();
  }
}
