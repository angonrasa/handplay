// js/ui/ResultScreen.js
// ResultScreen — mengisi layar Hasil (M5.5) dari ringkasan ronde `GameEngine.result`.
// Hanya MEMBACA hasil dan menulis ke DOM; tidak menyentuh state permainan. Semua teks dari soal dimasukkan
// lewat textContent (bukan innerHTML), jadi bank soal buatan guru tidak bisa menyisipkan markup.
// Satu fokus: skor (dihitung naik sekali saat layar muncul). Soal yang keliru disembunyikan di balik satu tombol.

const REASON_TITLE = {
  time: 'Waktu habis',
  lives: 'Nyawa habis',
  questions: 'Semua soal selesai',
  manual: 'Ronde selesai',
};

const COUNT_MS = 800;

function make(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function prefersReducedMotion() {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function noteFor({ correct, wrong }) {
  const answered = correct + wrong;
  if (answered === 0) return 'Belum ada soal yang dijawab.';
  if (wrong === 0) return 'Semua jawabanmu benar.';
  return `${correct} dari ${answered} jawaban benar.`;
}

export class ResultScreen {
  /** @param {HTMLElement} root  elemen #result */
  constructor(root) {
    if (!root) throw new TypeError('ResultScreen: root wajib diisi');
    this.root = root;
    const part = (name) => root.querySelector(`[data-result="${name}"]`);
    this.el = {
      meter: part('meter'),
      arc: part('arc'),
      score: part('score'),
      title: part('title'),
      note: part('note'),
      correct: part('correct'),
      wrong: part('wrong'),
      skipped: part('skipped'),
      review: part('review'),
      reviewTitle: part('review-title'),
      list: part('wrong-list'),
    };
    this._raf = 0;
  }

  /**
   * @param {{ reason?: string, score?: number, correct?: number, wrong?: number, skipped?: number,
   *   accuracy?: number|null, wrongItems?: { prompt: string, picked: string|null, answer: string|null, explain?: string }[] }|null} result
   *  bentuk GameEngine.result (ScoreManager.summary() + reason)
   */
  render(result) {
    const r = result || {};
    const score = Number.isFinite(r.score) ? r.score : 0;
    const correct = r.correct || 0;
    const wrong = r.wrong || 0;
    const skipped = r.skipped || 0;
    const accuracy = typeof r.accuracy === 'number' ? Math.min(1, Math.max(0, r.accuracy)) : null;
    const pct = accuracy === null ? 0 : Math.round(accuracy * 100);
    const e = this.el;

    e.title.textContent = REASON_TITLE[r.reason] || REASON_TITLE.manual;
    e.note.textContent = noteFor({ correct, wrong });
    e.correct.textContent = String(correct);
    e.wrong.textContent = String(wrong);
    e.skipped.textContent = String(skipped);
    e.meter.setAttribute('aria-label', accuracy === null ? `Skor ${score}` : `Skor ${score}, akurasi ${pct} persen`);

    this._renderReview(Array.isArray(r.wrongItems) ? r.wrongItems : []);
    this.root.scrollTop = 0;

    // Cincin akurasi: mulai dari kosong, lalu tumbuh (transisi ada di css/result.css).
    e.arc.style.strokeDashoffset = '100';
    void e.arc.getBoundingClientRect();
    e.arc.style.strokeDashoffset = String(100 - pct);

    this._countTo(score);
  }

  _renderReview(items) {
    const e = this.el;
    e.review.open = false;
    e.review.hidden = items.length === 0;
    e.list.replaceChildren();
    if (!items.length) return;
    e.reviewTitle.textContent = items.length === 1 ? 'Pelajari 1 soal yang keliru' : `Pelajari ${items.length} soal yang keliru`;

    for (const item of items) {
      const li = make('li', 'result__miss');
      li.append(make('p', 'result__miss-q', item.prompt || ''));
      if (item.picked) {
        const line = make('p', 'result__miss-line result__miss-line--picked', 'Jawabanmu: ');
        line.append(make('strong', '', item.picked));
        li.append(line);
      }
      if (item.answer) {
        const line = make('p', 'result__miss-line result__miss-line--answer', 'Jawaban benar: ');
        line.append(make('strong', '', item.answer));
        li.append(line);
      }
      if (item.explain) li.append(make('p', 'result__miss-why', item.explain));
      e.list.append(li);
    }
  }

  // Skor dihitung naik sekali (respons atas selesainya ronde). Gerak dimatikan bila pemain memintanya.
  _countTo(target) {
    cancelAnimationFrame(this._raf);
    const node = this.el.score;
    if (prefersReducedMotion() || target <= 0) {
      node.textContent = String(target);
      return;
    }
    const start = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - start) / COUNT_MS);
      const eased = 1 - (1 - k) ** 3;
      node.textContent = String(Math.round(target * eased));
      if (k < 1) this._raf = requestAnimationFrame(step);
    };
    node.textContent = '0';
    this._raf = requestAnimationFrame(step);
  }
}
