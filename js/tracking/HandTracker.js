// HandTracker — pembungkus MediaPipe Hand Landmarker (lapisan persepsi).
// Output: data tangan (21 landmark + handedness). Tidak tahu aturan game.
// Dibuat replaceable: kontrak keluaran tetap sama jika MediaPipe diganti.
// TODO(M2.1–M2.4)
export class HandTracker {
  constructor({ numHands = 1 } = {}) {
    this.numHands = numHands; // MVP: satu tangan; angka ini parameter, bukan hard-code
  }

  async init() {
    throw new Error('HandTracker.init: belum diimplementasi (M2)');
  }

  detect(/* videoElement, timestamp */) {
    // Kontrak keluaran: [{ handedness, landmarks: [{ x, y, z }] }]  (x,y dinormalisasi 0..1)
    throw new Error('HandTracker.detect: belum diimplementasi (M2)');
  }
}
