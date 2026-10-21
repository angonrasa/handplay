# ROADMAP — HandPlay AR (Edisi IPA)

Status: `[ ]` belum, `[~]` berjalan, `[x]` selesai.
Tiap milestone punya **Definisi selesai (DoD)** yang bisa dites langsung di HP.

---

## M0 — Blueprint & kerangka
- [x] M0.1 Blueprint v1 (arsitektur, pipeline)
- [x] M0.2 Blueprint disesuaikan ke konsep kuis IPA (`blueprint.md`)
- [x] M0.3 Tentukan bab pertama untuk bank soal: sistem pernapasan
- [x] M0.3a Tentukan jumlah tangan MVP: satu tangan
- [x] M0.4 Siapkan struktur folder sesuai blueprint + `index.html` dasar (modul kosong bertanda `TODO(Mx.y)`)
- [x] M0.4a Token desain dasar di `css/app.css` (palet, tipografi, jarak, gerak; ukuran relatif ke sisi terpendek layar)
- [x] M0.4b `ScreenManager` + alur layar dasar (Home → Kalibrasi → Game → Hasil)
- [x] M0.6 Tetapkan prinsip desain UI/UX: clean, elegan, unik, sembunyikan kompleksitas (blueprint bagian 13)
- [x] M0.7 Arah visual "udara & paru" (palet, gelembung kaca) disetujui
- [x] M0.7a Screenshot referensi game AR viral dipakai sebagai acuan fungsional saja (kamera penuh, teks bola besar, skeleton terlihat, tata letak HUD); prinsip UI/UX dan arah "udara & paru" tetap (blueprint 13.3)
- [ ] M0.5 Pastikan cara menjalankan lewat server lokal (HTTPS/localhost) di HP

**DoD:** folder proyek jalan, halaman kosong terbuka di browser HP.

---

## M1 — Kamera
- [x] M1.1 `CameraManager.js`: minta izin kamera
- [x] M1.2 Aktifkan kamera depan, atur resolusi (target 1280×720; 1920×1080 di layar ≥1200px supaya tajam di TV; jika perangkat tidak bisa, otomatis dapat resolusi terdekat atau coba tanpa syarat)
- [x] M1.3 Tampilkan preview video penuh layar + mirror (mirror hanya untuk kamera depan; layar penuh diminta saat menekan "Mulai", bila didukung)
- [x] M1.4 Tangani error (izin ditolak, kamera tidak ada, dipakai app lain, bukan https/localhost, browser tidak mendukung) dengan pesan jelas + tombol "Coba lagi" yang hanya muncul saat gagal
- [x] M1.5 Fungsi stop/restart kamera saat pindah layar; kamera juga mati saat tab/aplikasi tidak terlihat dan menyala lagi saat kembali
- [x] M1.6 Layout fullscreen yang mengikuti orientasi perangkat (tanpa kunci), video mengisi viewport dengan `cover`
- [x] M1.7 Deteksi perubahan ukuran/orientasi (`resize`/`orientationchange`) dan resize ulang canvas (`ui/Viewport.js`)
- [x] M1.9 Mode `?debug`: pasang `js/debug/bootstrap.js` di `index.html` (sebelumnya belum terpasang, jadi eruda dan panel tidak pernah muncul); eruda diperbesar otomatis di layar besar
- [x] M1.8a Kamera diuji di papan interaktif Hisense 75WM61FE (Chrome 150): jalan, tampil jernih setelah resolusi dinaikkan
- [x] M1.11 Zoom digital supaya tangan tampak lebih dekat di layar besar (bawaan 1.3x di layar ≥1200px, 1x di HP; ubah lewat `?zoom=1.5` atau tombol Zoom di panel `?debug`); panel menampilkan resolusi maksimum kamera
- [x] M1.10 Gambar kamera di papan interaktif buram karena diminta 640×480 lalu diperbesar; resolusi dinaikkan (lihat M1.2)
- [ ] M1.8 **Tes di perangkat asli**: HP (portrait + landscape) dan TV sekolah; catat apa yang meleset (TV sudah, lihat M1.8a; HP belum dicatat)

**DoD:** kamera tampil mulus, bisa stop/start tanpa reload. (Logika `CameraManager` sudah diuji dengan kamera tiruan; yang tersisa M1.8, uji di perangkat asli.)

---

## M2 — Hand Tracking
- [ ] M2.1 Bundle WASM + `hand_landmarker.task` secara lokal untuk offline — **belum**; sementara aplikasi otomatis memakai CDN bila `assets/mediapipe/` tidak lengkap (butuh internet). Daftar file dan cara unduh manual ada di README
- [x] M2.2 `HandTracker.js`: inisialisasi MediaPipe, mode VIDEO, `numHands: 1` (jumlah tangan jadi parameter agar mudah dinaikkan nanti); GPU, jatuh ke CPU bila gagal; pesan jelas bila file MediaPipe tidak ada (belum diuji dengan MediaPipe asli; menunggu uji M2.7)
- [x] M2.3 Loop deteksi per frame (`requestVideoFrameCallback`, cadangan `requestAnimationFrame`); mulai setelah kamera siap, berhenti saat kamera dilepas; kegagalan tracker tidak menghalangi kamera
- [x] M2.4 Output 21 landmark + handedness (`toHands`, diuji dengan data tiruan)
- [x] M2.5 Overlay canvas: gambar skeleton + titik landmark (`ui/SkeletonOverlay.js`; tombol on/off di panel `?debug`)
- [x] M2.6 Ukur FPS dan tampilkan di panel debug (FPS, ms per deteksi, jumlah tangan, delegate, galat)
- [x] M2.5a Uji awal di papan Hisense 75WM61FE (Chrome 150, MediaPipe dari CDN, delegate GPU, kamera 1920×1080): skeleton muncul dan pas di tangan, tetapi hanya 5–6 FPS (±170 ms per deteksi) dan terasa delay
- [x] M2.8 Percepat deteksi: video diperkecil ke 360 px tinggi (rasio sama) sebelum masuk MediaPipe, video tampilan tetap 1080p (`inputHeight` di `HandTracker`); alamat uji `?det=240|360|480|720|0` dan `?cam=480|720|1080`; panel menampilkan FPS kamera dan ukuran input deteksi (belum diukur ulang di papan)
- [ ] M2.7 **Tes di HP asli**, catat FPS; tentukan resolusi/delegate terbaik (papan: lihat M2.5a dan M2.8; HP belum)

**DoD:** skeleton tangan mengikuti gerakan, FPS terukur dan layak (target ≥ 20 FPS).

---

## M3 — Ujung jari & gestur apit
- [x] M3.1 `LandmarkMapper.js`: normalisasi → koordinat layar (termasuk mirror; dikerjakan lebih awal karena skeleton M2.5 membutuhkannya)
- [x] M3.1a Pemetaan memperhitungkan rasio video vs layar (efek `cover`/crop), dihitung ulang saat resize/orientasi (diuji hitungannya; akurasi di layar asli lewat M3.1b)
- [ ] M3.1b Tes akurasi penanda ujung jari di portrait, landscape, dan layar lebar
- [x] M3.2 Ambil 5 ujung jari (landmark 4, 8, 12, 16, 20) sebagai titik sentuh: `LandmarkMapper.fingertips(hand)` → `[{id, landmark, x, y}]` koordinat layar; dipasang di `app.js` sebagai `input.fingertips` (diuji dengan data tiruan di Node; belum dicoba di perangkat)
- [x] M3.3 Smoothing posisi tiap ujung jari: `OneEuroFilter.js` (adaptif, berbasis waktu) dipakai di `LandmarkMapper.fingertips()`; parameter di `DEFAULT_SMOOTHING` / `setSmoothing()`, `?smooth=0` mematikan; filter di-reset saat tangan hilang (nilai awal disetel di M3.5b; diuji data tiruan di Node, belum di perangkat)
- [x] M3.4 Gambar penanda ujung jari di canvas: `SkeletonOverlay.draw(hands, vp, fingertips)` menggambar 5 cincin tipis setara (radius `2,6u`) memakai posisi yang sudah dihaluskan; tetap tampil walau kerangka dimatikan; sorotan telunjuk lama dihapus (diuji dengan canvas tiruan di Node, belum dilihat di perangkat)
- [x] M3.5 `GestureDetector.js` dasar: `update(fingertips, t)` (10 pasangan jari, event `hand` / `no-hand`) dan `match(targets, t)` (event `apit`: target, pasangan jari bebas, titik tengah, jarak; tiga syarat + tahan 80 ms; sekali per apitan); dipasang di `app.js` sebagai `gestures` (diuji data tiruan di Node, belum di perangkat)
- [x] M3.5a Parameter apit di config (`data/settings.json` kunci `apit`, dimuat `app.js` → `gestures.setApit()`; timpa lewat `?center=` `?close=` `?hold=`; nilai cadangan tetap di GestureDetector). Nilai awal: `centerTolerance` 0,5 (× radius), `closeRatio` 1,7 (× radius), `holdMs` 80
- [ ] M3.5b Tes apit di HP dan papan Hisense: catat salah deteksi dan apit yang tidak terbaca, setel ulang parameter
  - Alat uji siap: `?apittest` (`js/debug/ApitTest.js`): 6 lingkaran diam yang pecah bila diapit, plus teks seberapa dekat pasangan jari terbaik dengan syarat apit. **Menunggu hasil uji di A15 dan Hisense.**
- [x] M3.6 Tangani tangan hilang: `SkeletonOverlay` menahan gambar terakhir 200 ms lalu memudar 250 ms (requestAnimationFrame sendiri, jadi halus walau deteksi 5–6 FPS); satu frame deteksi yang terlewat tidak membuat berkedip; filter smoothing tidak lagi di-reset tiap frame kosong (cukup `maxGapMs` 300 ms); lapisan tambahan lewat `addLayer()` (dipakai `?apittest`); `reset()` saat tracking berhenti (diuji canvas tiruan di Node, belum dilihat di perangkat)

**DoD:** penanda mengikuti kelima ujung jari dengan stabil di seluruh layar, dan apit dua jari mana pun terdeteksi dengan andal.

---

## M4 — Game Engine inti (Mode A: Pecahkan yang Benar)
- [x] M4.1 `GameState.js` + mesin state: tabel `TRANSITIONS` (home → calibration → playing ↔ paused → result; kamera putus: playing/paused → calibration), `go()` menolak perpindahan tidak sah dengan galat, `onPhase()`, `reset(config)` divalidasi, `accuracy`; `app.js`: layar ↔ fase saling mengikuti (`state` diekspor; layar `game` = fase playing/paused). Belum dipakai GameEngine (M4.8) (diuji di Node, belum dicoba di perangkat)
- [x] M4.2 `BubbleManager.js`: `setArea(viewport)`, `spawn({text,kind})` (null bila penuh/tak ada tempat; jalur acak tanpa tumpang tindih), `update(dt detik)` → `{exited}` (dt dipotong 0,1 s), `remove(id)`, `clear()`, `capacity`; kecepatan dasar 12u/detik × `bubbleSpeed`; semua angka di `BUBBLE` (diuji di Node termasuk simulasi 10 menit tanpa tumpang tindih, belum di perangkat)
- [x] M4.3 Bola berisi teks: `fitText()` memecah teks jadi 1–3 baris dan memilih font terbesar yang muat (satuan radius, jadi tidak berubah saat layar berubah ukuran); `ui/BubbleRenderer.js` menggambar gelembung kaca + teks dan mengecilkan font bila hasil ukur nyata melebihi lingkaran; semua gelembung tampil sama (benar/pengecoh tak terlihat) (diuji dengan kanvas tiruan di Node, belum dilihat di perangkat)
- [x] M4.3a Ukuran bola dan penanda jari relatif ke sisi terpendek layar (bukan piksel tetap): bola 9u (±10%), penanda jari 2,6u; `sizeScale` disiapkan untuk opsi "Ukuran besar" (M5.10)
- [x] M4.3b Spawn dan arah gerak bola menyesuaikan orientasi (portrait: masuk dari bawah dan naik; landscape: masuk dari kanan dan ke kiri), jumlah bola maksimum menyesuaikan luas area (`capacity`: gelembung memenuhi ≤ 10% luas, 2–10 buah)
- [ ] M4.3c Pause otomatis + hitung ulang layout saat orientasi berubah di tengah permainan
  - Sisi BubbleManager sudah ada: `setArea()` menskalakan posisi bila orientasi sama, dan menata ulang gelembung merata di arah gerak baru bila orientasi berganti (diuji di Node). **Menunggu GameEngine (M4.8)** untuk menjeda otomatis (`playing` → `paused`) lalu melanjutkan.
- [x] M4.4 `Collision.js`: `toTargets(bubbles)` → `{id,x,y,r}` untuk `gestures.match()`, `resolveHits()` memetakan hasil `apit` kembali ke gelembung (hasil ganda/usang dibuang), `findPinched(gestures, bubbles, t)` = keduanya sekali jalan; plus `circlesOverlap`. Logika apit tetap di `GestureDetector` (diuji dengan GestureDetector asli di Node, belum di perangkat)
- [ ] M4.4a Tes gelembung di HP dan papan Hisense: alamat `?bubbletest` (`js/debug/BubbleTest.js`; `?bspeed=1.5` mengubah kecepatan). Masuk ke layar game: gelembung berisi istilah pernapasan bergerak dan pecah bila diapit; teks bawah menampilkan jumlah, pecah, lolos, arah, dan radius. Catat: apakah ukuran bola enak di HP dan TV, kecepatan, teks terbaca/terpotong, dan apit pada bola yang bergerak. **Menunggu hasil uji.** Loop alat uji memakai `SkeletonOverlay.redraw()` supaya gerak tetap halus walau deteksi 5–6 FPS
- [x] M4.5 `QuestionBank.js`: `QuestionBank.load(url)` / `.from(data)` / `.validate(data)`, `draw({type,count,rng})` acak tanpa pengulangan, `byType`, `getById`; validasi sesuai blueprint 8 (soal salah dibuang + `warnings`, `strict` menolak seluruh bank); belum dipakai mode (M4.6) (diuji di Node dengan `pernapasan-8.json` asli)
- [x] M4.6 `PickCorrectMode.js`: satu soal aktif; gelembung benar + (`bubbleCount` − 1) pengecoh masuk satu per satu dalam urutan acak (jeda 0,9 s); apit satu gelembung langsung menyelesaikan soal → event `correct` / `wrong` (membawa jawaban + penjelasan); jawaban benar keburu keluar layar → event `missed`; jeda 0,8 s lalu soal berikutnya; soal habis → `isFinished()`. Mode hanya mengembalikan event, tidak tahu skor/waktu/MediaPipe. Kontrak di `ModeRegistry.js` diperbarui (`update(dt, { pinched })`, `setArea()`, `start({ area })`) (diuji di Node dengan GameState + ScoreManager + BubbleManager asli, belum di perangkat)
- [x] M4.7 `ScoreManager.js`: `recordHit({correct,item,picked})` menulis ke `GameState` (skor dari `games.json` `scoring`, nyawa −1 saat salah, skor tidak di bawah 0), `recordSkip()` untuk soal terlewat (tidak mengurangi nyawa dan tidak menurunkan akurasi), `outOfLives`, `summary()` untuk layar Hasil (skor, benar, salah, terlewat, akurasi, daftar soal salah + jawaban + penjelasan). `lives: 0` = tanpa nyawa (diuji di Node, belum di perangkat)
- [x] M4.8 Timer + kondisi selesai (waktu habis / nyawa habis / soal habis)
- [x] M4.9 Bank soal awal `pernapasan-8.json`: 17 soal `pick-correct` + 1 `group` + 1 `sequence`, semua ada `explain`, lolos validasi `strict`. **Isi soal perlu ditinjau guru IPA sebelum dipakai ke siswa.**

**DoD:** satu sesi penuh bisa dimainkan dari mulai sampai hasil.

---

## M5 — UI, umpan balik, dan layar
- [ ] M5.1 `ScreenManager.js` + layar Home
- [ ] M5.2 Layar Kalibrasi (tangan terdeteksi ✓, tes apit bola)
- [x] M5.3 `HUD.js`: `new HUD(#hud)`, `render(engine.snapshot())`, `reset()` (ronde baru); waktu + skor kiri atas, soal tengah atas (panel semi-transparan, memudar saat jeda antar soal), nyawa kanan atas berupa cincin (terisi = sisa, kosong = hilang; jumlah awal dipelajari dari render pertama, 0 nyawa = disembunyikan); angka waktu memakai warna "salah" di ≤ 10 detik; portrait: soal turun ke baris kedua; DOM hanya disentuh bila nilai berubah; HUD sementara di `app.js` dihapus (diuji dengan DOM tiruan di Node, belum dilihat di perangkat). **Catatan:** HUD menimpa bagian atas area bola; menyisihkan area bola dari HUD ikut M5.9
- [ ] M5.4 `FeedbackPanel.js`: penjelasan singkat saat jawaban salah
- [x] M5.5 Layar Hasil: skor, akurasi, daftar soal salah + penjelasan — `js/ui/ResultScreen.js` + `css/result.css`: skor dihitung naik sekali dengan cincin akurasi, rincian benar/salah/terlewat, soal keliru (jawabanmu, jawaban benar, penjelasan) di balik satu tombol; teks soal lewat textContent; dicoba di Chromium headless (HP portrait/landscape, TV), belum di perangkat
- [ ] M5.6 Layar Pilih Bab / Pilih Mode
- [ ] M5.7 Layar Cara Bermain
- [ ] M5.8 Pengaturan (skeleton on/off; bawaan tampil saat bermain, kecepatan bola, suara)
- [ ] M5.9 Layout HUD dan panel penjelasan adaptif (atas/samping sesuai orientasi, tidak menutupi bola)
- [ ] M5.10 Opsi "Ukuran besar" untuk TV: perbesar bola, penanda jari, dan font (terbaca dari jarak jauh)
- [ ] M5.11 Petunjuk jarak berdiri di layar Kalibrasi
- [ ] M5.12 Pilih dan bundel font ke `assets/fonts/` (offline), tetapkan skala tipografi
- [ ] M5.13 Terapkan progressive disclosure (blueprint 13.4): kalibrasi hanya bila perlu, cara bermain sekali saja, pengaturan lanjutan di balik satu ikon, panel debug tersembunyi
- [x] M5.14 Penanda ujung jari berupa cincin tipis; efek pecah berupa cincin memudar — `js/ui/Effects.js` (dua cincin + selisih skor, kilat tepi saat salah), diberi event lewat `GameEngine.onEvent`; belum dilihat di perangkat
- [ ] M5.15 Tinjau tiap layar dengan uji 13.6 (satu fokus, tidak pasaran, terbaca di HP dan TV)
- [x] M5.16 Polish visual "premium" tanpa mengubah arah "udara & paru": token baru di `css/app.css` (kaca berasap, sorot tepi, bayang bertinta teal), latar udara + butiran halus saat kamera mati, gelembung kaca berlapis (CSS dan canvas sama resepnya), HUD kaca dengan garis sisa waktu soal dan nyawa berbentuk gelembung mini, kartu Jeda, status kamera bertitik. Tanpa backdrop-filter (hemat untuk papan TV). **Catatan:** `.veil` kini di bawah canvas overlay (sebelumnya menggelapkan gelembung dan teks); HUD portrait dipadatkan, tetapi soal tiga baris masih bisa menyentuh gelembung teratas sampai M5.9

**DoD:** alur layar lengkap, siswa bisa main tanpa bantuan.

---

## M6 — Polish
- [ ] M6.1 Animasi bola pecah (partikel)
- [ ] M6.2 Efek benar/salah (warna, getar, skor melayang)
- [ ] M6.3 Efek suara (pecah, benar, salah, selesai)
- [ ] M6.4 Bola punya variasi warna per kategori
- [ ] M6.5 Tingkat kesulitan (kecepatan, jumlah bola, ukuran bola)
- [ ] M6.6 Skor tertinggi disimpan lokal per bab

**DoD:** game terasa "hidup" dan enak dilihat.

---

## M7 — Mode tambahan
- [ ] M7.1 `ModeRegistry.js` + `games.json` per mode
- [ ] M7.2 `GroupMode.js` (Kelompokkan)
- [ ] M7.3 `SequenceMode.js` (Urutan Alur)
- [ ] M7.4 Tambah soal bertipe `group` dan `sequence` ke bank
- [ ] M7.5 Bank soal bab kedua (setelah pernapasan; bab ditentukan nanti)
- [ ] M7.6 Gesture lanjutan: pinch, kepalan, swipe (opsional)

**DoD:** tiga mode bisa dipilih dari menu, bank soal bisa ditukar tanpa ubah kode.

---

## M8 — Mode kelas
- [ ] M8.1 Input daftar nama siswa/kelompok
- [ ] M8.2 Sistem giliran (pemain berikutnya otomatis)
- [ ] M8.3 Papan skor sesi
- [ ] M8.4 Ringkasan akhir sesi (soal yang paling sering salah)
- [ ] M8.5 Impor bank soal oleh guru (file JSON / tempel teks)
- [ ] M8.6 Tes tampilan di TV besar sekolah (keterbacaan papan skor dan soal dari jarak jauh)

**DoD:** satu kelas bisa main bergiliran dalam satu sesi.

---

## M9 — Android
- [ ] M9.1 Jadikan PWA (manifest + service worker, cache model & aset)
- [ ] M9.2 Verifikasi offline penuh
- [ ] M9.3 Bungkus Capacitor
- [ ] M9.4 Izin kamera Android (AndroidManifest)
- [ ] M9.5 Tes di beberapa HP (performa, portrait + landscape) dan di TV sekolah
- [ ] M9.5a Pastikan Capacitor tidak mengunci orientasi (konfigurasi Android mengikuti sensor/perangkat)
- [ ] M9.6 Build APK
- [ ] M9.7 Ikon, splash screen, nama aplikasi

**DoD:** APK terpasang dan berjalan offline di HP.

---

## Urutan prioritas

`M1 → M2 → M3 → M4` adalah jalur kritis. Setelah M4 selesai, game sudah bisa dimainkan dan diuji ke siswa; M5–M9 menyusul berdasarkan umpan balik.

## Keputusan

- **Orientasi layar: mengikuti perangkat** (tidak dikunci). Target pakai: HP dan TV besar sekolah.
- **Bank soal awal: sistem pernapasan saja.** Bab lain menyusul setelah MVP berjalan.
- **MVP: satu tangan saja** (`numHands: 1`). Dua tangan dipertimbangkan setelah MVP stabil.
- **Cara memecahkan bola: diapit dua jari, pasangan jari bebas** (blueprint 7). Bukan sentuhan satu telunjuk.

## Keputusan terbuka

Belum ada.
