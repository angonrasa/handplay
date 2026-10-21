// js/game/QuestionBank.js
// QuestionBank — memuat, memvalidasi, dan mengacak bank soal (data/banks/*.json).
// Soal adalah data, bukan kode. Skema dan aturan validasi: blueprint bagian 8.
//
// Soal yang salah dibuang beserta peringatan yang menyebut id dan alasannya (bank.warnings), supaya satu salah
// ketik tidak menghentikan permainan tetapi juga tidak lolos diam-diam. Bank tanpa soal valid ditolak.
// `strict: true` menolak seluruh bank bila ada satu saja soal yang salah (berguna saat menyusun soal).

export const QUESTION_TYPES = Object.freeze(['pick-correct', 'group', 'sequence']);

export class QuestionBankError extends Error {
  /** @param {'http'|'json'|'invalid'} code  @param {string} message  @param {{path:string,message:string}[]} [problems] */
  constructor(code, message, problems = []) {
    super(message);
    this.name = 'QuestionBankError';
    this.code = code;
    this.problems = problems;
  }
}

const isText = (v) => typeof v === 'string' && v.trim() !== '';
const clean = (list) => list.map((s) => s.trim());
const key = (s) => s.trim().toLowerCase();

/** Acak Fisher–Yates; salinan baru, `rng` bisa diganti agar hasilnya bisa diuji. */
export function shuffle(list, rng = Math.random) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function textList(item, field, min, problems) {
  const v = item[field];
  if (!Array.isArray(v)) {
    problems.push(`"${field}" harus berupa daftar teks`);
    return null;
  }
  if (!v.every(isText)) {
    problems.push(`"${field}" berisi isian kosong atau bukan teks`);
    return null;
  }
  if (v.length < min) problems.push(`"${field}" minimal ${min} isian (ada ${v.length})`);
  const seen = new Set();
  for (const s of v) {
    if (seen.has(key(s))) problems.push(`"${field}" berisi duplikat: "${s.trim()}"`);
    seen.add(key(s));
  }
  return v;
}

/** Periksa satu soal. Kembalikan { item, problems }; item null bila ada masalah. */
function checkItem(raw) {
  const problems = [];
  if (!raw || typeof raw !== 'object') return { item: null, problems: ['soal harus berupa objek'] };
  if (!isText(raw.id)) problems.push('"id" kosong');
  if (!QUESTION_TYPES.includes(raw.type)) problems.push(`"type" tidak dikenal: ${JSON.stringify(raw.type)} (pilihan: ${QUESTION_TYPES.join(', ')})`);
  if (!isText(raw.prompt)) problems.push('"prompt" kosong');
  if (!isText(raw.explain)) problems.push('"explain" kosong (setiap soal wajib punya penjelasan)');

  let item = null;
  if (QUESTION_TYPES.includes(raw.type)) {
    if (raw.type === 'sequence') {
      const seq = textList(raw, 'sequence', 2, problems);
      if (seq) item = { sequence: clean(seq) };
    } else {
      const correct = textList(raw, 'correct', raw.type === 'pick-correct' ? 1 : 2, problems);
      const distractors = textList(raw, 'distractors', 1, problems);
      if (raw.type === 'pick-correct' && Array.isArray(raw.correct) && raw.correct.length > 1) problems.push('"correct" harus tepat 1 isian untuk pick-correct');
      if (correct && distractors) {
        const correctKeys = new Set(correct.map(key));
        for (const d of distractors) if (correctKeys.has(key(d))) problems.push(`"${d.trim()}" ada di "correct" sekaligus "distractors"`);
        item = { correct: clean(correct), distractors: clean(distractors) };
      }
    }
  }
  if (problems.length || !item) return { item: null, problems };
  return { item: { id: raw.id.trim(), type: raw.type, prompt: raw.prompt.trim(), ...item, explain: raw.explain.trim() }, problems };
}

export class QuestionBank {
  constructor({ bankId, title, items, warnings = [] }) {
    this.bankId = bankId;
    this.title = title;
    this.items = Object.freeze(items);
    this.warnings = warnings; // [{ path, message }] soal yang dibuang
  }

  /**
   * Periksa data bank mentah (hasil JSON.parse). Tidak melempar galat.
   * @returns {{ bankId: string, title: string, items: object[], problems: {path:string,message:string}[], fatal: boolean }}
   *  problems: semua masalah; fatal: bank tidak bisa dipakai sama sekali.
   */
  static validate(data) {
    const problems = [];
    const add = (path, message) => problems.push({ path, message });
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      add('bank', 'isi berkas bukan objek');
      return { bankId: '', title: '', items: [], problems, fatal: true };
    }
    if (!isText(data.bankId)) add('bank', '"bankId" kosong');
    if (!isText(data.title)) add('bank', '"title" kosong');
    if (!Array.isArray(data.items) || data.items.length === 0) {
      add('bank', '"items" harus berupa daftar soal yang tidak kosong');
      return { bankId: String(data.bankId ?? ''), title: String(data.title ?? ''), items: [], problems, fatal: true };
    }

    const items = [];
    const ids = new Set();
    data.items.forEach((raw, i) => {
      const label = raw && isText(raw.id) ? raw.id.trim() : `#${i + 1}`;
      const { item, problems: itemProblems } = checkItem(raw);
      if (item && ids.has(item.id)) itemProblems.push(`"id" ganda: ${item.id}`);
      for (const message of itemProblems) add(label, message);
      if (item && !itemProblems.length) {
        ids.add(item.id);
        items.push(item);
      }
    });
    const fatal = items.length === 0 || problems.some((p) => p.path === 'bank');
    return { bankId: isText(data.bankId) ? data.bankId.trim() : '', title: isText(data.title) ? data.title.trim() : '', items, problems, fatal };
  }

  /**
   * Bangun bank dari data mentah. Lempar QuestionBankError (code 'invalid') bila bank tidak bisa dipakai,
   * atau bila `strict` dan ada satu saja masalah.
   * @param {object} data  @param {{ strict?: boolean }} [options]
   */
  static from(data, { strict = false } = {}) {
    const result = QuestionBank.validate(data);
    if (result.fatal || (strict && result.problems.length)) {
      const detail = result.problems.map((p) => `${p.path}: ${p.message}`).join('; ');
      throw new QuestionBankError('invalid', `Bank soal tidak valid. ${detail}`, result.problems);
    }
    if (result.problems.length) {
      console.warn(`[handplay] bank soal "${result.bankId}": ${result.problems.length} masalah, soal terkait dibuang:`, result.problems);
    }
    return new QuestionBank({ ...result, warnings: result.problems });
  }

  /**
   * Muat dari alamat JSON.
   * @param {string|URL} url  @param {{ strict?: boolean, fetchFn?: typeof fetch }} [options]
   * @throws {QuestionBankError} code 'http' (berkas tidak terbaca), 'json' (bukan JSON), atau 'invalid'
   */
  static async load(url, { strict = false, fetchFn = (typeof fetch === 'function' ? fetch : null) } = {}) {
    if (!fetchFn) throw new QuestionBankError('http', 'fetch tidak tersedia');
    let res;
    try {
      res = await fetchFn(url);
    } catch (err) {
      throw new QuestionBankError('http', `Bank soal tidak bisa dimuat: ${err?.message || err}`);
    }
    if (!res.ok) throw new QuestionBankError('http', `Bank soal tidak bisa dimuat (HTTP ${res.status}): ${url}`);
    let data;
    try {
      data = await res.json();
    } catch (err) {
      throw new QuestionBankError('json', `Bank soal bukan JSON yang valid: ${err?.message || err}`);
    }
    return QuestionBank.from(data, { strict });
  }

  getById(id) {
    return this.items.find((item) => item.id === id) || null;
  }

  byType(type) {
    return this.items.filter((item) => item.type === type);
  }

  /**
   * Ambil soal secara acak tanpa pengulangan. Bank tidak berubah.
   * @param {{ type?: string, count?: number, rng?: () => number }} [options]  tanpa `count` = semua soal (diacak)
   */
  draw({ type, count, rng = Math.random } = {}) {
    const pool = type ? this.byType(type) : this.items.slice();
    const mixed = shuffle(pool, rng);
    return Number.isInteger(count) && count >= 0 ? mixed.slice(0, count) : mixed;
  }
}
