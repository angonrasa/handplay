// js/tracking/OneEuroFilter.js
// OneEuroFilter — penghalus sinyal satu dimensi yang menyesuaikan diri dengan kecepatan gerak.
// Gerak lambat/diam: dihaluskan kuat (jitter hilang). Gerak cepat: hampir tanpa tunda.
// Berbasis waktu (ms), bukan jumlah frame, jadi hasilnya setara di perangkat dengan FPS berbeda.
// Rujukan: Casiez, Roussel, Vogel (2012), "1€ Filter".

const TWO_PI = 2 * Math.PI;

export class OneEuroFilter {
  /**
   * @param {{ minCutoff?: number, beta?: number, dCutoff?: number, maxGapMs?: number }} [options]
   *  minCutoff: Hz; makin kecil makin halus saat diam (tetapi makin tertinggal).
   *  beta: makin besar makin cepat mengejar saat gerak cepat.
   *  dCutoff: Hz; penghalus untuk perkiraan kecepatan.
   *  maxGapMs: jeda antar-sampel yang dianggap "sinyal putus"; filter mulai dari nol lagi.
   */
  constructor({ minCutoff = 0.8, beta = 6, dCutoff = 1, maxGapMs = 300 } = {}) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.maxGapMs = maxGapMs;
    this.reset();
  }

  reset() {
    this._x = null;
    this._dx = 0;
    this._t = null;
  }

  /** @param {number} x  nilai mentah  @param {number} t  waktu dalam ms (naik terus) */
  filter(x, t) {
    if (this._t === null || t <= this._t || t - this._t > this.maxGapMs) {
      this._x = x;
      this._dx = 0;
      this._t = t;
      return x;
    }
    const dt = (t - this._t) / 1000;
    const rawDx = (x - this._x) / dt;
    this._dx += alpha(this.dCutoff, dt) * (rawDx - this._dx);
    const cutoff = this.minCutoff + this.beta * Math.abs(this._dx);
    this._x += alpha(cutoff, dt) * (x - this._x);
    this._t = t;
    return this._x;
  }
}

function alpha(cutoff, dt) {
  const tau = 1 / (TWO_PI * cutoff);
  return 1 / (1 + tau / dt);
}
