/* bootstrap.js — skrip KLASIK (ES5, bukan module) yang dimuat paling awal.
 *
 * Tugas:
 *  1. Menangkap galat sejak awal, termasuk saat modul utama gagal dimuat
 *     (mis. browser TV terlalu lama sehingga tidak paham sintaks baru).
 *  2. Memeriksa fitur browser yang dibutuhkan.
 *  3. Mode ?debug: memuat eruda (konsol di layar) dan membuka panel diagnostik.
 *  4. Jika aplikasi tidak pernah "booted", tampilkan pesan di layar, bukan layar kosong.
 *
 * Ditulis dengan sintaks ES5 sengaja, agar tetap jalan di browser lama.
 */
(function () {
  'use strict';

  var hp = (window.__handplay = {
    debug: /[?&]debug(=|&|$)/.test(window.location.search),
    booted: false,
    errors: [],
    features: {}
  });

  function record(message) {
    hp.errors.push(message);
    if (window.console && console.error) console.error('[handplay] ' + message);
  }

  // ---------- Pemeriksaan fitur ----------
  function canRun(code) {
    try { new Function(code)(); return true; } catch (e) { return false; }
  }
  var hasCssSupports = !!(window.CSS && window.CSS.supports);
  hp.features.modules = 'noModule' in document.createElement('script');
  hp.features.optionalChaining = canRun('var a = null; return a?.b;');
  hp.features.nullishCoalescing = canRun('return null ?? 1;');
  hp.features.cssInset = hasCssSupports && CSS.supports('inset', '0');
  hp.features.cssMinClamp = hasCssSupports &&
    CSS.supports('width', 'min(1vw, 1vh)') && CSS.supports('width', 'clamp(1px, 2px, 3px)');

  // ---------- Penangkap galat ----------
  window.addEventListener('error', function (event) {
    var t = event.target;
    if (t && t !== window && (t.src || t.href)) {
      record('Gagal memuat: ' + (t.src || t.href));
      return;
    }
    var where = event.filename ? ' (' + String(event.filename).split('/').pop() + ':' + event.lineno + ')' : '';
    record('Galat: ' + (event.message || 'tidak diketahui') + where);
  }, true);

  window.addEventListener('unhandledrejection', function (event) {
    var r = event.reason;
    var text = r && (r.name || r.message) ? (r.name || '') + ' ' + (r.message || '') : String(r);
    record('Promise ditolak: ' + text);
  });

  // ---------- Pesan di layar bila aplikasi gagal dimuat ----------
  function showNotice(lines) {
    if (!document.body) return;
    var box = document.getElementById('boot-notice');
    if (!box) {
      box = document.createElement('div');
      box.id = 'boot-notice';
      box.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:99999;max-height:60%;' +
        'overflow:auto;padding:16px 20px;background:#0C2B2E;color:#E9F2EE;' +
        'font:16px/1.45 sans-serif;border-top:3px solid #F2707B;white-space:pre-wrap';
      document.body.appendChild(box);
    }
    box.textContent = lines.join('\n');
  }

  function checkBoot() {
    if (hp.booted) return;
    var lines = ['Aplikasi gagal dimuat.'];
    if (!hp.features.modules) lines.push('Browser ini tidak mendukung ES modules.');
    if (hp.debug) {
      var f = hp.features;
      lines.push('');
      lines.push('Fitur browser:');
      for (var k in f) { if (Object.prototype.hasOwnProperty.call(f, k)) lines.push('  ' + k + ': ' + (f[k] ? 'ya' : 'TIDAK')); }
      lines.push('');
      lines.push('Galat tertangkap (' + hp.errors.length + '):');
      for (var i = 0; i < hp.errors.length; i++) lines.push('  ' + hp.errors[i]);
      lines.push('');
      lines.push('Peramban: ' + navigator.userAgent);
    } else {
      lines.push('Tambahkan ?debug di akhir alamat untuk melihat rincian.');
    }
    showNotice(lines);
  }

  window.addEventListener('load', function () {
    setTimeout(checkBoot, 2500);
  });

  // ---------- Mode ?debug: eruda ----------
  function initEruda() {
    try {
      window.eruda.init();
      for (var i = 0; i < hp.errors.length; i++) console.error('[handplay] (sebelum eruda) ' + hp.errors[i]);
    } catch (e) {
      record('eruda gagal dijalankan: ' + e);
    }
  }

  function loadEruda() {
    var s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/eruda@3';
    s.onload = function () {
      if (document.body) initEruda();
      else document.addEventListener('DOMContentLoaded', initEruda);
    };
    s.onerror = function () { record('eruda gagal diunduh (periksa koneksi internet).'); };
    document.head.appendChild(s);
  }

  if (hp.debug) loadEruda();
})();
