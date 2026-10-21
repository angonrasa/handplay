// js/game/Collision.js
// Collision — fungsi murni, tanpa state. Menjembatani daftar gelembung dan GestureDetector:
// gelembung → target `{id,x,y,r}` untuk `gestures.match()`, lalu hasil `apit` → gelembung yang kena.
// Aturan apit sendiri (tiga syarat, blueprint 7) ada di GestureDetector, bukan di sini.

export function pointInCircle(px, py, cx, cy, radius) {
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy <= radius * radius;
}

/** Dua lingkaran `{x,y,r}` saling tumpang tindih? `gap` = jarak aman tambahan (piksel). */
export function circlesOverlap(a, b, gap = 0) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const min = a.r + b.r + gap;
  return dx * dx + dy * dy < min * min;
}

/** Daftar target untuk `gestures.match()`: hanya id dan lingkaran (koordinat layar). */
export function toTargets(bubbles) {
  return bubbles.map(({ id, x, y, r }) => ({ id, x, y, r }));
}

/**
 * Ubah hasil `gestures.match()` menjadi gelembung yang kena. Hasil untuk gelembung yang sudah tidak ada
 * (keburu dihapus) atau yang muncul dua kali dibuang.
 * @returns {{ bubble: object, pair: object, mid: {x:number,y:number}, gap: number }[]}
 */
export function resolveHits(hits, bubbles) {
  const byId = new Map(bubbles.map((b) => [b.id, b]));
  const seen = new Set();
  const out = [];
  for (const hit of hits) {
    const bubble = byId.get(hit.target.id);
    if (!bubble || seen.has(bubble.id)) continue;
    seen.add(bubble.id);
    out.push({ bubble, pair: hit.pair, mid: hit.mid, gap: hit.gap });
  }
  return out;
}

/**
 * Satu langkah per frame: cocokkan semua gelembung dengan pasangan jari. `gestures` hanya perlu punya `match(targets, time)`.
 * @returns {{ bubble: object, pair: object, mid: {x:number,y:number}, gap: number }[]} gelembung yang BARU saja diapit
 */
export function findPinched(gestures, bubbles, time) {
  return resolveHits(gestures.match(toTargets(bubbles), time), bubbles);
}
