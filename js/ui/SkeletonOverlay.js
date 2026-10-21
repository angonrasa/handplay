// js/ui/SkeletonOverlay.js
// SkeletonOverlay — menggambar di canvas overlay: kerangka tangan (21 titik) dan penanda lima ujung jari.
// Hanya menggambar; posisi layar dihitung LandmarkMapper. Kerangka bisa dimatikan; penanda ujung jari
// tetap tampil karena itulah yang dipakai pemain untuk mengapit bola.
//
// Tangan hilang (M3.6): gambar terakhir ditahan `holdMs`, lalu memudar selama `fadeMs`. Satu frame
// deteksi yang terlewat (±200 ms di 5–6 FPS) tidak membuat penanda berkedip. Pemudaran berjalan lewat
// requestAnimationFrame sendiri, jadi tetap halus walau deteksi lambat.
//
// Lapisan tambahan (`addLayer`): fungsi `(ctx, viewport, waktu)` yang digambar di atas hasil ini pada setiap
// penggambaran ulang, termasuk saat memudar, supaya tidak terhapus (dipakai js/debug/ApitTest.js).

const CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],          // ibu jari
  [0, 5], [5, 6], [6, 7], [7, 8],          // telunjuk
  [5, 9], [9, 10], [10, 11], [11, 12],     // jari tengah
  [9, 13], [13, 14], [14, 15], [15, 16],   // jari manis
  [13, 17], [17, 18], [18, 19], [19, 20],  // kelingking
  [0, 17],                                  // telapak
];
const LINE = '#8EDDCB';                    // --napas
const DOT = '#E9F2EE';                     // --embun
const MARK_BACK = 'rgba(12, 43, 46, 0.45)'; // --paru, pelindung kontras di atas video terang
const MARK_FILL = 'rgba(233, 242, 238, 0.14)';
const MARK_HALO = 'rgba(142, 221, 203, 0.32)'; // --napas, tipis

const defaultNow = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export class SkeletonOverlay {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {import('../tracking/LandmarkMapper.js').LandmarkMapper} mapper
   * @param {{ holdMs?: number, fadeMs?: number, now?: () => number, requestFrame?: (cb: () => void) => number, cancelFrame?: (id: number) => void }} [options]
   */
  constructor(canvas, mapper, { holdMs = 200, fadeMs = 250, now = defaultNow, requestFrame, cancelFrame } = {}) {
    this.canvas = canvas;
    this.mapper = mapper;
    this.ctx = canvas.getContext('2d');
    this.enabled = true;
    this.holdMs = holdMs;
    this.fadeMs = fadeMs;
    this._now = now;
    this._request = requestFrame || (typeof requestAnimationFrame === 'function' ? (cb) => requestAnimationFrame(cb) : null);
    this._cancel = cancelFrame || (typeof cancelAnimationFrame === 'function' ? (id) => cancelAnimationFrame(id) : () => {});
    this._layers = [];
    this._last = null;   // { hands, fingertips } terakhir yang terlihat
    this._lostAt = null; // waktu tangan mulai hilang
    this._vp = null;
    this._raf = 0;
    this._tick = this._tick.bind(this);
  }

  /** Tambah lapisan gambar di atas overlay: fn(ctx, viewport, waktu). */
  addLayer(fn) {
    this._layers.push(fn);
  }

  /** Hanya kerangka; penanda ujung jari tidak ikut dimatikan. */
  setEnabled(on) {
    this.enabled = !!on;
    if (!this.enabled) this.clear(); // frame berikutnya menggambar ulang penanda
  }

  clear() {
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /** Hapus layar dan lupakan gambar terakhir (tanpa pemudaran). Dipakai saat tracking berhenti. */
  reset() {
    this._stopTick();
    this._last = null;
    this._lostAt = null;
    this.clear();
  }

  /**
   * @param {object[]} hands  keluaran HandTracker (kosong = tangan hilang)
   * @param {{width:number,height:number,dpr:number}} viewport
   * @param {{x:number,y:number}[][]} [fingertips]  `input.fingertips` (sudah dihaluskan, koordinat layar), satu daftar per tangan
   * @param {number} [time]  ms, bawaan performance.now()
   */
  draw(hands, viewport, fingertips = [], time = this._now()) {
    this.clear();
    if (!viewport) return;
    this._vp = viewport;
    this.ctx.setTransform(viewport.dpr, 0, 0, viewport.dpr, 0, 0);
    if (hands.length) {
      this._stopTick();
      this._lostAt = null;
      this._last = { hands, fingertips };
      this._paint(hands, fingertips, 1);
    } else if (this._last) {
      if (this._lostAt === null) this._lostAt = time;
      this._paintLost(time);
      if (this._last) this._startTick();
    }
    this._runLayers(time);
  }

  /**
   * Gambar ulang frame terakhir (kerangka, penanda, lapisan) TANPA data deteksi baru. Untuk loop yang berjalan
   * lebih cepat dari deteksi (mis. gelembung bergerak halus walau tangan hanya terdeteksi 5–6 kali per detik).
   * @param {{width:number,height:number,dpr:number}} [viewport]  bawaan: viewport terakhir
   * @param {number} [time]  ms
   */
  redraw(viewport = this._vp, time = this._now()) {
    if (!viewport) return;
    this._vp = viewport;
    this.clear();
    this.ctx.setTransform(viewport.dpr, 0, 0, viewport.dpr, 0, 0);
    if (this._last) {
      if (this._lostAt === null) this._paint(this._last.hands, this._last.fingertips, 1);
      else this._paintLost(time);
    }
    this._runLayers(time);
  }

  // Gambar terakhir ditahan, lalu memudar; setelah itu dilupakan.
  _paintLost(time) {
    const age = time - this._lostAt;
    if (age >= this.holdMs + this.fadeMs) {
      this._last = null;
      this._lostAt = null;
      return;
    }
    const alpha = age <= this.holdMs ? 1 : 1 - (age - this.holdMs) / this.fadeMs;
    this._paint(this._last.hands, this._last.fingertips, alpha);
  }

  _startTick() {
    if (this._raf || !this._request) return;
    this._raf = this._request(this._tick);
  }

  _stopTick() {
    if (this._raf) this._cancel(this._raf);
    this._raf = 0;
  }

  _tick() {
    this._raf = 0;
    if (!this._last || this._lostAt === null || !this._vp) return;
    const time = this._now();
    this.clear();
    this.ctx.setTransform(this._vp.dpr, 0, 0, this._vp.dpr, 0, 0);
    this._paintLost(time);
    this._runLayers(time);
    if (this._last) this._startTick();
  }

  _runLayers(time) {
    this.ctx.globalAlpha = 1;
    for (const fn of this._layers) fn(this.ctx, this._vp, time);
  }

  _paint(hands, fingertips, alpha) {
    const u = Math.min(this._vp.width, this._vp.height) / 100; // 1% sisi terpendek, sama dengan --u di CSS
    const ctx = this.ctx;
    ctx.globalAlpha = alpha;
    ctx.lineCap = 'round';
    if (this.enabled) this._drawSkeleton(hands, u);
    this._drawFingertips(fingertips, u);
    ctx.globalAlpha = 1;
  }

  _drawSkeleton(hands, u) {
    const ctx = this.ctx;
    for (const hand of hands) {
      const pts = hand.landmarks.map((p) => this.mapper.toScreen(p));
      if (pts.some((p) => !p)) continue;

      ctx.strokeStyle = LINE;
      ctx.lineWidth = u * 0.5;
      ctx.beginPath();
      for (const [a, b] of CONNECTIONS) {
        ctx.moveTo(pts[a].x, pts[a].y);
        ctx.lineTo(pts[b].x, pts[b].y);
      }
      ctx.stroke();

      ctx.fillStyle = DOT;
      for (const p of pts) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, u * 0.55, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // Lima cincin tipis setara (jari mana pun boleh dipakai mengapit). Ukuran relatif ke sisi terpendek layar.
  // Cincin = area sentuh; titik kecil di tengah = titik yang sebenarnya dihitung; halo tipis menjaga terlihat di latar terang.
  _drawFingertips(fingertips, u) {
    const ctx = this.ctx;
    const r = u * 2.6;
    for (const tips of fingertips) {
      for (const p of tips) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fillStyle = MARK_FILL;
        ctx.fill();
        ctx.strokeStyle = MARK_BACK;
        ctx.lineWidth = u * 0.9;
        ctx.stroke();
        ctx.strokeStyle = DOT;
        ctx.lineWidth = u * 0.45;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(p.x, p.y, r * 1.5, 0, Math.PI * 2);
        ctx.strokeStyle = MARK_HALO;
        ctx.lineWidth = u * 0.3;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(p.x, p.y, u * 0.55, 0, Math.PI * 2);
        ctx.fillStyle = DOT;
        ctx.fill();
      }
    }
  }
}
