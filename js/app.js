// js/app.js
// app.js — titik masuk. Merangkai modul; tidak berisi logika game.
import { ScreenManager } from './ui/ScreenManager.js';
import { Viewport } from './ui/Viewport.js';
import { CameraManager } from './camera/CameraManager.js';
import { HandTracker } from './tracking/HandTracker.js';
import { LandmarkMapper } from './tracking/LandmarkMapper.js';
import { GestureDetector } from './gesture/GestureDetector.js';
import { SkeletonOverlay } from './ui/SkeletonOverlay.js';
import { GameState, Phase } from './game/GameState.js';
import { GameEngine } from './game/GameEngine.js';
import { ModeRegistry } from './game/ModeRegistry.js';
import { PickCorrectMode } from './game/modes/PickCorrectMode.js';
import { QuestionBank } from './game/QuestionBank.js';
import { drawBubbles } from './ui/BubbleRenderer.js';
import { HUD } from './ui/HUD.js';
import { Effects } from './ui/Effects.js';
import { ResultScreen } from './ui/ResultScreen.js';
import { SoundManager } from './audio/SoundManager.js';

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

let perf = null; // PerfMeter (?perf)
let engine = null; // GameEngine, dibuat di bagian "Permainan" di bawah
const viewport = new Viewport(stage, overlay, (state) => {
  layout.viewport = state;
  document.documentElement.dataset.orientation = state.orientation;
  if (engine) engine.setArea(state); // layar diputar saat bermain → jeda otomatis (M4.3c)
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

// Suara (M6.3). Dibuka lewat klik pertama pemain; bisa dimatikan di data/settings.json (`sound`) atau lewat ?mute.
const sound = new SoundManager({ enabled: !query.has('mute') });

// Batas FPS loop game: 30 di layar besar (TV/papan lemah), ikut layar di HP. Ujicoba: ?fps=60 atau ?fps=0 (tanpa batas).
const fpsParam = parseInt(query.get('fps'), 10);
const maxFps = Number.isNaN(fpsParam) ? (bigScreen ? 30 : 0) : fpsParam;
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
// getZoom: detektor hanya melihat bagian video yang tampil di layar (tangan jauh jadi lebih besar). ?conf=0.3 menurunkan ambang deteksi.
const confParam = parseFloat(query.get('conf'));
// ?delegate=cpu mencoba deteksi di CPU (di TV lemah, GPU kadang justru lebih lambat).
const delegateParam = (query.get('delegate') || '').toUpperCase();
const tracker = new HandTracker({
  numHands: 1,
  ...(delegateParam === 'CPU' || delegateParam === 'GPU' ? { delegate: delegateParam, autoDelegate: false } : {}),
  getZoom: () => zoom,
  ...(Number.isNaN(confParam) ? {} : { minConfidence: confParam }),
  ...(Number.isNaN(detParam) ? {} : { inputHeight: detParam }),
});
// Ujicoba lewat alamat: ?smooth=0 mematikan smoothing ujung jari (untuk membandingkan).
const mapper = new LandmarkMapper(query.get('smooth') === '0' ? { smoothing: null } : {});
const skeleton = new SkeletonOverlay(overlay, mapper);
let trackRun = 0;

// Titik sentuh terbaru (koordinat layar): satu daftar 5 ujung jari per tangan, kosong bila tidak ada tangan.
// Dibaca GestureDetector (M3.5).
export const input = { fingertips: [] };

// Gestur dari ujung jari. Game memanggil `gestures.match(bola, waktu)` tiap frame (M4.4) dan mendengarkan 'apit'.
export const gestures = new GestureDetector();

// Parameter apit dari data/settings.json (kunci `apit`). Gagal dimuat = pakai nilai cadangan di GestureDetector.
// Ujicoba di perangkat tanpa mengubah berkas: ?center=0.5 (toleransi pusat), ?close=1.7 (jarak tutup), ?hold=80 (ms bertahan).
async function loadApitSettings() {
  let fromFile = {};
  let inputFromFile = {};
  try {
    const res = await fetch(new URL('../data/settings.json', import.meta.url));
    if (res.ok) {
      const settings = await res.json();
      fromFile = settings.apit || {};
      inputFromFile = settings.input || {};
      if (settings.sound === false) sound.setEnabled(false);
    }
  } catch (err) {
    console.warn('[handplay] settings.json tidak dimuat, memakai nilai cadangan:', err?.message);
  }
  const num = (name) => (query.has(name) ? parseFloat(query.get(name)) : undefined);
  const applied = gestures.setApit({
    ...fromFile,
    centerTolerance: num('center') ?? fromFile.centerTolerance,
    closeRatio: num('close') ?? fromFile.closeRatio,
    holdMs: num('hold') ?? fromFile.holdMs,
  });
  console.info('[handplay] parameter apit:', applied);
  // Cara input: 'tusuk' (sentuh dengan jari mana pun) atau 'apit'. Ujicoba: ?mode=apit, ?touch=1.2 (× radius), ?thold=60 (ms).
  const inputApplied = gestures.setInput({
    ...inputFromFile,
    ...(query.has('mode') ? { mode: query.get('mode') } : {}),
    ...(query.has('touch') ? { touchRadius: parseFloat(query.get('touch')) } : {}),
    ...(query.has('thold') ? { touchHoldMs: parseFloat(query.get('thold')) } : {}),
  });
  console.info('[handplay] cara input:', inputApplied);
}
loadApitSettings();

// Uji apit di perangkat: buka dengan ?apittest, tekan Mulai, lalu masuk ke layar game (js/debug/ApitTest.js).
let apitTest = null;
if (query.has('apittest')) {
  import('./debug/ApitTest.js')
    .then((m) => {
      apitTest = m.mountApitTest({ gestures });
      skeleton.addLayer(apitTest.draw);
    })
    .catch((err) => console.error('[handplay] ApitTest gagal dimuat:', err));
}

// Uji gelembung di perangkat (M4.2–M4.4): buka dengan ?bubbletest, tekan Mulai, lalu masuk ke layar game (js/debug/BubbleTest.js).
if (query.has('bubbletest')) {
  import('./debug/BubbleTest.js')
    .then((m) => {
      const bubbleTest = m.mountBubbleTest({
        gestures,
        overlay: skeleton,
        getViewport: () => layout.viewport,
        getScreen: () => screens.current,
      });
      skeleton.addLayer(bubbleTest.draw);
    })
    .catch((err) => console.error('[handplay] BubbleTest gagal dimuat:', err));
}

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
  const t = performance.now();
  input.fingertips = hands.map((hand, slot) => mapper.fingertips(hand, slot, t)).filter((tips) => tips.length);
  gestures.update(input.fingertips, t);
  if (apitTest) apitTest.update(vp, t);
  skeleton.draw(hands, vp, input.fingertips, t);
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
  mapper.resetSmoothing();
  input.fingertips = [];
  gestures.update([]);
  skeleton.reset();
}

// Kamera berhenti sendiri (dicabut / diambil app lain): kembali ke Kalibrasi.
camera.onEnded = () => {
  stopTracking();
  overlay.hidden = true;
  if (NEEDS_CAMERA.has(screens.current)) screens.show('calibration');
};

// ---------- Layar ----------

// >>> sinkron-fase
// Keadaan permainan. Layar dan fase saling mengikuti: navigasi layar menggerakkan fase, dan fase yang
// digerakkan di luar navigasi (mis. waktu habis → result, jeda) menampilkan layar yang sesuai.
export const state = new GameState();
const SCREEN_PHASE = { home: Phase.HOME, calibration: Phase.CALIBRATION, game: Phase.PLAYING, result: Phase.RESULT };
const PHASE_SCREEN = { [Phase.HOME]: 'home', [Phase.CALIBRATION]: 'calibration', [Phase.PLAYING]: 'game', [Phase.PAUSED]: 'game', [Phase.RESULT]: 'result' };

function syncPhase(screenName) {
  const next = SCREEN_PHASE[screenName];
  if (!next) return;
  try {
    state.go(next);
  } catch (err) {
    console.error('[handplay]', err.message); // layar tetap tampil; masalah ini artinya ada navigasi yang belum didaftarkan di TRANSITIONS
  }
}
// <<< sinkron-fase

const screens = new ScreenManager(document.getElementById('screens'), {
  onChange: (name) => {
    document.body.dataset.screen = name;
    syncPhase(name);
    if (NEEDS_CAMERA.has(name)) ensureCamera();
    else releaseCamera();
  },
});

// Fase digerakkan di luar navigasi layar: tampilkan layar yang sesuai (fase yang sama dengan layar aktif = tidak berbuat apa-apa).
state.onPhase((phase) => {
  const screen = PHASE_SCREEN[phase];
  if (screen && screens.current !== screen) screens.show(screen);
});

// ---------- Permainan (M4.8) ----------

const registry = new ModeRegistry();
registry.register('pick-correct', PickCorrectMode);

// Data dimuat sekali di awal. Gagal dimuat = layar game kosong dan galat tercatat di konsol.
let bank = null;
const dataUrl = (path) => new URL(path, import.meta.url);
async function loadGameData() {
  try {
    const [games, loaded] = await Promise.all([
      fetch(dataUrl('../data/games.json')).then((res) => res.json()),
      QuestionBank.load(dataUrl('../data/banks/pernapasan-8.json').href),
    ]);
    bank = loaded;
    engine.setConfig(games.modes.find((m) => m.id === 'pick-correct') || games.modes[0]);
    if (bank.warnings && bank.warnings.length) console.warn('[handplay] peringatan bank soal:', bank.warnings);
  } catch (err) {
    console.error('[handplay] data game gagal dimuat:', err?.message || err);
  }
}

// HUD (M5.3): hanya membaca gambaran engine; digambar tiap frame dan saat fase berganti.
const hud = new HUD(document.getElementById('hud'));
const resumeButton = document.getElementById('resume');
const pauseCard = document.getElementById('pause');
const resultScreen = new ResultScreen(document.getElementById('result'));
// Umpan balik pecah (cincin memudar + kilat tepi saat salah): diberi event engine, digambar sebagai lapisan overlay.
const effects = new Effects({ flashEl: document.getElementById('flash') });
function renderHud() {
  hud.render(engine.snapshot());
}

engine = new GameEngine({
  state,
  registry,
  gestures,
  getArea: () => layout.viewport,
  maxFps,
  onEvent: (event) => {
    effects.handle(event);
    sound.handle(event);
  },
  getItems: (config) => {
    const count = bank.byType('pick-correct').length;
    return bank.draw({ type: 'pick-correct', count });
  },
  // Dipanggil tiap frame: gelembung bergerak halus walau deteksi tangan hanya 5–6 kali per detik.
  onFrame: (t) => {
    const t0 = performance.now();
    skeleton.redraw(layout.viewport, t);
    renderHud();
    if (perf) perf.frame(t, performance.now() - t0);
  },
});
loadGameData();

// Gelembung digambar sebagai lapisan di atas kerangka/penanda jari.
skeleton.addLayer((ctx, vp, t) => {
  if (engine.visible) drawBubbles(ctx, engine.getBubbles(), t);
});
skeleton.addLayer((ctx, vp, t) => effects.draw(ctx, vp, t));

state.onPhase((phase, previous) => {
  resumeButton.hidden = phase !== Phase.PAUSED;
  pauseCard.hidden = phase !== Phase.PAUSED;
  if (phase === Phase.PLAYING && previous !== Phase.PAUSED) {
    hud.reset(); // ronde baru
    effects.clear();
  }
  if (phase === Phase.PLAYING || phase === Phase.PAUSED || phase === Phase.RESULT) renderHud();
  if (phase === Phase.RESULT) {
    sound.play('finish');
    resultScreen.render(engine.result);
    console.info('[handplay] hasil ronde:', engine.result);
  }
});

// Hemat baterai dan privasi: kamera mati saat tab/aplikasi tidak terlihat.
document.addEventListener('visibilitychange', () => {
  if (!NEEDS_CAMERA.has(screens.current)) return;
  if (document.hidden && state.phase === Phase.PLAYING) engine.pause();
  if (document.hidden) releaseCamera();
  else ensureCamera();
});

function enterFullscreen() {
  const root = document.documentElement;
  if (document.fullscreenElement || !root.requestFullscreen) return;
  root.requestFullscreen().catch(() => {}); // gagal = tetap jalan tanpa layar penuh
}

document.addEventListener('click', (event) => {
  sound.unlock(); // browser baru mengizinkan suara setelah sentuhan pemain
  if (event.target.closest('[data-camera-retry]')) {
    releaseCamera(); // batalkan permintaan yang menggantung, lalu mulai ulang
    ensureCamera();
    return;
  }
  if (event.target.closest('[data-resume]')) {
    engine.resume();
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
      getPhase: () => state.phase,
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

// ?perf: panel ukur FPS/beban (js/debug/PerfMeter.js), terpisah dari ?debug.
if (query.has('perf')) {
  import('./debug/PerfMeter.js')
    .then((m) => {
      perf = m.mountPerfMeter({
        getTracker: () => tracker.stats,
        getViewport: () => layout.viewport,
        getCameraSize: () => camera.size,
        getZoom: () => zoom,
        maxFps,
      });
    })
    .catch((err) => console.error('[handplay] PerfMeter gagal dimuat:', err));
}

// Penanda "aplikasi berhasil dimuat" untuk debug/bootstrap.js.
if (handplay) handplay.booted = true;
