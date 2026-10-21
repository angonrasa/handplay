// js/debug/ApitTest.js
// Alat uji apit untuk perangkat (M3.5b). Aktif hanya dengan ?apittest di alamat; tidak dipakai game.
// Menggambar enam lingkaran diam di canvas overlay. Lingkaran pecah bila diapit dua jari (lewat
// GestureDetector.match), lalu muncul lagi 1,2 detik kemudian supaya uji bisa diulang.
// Dipasang sebagai lapisan SkeletonOverlay (addLayer) agar tetap tergambar saat penanda memudar.
// Teks di bawah layar menunjukkan parameter yang berlaku dan seberapa dekat pasangan jari terbaik
// dengan syarat apit, jadi terlihat kenapa apit "tidak kena" dan mana yang perlu dilonggarkan.
import { distanceToSegment } from '../gesture/GestureDetector.js';

const COLS = [0.2, 0.5, 0.8]; // posisi sebagai pecahan lebar/tinggi layar
const ROWS = [0.38, 0.66];
const RADIUS_U = 9;           // radius lingkaran = 9u (u = 1% sisi terpendek layar)
const RESPAWN_MS = 1200;
const BURST_MS = 350;

const FILL = 'rgba(142, 221, 203, 0.18)'; // --napas
const EDGE = '#E9F2EE';                   // --embun
const SHADOW = 'rgba(12, 43, 46, 0.85)';  // --paru

/**
 * @param {{ gestures: import('../gesture/GestureDetector.js').GestureDetector }} deps
 * @returns {{ update: (vp: object, t: number) => void, draw: (ctx: CanvasRenderingContext2D, vp: object, t: number) => void, stats: object }}
 *  update: panggil tiap frame deteksi (logika + cocokkan apit). draw: daftarkan lewat `overlay.addLayer`.
 */
export function mountApitTest({ gestures }) {
  const stats = { hits: 0, last: null };
  const bursts = [];
  const circles = ROWS.flatMap((fy, r) => COLS.map((fx, c) => ({ id: `uji-${r}${c}`, fx, fy, x: 0, y: 0, r: 0, alive: true, respawnAt: 0 })));
  let lastT = 0;

  gestures.on('apit', (hit) => {
    const circle = circles.find((c) => c.id === hit.target.id);
    if (!circle) return;
    circle.alive = false;
    circle.respawnAt = lastT + RESPAWN_MS;
    bursts.push({ x: circle.x, y: circle.y, r: circle.r, t0: lastT });
    const d = distanceToSegment(hit.target, hit.pair.a, hit.pair.b);
    stats.hits += 1;
    stats.last = { pair: hit.pair.id, gapR: hit.gap / circle.r, centerR: d / circle.r };
    console.info('[apittest] apit', stats.last);
  });

  function update(vp, t) {
    lastT = t;
    const u = Math.min(vp.width, vp.height) / 100;
    for (const c of circles) {
      if (!c.alive && t >= c.respawnAt) c.alive = true;
      c.x = c.fx * vp.width;
      c.y = c.fy * vp.height;
      c.r = u * RADIUS_U;
    }
    gestures.match(circles.filter((c) => c.alive), t);
  }

  function draw(ctx, vp, t) {
    if (!vp) return;
    const u = Math.min(vp.width, vp.height) / 100;
    for (const c of circles) {
      if (!c.alive) continue;
      ctx.beginPath();
      ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
      ctx.fillStyle = FILL;
      ctx.fill();
      ctx.strokeStyle = EDGE;
      ctx.lineWidth = u * 0.5;
      ctx.stroke();
    }
    for (let i = bursts.length - 1; i >= 0; i -= 1) {
      const age = t - bursts[i].t0;
      if (age > BURST_MS) { bursts.splice(i, 1); continue; }
      const k = age / BURST_MS;
      ctx.beginPath();
      ctx.arc(bursts[i].x, bursts[i].y, bursts[i].r * (1 + 0.6 * k), 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(142, 221, 203, ${1 - k})`;
      ctx.lineWidth = u * 0.8;
      ctx.stroke();
    }
    drawReadout(ctx, vp, u, gestures, circles.filter((c) => c.alive), stats);
  }

  return { update, draw, stats };
}

/** Pasangan jari yang paling dekat dengan memenuhi syarat apit untuk salah satu lingkaran (null bila tidak ada tangan). */
export function nearestCandidate(gestures, targets) {
  const { centerTolerance, closeRatio } = gestures.apit;
  let best = null;
  for (const target of targets) {
    for (const pair of gestures.pairs) {
      const gapR = pair.gap / target.r;
      const centerR = distanceToSegment(target, pair.a, pair.b) / target.r;
      const score = Math.max(gapR / closeRatio, centerR / centerTolerance); // ≤ 1 berarti memenuhi syarat
      if (!best || score < best.score) best = { pair: pair.id, gapR, centerR, score };
    }
  }
  return best;
}

function drawReadout(ctx, vp, u, gestures, targets, stats) {
  const a = gestures.apit;
  const near = nearestCandidate(gestures, targets);
  const f = (n) => n.toFixed(2);
  const lines = [
    `apit: ${stats.hits}  |  pusat ≤ ${a.centerTolerance}r  tutup ≤ ${a.closeRatio}r  tahan ${a.holdMs} ms`,
    near
      ? `terdekat ${near.pair}: tutup ${f(near.gapR)}r  pusat ${f(near.centerR)}r  ${near.score <= 1 ? 'MEMENUHI' : 'belum'}`
      : 'tangan tidak terdeteksi',
    stats.last ? `terakhir ${stats.last.pair}: tutup ${f(stats.last.gapR)}r  pusat ${f(stats.last.centerR)}r` : 'terakhir: -',
  ];
  const fs = u * 2.3;
  ctx.font = `${fs}px system-ui, sans-serif`;
  ctx.textBaseline = 'bottom';
  ctx.lineJoin = 'round';
  lines.forEach((text, i) => {
    const x = u * 2;
    const y = vp.height - u * 2 - (lines.length - 1 - i) * fs * 1.35;
    ctx.lineWidth = u * 0.7;
    ctx.strokeStyle = SHADOW;
    ctx.strokeText(text, x, y);
    ctx.fillStyle = EDGE;
    ctx.fillText(text, x, y);
  });
}
