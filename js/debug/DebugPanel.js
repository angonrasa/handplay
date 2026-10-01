// DebugPanel — panel diagnostik yang hanya dimuat saat alamat berisi ?debug.
// Menampilkan keadaan browser, izin, daftar kamera, dan galat kamera yang asli,
// langsung di layar (terbaca di TV tanpa membuka konsol).

/** Murni: ubah data lingkungan menjadi baris [label, nilai]. Mudah diuji. */
export function buildReport(env) {
  const rows = [];
  const add = (label, value) => rows.push([label, value]);
  const yn = (v) => (v ? 'ya' : 'TIDAK');
  const f = env.features || {};

  const chrome = /Chrom(?:e|ium)\/(\d+)/.exec(env.userAgent || '');
  add('Versi Chrome', chrome ? chrome[1] : 'tidak terbaca');
  add('Alamat aman', `${yn(env.isSecureContext)} (${env.protocol})`);
  add('mediaDevices', yn(env.hasMediaDevices));
  add('getUserMedia', yn(env.hasGetUserMedia));
  add('Izin kamera', env.cameraPermission);

  if (Array.isArray(env.devices)) {
    const cams = env.devices.filter((d) => d.kind === 'videoinput');
    add('Kamera terdeteksi', String(cams.length));
    cams.forEach((c, i) => add(`  kamera ${i + 1}`, c.label || '(nama kosong sampai izin diberikan)'));
  } else if (env.devices && env.devices.error) {
    add('Daftar perangkat', `gagal: ${env.devices.error}`);
  } else {
    add('Daftar perangkat', 'tidak didukung');
  }

  const cam = env.camera || {};
  add('Kamera di aplikasi', cam.active ? `aktif ${cam.width}×${cam.height}` : 'tidak aktif');
  if (cam.active) add('FPS kamera', cam.frameRate ? String(cam.frameRate) : 'tidak dilaporkan');
  if (cam.active) add('Resolusi maks kamera', cam.maxWidth ? `${cam.maxWidth}×${cam.maxHeight}` : 'tidak dilaporkan');
  if (env.zoom) add('Zoom digital', `${env.zoom}x`);
  if (env.lastError) {
    const e = env.lastError;
    add('Galat kamera terakhir', e.code || '-');
    add('  nama asli', e.causeName || '-');
    add('  pesan asli', e.causeMessage || '-');
  } else {
    add('Galat kamera terakhir', 'tidak ada');
  }

  const t = env.tracker;
  if (t) {
    add('Pelacak tangan', t.running ? 'berjalan' : t.status);
    add('FPS deteksi', t.running ? String(t.fps) : '-');
    add('Waktu per deteksi', t.running ? `${t.detectMs} ms` : '-');
    add('Tangan terdeteksi', t.running ? String(t.hands) : '-');
    add('Delegate', t.delegate || '-');
    add('Sumber MediaPipe', t.source || '-');
    add('Input deteksi', t.inputSize ? `${t.inputSize.width}×${t.inputSize.height}` : '-');
    if (t.error) {
      add('Galat pelacak', t.error.code || '-');
      add('  rincian', t.error.detail || '-');
    }
  }

  add('Layar aktif', env.screen || '-');
  const v = env.viewport;
  add('Area tampilan', v ? `${v.width}×${v.height} @${v.dpr}x, ${v.orientation}` : '-');
  add('Ukuran layar perangkat', env.screenSize || '-');

  add('ES modules', yn(f.modules));
  add('Sintaks ?. dan ??', yn(f.optionalChaining && f.nullishCoalescing));
  add('CSS inset', yn(f.cssInset));
  add('CSS min()/clamp()', yn(f.cssMinClamp));
  add('Layar penuh (API)', yn(env.hasFullscreen));

  const errors = env.errors || [];
  add('Galat tertangkap', String(errors.length));
  errors.slice(-5).forEach((m) => add('  •', m));

  add('Peramban', env.userAgent || '-');
  return rows;
}

export function formatReport(rows) {
  const width = Math.max(...rows.map((r) => r[0].length));
  return rows.map(([label, value]) => `${label.padEnd(width)}  ${value}`).join('\n');
}

/**
 * Tes kamera mentah (tanpa logika aplikasi): getUserMedia({video:true}).
 * Melaporkan sukses, galat dengan nama aslinya, atau "tidak ada respons"
 * (dialog izin yang tidak pernah tampil).
 */
export async function runCameraTest(mediaDevices, { timeoutMs = 8000 } = {}) {
  if (!mediaDevices || !mediaDevices.getUserMedia) {
    return 'Tidak ada navigator.mediaDevices.getUserMedia di browser ini.';
  }
  const started = Date.now();
  const elapsed = () => `${Date.now() - started} ms`;

  const attempt = mediaDevices
    .getUserMedia({ video: true, audio: false })
    .then((stream) => ({ stream }), (error) => ({ error }));

  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve('timeout'), timeoutMs);
  });
  const first = await Promise.race([attempt, timeout]);
  clearTimeout(timer);

  if (first === 'timeout') {
    // Permintaan masih menunggu. Jika nanti berhasil, lepaskan kameranya.
    attempt.then((r) => {
      if (r.stream) r.stream.getTracks().forEach((t) => t.stop());
    });
    return `Belum ada respons setelah ${Math.round(timeoutMs / 1000)} detik. Dialog izin mungkin tidak tampil di browser ini.`;
  }

  if (first.error) {
    const e = first.error;
    return `Gagal (${elapsed()}): ${e.name || 'Error'} — ${e.message || '(tanpa pesan)'}`;
  }

  const track = first.stream.getVideoTracks()[0];
  const settings = track && track.getSettings ? track.getSettings() : {};
  const label = (track && track.label) || '(tanpa nama)';
  first.stream.getTracks().forEach((t) => t.stop());
  const size = settings.width ? `${settings.width}×${settings.height}` : 'ukuran tidak terbaca';
  return `Berhasil (${elapsed()}): ${label}, ${size}`;
}

async function gatherEnv(ctx) {
  const md = navigator.mediaDevices;

  let cameraPermission = 'tidak didukung';
  if (navigator.permissions && navigator.permissions.query) {
    try {
      cameraPermission = (await navigator.permissions.query({ name: 'camera' })).state;
    } catch (e) {
      cameraPermission = `tidak bisa dibaca (${e.name})`;
    }
  }

  let devices = null;
  if (md && md.enumerateDevices) {
    try {
      devices = (await md.enumerateDevices()).map((d) => ({ kind: d.kind, label: d.label }));
    } catch (e) {
      devices = { error: `${e.name}: ${e.message}` };
    }
  }

  const lastError = ctx.getLastCameraError();
  const hp = window.__handplay || {};
  return {
    userAgent: navigator.userAgent,
    protocol: location.protocol,
    isSecureContext: window.isSecureContext,
    hasMediaDevices: !!md,
    hasGetUserMedia: !!(md && md.getUserMedia),
    cameraPermission,
    devices,
    camera: {
      active: ctx.camera.active,
      ...ctx.camera.size,
      frameRate: ctx.camera.frameRate,
      maxWidth: ctx.camera.maxSize && ctx.camera.maxSize.width,
      maxHeight: ctx.camera.maxSize && ctx.camera.maxSize.height,
    },
    zoom: ctx.getZoom ? ctx.getZoom() : null,
    lastError: lastError
      ? {
          code: lastError.code,
          causeName: lastError.cause && lastError.cause.name,
          causeMessage: lastError.cause && lastError.cause.message,
        }
      : null,
    tracker: ctx.getTrackerStats ? ctx.getTrackerStats() : null,
    screen: ctx.getScreen(),
    viewport: ctx.getViewport(),
    screenSize: window.screen ? `${window.screen.width}×${window.screen.height}` : null,
    features: hp.features,
    hasFullscreen: !!document.documentElement.requestFullscreen,
    errors: hp.errors || [],
  };
}

/**
 * Memasang panel di layar.
 * @param {{ camera, getScreen: ()=>string, getViewport: ()=>object, getLastCameraError: ()=>Error|null,
 *           getTrackerStats?: ()=>object, getZoom?: ()=>number, changeZoom?: (d:number)=>number, isSkeletonOn?: ()=>boolean, toggleSkeleton?: ()=>boolean }} ctx
 */
export function mountDebugPanel(ctx) {
  const root = document.createElement('div');
  root.id = 'debug-panel';
  root.style.cssText =
    'position:fixed;left:0;right:0;bottom:0;z-index:9998;background:rgba(0,0,0,.88);color:#b8f5c8;' +
    'font:14px/1.4 monospace;border-top:2px solid #8EDDCB;';

  const bar = document.createElement('div');
  bar.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;padding:8px;';

  const out = document.createElement('pre');
  out.style.cssText = 'margin:0;padding:8px 12px;max-height:40vh;overflow:auto;white-space:pre-wrap;word-break:break-word;';

  const testOut = document.createElement('div');
  testOut.style.cssText = 'padding:0 12px 8px;color:#ffd479;white-space:pre-wrap;';

  function button(label, onClick) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.style.cssText =
      'min-height:44px;padding:0 18px;font:600 15px sans-serif;border:1px solid #8EDDCB;border-radius:999px;' +
      'background:#123F43;color:#E9F2EE;cursor:pointer;';
    b.addEventListener('click', onClick);
    bar.appendChild(b);
    return b;
  }

  let expanded = true;
  let lastText = '';

  async function refresh(log) {
    try {
      const env = await gatherEnv(ctx);
      lastText = formatReport(buildReport(env));
      out.textContent = lastText;
      if (log) console.log('[handplay] diagnostik\n' + lastText);
    } catch (e) {
      out.textContent = `Diagnostik gagal: ${e && e.message}`;
    }
  }

  button('Segarkan', () => refresh(true));
  const testBtn = button('Tes kamera', async () => {
    testBtn.disabled = true;
    testOut.textContent = 'Menguji kamera…';
    const result = await runCameraTest(navigator.mediaDevices);
    testOut.textContent = `Tes kamera: ${result}`;
    console.log('[handplay] tes kamera: ' + result);
    testBtn.disabled = false;
    refresh(true);
  });
  if (ctx.changeZoom) {
    button('Zoom −', () => { ctx.changeZoom(-0.1); refresh(false); });
    button('Zoom +', () => { ctx.changeZoom(0.1); refresh(false); });
  }
  if (ctx.toggleSkeleton) {
    const skel = button(ctx.isSkeletonOn() ? 'Skeleton: nyala' : 'Skeleton: mati', () => {
      skel.textContent = ctx.toggleSkeleton() ? 'Skeleton: nyala' : 'Skeleton: mati';
    });
  }
  const toggle = button('Sembunyikan', () => {
    expanded = !expanded;
    out.hidden = !expanded;
    testOut.hidden = !expanded;
    toggle.textContent = expanded ? 'Sembunyikan' : 'Tampilkan debug';
  });

  root.appendChild(bar);
  root.appendChild(out);
  root.appendChild(testOut);
  document.body.appendChild(root);

  refresh(true);
  setInterval(() => { if (expanded) refresh(false); }, 2000);
}
