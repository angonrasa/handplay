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

## Menjalankan

Kamera hanya bisa dipakai lewat `localhost` atau HTTPS, dan ES modules butuh server (bukan `file://`).
Jalankan server statis dari folder ini, lalu buka `http://localhost:<port>`.

## Status

M0 (kerangka) selesai. Modul yang masih kosong ditandai `TODO(Mx.y)` di dalam filenya, sesuai nomor subtask di roadmap.
