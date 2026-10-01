// app.js — titik masuk. Merangkai modul; tidak berisi logika game.
import { ScreenManager } from './ui/ScreenManager.js';
import { Viewport } from './ui/Viewport.js';
import { CameraManager } from './camera/CameraManager.js';

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

const camera = new CameraManager(video);
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
  camera.stop();
  overlay.hidden = true;
}

// Kamera berhenti sendiri (dicabut / diambil app lain): kembali ke Kalibrasi.
camera.onEnded = () => {
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
    }))
    .catch((err) => console.error('[handplay] panel debug gagal dimuat:', err));
}

// Penanda "aplikasi berhasil dimuat" untuk debug/bootstrap.js.
if (handplay) handplay.booted = true;
