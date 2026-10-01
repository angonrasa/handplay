// ModeRegistry — daftar mode permainan. Mode baru = daftar di sini,
// tanpa mengubah GameEngine.
//
// Kontrak sebuah mode (lihat modes/*.js):
//   constructor({ config, items })
//   start()                      → mulai ronde
//   update(dt, cursor)           → maju satu langkah; cursor = { x, y } atau null
//   getBubbles()                 → daftar gelembung untuk dirender
//   getPrompt()                  → teks soal aktif
//   isFinished()                 → boolean
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
