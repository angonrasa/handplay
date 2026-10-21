// js/game/ModeRegistry.js
// ModeRegistry — daftar mode permainan. Mode baru = daftar di sini,
// tanpa mengubah GameEngine.
//
// Kontrak sebuah mode (lihat modes/*.js):
//   constructor({ config, items, rng })   config = satu entri data/games.json; items = soal dari QuestionBank
//   setArea(area)                         ukuran area tampilan (layout.viewport); boleh dipanggil saat layar diputar
//   start({ area })                       mulai ronde
//   update(dt, { pinched })  → event[]    dt detik; pinched = gelembung yang diapit frame ini (Collision.findPinched)
//   getBubbles()                          gelembung untuk digambar dan dicocokkan dengan apit
//   getPrompt()                           teks soal aktif (null bila tidak ada)
//   isFinished()                          soal habis (waktu/nyawa habis diputuskan GameEngine)
// Mode hanya mengembalikan event ({ type: 'question'|'correct'|'wrong'|'timeout', item, ... }); skor, nyawa, dan
// penjelasan ditangani GameEngine lewat ScoreManager dan FeedbackPanel. Mode tidak tahu MediaPipe.
export class ModeRegistry {
  constructor() {
    this.modes = new Map();
  }

  register(id, ModeClass) {
    this.modes.set(id, ModeClass);
  }

  create(id, options) {
    const ModeClass = this.modes.get(id);
    if (!ModeClass) throw new Error(`Mode tidak terdaftar: ${id}`);
    return new ModeClass(options);
  }

  list() {
    return [...this.modes.keys()];
  }
}
