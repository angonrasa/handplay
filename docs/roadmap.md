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
- [x] M1.10 Gambar kamera di papan interaktif buram karena diminta 640×480 lalu diperbesar; resolusi dinaikkan (lihat M1.2)
- [ ] M1.8 **Tes di perangkat asli**: HP (portrait + landscape) dan TV sekolah; catat apa yang meleset

**DoD:** kamera tampil mulus, bisa stop/start tanpa reload. (Logika `CameraManager` sudah diuji dengan kamera tiruan; yang tersisa M1.8, uji di perangkat asli.)

---

## M2 — Hand Tracking
- [ ] M2.1 Bundle WASM + `hand_landmarker.task` secara lokal
- [ ] M2.2 `HandTracker.js`: inisialisasi MediaPipe, mode VIDEO, `numHands: 1` (jumlah tangan jadi parameter agar mudah dinaikkan nanti)
- [ ] M2.3 Loop deteksi per frame (`requestAnimationFrame`)
- [ ] M2.4 Output 21 landmark + handedness
- [ ] M2.5 Overlay canvas: gambar skeleton + titik landmark (bisa on/off)
- [ ] M2.6 Ukur FPS dan tampilkan di panel debug
- [ ] M2.7 **Tes di HP asli**, catat FPS; tentukan resolusi/delegate terbaik

**DoD:** skeleton tangan mengikuti gerakan, FPS terukur dan layak (target ≥ 20 FPS).

---

## M3 — Cursor & interaksi
- [ ] M3.1 `LandmarkMapper.js`: normalisasi → koordinat layar (termasuk mirror)
- [ ] M3.1a Pemetaan memperhitungkan rasio video vs layar (efek `cover`/crop), dihitung ulang saat resize/orientasi
- [ ] M3.1b Tes akurasi cursor di portrait, landscape, dan layar lebar
- [ ] M3.2 Ambil landmark 8 sebagai cursor
- [ ] M3.3 Smoothing posisi cursor (parameter bisa diatur)
- [ ] M3.4 Gambar cursor di canvas
- [ ] M3.5 `GestureDetector.js` dasar: event `pointing` / `no-hand`
- [ ] M3.6 Tangani tangan hilang (cursor menghilang halus, bukan lompat)

**DoD:** cursor mengikuti ujung telunjuk dengan stabil di seluruh layar.

---

## M4 — Game Engine inti (Mode A: Pecahkan yang Benar)
- [ ] M4.1 `GameState.js` + mesin state (home → kalibrasi → main → hasil)
- [ ] M4.2 `BubbleManager.js`: spawn bola, gerak, hapus saat keluar layar
- [ ] M4.3 Bola berisi teks (ukuran font menyesuaikan panjang istilah)
- [ ] M4.3a Ukuran bola dan cursor relatif ke sisi terpendek layar (bukan piksel tetap)
- [ ] M4.3b Spawn dan arah gerak bola menyesuaikan orientasi, jumlah bola maksimum menyesuaikan luas area
- [ ] M4.3c Pause otomatis + hitung ulang layout saat orientasi berubah di tengah permainan
- [ ] M4.4 `Collision.js`: cursor vs lingkaran
- [ ] M4.5 `QuestionBank.js`: muat JSON, validasi skema, acak soal
- [ ] M4.6 `PickCorrectMode.js`: soal aktif, bola benar/pengecoh
- [ ] M4.7 `ScoreManager.js`: skor, nyawa, akurasi
- [ ] M4.8 Timer + kondisi selesai (waktu habis / nyawa habis / soal habis)
- [ ] M4.9 Bank soal awal `pernapasan-8.json` (minimal 15 soal, tiap soal ada `explain`)

**DoD:** satu sesi penuh bisa dimainkan dari mulai sampai hasil.

---

## M5 — UI, umpan balik, dan layar
- [ ] M5.1 `ScreenManager.js` + layar Home
- [ ] M5.2 Layar Kalibrasi (tangan terdeteksi ✓, tes sentuh bola)
- [ ] M5.3 `HUD.js`: skor, waktu, nyawa, teks soal
- [ ] M5.4 `FeedbackPanel.js`: penjelasan singkat saat jawaban salah
- [ ] M5.5 Layar Hasil: skor, akurasi, daftar soal salah + penjelasan
- [ ] M5.6 Layar Pilih Bab / Pilih Mode
- [ ] M5.7 Layar Cara Bermain
- [ ] M5.8 Pengaturan (skeleton on/off, kecepatan bola, suara)
- [ ] M5.9 Layout HUD dan panel penjelasan adaptif (atas/samping sesuai orientasi, tidak menutupi bola)
- [ ] M5.10 Opsi "Ukuran besar" untuk TV: perbesar bola, cursor, dan font (terbaca dari jarak jauh)
- [ ] M5.11 Petunjuk jarak berdiri di layar Kalibrasi
- [ ] M5.12 Pilih dan bundel font ke `assets/fonts/` (offline), tetapkan skala tipografi
- [ ] M5.13 Terapkan progressive disclosure (blueprint 13.4): kalibrasi hanya bila perlu, cara bermain sekali saja, pengaturan lanjutan di balik satu ikon, panel debug tersembunyi
- [ ] M5.14 Cursor berupa cincin tipis; efek pecah berupa cincin memudar
- [ ] M5.15 Tinjau tiap layar dengan uji 13.6 (satu fokus, tidak pasaran, terbaca di HP dan TV)

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

## Keputusan terbuka

Belum ada.
