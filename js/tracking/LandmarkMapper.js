// LandmarkMapper — koordinat landmark (0..1) → koordinat layar.
// Memperhitungkan: mirror, rasio video vs layar (cover/crop), resize/orientasi,
// dan smoothing cursor.
// TODO(M3.1–M3.3)
export class LandmarkMapper {
  setViewport(/* { width, height, videoWidth, videoHeight } */) {
    throw new Error('LandmarkMapper.setViewport: belum diimplementasi (M3)');
  }

  toScreen(/* landmark */) {
    throw new Error('LandmarkMapper.toScreen: belum diimplementasi (M3)');
  }
}
