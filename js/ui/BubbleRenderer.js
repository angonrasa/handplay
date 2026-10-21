// js/ui/BubbleRenderer.js
// BubbleRenderer — menggambar gelembung kaca berisi teks di canvas. Hanya menggambar; posisi dan ukuran
// berasal dari BubbleManager (koordinat layar). Semua gelembung tampil sama: pemain tidak boleh bisa
// membedakan jawaban benar dari pengecoh lewat tampilan (warna per kategori baru di M6.4).
//
// Resep kaca (sama dengan .bubble di css/game.css): inti berasap agar teks terbaca di atas video terang, kaca bening
// dengan pantulan kiri atas, cahaya tipis di sepanjang tepi dalam, tepi bergradasi (terang di kiri atas, aksen di kanan
// bawah) dan satu sorot lonjong. Hanya gradien dan satu jalur blob per gelembung, tanpa shadowBlur: ringan untuk papan TV.
//
// Bentuk gelembung adalah blob "goo": tepi bergelombang pelan (jumlah gelombang 2–4, bergeser seiring waktu).
// Simpangan paling besar ±~10% radius, jadi lingkaran apit (x, y, r) dari BubbleManager tetap akurat.
// `b.wobble` (dari BubbleManager) menskalakan simpangan; 0 = lingkaran sempurna.
import { TEXT } from '../game/BubbleManager.js';

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const EMBUN = '#E9F2EE';
const NAPAS = '52, 217, 182';
const PARU_DALAM = '7, 30, 33';
const PARU_SHADOW = `rgba(${PARU_DALAM}, 0.62)`;

const BLOB_POINTS = 56;
// [jumlah gelombang, amplitudo (× r), kecepatan (putaran/detik), faktor fase acak]
const BLOB_WAVES = [
  [2, 0.045, 0.24, 1.0],
  [3, 0.035, -0.31, 1.7],
  [4, 0.02, 0.39, 2.3],
];
const APPEAR_S = 0.4; // lama animasi muncul (detik, memakai b.age)

/**
 * @param {CanvasRenderingContext2D} ctx  sudah di-transform ke koordinat layar (seperti lapisan SkeletonOverlay)
 * @param {{x:number,y:number,r:number,lines:string[],fontScale:number,phase?:number,wobble?:number,age?:number}[]} bubbles
 * @param {number} [time]  ms (untuk goyang bentuk)
 */
export function drawBubbles(ctx, bubbles, time = 0) {
  for (const b of bubbles) drawBubble(ctx, b, time);
}

function appearScale(age) {
  if (!Number.isFinite(age) || age >= APPEAR_S) return 1;
  const k = Math.max(0, age) / APPEAR_S;
  return 1 - (1 - k) ** 3; // easeOutCubic
}

function blobPath(ctx, b, r, time) {
  const k = time / 1000;
  const amp = b.wobble === undefined ? 1 : b.wobble;
  const phase = b.phase || 0;
  ctx.beginPath();
  for (let i = 0; i <= BLOB_POINTS; i += 1) {
    const th = (i / BLOB_POINTS) * Math.PI * 2;
    let d = 0;
    for (const [m, a, hz, ph] of BLOB_WAVES) d += a * Math.sin(m * th + phase * ph + k * hz * Math.PI * 2);
    const rr = r * (1 + d * amp);
    const x = b.x + Math.cos(th) * rr;
    const y = b.y + Math.sin(th) * rr;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

export function drawBubble(ctx, b, time = 0) {
  const grow = appearScale(b.age);
  if (grow <= 0.01) return;
  const r = b.r * grow;
  ctx.globalAlpha = Math.min(1, grow * 1.5); // muncul sambil memudar masuk

  blobPath(ctx, b, r, time);

  // 1) Inti berasap: menggelapkan video di dalam gelembung sedikit supaya teks terbaca di ruangan terang
  const core = ctx.createRadialGradient(b.x, b.y, r * 0.1, b.x, b.y, r);
  core.addColorStop(0, `rgba(${PARU_DALAM}, 0.40)`);
  core.addColorStop(0.7, `rgba(${PARU_DALAM}, 0.22)`);
  core.addColorStop(1, `rgba(${PARU_DALAM}, 0.10)`);
  ctx.fillStyle = core;
  ctx.fill();

  // 2) Badan kaca: pantulan di kiri atas, hampir bening di tengah, tepi sedikit terang
  const glass = ctx.createRadialGradient(b.x - r * 0.4, b.y - r * 0.48, r * 0.05, b.x, b.y, r);
  glass.addColorStop(0, 'rgba(233, 242, 238, 0.50)');
  glass.addColorStop(0.34, `rgba(${NAPAS}, 0.22)`);
  glass.addColorStop(0.62, `rgba(${NAPAS}, 0.10)`);
  glass.addColorStop(1, 'rgba(233, 242, 238, 0.18)');
  ctx.fillStyle = glass;
  ctx.fill();

  // 3) Cahaya tepi dalam: memberi ketebalan kaca
  const rim = ctx.createRadialGradient(b.x - r * 0.1, b.y - r * 0.12, r * 0.7, b.x, b.y, r * 1.02);
  rim.addColorStop(0, `rgba(${NAPAS}, 0)`);
  rim.addColorStop(1, `rgba(${NAPAS}, 0.42)`);
  ctx.fillStyle = rim;
  ctx.fill();

  // 4) Tepi bergradasi: terang di kiri atas (kena cahaya), aksen di kanan bawah
  const edge = ctx.createLinearGradient(b.x - r, b.y - r, b.x + r, b.y + r);
  edge.addColorStop(0, 'rgba(233, 242, 238, 0.92)');
  edge.addColorStop(0.4, 'rgba(233, 242, 238, 0.34)');
  edge.addColorStop(0.7, `rgba(${NAPAS}, 0.55)`);
  edge.addColorStop(1, `rgba(${NAPAS}, 1)`);
  ctx.strokeStyle = edge;
  ctx.lineWidth = Math.max(2, r * 0.05);
  ctx.stroke();

  // 5) Sorot lonjong di kiri atas
  ctx.save();
  ctx.translate(b.x - r * 0.36, b.y - r * 0.46);
  ctx.rotate(-0.58);
  ctx.scale(1, 0.55);
  const spec = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.3);
  spec.addColorStop(0, 'rgba(255, 255, 255, 0.66)');
  spec.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = spec;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  drawLabel(ctx, b, r);
  ctx.globalAlpha = 1;
}

function drawLabel(ctx, b, r) {
  const lines = b.lines && b.lines.length ? b.lines : [b.text || ''];
  const n = lines.length;
  let size = b.fontScale * r;

  // Pengaman: perkiraan lebar huruf di BubbleManager bisa meleset (huruf lebar, font berbeda). Ukur nyata dan kecilkan bila perlu.
  ctx.font = `700 ${size}px ${FONT}`;
  const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
  const avail = (TEXT.widthR[n] || TEXT.widthR[3]) * r;
  if (widest > avail && widest > 0) {
    size *= avail / widest;
    ctx.font = `700 ${size}px ${FONT}`;
  }

  const lh = size * TEXT.lineHeight;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  lines.forEach((line, i) => {
    const y = b.y + (i - (n - 1) / 2) * lh;
    ctx.lineWidth = Math.max(2, size * 0.14);
    ctx.strokeStyle = PARU_SHADOW;
    ctx.strokeText(line, b.x, y);
    ctx.fillStyle = EMBUN;
    ctx.fillText(line, b.x, y);
  });
}
