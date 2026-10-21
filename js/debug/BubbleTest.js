// js/debug/BubbleTest.js
// Alat uji gelembung untuk perangkat (M4.2–M4.4). Aktif hanya dengan ?bubbletest di alamat; tidak dipakai game.
// Masuk ke layar game: beberapa gelembung berisi istilah pernapasan muncul sekaligus, diam di tempat dan
// bergoyang pelan (goo), pecah bila diapit dua jari. Setelah semuanya pecah, satu set baru muncul.
// Memakai persis alur yang nanti dipakai GameEngine:
// BubbleManager.place → Collision.findPinched(gestures) → hapus gelembung, digambar lewat BubbleRenderer.
// Loop memakai requestAnimationFrame sendiri (deteksi tangan hanya 5–6 FPS di papan, tetapi gerak harus halus).
import { BubbleManager } from '../game/BubbleManager.js';
import { findPinched } from '../game/Collision.js';
import { drawBubbles } from '../ui/BubbleRenderer.js';

const WORDS = [
  'Alveolus', 'Trakea', 'Bronkus', 'Faring', 'Laring', 'Rongga hidung', 'Bronkiolus',
  'Diafragma', 'Pita suara', 'Epiglotis', 'Karbondioksida', 'Pertukaran gas',
];
const SET_SIZE = 4;           // jumlah gelembung per set (dibatasi kapasitas area)
const REFILL_DELAY_MS = 700;  // jeda setelah set habis sebelum set baru muncul
const BURST_MS = 350;

const EDGE = '#E9F2EE';
const SHADOW = 'rgba(12, 43, 46, 0.85)';

/**
 * @param {{
 *   gestures: import('../gesture/GestureDetector.js').GestureDetector,
 *   overlay: import('../ui/SkeletonOverlay.js').SkeletonOverlay,
 *   getViewport: () => ({width:number,height:number,dpr:number}|null),
 *   getScreen: () => string,
 *   wobble?: number,
 * }} deps   (opsi lama `speed` / `?bspeed` tidak dipakai lagi: gelembung tidak bergerak)
 * @returns {{ draw: (ctx: CanvasRenderingContext2D, vp: object, t: number) => void, manager: BubbleManager, stats: object, stop: () => void }}
 */
export function mountBubbleTest({ gestures, overlay, getViewport, getScreen, wobble = 1 }) {
  const manager = new BubbleManager({ wobble });
  const stats = { sets: 0, popped: 0, lastGapR: null };
  const bursts = [];
  let word = 0;
  let refillAt = 0;
  let last = 0;
  let raf = 0;

  function placeSet() {
    const specs = [];
    const n = Math.min(SET_SIZE, manager.capacity);
    for (let i = 0; i < n; i += 1) specs.push({ text: WORDS[(word + i) % WORDS.length] });
    if (!specs.length) return;
    word += n;
    if (manager.place(specs).length) stats.sets += 1;
  }

  function frame(t) {
    raf = requestAnimationFrame(frame);
    const vp = getViewport();
    if (!vp || getScreen() !== 'game') {
      manager.clear();
      last = 0;
      refillAt = 0;
      return;
    }
    manager.setArea(vp);
    const dt = last ? (t - last) / 1000 : 0;
    last = t;

    manager.update(dt);

    if (!manager.bubbles.length) {
      if (!refillAt) refillAt = t + REFILL_DELAY_MS;
      else if (t >= refillAt) {
        placeSet();
        refillAt = 0;
      }
    }

    for (const { bubble, gap } of findPinched(gestures, manager.bubbles, t)) {
      manager.remove(bubble.id);
      bursts.push({ x: bubble.x, y: bubble.y, r: bubble.r, t0: t });
      stats.popped += 1;
      stats.lastGapR = gap / bubble.r;
      console.info('[bubbletest] pecah', bubble.text, { gapR: stats.lastGapR });
    }

    overlay.redraw(vp, t);
  }

  function draw(ctx, vp, t) {
    if (!vp || !manager.area) return;
    drawBubbles(ctx, manager.bubbles, t);

    const u = Math.min(vp.width, vp.height) / 100;
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
    drawReadout(ctx, vp, u, manager, stats);
  }

  raf = requestAnimationFrame(frame);
  return { draw, manager, stats, stop: () => cancelAnimationFrame(raf) };
}

function drawReadout(ctx, vp, u, manager, stats) {
  const lines = [
    `gelembung ${manager.bubbles.length}/${manager.capacity}  |  pecah ${stats.popped}  set ${stats.sets}  |  ${manager.orientation}`,
    manager.bubbles[0] ? `r ≈ ${Math.round(manager.bubbles[0].r)} px  (${(manager.bubbles[0].r / u).toFixed(1)}u)` : 'menunggu set berikutnya',
  ];
  const fs = u * 2.3;
  ctx.font = `${fs}px system-ui, sans-serif`;
  ctx.textAlign = 'left';
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
