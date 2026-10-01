// CameraManager — hanya mengurus kamera: izin, aktif/nonaktif, resolusi, kamera depan.
// Tidak tahu apa pun soal tracking atau game.
// TODO(M1.1–M1.5)
export class CameraManager {
  constructor(videoElement) {
    this.video = videoElement;
    this.stream = null;
  }

  async start(/* { facingMode, width, height } */) {
    throw new Error('CameraManager.start: belum diimplementasi (M1)');
  }

  stop() {
    throw new Error('CameraManager.stop: belum diimplementasi (M1)');
  }
}
