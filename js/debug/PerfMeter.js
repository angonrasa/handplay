// js/debug/PerfMeter.js
// PerfMeter — panel kecil untuk mencari tahu penyebab lambat di perangkat. Buka dengan ?perf (bisa digabung ?debug).
// Satu foto panel ini saat bermain sudah cukup untuk membedakan: deteksi tangan lambat, gambar (render) lambat,
// atau thread utama terblokir.
//
// Cara membaca:
//   loop    = FPS loop game (setelah dibatasi ?fps=), "terburuk" = jeda frame terpanjang 1 detik terakhir
//   gambar  = rata-rata ms untuk menggambar satu frame (canvas + HUD); > 16 ms berarti render berat
//   blokir  = jumlah dan lama terpanjang tugas > 50 ms (Long Task); biasanya deteksi MediaPipe yang memblokir
//   deteksi = FPS dan ms per deteksi; ms besar = MediaPipe yang lambat (coba ?det=240 atau ?cam=720)

export function mountPerfMeter({ getTracker, getViewport, getCameraSize, getZoom, maxFps }) {
  const el = document.createElement('pre');
  el.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;margin:0;padding:6px 10px;pointer-events:none;'
    + 'font:600 14px/1.35 ui-monospace,Menlo,Consolas,monospace;color:#fff;background:rgba(0,0,0,.72);white-space:pre';
  el.textContent = 'perf: menunggu game dimulai…';
  document.body.appendChild(el);

  let stamps = [];
  let lastT = 0;
  let worstGap = 0;
  let drawMs = 0;
  let longCount = 0;
  let longMax = 0;
  let hasLongTask = false;

  try {
    const obs = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        longCount += 1;
        longMax = Math.max(longMax, e.duration);
      }
    });
    obs.observe({ entryTypes: ['longtask'] });
    hasLongTask = true;
  } catch (e) { /* browser tanpa Long Task API */ }

  function frame(t, ms) {
    stamps.push(t);
    if (lastT) worstGap = Math.max(worstGap, t - lastT);
    lastT = t;
    drawMs = drawMs ? drawMs * 0.9 + ms * 0.1 : ms;
  }

  const timer = setInterval(() => {
    const now = performance.now();
    stamps = stamps.filter((s) => now - s <= 1000);
    const idle = !stamps.length;
    const tr = getTracker();
    const vp = getViewport();
    const cam = getCameraSize();
    const lines = [
      idle ? 'loop    : (tidak berjalan)' : `loop    : ${stamps.length} fps   terburuk ${Math.round(worstGap)} ms   batas ${maxFps || 'layar'}`,
      `gambar  : ${drawMs.toFixed(1)} ms/frame`,
      hasLongTask ? `blokir  : ${longCount}× tugas >50 ms, terlama ${Math.round(longMax)} ms` : 'blokir  : (tidak didukung)',
      `deteksi : ${tr.fps} fps   ${tr.detectMs} ms   ${tr.delegate || '-'}/${tr.source || '-'}   input ${tr.inputSize ? `${tr.inputSize.width}×${tr.inputSize.height}` : '-'}`,
      `canvas  : ${vp ? `${Math.round(vp.width * vp.dpr)}×${Math.round(vp.height * vp.dpr)} (dpr ${vp.dpr})` : '-'}   kamera ${cam.width}×${cam.height}   zoom ${getZoom()}`,
    ];
    el.textContent = lines.join('\n');
    worstGap = 0;
    longCount = 0;
    longMax = 0;
  }, 1000);

  return { frame, destroy() { clearInterval(timer); el.remove(); } };
}
