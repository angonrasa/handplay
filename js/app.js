// app.js — titik masuk. Merangkai modul; tidak berisi logika game.
import { ScreenManager } from './ui/ScreenManager.js';
import { Viewport } from './ui/Viewport.js';
import { CameraManager } from './camera/CameraManager.js';
import { HandTracker } from './tracking/HandTracker.js';
import { LandmarkMapper } from './tracking/LandmarkMapper.js';
import { SkeletonOverlay } from './ui/SkeletonOverlay.js';

const NEEDS_CAMERA = new Set(['calibration', 'game']);
const HANG_MS = 6000; // jika izin kamera tak kunjung dijawab, beri petunjuk

// Teks untuk pemain: jelaskan apa yang terjadi dan apa yang bisa dilakukan.
const CAMERA_TEXT = {
  starting: 'Menyalakan kamera…',
  waiting: 'Menunggu izin kamera. Jika tidak ada dialog izin, periksa pengaturan situs di browser, lalu coba lagi.',
  ready: 'Kamera siap.',
  denied: 'Izin kamera ditolak. Izinkan kamera di pengaturan browser, lalu coba lagi.',
  'not-found': 'Kamera tidak ditemukan di perangkat ini.',
  'in-use': 'Kamera sedang dipakai aplikasi lain. Tutup aplikasi itu, lalu coba lagi.',
  insecure: 'Kamera hanya bisa dipakai lewat https atau localhost.',
  unsupported: 'Browser ini tidak mendukung kamera.',
  unknown: 'Kamera tidak bisa dinyalakan. Coba lagi.',
};

const stage = document.getElementById('stage');
const video = document.getElementById('camera');
const overlay = document.getElementById('overlay');
const cameraStatus = document.getElementById('camera-status');
const cameraRetry = document.getElementById('camera-retry');
const cameraContinue = document.getElementById('camera-continue');

// ---------- Ukuran area tampilan (mengikuti orientasi perangkat) ----------

// Nanti diteruskan ke LandmarkMapper dan BubbleManager.
export const layout = { viewport: null };

const viewport = new Viewport(stage, overlay, (state) => {
  layout.viewport = state;
  document.documentElement.dataset.orientation = state.orientation;
});
viewport.start();

// ---------- Kamera ----------

// Layar besar (TV/papan interaktif) butuh gambar kamera lebih tajam; 640×480 jadi buram saat diperbesar.
// Resolusi hanya preferensi: kamera yang tidak sanggup otomatis dapat resolusi terdekat.
const bigScreen = Math.max(window.innerWidth, window.screen ? window.screen.width : 0) >= 1200;
// Ujicoba lewat alamat: ?cam=480|720|1080 (resolusi kamera), ?det=240|360|480|720|0 (tinggi gambar untuk deteksi; 0 = ukuran asli).
const query = new URLSearchParams(window.location.search);
const CAM_SIZES = { 480: [640, 480], 720: [1280, 720], 1080: [1920, 1080] };
const camParam = CAM_SIZES[query.get('cam')];
const camSize = camParam ? { width: camParam[0], height: camParam[1] } : bigScreen ? { width: 1920, height: 1080 } : {};
const camera = new CameraManager(video, camSize);

// Zoom digital: membuat tangan terlihat lebih dekat di layar besar tanpa mendekatkan kamera.
// Urutan: ?zoom=1.5 di alamat > nilai tersimpan (tombol Zoom di panel ?debug) > bawaan.
const ZOOM_MIN = 1;
const ZOOM_MAX = 3;
const ZOOM_KEY = 'handplay.zoom';
function clampZoom(z) {
  return Number.isFinite(z) ? Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 100) / 100)) : NaN;
}
function initialZoom() {
  const fromUrl = clampZoom(parseFloat(query.get('zoom')));
  if (!Number.isNaN(fromUrl)) return fromUrl;
  try {
    const saved = clampZoom(parseFloat(window.localStorage.getItem(ZOOM_KEY)));
    if (!Number.isNaN(saved)) return saved;
  } catch (e) { /* penyimpanan tidak tersedia: abaikan */ }
  return bigScreen ? 1.3 : 1;
}
let zoom = 1;
function setZoom(z) {
  zoom = clampZoom(z);
  document.documentElement.style.setProperty('--zoom', String(zoom));
  try { window.localStorage.setItem(ZOOM_KEY, String(zoom)); } catch (e) { /* abaikan */ }
  return zoom;
}
setZoom(initialZoom());
let ensureRun = 0; // penanda panggilan terbaru, agar panggilan lama tidak menimpa tampilan
let hangTimer = 0;
let lastCameraError = null;

function showCameraStatus(state) {
  cameraStatus.textContent = CAMERA_TEXT[state] ?? CAMERA_TEXT.unknown;
  cameraStatus.dataset.state = state;
  cameraRetry.hidden = state === 'starting' || state === 'ready'; // "Coba lagi" hanya saat perlu
  cameraContinue.disabled = state !== 'ready';
}

async function ensureCamera() {
  const run = ++ensureRun;
  clearTimeout(hangTimer);
  if (camera.active) {
    showCameraStatus('ready');
    startTracking();
    return;
  }
  showCameraStatus('starting');
  hangTimer = setTimeout(() => {
    if (run === ensureRun && !camera.active) showCameraStatus('waiting');
  }, HANG_MS);

  try {
    await camera.start();
    if (run !== ensureRun) return;
    clearTimeout(hangTimer);
    overlay.hidden = false;
    showCameraStatus('ready');
    startTracking();
  } catch (err) {
    if (run !== ensureRun) return;
    clearTimeout(hangTimer);
    if (err?.code === 'aborted') return;
    lastCameraError = err;
    overlay.hidden = true;
    showCameraStatus(err?.code ?? 'unknown');
    console.error('[handplay] kamera gagal:', err?.code, err?.cause ? `${err.cause.name}: ${err.cause.message}` : '');
  }
}

function releaseCamera() {
  ensureRun += 1;
  clearTimeout(hangTimer);
  stopTracking();
  camera.stop();
  overlay.hidden = true;
}

// ---------- Hand tracking (M2) ----------

const detParam = parseInt(query.get('det'), 10);
const tracker = new HandTracker({ numHands: 1, ...(Number.isNaN(detParam) ? {} : { inputHeight: detParam }) });
const mapper = new LandmarkMapper();
const skeleton = new SkeletonOverlay(overlay, mapper);
let trackRun = 0;

function onHands(hands) {
  const vp = layout.viewport;
  if (!vp) return;
  const size = camera.size;
  mapper.setViewport({
    width: vp.width,
    height: vp.height,
    videoWidth: size.width,
    videoHeight: size.height,
    mirrored: video.classList.contains('is-mirrored'),
    zoom,
  });
  skeleton.draw(hands, vp);
}

// Kegagalan tracker tidak boleh menghalangi kamera: hanya dicatat (terlihat di panel ?debug).
async function startTracking() {
  if (tracker.running) return;
  const run = ++trackRun;
  try {
    await tracker.init();
  } catch (err) {
    console.error('[handplay] tracker gagal:', err?.code, err?.detail || err?.message);
    return;
  }
  if (run !== trackRun || !camera.active) return;
  tracker.start(video, onHands);
}

function stopTracking() {
  trackRun += 1;
  tracker.stop();
  skeleton.clear();
}

// Kamera berhenti sendiri (dicabut / diambil app lain): kembali ke Kalibrasi.
camera.onEnded = () => {
  stopTracking();
  overlay.hidden = true;
  if (NEEDS_CAMERA.has(screens.current)) screens.show('calibration');
};

// ---------- Layar ----------

const screens = new ScreenManager(document.getElementById('screens'), {
  onChange: (name) => {
    document.body.dataset.screen = name;
    if (NEEDS_CAMERA.has(name)) ensureCamera();
    else releaseCamera();
  },
});

// Hemat baterai dan privasi: kamera mati saat tab/aplikasi tidak terlihat.
document.addEventListener('visibilitychange', () => {
  if (!NEEDS_CAMERA.has(screens.current)) return;
  if (document.hidden) releaseCamera();
  else ensureCamera();
});

function enterFullscreen() {
  const root = document.documentElement;
  if (document.fullscreenElement || !root.requestFullscreen) return;
  root.requestFullscreen().catch(() => {}); // gagal = tetap jalan tanpa layar penuh
}

document.addEventListener('click', (event) => {
  if (event.target.closest('[data-camera-retry]')) {
    releaseCamera(); // batalkan permintaan yang menggantung, lalu mulai ulang
    ensureCamera();
    return;
  }
  const trigger = event.target.closest('[data-goto]');
  if (!trigger) return;
  if (trigger.hasAttribute('data-fullscreen')) enterFullscreen();
  screens.show(trigger.dataset.goto);
});

screens.show('home');

// ---------- Mode ?debug (panel diagnostik; eruda dimuat oleh debug/bootstrap.js) ----------
const handplay = window.__handplay;
if (handplay && handplay.debug) {
  import('./debug/DebugPanel.js')
    .then((m) => m.mountDebugPanel({
      camera,
      getScreen: () => screens.current,
      getViewport: () => layout.viewport,
      getLastCameraError: () => lastCameraError,
      getTrackerStats: () => tracker.stats,
      getZoom: () => zoom,
      changeZoom: (delta) => setZoom(zoom + delta),
      isSkeletonOn: () => skeleton.enabled,
      toggleSkeleton: () => {
        skeleton.setEnabled(!skeleton.enabled);
        return skeleton.enabled;
      },
    }))
    .catch((err) => console.error('[handplay] panel debug gagal dimuat:', err));
}

// Penanda "aplikasi berhasil dimuat" untuk debug/bootstrap.js.
if (handplay) handplay.booted = true;
