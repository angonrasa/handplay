// js/ui/Effects.js
// Effects — umpan balik saat gelembung dipecahkan (blueprint 13.2: "pecah = cincin yang membesar lalu memudar,
// bukan ledakan"). Hanya menggambar: dua cincin tipis, kilatan lembut di awal, dan selisih skor yang naik pelan.
// Benar = warna aksen; salah = warna "salah" + kilat tepi layar (elemen #flash, animasinya di css/camera.css).
// Tanpa partikel, bintang, atau konfeti.
//
// Dipakai sebagai lapisan SkeletonOverlay (`addLayer`) dan diberi event dari GameEngine (`onEvent`).
// Jam yang dipakai sama dengan loop game: performance.now().

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const NAPAS = '142, 221, 203';   // --napas
const KAPILER = '242, 112, 123'; // --kapiler
const PARU_DALAM = '7, 30, 33';  // --paru-dalam
const DURATION_MS = 700;

const easeOut = (k) => 1 - (1 - Math.min(1, Math.max(0, k))) ** 3;

function ring(ctx, x, y, radius, rgb, alpha, width) {
  if (alpha <= 0.01 || radius <= 0) return;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.strokeStyle = `rgba(${rgb}, ${alpha})`;
  ctx.lineWidth = width;
  ctx.stroke();
}

export class Effects {
  /** @param {{ flashEl?: HTMLElement|null }} [options] */
  constructor({ flashEl = null } = {}) {
    this.flashEl = flashEl;
    this.items = [];
  }

  /** Terima event GameEngine.onEvent. Hanya 'correct' dan 'wrong' yang membawa gelembung. */
  handle(event) {
    if (!event || (event.type !== 'correct' && event.type !== 'wrong')) return;
    const b = event.bubble;
    if (!b || !Number.isFinite(b.x) || !Number.isFinite(b.y) || !(b.r > 0)) return;
    const correct = event.type === 'correct';
    const delta = event.outcome && Number.isFinite(event.outcome.delta) ? event.outcome.delta : 0;
    this.items.push({ x: b.x, y: b.y, r: b.r, correct, delta, t0: performance.now() });
    if (!correct) this._flash('wrong');
  }

  /** Ronde baru: lupakan sisa efek. */
  clear() {
    this.items.length = 0;
  }

  _flash(kind) {
    const el = this.flashEl;
    if (!el) return;
    el.dataset.kind = ''; // mulai ulang animasi bila kilat sebelumnya belum selesai
    void el.offsetWidth;
    el.dataset.kind = kind;
  }

  /** Lapisan gambar: (ctx, viewport, waktu ms). */
  draw(ctx, viewport, time) {
    if (!this.items.length || !viewport) return;
    this.items = this.items.filter((it) => time - it.t0 < DURATION_MS);
    const u = Math.min(viewport.width, viewport.height) / 100;

    for (const it of this.items) {
      const k = Math.max(0, (time - it.t0) / DURATION_MS);
      const rgb = it.correct ? NAPAS : KAPILER;

      // Kilatan lembut di awal: gelembung "menghembuskan napas"
      if (k < 0.3) {
        ctx.beginPath();
        ctx.arc(it.x, it.y, it.r * (1 + 0.15 * easeOut(k / 0.3)), 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${rgb}, ${0.2 * (1 - k / 0.3)})`;
        ctx.fill();
      }

      // Cincin utama membesar dan memudar; cincin kedua menyusul sedikit di belakang
      ring(ctx, it.x, it.y, it.r * (1 + 0.8 * easeOut(k)), rgb, 0.9 * (1 - k), Math.max(1.5, it.r * 0.07 * (1 - k)));
      const k2 = (k - 0.12) / 0.88;
      if (k2 > 0) ring(ctx, it.x, it.y, it.r * (0.92 + 0.5 * easeOut(k2)), rgb, 0.5 * (1 - k2), Math.max(1, it.r * 0.04 * (1 - k2)));

      // Selisih skor naik pelan lalu memudar (salah di skor 0 = selisih 0 = tidak ditulis)
      if (it.delta !== 0) {
        const text = it.delta > 0 ? `+${it.delta}` : `\u2212${Math.abs(it.delta)}`;
        const alpha = k < 0.55 ? 1 : 1 - (k - 0.55) / 0.45;
        const size = Math.max(u * 4.2, it.r * 0.52);
        ctx.font = `700 ${size}px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round';
        const y = it.y - easeOut(k) * u * 5;
        ctx.globalAlpha = Math.max(0, alpha);
        ctx.lineWidth = Math.max(2, size * 0.2);
        ctx.strokeStyle = `rgba(${PARU_DALAM}, 0.7)`;
        ctx.strokeText(text, it.x, y);
        ctx.fillStyle = `rgb(${rgb})`;
        ctx.fillText(text, it.x, y);
        ctx.globalAlpha = 1;
      }
    }
  }
}
