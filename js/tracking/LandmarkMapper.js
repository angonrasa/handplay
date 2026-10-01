// LandmarkMapper — koordinat landmark (0..1) → koordinat layar (piksel CSS).
// Memperhitungkan: mirror dan rasio video vs layar (video ditampilkan dengan `cover`,
// jadi sebagian tepinya terpotong).
// TODO(M3.3): smoothing posisi cursor.
export class LandmarkMapper {
  constructor() {
    this.view = null;
  }

  /**
   * Panggil ulang saat resize/orientasi atau saat ukuran video berubah.
   * @param {{ width:number, height:number, videoWidth:number, videoHeight:number, mirrored:boolean, zoom?:number }} view
   */
  setViewport(view) {
    const { width, height, videoWidth, videoHeight, mirrored, zoom = 1 } = view;
    if (!(width > 0 && height > 0 && videoWidth > 0 && videoHeight > 0)) {
      this.view = null;
      return;
    }
    const scale = Math.max(width / videoWidth, height / videoHeight); // cover
    this.view = {
      width,
      scale,
      mirrored: !!mirrored,
      zoom,
      height,
      offsetX: (width - videoWidth * scale) / 2,
      offsetY: (height - videoHeight * scale) / 2,
      videoWidth,
      videoHeight,
    };
  }

  /** @param {{x:number,y:number}} landmark  x,y 0..1 pada frame video. Null bila belum ada viewport. */
  toScreen(landmark) {
    const v = this.view;
    if (!v) return null;
    let x = v.offsetX + landmark.x * v.videoWidth * v.scale;
    let y = v.offsetY + landmark.y * v.videoHeight * v.scale;
    // Zoom digital berpusat di tengah layar (sama dengan transform CSS pada video).
    x = v.width / 2 + (x - v.width / 2) * v.zoom;
    y = v.height / 2 + (y - v.height / 2) * v.zoom;
    return { x: v.mirrored ? v.width - x : x, y };
  }
}
