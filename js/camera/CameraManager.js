// CameraManager — hanya mengurus kamera: izin, aktif/nonaktif, resolusi, kamera depan.
// Tidak tahu apa pun soal tracking, game, atau tampilan layar.

/** Error kamera dengan kode yang stabil, supaya UI memilih pesan sendiri. */
export class CameraError extends Error {
  /**
   * code: 'unsupported' | 'insecure' | 'denied' | 'not-found' | 'in-use'
   *     | 'unknown' | 'aborted'
   */
  constructor(code, cause) {
    super(code);
    this.name = 'CameraError';
    this.code = code;
    this.cause = cause;
  }
}

const CODE_BY_ERROR_NAME = {
  NotAllowedError: 'denied',
  PermissionDeniedError: 'denied',
  SecurityError: 'denied',
  NotFoundError: 'not-found',
  DevicesNotFoundError: 'not-found',
  NotReadableError: 'in-use',
  TrackStartError: 'in-use',
  AbortError: 'in-use',
};

function toCameraError(err) {
  return new CameraError(CODE_BY_ERROR_NAME[err?.name] ?? 'unknown', err);
}

function stopTracks(stream) {
  stream.getTracks().forEach((track) => track.stop());
}

export class CameraManager {
  /**
   * @param {HTMLVideoElement} video
   * @param {{ facingMode?: 'user'|'environment', width?: number, height?: number }} [options]
   */
  constructor(video, { facingMode = 'user', width = 1280, height = 720 } = {}) {
    this.video = video;
    this.options = { facingMode, width, height };
    this.stream = null;
    this.onEnded = null; // dipanggil jika kamera berhenti sendiri (dicabut/diambil app lain)
    this._starting = null;
    this._token = 0; // naik tiap stop(), membatalkan start yang masih berjalan
  }

  get active() {
    return this.stream !== null;
  }

  /** Ukuran video sebenarnya (setelah kamera aktif). */
  get size() {
    return { width: this.video.videoWidth, height: this.video.videoHeight };
  }

  /** Resolusi tertinggi yang sanggup diberikan kamera (bila browser melaporkan). */
  get maxSize() {
    const track = this.stream && this.stream.getVideoTracks()[0];
    const caps = track && track.getCapabilities ? track.getCapabilities() : null;
    if (!caps || !caps.width || !caps.height) return null;
    return { width: caps.width.max, height: caps.height.max };
  }

  /** Frame rate yang dilaporkan kamera (bisa turun di ruangan gelap). Null bila tidak dilaporkan. */
  get frameRate() {
    const track = this.stream && this.stream.getVideoTracks()[0];
    const settings = track && track.getSettings ? track.getSettings() : null;
    return settings && settings.frameRate ? Math.round(settings.frameRate) : null;
  }

  /** Menyalakan kamera. Aman dipanggil berulang. Resolve dengan ukuran video. */
  start() {
    if (this.stream) return Promise.resolve(this.size);
    if (this._starting) return this._starting;

    const promise = this._open(this._token);
    this._starting = promise;
    const clear = () => {
      if (this._starting === promise) this._starting = null;
    };
    promise.then(clear, clear);
    return promise;
  }

  /** Mematikan kamera dan membatalkan start yang masih berjalan. */
  stop() {
    this._token += 1;
    this._starting = null;
    this._release();
  }

  async _open(token) {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new CameraError(window.isSecureContext ? 'unsupported' : 'insecure');
    }

    const { facingMode, width, height } = this.options;
    const preferred = {
      video: { facingMode: { ideal: facingMode }, width: { ideal: width }, height: { ideal: height } },
      audio: false,
    };

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia(preferred);
    } catch (err) {
      if (err?.name === 'OverconstrainedError' || err?.name === 'ConstraintNotSatisfiedError') {
        // Perangkat tidak bisa memenuhi preferensi: coba lagi tanpa syarat.
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        } catch (err2) {
          throw toCameraError(err2);
        }
      } else {
        throw toCameraError(err);
      }
    }

    if (token !== this._token) {
      stopTracks(stream);
      throw new CameraError('aborted');
    }

    this.video.srcObject = stream;
    this.video.classList.toggle('is-mirrored', facingMode === 'user');
    try {
      await this.video.play();
    } catch (err) {
      stopTracks(stream);
      this.video.srcObject = null;
      if (token !== this._token) throw new CameraError('aborted');
      throw toCameraError(err);
    }

    if (token !== this._token) {
      stopTracks(stream);
      this.video.srcObject = null;
      throw new CameraError('aborted');
    }

    this.stream = stream;
    this.video.hidden = false;

    stream.getVideoTracks().forEach((track) => {
      track.addEventListener('ended', () => {
        if (this.stream !== stream) return;
        this._release();
        if (this.onEnded) this.onEnded();
      });
    });

    return this.size;
  }

  _release() {
    if (this.stream) {
      stopTracks(this.stream);
      this.stream = null;
    }
    this.video.srcObject = null;
    this.video.hidden = true;
  }
}
