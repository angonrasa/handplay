# BLUEPRINT — HandPlay AR (Edisi IPA)

Nama kerja: **HandPlay AR**
Konsep: game kuis berbasis kamera. Siswa memecahkan bola-bola berisi istilah/angka IPA dengan mengapitnya di antara dua jari di depan kamera.

> Bukan filter AR. Alurnya: **hand tracking → ujung jari/gesture → game interaction → umpan balik belajar**.

---

## 1. Visi

"Tanganmu adalah controller, dan bolanya adalah jawaban."

Mekanik viral (pecahkan bola yang melayang) dipakai sebagai **retrieval practice**: siswa harus mengingat jawaban lalu memilihnya secara aktif, bukan sekadar menebak dari daftar.

```
Kamera → Deteksi tangan → 21 landmark → Ujung jari/gesture
      → Game Engine (mode + bank soal) → Bola bereaksi
      → Skor + umpan balik penjelasan → Hasil
```

## 2. Perubahan dari blueprint awal

| Blueprint awal | Disesuaikan menjadi |
|---|---|
| Target = lingkaran polos | Target = **bola berisi teks** (istilah/angka) |
| Hit = skor +10 | Hit = **dinilai benar/salah** terhadap soal aktif |
| Game config JSON | Ditambah **bank soal JSON** terpisah dari config game |
| Satu mode (Hand Catch) | **3 mode**: Pilih Benar, Kelompokkan, Urutan |
| Tidak ada konteks kelas | Tambah **mode kelas** (giliran siswa/kelompok) |
| Tidak ada penjelasan | Tambah **umpan balik penjelasan** saat salah |

## 3. Mode permainan

### Mode A — Pecahkan yang Benar (MVP)
- Soal tampil di atas layar. Beberapa bola melayang, satu atau lebih berisi jawaban benar, sisanya pengecoh.
- Pecahkan bola benar → skor naik, soal berikutnya.
- Pecahkan bola salah → nyawa/skor berkurang + penjelasan singkat.

### Mode B — Kelompokkan
- Prompt berupa kategori, misalnya "Pecahkan semua yang termasuk saluran pernapasan".
- Bola bercampur: anggota kategori dan non-anggota.
- Ronde selesai saat semua bola benar pecah atau waktu habis.

### Mode C — Urutan Alur
- Prompt berupa proses, misalnya "Urutan jalur udara saat inhalasi".
- Bola dipecahkan sesuai urutan. Salah urut → feedback + urutan diulang.

## 4. Teknologi inti

```
HTML + CSS + JavaScript (ES modules, tanpa build step)
├── Camera API (getUserMedia)
├── MediaPipe Hand Landmarker (lapisan persepsi saja)
├── Canvas 2D (overlay: bola, penanda ujung jari, skeleton, efek)
└── Game Engine sederhana (mode + bank soal)
```

Catatan teknis penting:
- Kamera butuh **HTTPS atau localhost**; ES modules butuh server (bukan `file://`).
- File **WASM dan model MediaPipe di-bundle lokal** supaya bisa jalan offline di kelas dan di Capacitor.
- Kamera depan **di-mirror** agar gerakan terasa natural.
- **Orientasi mengikuti perangkat** (tidak dikunci). Target pakai: HP (portrait/landscape) dan TV besar sekolah (landscape). Lihat bagian 4A.
- **Smoothing** posisi ujung jari (filter ringan) untuk mengurangi jitter.

## 4A. Layout responsif (HP + TV besar)

Orientasi tidak dikunci, jadi semua ukuran dihitung dari **ukuran area tampilan saat itu**, bukan angka tetap.

- **Area game = ukuran viewport.** Video kamera dan canvas overlay dibuat sama ukuran dan ikut berubah saat layar diputar/di-resize.
- **Koordinat tangan dipetakan ulang** setiap resize atau perubahan orientasi. `LandmarkMapper` harus memperhitungkan rasio video kamera vs rasio layar (video di-crop/`cover`), agar penanda tepat di ujung jari di portrait, landscape, dan layar TV.
- **Ukuran elemen relatif ke sisi terpendek layar** (bola, penanda jari, font soal, HUD), bukan piksel tetap. Jadi bola tetap terbaca di HP kecil maupun TV besar.
- **Spawn bola menyesuaikan bentuk layar.** Portrait: bola bergerak dominan vertikal. Landscape: dominan horizontal. Jumlah bola maksimum menyesuaikan luas area.
- **HUD dan panel penjelasan** berpindah posisi (atas/samping) sesuai orientasi, tidak menutupi area bola.
- **TV besar:** teks soal dan penjelasan harus terbaca dari jarak jauh (ukuran font minimum lebih besar), dan siswa berdiri lebih jauh dari kamera sehingga tangan tampak lebih kecil. Perlu opsi ukuran penanda jari dan bola yang bisa diperbesar di Pengaturan.
- Jika area game berubah saat permainan berjalan (HP diputar), **permainan di-pause sebentar**, layout dihitung ulang, lalu dilanjutkan.

## 5. Arsitektur folder

```
handplay-ar/
├── index.html
├── README.md
├── docs/
│   ├── blueprint.md
│   └── roadmap.md
├── css/
│   ├── app.css
│   ├── camera.css
│   └── game.css
├── js/
│   ├── app.js
│   ├── camera/
│   │   └── CameraManager.js
│   ├── tracking/
│   │   ├── HandTracker.js
│   │   ├── LandmarkMapper.js      (mirror + ke koordinat layar + ujung jari + smoothing)
│   │   └── OneEuroFilter.js       (penghalus adaptif berbasis waktu)
│   ├── gesture/
│   │   └── GestureDetector.js
│   ├── game/
│   │   ├── GameEngine.js          (loop, state mesin)
│   │   ├── GameState.js
│   │   ├── ModeRegistry.js        (daftar mode: pilih-benar, kelompokkan, urutan)
│   │   ├── modes/
│   │   │   ├── PickCorrectMode.js
│   │   │   ├── GroupMode.js
│   │   │   └── SequenceMode.js
│   │   ├── BubbleManager.js       (spawn, gerak, siklus hidup bola)
│   │   ├── QuestionBank.js        (muat + validasi + acak soal)
│   │   ├── Collision.js
│   │   └── ScoreManager.js
│   └── ui/
│       ├── HUD.js
│       ├── FeedbackPanel.js       (penjelasan benar/salah)
│       ├── ScreenManager.js
│       └── Viewport.js            (ukuran area tampilan + orientasi, sinkron ke canvas)
├── data/
│   ├── games.json                 (config mode: durasi, nyawa, kecepatan)
│   ├── settings.json
│   └── banks/
│       └── pernapasan-8.json      (bank soal per bab)
└── assets/
    ├── mediapipe/                 (wasm + hand_landmarker.task)
    ├── fonts/                     (font dibundel lokal agar jalan offline)
    └── sfx/
```

## 6. Pipeline

```
CameraManager → HandTracker → LandmarkMapper → GestureDetector
     (video)     (21 landmark)  (x,y layar)      (event: apit, dst)
                                                        │
                                                        ▼
QuestionBank ──► Mode aktif ◄── GameEngine ◄── ujung jari + gesture
                     │
                     ▼
        BubbleManager + Collision → hasil hit
                     │
                     ▼
         ScoreManager + FeedbackPanel → Render (canvas di atas video)
```

Aturan: HandTracker tidak tahu soal game. Mode tidak tahu soal MediaPipe.

## 7. Input tangan

MVP: **satu tangan saja** (`numHands: 1`). Jumlah tangan tetap parameter di `HandTracker`, jadi dua tangan bisa diaktifkan nanti tanpa mengubah game.

**Bola pecah saat diapit dua jari. Dua jari mana pun boleh.** Tidak ada satu cursor. Yang dilacak adalah **lima ujung jari** (landmark 4, 8, 12, 16, 20), sehingga ada 10 pasangan jari yang diperiksa tiap frame.

Satu bola dianggap terapit oleh pasangan ujung jari A dan B jika (koordinat layar, pusat bola C, radius r):
1. **Bola ada di antara kedua jari:** jarak C ke ruas garis A–B ≤ `r × 0,5`. Ini sekaligus memastikan jari berada di sisi yang berlawanan.
2. **Jari menutup:** jarak A–B ≤ `r × 1,7`.
3. **Bertahan** minimal 80 ms (berbasis waktu, bukan jumlah frame, karena FPS di perangkat berbeda-beda).

Angka di atas adalah **nilai awal** yang disetel lewat uji di HP dan papan, disimpan di config, bukan di kode. Tangan terbuka yang menyapu bola tidak memecahkannya karena jarak antar jari terlalu lebar.

`GestureDetector` mengeluarkan event `apit` berisi pasangan jari, titik tengah, dan jarak. `Collision` mencocokkannya dengan bola. Penilaian apit dilakukan di bidang layar (2D, tanpa kedalaman).

Gesture tahap lanjut:

| Gesture | Fungsi |
|---|---|
| 🤏 Apit & tahan | Pegang & pindahkan (mode susun) |
| ✋ Telapak | Jeda / perisai |
| ✊ Kepalan | Konfirmasi jawaban |
| 👋 Swipe | Lewati soal |

## 8. Skema data

### Bank soal (`data/banks/<id>.json`)

Cakupan awal: **hanya sistem pernapasan** (`pernapasan-8.json`). Bab lain menyusul setelah MVP berjalan.

```json
{
  "bankId": "pernapasan-8",
  "title": "Sistem Pernapasan",
  "items": [
    {
      "id": "q001",
      "type": "pick-correct",
      "prompt": "Organ tempat pertukaran O₂ dan CO₂ di paru-paru?",
      "correct": ["Alveolus"],
      "distractors": ["Trakea", "Bronkus", "Faring"],
      "explain": "Pertukaran gas terjadi di alveolus karena dindingnya sangat tipis dan dikelilingi kapiler darah."
    },
    {
      "id": "q002",
      "type": "group",
      "prompt": "Pecahkan semua yang termasuk saluran pernapasan",
      "correct": ["Laring", "Trakea", "Bronkus"],
      "distractors": ["Esofagus", "Lambung", "Jantung"],
      "explain": "Esofagus dan lambung termasuk sistem pencernaan."
    },
    {
      "id": "q003",
      "type": "sequence",
      "prompt": "Urutan jalur udara saat inhalasi",
      "sequence": ["Rongga hidung", "Faring", "Laring", "Trakea", "Bronkus", "Bronkiolus", "Alveolus"],
      "explain": "Udara masuk dari luar menuju alveolus melalui saluran yang makin kecil."
    }
  ]
}
```

### Config mode (`data/games.json`)

```json
{
  "modes": [
    {
      "id": "pick-correct",
      "name": "Pecahkan yang Benar",
      "duration": 60,
      "lives": 3,
      "bubbleCount": 4,
      "bubbleSpeed": 1.0,
      "scoring": { "correct": 10, "wrong": -5 }
    }
  ]
}
```

## 9. Layar aplikasi

1. **Home**: Mulai, Pilih Bab, Pilih Mode, Cara Bermain, Pengaturan
2. **Kalibrasi**: izin kamera, deteksi tangan, tes apit bola
3. **Game**: HUD (skor, waktu, nyawa), soal di atas, bola melayang, penanda ujung jari
4. **Umpan balik**: panel penjelasan singkat saat salah (tidak menutup seluruh layar)
5. **Hasil**: skor, akurasi, daftar soal yang salah + penjelasan, Main Lagi / Beranda
6. **Mode Kelas**: input nama siswa/kelompok, giliran, papan skor

## 10. Mode kelas

- Satu kamera, **satu pemain per giliran**, **satu tangan** yang dilacak (MVP).
- Guru memilih bab + mode, memasukkan daftar nama/kelompok.
- Skor tiap giliran disimpan di sesi, ditampilkan di papan skor akhir.
- Layar dihubungkan ke proyektor/TV bila ada.

## 11. Prinsip arsitektur (SSOT)

1. **Tracking ≠ Game**: tracker hanya menghasilkan data tangan.
2. **Gesture ≠ Game**: gesture hanya menerjemahkan gerakan jadi event.
3. **Mode ≠ Engine**: tiap mode adalah modul terpisah, didaftarkan di `ModeRegistry`.
4. **Soal = data**: konten IPA hidup di JSON, bukan di kode.
5. **Tracking replaceable**: MediaPipe bisa diganti tanpa membongkar game.
6. **UI ≠ logika**: HUD hanya membaca state.

## 12. Risiko & mitigasi

| Risiko | Mitigasi |
|---|---|
| FPS rendah di HP menengah | Resolusi kamera diturunkan, tes perangkat asli sejak M2, pilih delegate GPU |
| Jitter ujung jari | Smoothing di LandmarkMapper, tingkatkan ukuran bola, syarat apit diberi toleransi |
| Apit tidak terdeteksi (FPS rendah, tangan jauh, dua jari saling menutupi) | Syarat apit longgar dan bertahan singkat (ms, bukan jumlah frame), bola besar, uji di HP dan papan sejak M3, parameter di config |
| Apit tidak sengaja saat tangan bergerak cepat | Wajib bertahan ≥ 80 ms; tangan terbuka yang menyapu tidak memecahkan bola |
| Bola terlalu cepat untuk siswa | Kecepatan dan jumlah bola bisa diatur di `games.json` |
| Pencahayaan kelas buruk | Indikator "tangan terdeteksi" di kalibrasi + tips posisi |
| Soal ambigu/salah konsep | Setiap soal punya `explain`; bank soal divalidasi saat dimuat |
| Model tidak termuat offline | Bundle lokal, cek saat startup |
| Penanda jari meleset saat layar diputar / di TV | Petakan ulang koordinat saat resize/orientasi, hitung dari rasio video vs layar |
| Teks/bola terlalu kecil di TV dari jarak jauh | Ukuran relatif ke sisi terpendek layar + opsi perbesar di Pengaturan |
| Tangan tampak kecil bagi kamera saat siswa berdiri jauh | Tampilkan petunjuk jarak di Kalibrasi, bola dan penanda jari bisa diperbesar |

---

## 13. Prinsip desain UI/UX

Empat prinsip dari pemilik proyek: **clean, elegan, unik (tidak pasaran), dan sembunyikan kompleksitas sampai waktunya dibutuhkan.** Setiap keputusan tampilan diuji terhadap keempatnya.

### 13.1 Clean
- **Satu fokus per layar.** Satu aksi utama, satu hal yang dibaca.
- Ruang kosong adalah bagian dari desain, bukan ruang yang harus diisi.
- Palet dibatasi: satu warna dasar, satu aksen, satu warna "salah". Tidak ada warna tambahan tanpa alasan fungsi.
- Dua tingkat tipografi di layar yang sama sudah cukup (judul + isi).
- Teks pendek, kalimat aktif, huruf kecil biasa (sentence case). Tidak ada label dekoratif.

### 13.2 Elegan
- Gerak halus dan berarti: **gerak yang berjalan sendiri hanya satu** (gelembung "bernapas" di Home). Selebihnya gerak hanya sebagai jawaban atas aksi pemain (pecah, benar, salah).
- Skala jarak dan ukuran konsisten (token di `css/app.css`), tidak ada angka acak.
- Tidak ada elemen tanpa fungsi: tanpa bintang, koin, atau konfeti.
- Umpan balik tenang: gelembung pecah sebagai cincin yang memudar, bukan ledakan.

### 13.3 Unik, tidak pasaran
Hindari tampilan "game kuis" yang umum: neon cerah, gradien ungu-biru, font bulat bergaya anak, tombol besar berkilau, maskot.

Arah visual yang diusulkan (**bisa diganti**): **udara dan paru.**
- **Gelembung kaca** dengan tepi tipis dan sorot cahaya lembut, cukup pekat agar teks di dalamnya terbaca di atas video. Inilah satu hal yang diingat pemain.
- Palet bernuansa paru: `Paru #0C2B2E` (dasar), `Kabut #123F43` (permukaan), `Embun #E9F2EE` (teks), `Napas #8EDDCB` (aksen/benar), `Kapiler #F2707B` (salah).
- Kamera tampil dengan **veil** warna tipis supaya gelembung dan teks tetap terbaca di ruangan terang maupun gelap.
- Penanda ujung jari berupa **cincin tipis**, bukan emoji jari.
- Pecah = cincin yang membesar lalu memudar, sejalan dengan ide "menghembuskan napas".
- Tombol berbentuk pil, mengulang bentuk bulat gelembung.

**Referensi screenshot (game AR viral).** Diambil hanya hal fungsionalnya, bukan gayanya. Prinsip 13.1 sampai 13.4 tidak berubah, dan identitas "udara dan paru" di atas tetap.

Yang diambil:
- Kamera penuh layar dan tetap jelas terlihat.
- Bola berisi teks besar dan tebal, terbaca sekilas.
- Skeleton tangan terlihat saat bermain (garis tipis + titik), supaya pemain tahu tangannya terlacak. Bisa dimatikan di Pengaturan. Lima ujung jari ditandai cincin tipis yang tetap tampil walau kerangka dimatikan.
- Tata letak HUD: waktu di kiri atas, nyawa di kanan atas, soal di tengah atas, dalam panel kecil semi-transparan.

Yang tidak ditiru: warna jenuh biru/ungu, kilau tebal, dan tampilan "game kuis" umum. Warna tetap memakai palet di atas.

### 13.4 Sembunyikan kompleksitas sampai dibutuhkan (progressive disclosure)

| Hal | Kapan muncul |
|---|---|
| Home | Hanya judul, satu kalimat, satu tombol "Mulai" |
| Pilih bab/mode | Setelah "Mulai"; memakai pilihan terakhir sebagai default |
| Kalibrasi | Hanya jika tangan belum terdeteksi, bukan layar wajib setiap kali |
| Cara bermain | Sekali saat pertama dimainkan, lalu tersembunyi |
| Penjelasan jawaban | Hanya saat jawaban salah |
| Pengaturan lanjutan (skeleton, ukuran besar, kecepatan) | Di balik satu ikon kecil, tidak di Home |
| Panel debug (FPS, landmark) | Tersembunyi; dibuka dengan cara khusus (mis. `?debug`) |
| Mode kelas (giliran, papan skor) | Hanya setelah guru memilihnya |
| Impor bank soal | Hanya di area guru |

### 13.5 Aturan untuk antarmuka berbasis tangan
- Target (bola, tombol) **besar**, ukuran relatif ke sisi terpendek layar.
- Tidak mengandalkan hover. Jarak antar target cukup agar apitan tidak mengenai target tetangga.
- Teks di game terbaca dari jarak jauh (TV): kontras tinggi di atas video kamera.
- Tidak ada interaksi yang menuntut presisi piksel. Gestur apit diberi toleransi besar (lihat bagian 7).

### 13.6 Uji sebelum sebuah layar dianggap selesai
1. Apa **satu** hal yang dilakukan pemain di layar ini? Apakah sudah jelas tanpa membaca?
2. Adakah elemen yang bisa dibuang tanpa mengurangi fungsi? Buang.
3. Adakah yang tampak seperti game kuis pada umumnya? Ubah.
4. Terbaca di HP kecil dan di TV dari jauh, portrait dan landscape?
5. Jika ada kompleksitas, apakah sudah disembunyikan sampai dibutuhkan?
