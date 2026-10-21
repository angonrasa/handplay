// js/tracking/WorkerHandTracker.js
// WorkerHandTracker — HandTracker yang deteksinya berjalan di Web Worker (handWorker.js), bukan di thread utama.
// Alasan: detectForVideo() sinkron. Di thread utama, deteksi 75–170 ms membuat SELURUH halaman (gelembung, HUD, penanda)
// hanya berjalan sebanyak deteksi per detik. Di worker, thread utama hanya menggambar frame kecil dan mengirimnya.
//
// Kontrak sama dengan HandTracker (init / start / stop / running / stats), jadi app.js tidak perlu tahu bedanya.
// Satu frame dalam perjalanan pada satu waktu (frame yang datang saat worker sibuk dilewati). Bila worker gagal dimuat,
// init() menolak dengan TrackerError dan app.js jatuh ke HandTracker biasa. Pemilihan GPU/CPU otomatis (tune) tidak dipakai di sini:
// pakai ?delegate=cpu bila GPU di worker lambat.
import { HandTracker, TrackerError, toHands, pickSource } from './HandTracker.js';

const INIT_TIMEOUT_MS = 40000; // unduh model + WASM bisa lama di jaringan lambat

export class WorkerHandTracker extends HandTracker {
  /** Opsi sama dengan HandTracker; `createWorker` hanya untuk uji. */
  constructor(options = {}) {
    super({ ...options, autoDelegate: false });
    this._createWorker = options.createWorker || (() => new Worker(new URL('./handWorker.js', import.meta.url)));
    this._worker = null;
    this._busy = false;     // ada frame yang belum dijawab worker
    this._inflight = null;  // { run, t0, onResult }
    this.workerMs = 0;      // lama deteksi di dalam worker (tanpa antrean kirim-terima)
  }

  async _load() {
    const src = await pickSource();
    this.source = src.name;
    let worker;
    try {
      worker = this._createWorker();
    } catch (e) {
      throw new TrackerError('init-failed', `worker tidak bisa dibuat: ${e && e.message}`);
    }
    this._worker = worker;
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => fail(new TrackerError('init-failed', 'worker tidak menjawab (waktu habis)')), INIT_TIMEOUT_MS);
      const fail = (err) => {
        clearTimeout(timer);
        this._destroyWorker();
        reject(err);
      };
      worker.onerror = (e) => fail(new TrackerError('init-failed', `worker galat: ${(e && e.message) || 'tidak diketahui'}`));
      worker.onmessage = (event) => {
        const m = event.data || {};
        if (m.type === 'ready') {
          clearTimeout(timer);
          this.delegate = m.delegate;
          this._wire(worker);
          resolve();
        } else if (m.type === 'error') {
          fail(new TrackerError('init-failed', m.message));
        }
      };
      worker.postMessage({
        type: 'init',
        bundle: src.bundle,
        wasmDir: src.wasmDir,
        model: src.model,
        delegate: this.delegatePref,
        numHands: this.numHands,
        minConfidence: this.minConfidence,
      });
    });
    this._landmarker = {}; // penanda "sudah dimuat" untuk HandTracker.start()
  }

  _wire(worker) {
    worker.onerror = (e) => this._fail(new TrackerError('detect-failed', `worker galat: ${(e && e.message) || 'tidak diketahui'}`));
    worker.onmessage = (event) => {
      const m = event.data || {};
      const f = this._inflight;
      if (m.type !== 'result' && m.type !== 'fail') return;
      this._inflight = null;
      this._busy = false;
      if (!f || f.run !== this._run) return; // jawaban untuk loop yang sudah berhenti
      if (m.type === 'fail') {
        f.failures += 1;
        if (f.failures >= 3) this._fail(new TrackerError('detect-failed', m.message));
        return;
      }
      this.workerMs = this.workerMs ? this.workerMs * 0.9 + m.ms * 0.1 : m.ms;
      const hands = this._toVideoSpace(toHands({ landmarks: m.landmarks, handedness: m.handedness }));
      this._record(performance.now() - f.t0, hands.length);
      f.onResult(hands);
    };
  }

  _fail(err) {
    this.error = err;
    this.status = 'error';
    const f = this._inflight;
    this._inflight = null;
    this._busy = false;
    this._running = false;
    this._run += 1;
    if (f) f.onResult([]);
  }

  _destroyWorker() {
    if (this._worker) {
      try { this._worker.terminate(); } catch (e) { /* abaikan */ }
    }
    this._worker = null;
    this._landmarker = null;
  }

  destroy() {
    this.stop();
    this._destroyWorker();
    this.status = 'idle';
    this._initPromise = null;
  }

  start(video, onResult) {
    this.stop();
    if (this.status !== 'ready' || !this._worker) return;
    const run = this._run;
    this._running = true;
    let failures = 0;
    const schedule = (cb) =>
      video.requestVideoFrameCallback ? video.requestVideoFrameCallback(cb) : requestAnimationFrame(cb);

    const tick = () => {
      if (run !== this._run) return;
      if (!this._busy && video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
        const t0 = performance.now();
        const ts = Math.max(t0, this._lastTs + 1);
        this._lastTs = ts;
        let source;
        try {
          source = this._source(video); // sama dengan HandTracker: potong sesuai zoom, kecilkan ke inputHeight
        } catch (e) {
          source = null;
        }
        if (source) {
          this._busy = true;
          const frame = { run, t0, onResult, failures };
          this._inflight = frame;
          createImageBitmap(source).then(
            (bitmap) => {
              if (this._inflight !== frame || !this._worker) {
                if (bitmap.close) bitmap.close();
                return;
              }
              this._worker.postMessage({ type: 'frame', bitmap, ts }, [bitmap]);
            },
            () => {
              // Gagal membuat bitmap: lepas frame ini; tiga kali berturut-turut = galat.
              if (this._inflight !== frame) return;
              this._inflight = null;
              this._busy = false;
              failures += 1;
              frame.failures = failures;
              if (failures >= 3) this._fail(new TrackerError('detect-failed', 'createImageBitmap gagal'));
            },
          );
        }
      }
      schedule(tick);
    };
    schedule(tick);
  }

  get stats() {
    return { ...super.stats, tune: 'worker', detectMs: Math.round(this.detectMs), workerMs: Math.round(this.workerMs) };
  }
}
