// js/ui/HUD.js
// HUD — menampilkan waktu, skor, nyawa, dan teks soal. Hanya MEMBACA: menerima gambaran dari
// GameEngine.snapshot() dan tidak mengubah state apa pun (blueprint 11, prinsip 6).
// Tata letak (blueprint 13.3): waktu + skor di kiri atas, soal di tengah atas, nyawa di kanan atas.
// Portrait: soal turun ke baris kedua selebar layar. Gayanya ada di css/game.css.
// Dipanggil tiap frame, jadi DOM hanya disentuh bila nilainya berubah.

export const LOW_TIME = 10; // detik; di bawah ini angka waktu memakai warna "salah"
export const LOW_QUESTION_TIME = 3; // detik; di bawah ini garis sisa waktu soal memakai warna "salah"

function make(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function makeStat(name, label) {
  const root = make('div', 'hud__stat');
  root.dataset.stat = name;
  const value = make('span', 'hud__value', '0');
  root.append(value, make('span', 'hud__label', label));
  return { root, value };
}

export class HUD {
  /** @param {HTMLElement} container  slot #hud di layar game */
  constructor(container) {
    if (!container) throw new TypeError('HUD: container wajib diisi');
    this.container = container;

    this.time = makeStat('time', 'detik');
    this.score = makeStat('score', 'skor');
    this.left = make('div', 'hud__left');
    this.left.append(this.time.root, this.score.root);

    this.promptEl = make('div', 'hud__prompt');
    this.promptEl.setAttribute('role', 'status');
    this.promptEl.setAttribute('aria-live', 'polite');
    this.promptText = make('span', 'hud__prompt-text');
    this.timeBar = make('span', 'hud__timebar'); // sisa waktu soal; lebarnya dari variabel CSS --q (0..1)
    this.timeBar.setAttribute('aria-hidden', 'true');
    this.timeBar.hidden = true;
    this.promptEl.append(this.promptText, this.timeBar);

    this.livesEl = make('div', 'hud__lives');

    this.bar = make('div', 'hud__bar');
    this.bar.append(this.left, this.promptEl, this.livesEl);
    container.replaceChildren(this.bar);

    this.reset();
  }

  /** Ronde baru: lupakan nilai lama (jumlah nyawa awal dipelajari lagi dari render pertama). */
  reset() {
    this._maxLives = 0;
    this._lifeEls = [];
    this._cache = {};
    this.livesEl.replaceChildren();
    this.livesEl.hidden = true;
    this.promptEl.dataset.visible = 'false';
    this.promptEl.dataset.low = 'false';
    this.timeBar.hidden = true;
  }

  /**
   * @param {{ prompt: string|null, score: number, lives: number, timeLeft: number, timed: boolean }} snap
   *  bentuk GameEngine.snapshot()
   */
  render(snap) {
    if (!snap) return;
    const c = this._cache;

    // Waktu (disembunyikan bila ronde tanpa batas waktu)
    const timed = !!snap.timed;
    if (timed !== c.timed) {
      this.time.root.hidden = !timed;
      c.timed = timed;
    }
    if (timed) {
      const secs = Math.max(0, Math.ceil(snap.timeLeft));
      if (secs !== c.secs) {
        this.time.value.textContent = String(secs);
        this.time.root.setAttribute('aria-label', `Sisa waktu ${secs} detik`);
        this.time.root.dataset.low = String(secs <= LOW_TIME);
        c.secs = secs;
      }
    }

    // Skor
    if (snap.score !== c.score) {
      this.score.value.textContent = String(snap.score);
      this.score.root.setAttribute('aria-label', `Skor ${snap.score}`);
      if (c.score !== undefined) this._tick(this.score.value); // bukan render pertama: skor berubah karena apitan
      c.score = snap.score;
    }

    // Nyawa: jumlah awal = nilai terbesar yang pernah terlihat di ronde ini; 0 = ronde tanpa nyawa
    if (snap.lives > this._maxLives) this._buildLives(snap.lives);
    if (this._maxLives > 0 && snap.lives !== c.lives) {
      this._lifeEls.forEach((life, i) => life.classList.toggle('hud__life--lost', i >= snap.lives));
      this.livesEl.setAttribute('aria-label', `Nyawa ${snap.lives} dari ${this._maxLives}`);
      c.lives = snap.lives;
    }

    // Soal: teks terakhir tetap ada saat panel memudar (jeda antar soal), jadi tidak berkedip kosong
    const visible = !!snap.prompt;
    if (visible && snap.prompt !== c.prompt) {
      this.promptText.textContent = snap.prompt;
      c.prompt = snap.prompt;
    }
    if (visible !== c.visible) {
      this.promptEl.dataset.visible = String(visible);
      c.visible = visible;
    }

    // Sisa waktu soal (hanya bila mode punya batas waktu per soal). Dibulatkan 1% agar DOM tidak ditulis tiap frame.
    const qt = snap.questionTime;
    const hasQ = !!(qt && qt.total > 0);
    if (hasQ !== c.hasQ) {
      this.timeBar.hidden = !hasQ;
      c.hasQ = hasQ;
    }
    if (hasQ) {
      const q = Math.round(Math.min(1, Math.max(0, qt.left / qt.total)) * 100) / 100;
      if (q !== c.q) {
        this.timeBar.style.setProperty('--q', String(q));
        c.q = q;
      }
      const low = qt.left <= LOW_QUESTION_TIME;
      if (low !== c.qLow) {
        this.promptEl.dataset.low = String(low);
        c.qLow = low;
      }
    }
  }

  // Putar ulang animasi kecil pada angka skor (respons atas apitan).
  _tick(node) {
    node.classList.remove('is-tick');
    void node.offsetWidth;
    node.classList.add('is-tick');
  }

  _buildLives(max) {
    this._maxLives = max;
    this._lifeEls = Array.from({ length: max }, () => make('span', 'hud__life'));
    this.livesEl.replaceChildren(...this._lifeEls);
    this.livesEl.hidden = false;
    this._cache.lives = undefined; // paksa warnai ulang
  }
}
