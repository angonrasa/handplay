# HandPlay AR

Game kuis IPA yang dimainkan dengan tangan di depan kamera. Dokumen rancangan ada di `docs/`:

- `docs/blueprint.md` — arsitektur, prinsip desain UI/UX, skema data
- `docs/roadmap.md` — milestone M0–M9 beserta subtask

## Struktur

```
index.html          halaman tunggal, semua layar di dalamnya
css/                app.css (token desain), camera.css, game.css
js/                 modul per tanggung jawab (camera, tracking, gesture, game, ui)
data/               games.json, settings.json, banks/ (bank soal per bab)
assets/             mediapipe/, sfx/, fonts/
docs/               blueprint dan roadmap
```

## MediaPipe

Tidak perlu instal apa pun. Jika folder `assets/mediapipe/` kosong, aplikasi memuat MediaPipe dari CDN (butuh internet; panel `?debug` menampilkan `Sumber MediaPipe: cdn`).

Untuk jalan **offline** (kelas tanpa internet), simpan 4 file ini ke `assets/mediapipe/` dengan nama dan susunan persis begini (versi library harus sama dengan `CDN_VERSION` di `js/tracking/HandTracker.js`):

```
assets/mediapipe/vision_bundle.mjs
assets/mediapipe/wasm/vision_wasm_internal.js
assets/mediapipe/wasm/vision_wasm_internal.wasm
assets/mediapipe/hand_landmarker.task
```

Sumber unduhan:
- `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs`
- `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm/vision_wasm_internal.js`
- `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm/vision_wasm_internal.wasm`
- `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`

Aplikasi memakai folder lokal hanya jika keempat file ada; kalau ada yang kurang, otomatis kembali ke CDN.

## Menjalankan

Kamera hanya bisa dipakai lewat `localhost` atau HTTPS, dan ES modules butuh server (bukan `file://`).
Jalankan server statis dari folder ini, lalu buka `http://localhost:<port>`.

## Status

M0 (kerangka) dan M1 (kamera) selesai; kamera sudah diuji di papan interaktif sekolah. M2 (hand tracking) sudah ditulis tetapi belum diuji dengan MediaPipe asli: mulai dari CDN, file lokal opsional. Modul yang masih kosong ditandai `TODO(Mx.y)` di dalam filenya, sesuai nomor subtask di roadmap.
