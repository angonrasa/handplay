// HandTracker — pembungkus MediaPipe Hand Landmarker (lapisan persepsi).
// Output: data tangan (21 landmark + handedness). Tidak tahu aturan game.
// Dibuat replaceable: kontrak keluaran tetap sama jika MediaPipe diganti.
//
// Kontrak keluaran: [{ handedness, score, landmarks: [{ x, y, z }] }]  (x,y dinormalisasi 0..1)
// Catatan handedness: MediaPipe mengira gambar adalah selfie (cermin). Karena video kita
// belum di-mirror saat diproses, "Left"/"Right" bisa tertukar. Jangan dipakai sebelum diuji.

// Sumber MediaPipe: folder lokal assets/mediapipe/ bila lengkap (jalan offline),
// jika tidak, otomatis dari CDN (butuh internet). Tidak perlu langkah instal apa pun.
const ASSET_BASE = new URL('../../assets/mediapipe/', import.meta.url);
const FILES = {
  bundle: 'vision_bundle.mjs',
  wasm: 'wasm/vision_wasm_internal.wasm', // varian SIMD; cukup untuk Chrome modern
  wasmJs: 'wasm/vision_wasm_internal.js',
  model: 'hand_landmarker.task',
};
const CDN_VERSION = '0.10.14'; // ubah di sini bila perlu versi lain
const CDN_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${CDN_VERSION}/`;
const CDN_MODEL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const MAX_CONSECUTIVE_ERRORS = 3;

/** code: 'missing-assets' (lokal tidak ada dan CDN gagal) | 'init-failed' | 'detect-failed' */
export class TrackerError extends Error {
  constructor(code, detail) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'TrackerError';
    this.code = code;
    this.detail = detail || '';
  }
}

/** Murni: hasil mentah MediaPipe → kontrak keluaran HandTracker. */
export function toHands(result) {
  const all = (result && result.landmarks) || [];
  return all.map((points, i) => {
    const category = result.handedness && result.handedness[i] && result.handedness[i][0];
    return {
      handedness: (category && category.categoryName) || 'Unknown',
      score: (category && category.score) || 0,
      landmarks: points.map((p) => ({ x: p.x, y: p.y, z: p.z })),
    };
  });
}

async function findMissingLocal() {
  const missing = [];
  for (const file of Object.values(FILES)) {
    try {
      const res = await fetch(new URL(file, ASSET_BASE), { method: 'HEAD' });
      if (!res.ok) missing.push(file);
    } catch (e) {
      missing.push(file);
    }
  }
  return missing;
}

async function pickSource() {
  const missing = await findMissingLocal();
  if (!missing.length) {
    return {
      name: 'lokal',
      bundle: new URL(FILES.bundle, ASSET_BASE).href,
      wasmDir: new URL('wasm', ASSET_BASE).href,
      model: new URL(FILES.model, ASSET_BASE).href,
    };
  }
  return {
    name: 'cdn',
    missing,
    bundle: `${CDN_BASE}vision_bundle.mjs`,
    wasmDir: `${CDN_BASE}wasm`,
    model: CDN_MODEL,
  };
}

export class HandTracker {
  /** @param {{ numHands?: number, delegate?: 'GPU'|'CPU' }} [options] */
  constructor({ numHands = 1, delegate = 'GPU' } = {}) {
    this.numHands = numHands; // MVP: satu tangan; angka ini parameter, bukan hard-code
    this.delegatePref = delegate;
    this.source = null; // 'lokal' | 'cdn'
    this.delegate = null; // delegate yang benar-benar dipakai (GPU bisa jatuh ke CPU)
    this.status = 'idle'; // 'idle' | 'loading' | 'ready' | 'error'
    this.error = null;
    this.fps = 0;
    this.detectMs = 0; // rata-rata lama satu deteksi
    this.handCount = 0;
    this._landmarker = null;
    this._initPromise = null;
    this._run = 0; // naik tiap start/stop, menghentikan loop lama
    this._running = false;
    this._lastTs = 0;
    this._stamps = []; // waktu deteksi terakhir, untuk FPS
  }

  get running() {
    return this._running;
  }

  /** Memuat MediaPipe. Aman dipanggil berulang. */
  init() {
    if (this.status === 'ready') return Promise.resolve();
    if (this._initPromise) return this._initPromise;
    this.status = 'loading';
    this.error = null;
    const promise = this._load().then(
      () => {
        this.status = 'ready';
      },
      (err) => {
        this.status = 'error';
        this.error = err;
        this._initPromise = null; // boleh dicoba lagi
        throw err;
      },
    );
    this._initPromise = promise;
    return promise;
  }

  async _load() {
    const src = await pickSource();
    this.source = src.name;
    let vision;
    let HandLandmarker;
    try {
      const mod = await import(src.bundle);
      HandLandmarker = mod.HandLandmarker;
      vision = await mod.FilesetResolver.forVisionTasks(src.wasmDir);
    } catch (e) {
      const why = `${e && e.name}: ${e && e.message}`;
      if (src.name === 'cdn') {
        throw new TrackerError('missing-assets', `file lokal tidak ada (${src.missing.join(', ')}) dan CDN gagal (${why})`);
      }
      throw new TrackerError('init-failed', why);
    }

    const create = (delegate) =>
      HandLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: src.model, delegate },
        runningMode: 'VIDEO',
        numHands: this.numHands,
      });

    try {
      this._landmarker = await create(this.delegatePref);
      this.delegate = this.delegatePref;
    } catch (e) {
      if (this.delegatePref === 'CPU') {
        throw new TrackerError('init-failed', `${e && e.name}: ${e && e.message}`);
      }
      try {
        this._landmarker = await create('CPU'); // GPU tidak tersedia: jatuh ke CPU
        this.delegate = 'CPU';
      } catch (e2) {
        throw new TrackerError('init-failed', `${e2 && e2.name}: ${e2 && e2.message}`);
      }
    }
  }

  /** Satu deteksi. timestamp (ms) harus selalu naik. Mengembalikan daftar tangan. */
  detect(video, timestamp) {
    if (!this._landmarker) throw new TrackerError('detect-failed', 'belum init');
    return toHands(this._landmarker.detectForVideo(video, timestamp));
  }

  /**
   * Loop deteksi per frame video. Hanya satu loop aktif; memanggil start lagi
   * menggantikan loop lama. Perlu init() selesai lebih dulu.
   * @param {HTMLVideoElement} video
   * @param {(hands: object[]) => void} onResult  dipanggil tiap frame (daftar kosong = tidak ada tangan)
   */
  start(video, onResult) {
    this.stop();
    if (this.status !== 'ready') return;
    const run = this._run;
    this._running = true;
    let failures = 0;

    const schedule = (cb) =>
      video.requestVideoFrameCallback ? video.requestVideoFrameCallback(cb) : requestAnimationFrame(cb);

    const tick = () => {
      if (run !== this._run) return;
      if (video.readyState >= 2 && video.videoWidth > 0) {
        const t0 = performance.now();
        const ts = Math.max(t0, this._lastTs + 1);
        this._lastTs = ts;
        try {
          const hands = this.detect(video, ts);
          failures = 0;
          this._record(performance.now() - t0, hands.length);
          onResult(hands);
        } catch (e) {
          failures += 1;
          if (failures >= MAX_CONSECUTIVE_ERRORS) {
            this.error = e instanceof TrackerError ? e : new TrackerError('detect-failed', e && e.message);
            this.status = 'error';
            this._running = false;
            onResult([]);
            return;
          }
        }
      }
      schedule(tick);
    };
    schedule(tick);
  }

  stop() {
    this._run += 1;
    this._running = false;
    this.fps = 0;
    this.handCount = 0;
  }

  _record(ms, handCount) {
    const now = performance.now();
    this._stamps.push(now);
    while (this._stamps.length && now - this._stamps[0] > 1000) this._stamps.shift();
    this.fps = this._stamps.length;
    this.detectMs = this.detectMs ? this.detectMs * 0.9 + ms * 0.1 : ms; // rata-rata bergerak
    this.handCount = handCount;
  }

  /** Ringkasan untuk panel debug. */
  get stats() {
    return {
      status: this.status,
      running: this._running,
      fps: this.fps,
      detectMs: Math.round(this.detectMs),
      hands: this.handCount,
      delegate: this.delegate,
      source: this.source,
      error: this.error ? { code: this.error.code, detail: this.error.detail || this.error.message } : null,
    };
  }
}
