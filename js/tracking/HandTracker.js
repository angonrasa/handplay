// js/tracking/HandTracker.js
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

// Pilih delegate otomatis (GPU vs CPU). Di TV/papan lemah, GPU kadang jauh lebih lambat dari CPU (±170 ms per deteksi).
// Ukur GPU dulu; bila lambat, coba CPU dengan jumlah frame yang sama dan pakai yang lebih cepat. Hasil diingat per perangkat
// (localStorage), jadi pengukuran hanya sekali. ?retune mengulang pengukuran; ?delegate=cpu|gpu memaksa pilihan.
const TUNE_SAMPLES = 14;   // frame BERTANGAN yang diukur per delegate (frame tanpa tangan lebih lambat dan tidak sebanding)
const TUNE_WARMUP = 3;     // frame awal setelah ganti delegate dibuang
const TUNE_SLOW_MS = 70;   // GPU lebih cepat dari ini = cukup, tidak perlu mencoba CPU
const TUNE_MARGIN = 0.8;   // CPU dipakai bila ≤ 80% waktu GPU
const SAVE_KEY = 'handplay.delegate';

function readSavedDelegate() {
  try {
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('retune')) {
      window.localStorage.removeItem(SAVE_KEY);
      return null;
    }
    const v = window.localStorage.getItem(SAVE_KEY);
    return v === 'GPU' || v === 'CPU' ? v : null;
  } catch (e) {
    return null;
  }
}

function saveDelegate(name) {
  try { window.localStorage.setItem(SAVE_KEY, name); } catch (e) { /* abaikan */ }
}

const median = (list) => {
  const s = [...list].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

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

export async function pickSource() {
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
  /**
   * @param {{ numHands?: number, delegate?: 'GPU'|'CPU', inputHeight?: number, getZoom?: () => number, minConfidence?: number, autoDelegate?: boolean, createCanvas?: () => HTMLCanvasElement }} [options]
   *   autoDelegate: pilih GPU/CPU otomatis berdasarkan kecepatan nyata di perangkat (hanya bila delegate = 'GPU').
   *   getZoom: zoom digital yang sedang tampil. Bila > 1, hanya bagian tengah video yang dikirim ke MediaPipe (sama dengan yang terlihat
   *   di layar), jadi tangan tampak lebih besar bagi detektor dan jarak deteksi bertambah. Landmark dikembalikan ke koordinat video penuh.
   *   minConfidence: ambang deteksi/kehadiran/pelacakan tangan (bawaan MediaPipe 0,5; lebih rendah = tangan jauh lebih mudah ditangkap).
   *   inputHeight: tinggi gambar yang diberikan ke MediaPipe (px). Video 1080p diperkecil dulu
   *   karena deteksi di resolusi penuh lambat di perangkat lemah (TV/papan). 0 = pakai ukuran asli.
   */
  constructor({ numHands = 1, delegate = 'GPU', inputHeight = 360, getZoom = null, minConfidence = 0.4, autoDelegate = true, createCanvas = null } = {}) {
    this.numHands = numHands; // MVP: satu tangan; angka ini parameter, bukan hard-code
    this.inputHeight = inputHeight;
    this.getZoom = getZoom;
    this.autoDelegate = autoDelegate && delegate === 'GPU';
    this._create = null;   // pembuat HandLandmarker untuk delegate tertentu
    this._lms = {};        // delegate → instance yang masih hidup
    this._tune = null;     // keadaan pengukuran delegate (null = tidak/ tidak lagi mengukur)
    this.tuned = false;
    this.gpuMs = 0;
    this.minConfidence = minConfidence;
    this._crop = { x0: 0, y0: 0, w: 1, h: 1 }; // bagian video (0..1) yang dikirim ke MediaPipe
    this._createCanvas = createCanvas || (() => document.createElement('canvas'));
    this._canvas = null;
    this._ctx = null;
    this.inputSize = null; // ukuran gambar yang benar-benar diberikan ke MediaPipe
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
        minHandDetectionConfidence: this.minConfidence,
        minHandPresenceConfidence: this.minConfidence,
        minTrackingConfidence: this.minConfidence,
      });

    this._create = create;
    const saved = this.autoDelegate ? readSavedDelegate() : null;
    this._saved = saved;
    const wanted = saved || this.delegatePref;
    try {
      this._landmarker = await create(wanted);
      this.delegate = wanted;
    } catch (e) {
      if (wanted === 'CPU') {
        throw new TrackerError('init-failed', `${e && e.name}: ${e && e.message}`);
      }
      try {
        this._landmarker = await create('CPU'); // GPU tidak tersedia: jatuh ke CPU
        this.delegate = 'CPU';
      } catch (e2) {
        throw new TrackerError('init-failed', `${e2 && e2.name}: ${e2 && e2.message}`);
      }
    }
    this._lms[this.delegate] = this._landmarker;
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
    if (this.autoDelegate && !this._saved && !this.tuned && !this._tune && this.delegate === 'GPU') {
      this._tune = { phase: 'gpu', samples: [], skip: TUNE_WARMUP };
    }

    const schedule = (cb) =>
      video.requestVideoFrameCallback ? video.requestVideoFrameCallback(cb) : requestAnimationFrame(cb);

    const tick = () => {
      if (run !== this._run) return;
      if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
        const t0 = performance.now();
        const ts = Math.max(t0, this._lastTs + 1);
        this._lastTs = ts;
        try {
          const hands = this._toVideoSpace(this.detect(this._source(video), ts));
          failures = 0;
          const ms = performance.now() - t0;
          this._record(ms, hands.length);
          if (this._tune) this._tuneStep(ms, hands.length);
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

  /**
   * Frame yang dikirim ke MediaPipe: bagian tengah video sesuai zoom (bila zoom > 1), diperkecil ke `inputHeight`
   * (rasio sama). Tanpa zoom dan video sudah kecil = video apa adanya.
   */
  _source(video) {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const zoom = this.getZoom ? Math.max(1, Number(this.getZoom()) || 1) : 1;
    const cropped = zoom > 1.001;
    this._crop = cropped ? { x0: (1 - 1 / zoom) / 2, y0: (1 - 1 / zoom) / 2, w: 1 / zoom, h: 1 / zoom } : { x0: 0, y0: 0, w: 1, h: 1 };

    const sw = vw * this._crop.w;
    const sh = vh * this._crop.h;
    if (!cropped && (!this.inputHeight || vh <= this.inputHeight)) {
      this.inputSize = { width: vw, height: vh };
      return video;
    }
    if (!this._canvas) {
      this._canvas = this._createCanvas();
      this._ctx = this._canvas.getContext('2d', { alpha: false });
    }
    const h = this.inputHeight ? Math.min(this.inputHeight, Math.round(sh)) : Math.round(sh);
    const w = Math.round((sw / sh) * h);
    if (this._canvas.width !== w || this._canvas.height !== h) {
      this._canvas.width = w;
      this._canvas.height = h;
    }
    this._ctx.drawImage(video, vw * this._crop.x0, vh * this._crop.y0, sw, sh, 0, 0, w, h);
    this.inputSize = { width: w, height: h };
    return this._canvas;
  }

  /** Landmark hasil deteksi (koordinat potongan) → koordinat video penuh, supaya LandmarkMapper tidak perlu tahu soal potongan. */
  _toVideoSpace(hands) {
    const { x0, y0, w, h } = this._crop;
    if (w === 1 && h === 1) return hands;
    for (const hand of hands) {
      for (const p of hand.landmarks) {
        p.x = x0 + p.x * w;
        p.y = y0 + p.y * h;
      }
    }
    return hands;
  }

  // Pengukuran delegate: GPU dulu; bila lambat, pasang CPU dan ukur lagi; pakai yang lebih cepat.
  // Dipanggil tiap deteksi; hanya frame yang ADA tangannya dihitung (tanpa tangan, MediaPipe mencari telapak: lebih lambat).
  _tuneStep(ms, handCount) {
    const tn = this._tune;
    if (!tn || tn.phase === 'switching' || handCount === 0) return;
    if (tn.skip > 0) {
      tn.skip -= 1;
      return;
    }
    tn.samples.push(ms);
    if (tn.samples.length < TUNE_SAMPLES) return;
    const med = median(tn.samples);

    if (tn.phase === 'gpu') {
      this.gpuMs = med;
      tn.gpuMs = med;
      if (med < TUNE_SLOW_MS) {
        this._finishTune('GPU');
        return;
      }
      tn.phase = 'switching';
      this._create('CPU').then(
        (lm) => {
          if (!this._tune) {
            this._closeLandmarker(lm);
            return;
          }
          this._lms.CPU = lm;
          this._landmarker = lm;
          this.delegate = 'CPU';
          tn.phase = 'cpu';
          tn.samples = [];
          tn.skip = TUNE_WARMUP;
        },
        () => this._finishTune('GPU'), // CPU tidak bisa dibuat: tetap GPU
      );
      return;
    }

    if (tn.phase === 'cpu') {
      if (med <= tn.gpuMs * TUNE_MARGIN) {
        this._closeLandmarker(this._lms.GPU);
        delete this._lms.GPU;
        this._finishTune('CPU');
      } else {
        this._landmarker = this._lms.GPU;
        this.delegate = 'GPU';
        this._closeLandmarker(this._lms.CPU);
        delete this._lms.CPU;
        this._finishTune('GPU');
      }
    }
  }

  _finishTune(choice) {
    this._tune = null;
    this.tuned = true;
    saveDelegate(choice);
    if (typeof console !== 'undefined') console.info(`[handplay] delegate dipilih: ${choice} (GPU ${Math.round(this.gpuMs)} ms)`);
  }

  _closeLandmarker(lm) {
    try { if (lm && lm.close) lm.close(); } catch (e) { /* abaikan */ }
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
      tune: this._tune ? this._tune.phase : this.tuned ? 'selesai' : null,
      gpuMs: Math.round(this.gpuMs),
      inputSize: this.inputSize,
      error: this.error ? { code: this.error.code, detail: this.error.detail || this.error.message } : null,
    };
  }
}
