// js/tracking/handWorker.js
// Worker KLASIK (bukan module) yang menjalankan MediaPipe Hand Landmarker di luar thread utama, dipakai WorkerHandTracker.
// Klasik dengan sengaja: MediaPipe memuat WASM lewat importScripts() bila berjalan di worker, dan itu tidak ada di module worker.
// Bundle .mjs dimuat dengan import() dinamis (boleh di worker klasik).
//
// Pesan masuk : { type: 'init', bundle, wasmDir, model, delegate, numHands, minConfidence }
//               { type: 'frame', bitmap (ImageBitmap, ditransfer), ts }
// Pesan keluar: { type: 'ready', delegate } | { type: 'error', message }
//               { type: 'result', ts, ms, landmarks: [[{x,y,z}]], handedness: [[{categoryName,score}]] } | { type: 'fail', ts, message }

let landmarker = null;

async function init(m) {
  const mod = await import(m.bundle);
  const vision = await mod.FilesetResolver.forVisionTasks(m.wasmDir);
  const create = (delegate) => mod.HandLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: m.model, delegate },
    runningMode: 'VIDEO',
    numHands: m.numHands,
    minHandDetectionConfidence: m.minConfidence,
    minHandPresenceConfidence: m.minConfidence,
    minTrackingConfidence: m.minConfidence,
  });
  let delegate = m.delegate === 'CPU' ? 'CPU' : 'GPU';
  try {
    landmarker = await create(delegate);
  } catch (e) {
    if (delegate === 'CPU') throw e;
    delegate = 'CPU'; // GPU tidak tersedia di worker: jatuh ke CPU
    landmarker = await create(delegate);
  }
  return delegate;
}

self.onmessage = async (event) => {
  const m = event.data || {};
  if (m.type === 'init') {
    try {
      const delegate = await init(m);
      self.postMessage({ type: 'ready', delegate });
    } catch (e) {
      self.postMessage({ type: 'error', message: `${e && e.name}: ${e && e.message}` });
    }
    return;
  }
  if (m.type === 'frame') {
    const t0 = Date.now();
    try {
      const res = landmarker.detectForVideo(m.bitmap, m.ts);
      // Salin jadi objek polos supaya aman dikirim lewat postMessage.
      const landmarks = (res.landmarks || []).map((pts) => pts.map((p) => ({ x: p.x, y: p.y, z: p.z })));
      const handedness = (res.handedness || []).map((list) => list.map((c) => ({ categoryName: c.categoryName, score: c.score })));
      self.postMessage({ type: 'result', ts: m.ts, ms: Date.now() - t0, landmarks, handedness });
    } catch (e) {
      self.postMessage({ type: 'fail', ts: m.ts, message: `${e && e.name}: ${e && e.message}` });
    } finally {
      if (m.bitmap && m.bitmap.close) m.bitmap.close();
    }
  }
};
