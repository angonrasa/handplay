// js/ui/SkeletonOverlay.js
// SkeletonOverlay — menggambar di canvas overlay: kerangka tangan (21 titik) dan penanda lima ujung jari.
// Hanya menggambar; posisi layar dihitung LandmarkMapper. Kerangka bisa dimatikan; penanda ujung jari
// tetap tampil karena itulah yang dipakai pemain untuk mengapit bola.

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

export class SkeletonOverlay {
  /** @param {HTMLCanvasElement} canvas  @param {import('../tracking/LandmarkMapper.js').LandmarkMapper} mapper */
  constructor(canvas, mapper) {
    this.canvas = canvas;
    this.mapper = mapper;
    this.ctx = canvas.getContext('2d');
    this.enabled = true;
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

  /**
   * @param {object[]} hands  keluaran HandTracker
   * @param {{width:number,height:number,dpr:number}} viewport
   * @param {{x:number,y:number}[][]} [fingertips]  `input.fingertips` (sudah dihaluskan, koordinat layar), satu daftar per tangan
   */
  draw(hands, viewport, fingertips = []) {
    this.clear();
    if (!viewport) return;
    const ctx = this.ctx;
    ctx.setTransform(viewport.dpr, 0, 0, viewport.dpr, 0, 0);
    const u = Math.min(viewport.width, viewport.height) / 100; // 1% sisi terpendek, sama dengan --u di CSS
    ctx.lineCap = 'round';
    if (this.enabled) this._drawSkeleton(hands, u);
    this._drawFingertips(fingertips, u);
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
      }
    }
  }
}
