// GameEngine — loop permainan dan mesin state. Tidak tahu MediaPipe, tidak
// menggambar UI. Menerima cursor + gesture, mengembalikan state untuk dirender.
// TODO(M4.1, M4.8)
export class GameEngine {
  constructor({ state, registry }) {
    this.state = state;
    this.registry = registry;
  }

  start(/* modeId, items */) {
    throw new Error('GameEngine.start: belum diimplementasi (M4)');
  }

  update(/* dt, input */) {
    throw new Error('GameEngine.update: belum diimplementasi (M4)');
  }
}
