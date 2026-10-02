// js/tracking/LandmarkMapper.js
// LandmarkMapper — koordinat landmark (0..1) → koordinat layar (piksel CSS).
// Memperhitungkan: mirror dan rasio video vs layar (video ditampilkan dengan `cover`,
// jadi sebagian tepinya terpotong).
// Ujung jari (M3.2): landmark 4, 8, 12, 16, 20 diambil lewat `fingertips()`; semuanya titik sentuh setara
// (bola diapit dua jari mana pun, lihat blueprint 7).
// Smoothing (M3.3): posisi ujung jari dihaluskan (OneEuroFilter, ruang 0..1) sebelum dipetakan ke layar.
// Nilai awal `DEFAULT_SMOOTHING` disetel lewat uji perangkat di M3.5b; `new LandmarkMapper({ smoothing: null })` mematikannya.
import { OneEuroFilter } from './OneEuroFilter.js';

export const DEFAULT_SMOOTHING = { minCutoff: 0.8, beta: 6, dCutoff: 1, maxGapMs: 300 };

/** Ujung kelima jari pada 21 landmark MediaPipe. */
export const FINGERTIPS = [
  { id: 'thumb', landmark: 4 },
  { id: 'index', landmark: 8 },
  { id: 'middle', landmark: 12 },
  { id: 'ring', landmark: 16 },
  { id: 'pinky', landmark: 20 },
];

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export class LandmarkMapper {
  /** @param {{ smoothing?: object|null }} [options]  smoothing: parameter OneEuroFilter, atau null = mati */
  constructor({ smoothing = DEFAULT_SMOOTHING } = {}) {
    this.view = null;
    this._filters = new Map(); // "slot:landmark" → { x, y }
    this.setSmoothing(smoothing);
  }

  /** Ganti parameter smoothing saat berjalan (null = mati). Riwayat filter dibuang. */
  setSmoothing(smoothing) {
    this.smoothing = smoothing ? { ...DEFAULT_SMOOTHING, ...smoothing } : null;
    this.resetSmoothing();
  }

  /** Buang riwayat filter. Panggil saat tangan hilang agar tangan yang muncul lagi tidak "meluncur" dari posisi lama. */
  resetSmoothing() {
    this._filters.clear();
  }

  _smooth(slot, landmark, p, time) {
    const cfg = this.smoothing;
    if (!cfg) return p;
    const key = `${slot}:${landmark}`;
    let f = this._filters.get(key);
    if (!f) {
      f = { x: new OneEuroFilter(cfg), y: new OneEuroFilter(cfg) };
      this._filters.set(key, f);
    }
    return { x: f.x.filter(p.x, time), y: f.y.filter(p.y, time) };
  }

  /**
   * Panggil ulang saat resize/orientasi atau saat ukuran video berubah.
   * @param {{ width:number, height:number, videoWidth:number, videoHeight:number, mirrored:boolean, zoom?:number }} view
   */
  setViewport(view) {
    const { width, height, videoWidth, videoHeight, mirrored, zoom = 1 } = view;
    if (!(width > 0 && height > 0 && videoWidth > 0 && videoHeight > 0)) {
      this.view = null;
      return;
    }
    const scale = Math.max(width / videoWidth, height / videoHeight); // cover
    this.view = {
      width,
      scale,
      mirrored: !!mirrored,
      zoom,
      height,
      offsetX: (width - videoWidth * scale) / 2,
      offsetY: (height - videoHeight * scale) / 2,
      videoWidth,
      videoHeight,
    };
  }

  /** @param {{x:number,y:number}} landmark  x,y 0..1 pada frame video. Null bila belum ada viewport. */
  toScreen(landmark) {
    const v = this.view;
    if (!v) return null;
    let x = v.offsetX + landmark.x * v.videoWidth * v.scale;
    let y = v.offsetY + landmark.y * v.videoHeight * v.scale;
    // Zoom digital berpusat di tengah layar (sama dengan transform CSS pada video).
    x = v.width / 2 + (x - v.width / 2) * v.zoom;
    y = v.height / 2 + (y - v.height / 2) * v.zoom;
    return { x: v.mirrored ? v.width - x : x, y };
  }

  /**
   * Lima ujung jari satu tangan dalam koordinat layar.
   * Kosong bila belum ada viewport atau data landmark tidak lengkap (supaya pemanggil tidak perlu cek satu-satu).
   * @param {{ landmarks: {x:number,y:number}[] }} hand  satu elemen keluaran HandTracker
   * @param {number} [slot]  urutan tangan pada frame (0 untuk MVP satu tangan); tiap slot punya filter sendiri
   * @param {number} [time]  waktu frame dalam ms; bawaan performance.now()
   * @returns {{ id:string, landmark:number, x:number, y:number }[]}
   */
  fingertips(hand, slot = 0, time = now()) {
    const pts = hand && hand.landmarks;
    if (!this.view || !pts || pts.length < 21) return [];
    const out = [];
    for (const { id, landmark } of FINGERTIPS) {
      const p = this.toScreen(this._smooth(slot, landmark, pts[landmark], time));
      if (!p) return [];
      out.push({ id, landmark, x: p.x, y: p.y });
    }
    return out;
  }
}
