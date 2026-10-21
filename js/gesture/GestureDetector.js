// js/gesture/GestureDetector.js
// GestureDetector — dari posisi ujung jari (layar) menjadi gestur. Tidak tahu aturan game dan tidak menggambar.
//
// Alur per frame:  detector.update(fingertips, t)   → memperbarui `pairs`, memancarkan 'hand' / 'no-hand'
//                  detector.match(targets, t)       → daftar target yang sedang diapit, memancarkan 'apit'
//
// Apit (blueprint 7): satu target (bola; pusat C, radius r) diapit pasangan ujung jari A dan B bila
//   1. C dekat ruas garis A–B:  jarak(C, AB) ≤ r × centerTolerance   (target ada di antara kedua jari)
//   2. kedua jari menutup:      jarak(A, B)  ≤ r × closeRatio
//   3. keduanya bertahan ≥ holdMs (berbasis waktu, karena FPS tiap perangkat berbeda)
// Pasangan jari bebas (10 pasangan dari 5 ujung jari). Satu target hanya memancarkan 'apit' sekali
// sampai apitan dilepas. Angka dibaca dari `data/settings.json` (kunci `apit`) lewat `setApit()`; DEFAULT_APIT hanya cadangan bila berkas gagal dimuat.

export const DEFAULT_APIT = { centerTolerance: 0.5, closeRatio: 1.7, holdMs: 80 };

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
  /** @param {{ apit?: Partial<typeof DEFAULT_APIT> }} [options] */
  constructor({ apit = {} } = {}) {
    this.apit = { ...DEFAULT_APIT, ...apit };
    this.pairs = [];     // pasangan ujung jari frame terakhir
    this.hasHand = false;
    this._listeners = { hand: [], 'no-hand': [], apit: [] };
    this._since = new Map(); // "target|tangan|pasangan" → waktu mulai memenuhi syarat
    this._fired = new Set(); // kunci yang sudah memancarkan 'apit' dan belum dilepas
  }

  /**
   * Ganti parameter apit saat berjalan. Nilai yang bukan angka valid diabaikan (parameter lama tetap).
   * centerTolerance dan closeRatio harus > 0, holdMs harus ≥ 0.
   * @param {Partial<typeof DEFAULT_APIT>|null|undefined} params
   * @returns {typeof DEFAULT_APIT} parameter yang berlaku sekarang
   */
  setApit(params) {
    const min = { centerTolerance: 1e-6, closeRatio: 1e-6, holdMs: 0 };
    for (const key of Object.keys(min)) {
      const v = params && params[key];
      if (typeof v === 'number' && Number.isFinite(v) && v >= min[key]) this.apit[key] = v;
    }
    this._reset();
    return { ...this.apit };
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
    hands.forEach((tips, hand) => {
      for (let i = 0; i < tips.length; i += 1) {
        for (let j = i + 1; j < tips.length; j += 1) {
          const a = tips[i];
          const b = tips[j];
          pairs.push({
            id: `${a.id}-${b.id}`,
            hand,
            a,
            b,
            mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
            gap: Math.hypot(a.x - b.x, a.y - b.y),
          });
        }
      }
    });
    this.pairs = pairs;

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
    const { centerTolerance, closeRatio, holdMs } = this.apit;
    const seen = new Set();
    const hits = [];

    for (const target of targets) {
      let best = null; // bila beberapa pasangan memenuhi syarat, pakai yang paling dekat ke pusat
      for (const pair of this.pairs) {
        if (pair.gap > target.r * closeRatio) continue;
        const d = distanceToSegment(target, pair.a, pair.b);
        if (d > target.r * centerTolerance) continue;
        if (!best || d < best.d) best = { pair, d };
      }
      if (!best) continue;

      const key = `${target.id}|${best.pair.hand}|${best.pair.id}`;
      seen.add(key);
      if (!this._since.has(key)) this._since.set(key, time);
      if (time - this._since.get(key) < holdMs || this._fired.has(key)) continue;

      this._fired.add(key);
      const hit = { target, pair: best.pair, mid: best.pair.mid, gap: best.pair.gap };
      hits.push(hit);
      this._emit('apit', hit);
    }

    // Yang tidak lagi memenuhi syarat dilupakan, jadi apitan berikutnya dihitung dari awal.
    for (const key of [...this._since.keys()]) if (!seen.has(key)) this._since.delete(key);
    for (const key of [...this._fired]) if (!seen.has(key)) this._fired.delete(key);
    return hits;
  }

  _reset() {
    this._since.clear();
    this._fired.clear();
  }
}
