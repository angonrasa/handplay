// HUD — menampilkan skor, waktu, nyawa, teks soal. Hanya MEMBACA state.
// TODO(M5.3): render ke #hud.
export class HUD {
  constructor(container) {
    this.container = container;
  }

  render(/* state */) {
    throw new Error('HUD.render: belum diimplementasi (M5.3)');
  }
}
