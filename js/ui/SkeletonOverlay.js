// SkeletonOverlay — menggambar kerangka tangan (21 titik) di canvas overlay.
// Hanya menggambar; posisi layar dihitung LandmarkMapper. Bisa dimatikan.

const CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],          // ibu jari
  [0, 5], [5, 6], [6, 7], [7, 8],          // telunjuk
  [5, 9], [9, 10], [10, 11], [11, 12],     // jari tengah
  [9, 13], [13, 14], [14, 15], [15, 16],   // jari manis
  [13, 17], [17, 18], [18, 19], [19, 20],  // kelingking
  [0, 17],                                  // telapak
];
const INDEX_TIP = 8;
const LINE = '#8EDDCB';
const DOT = '#E9F2EE';
const TIP = '#F2707B';

export class SkeletonOverlay {
  /** @param {HTMLCanvasElement} canvas  @param {import('../tracking/LandmarkMapper.js').LandmarkMapper} mapper */
  constructor(canvas, mapper) {
    this.canvas = canvas;
    this.mapper = mapper;
    this.ctx = canvas.getContext('2d');
    this.enabled = true;
  }

  setEnabled(on) {
    this.enabled = !!on;
    if (!this.enabled) this.clear();
  }

  clear() {
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /** @param {object[]} hands  @param {{width:number,height:number,dpr:number}} viewport */
  draw(hands, viewport) {
    this.clear();
    if (!this.enabled || !viewport || !hands.length) return;
    const ctx = this.ctx;
    ctx.setTransform(viewport.dpr, 0, 0, viewport.dpr, 0, 0);
    const u = Math.min(viewport.width, viewport.height) / 100; // 1% sisi terpendek, sama dengan --u di CSS
    ctx.lineCap = 'round';

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

      pts.forEach((p, i) => {
        ctx.fillStyle = i === INDEX_TIP ? TIP : DOT;
        ctx.beginPath();
        ctx.arc(p.x, p.y, u * (i === INDEX_TIP ? 1.1 : 0.55), 0, Math.PI * 2);
        ctx.fill();
      });
    }
  }
}
