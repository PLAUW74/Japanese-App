// Holds the HSK word list in memory and answers searches off the main thread.
// The same protocol as js/dict-worker.js, so the views cannot tell the two apart:
// 'search', 'random' and 'get' all reply with entries shaped like the Japanese ones.
//
// Row in data/zh/vocab.json:
//   [id, hanzi, pinyin, [gloss], pos, band, band2025, [classifier]]
// `kanji` and `kana` carry the hanzi and its reading, so a saved Chinese word is the same
// shape as a saved Japanese one and the store, the quiz and My Words need no changes.
import { plain, toneString } from './pinyin.js';

const MAX_RESULTS = 50;

let rows = [];
let listDate = '';
const hanziText = [];   // every written form
const pinyinText = [];  // the same rows' readings, tones and spacing removed
const pinyinUmlaut = [];// and with ü kept, so a typed ü beats the u spelling
const toneText = [];    // and their tones, '44', for a query that gives them
const glossText = [];   // all glosses of a row, lowercased, one per line
const idToRow = new Map();
// Every written form on the list -> the easiest band it is taught in, and its reading
// there: what the writing page checks a learner's text against.
const byHanzi = new Map();
let longest = 1;

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load the word list (HTTP ${res.status})`);
  const total = Number(res.headers.get('content-length')) || 0;
  if (!res.body || !total) return res.text();

  const reader = res.body.getReader();
  const chunks = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    postMessage({ type: 'progress', value: Math.min(received / total, 0.99) });
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return new TextDecoder().decode(bytes);
}

async function load() {
  const data = JSON.parse(await fetchText(new URL('../../../data/zh/vocab.json', import.meta.url)));
  rows = data.words;
  listDate = data.date || '';
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    idToRow.set(row[0], i);
    const known = byHanzi.get(row[1]);
    if (!known || row[5] < known.band) byHanzi.set(row[1], { band: row[5], pinyin: row[2], id: row[0] });
    longest = Math.max(longest, [...row[1]].length);
    hanziText.push(row[1]);
    pinyinText.push(plain(row[2]));
    pinyinUmlaut.push(row[2].replace(/[1-5]/g, '').replace(/\s+/g, ''));
    toneText.push(toneString(row[2]));
    glossText.push(row[3].join('\n').toLowerCase());
  }
}

// The shape js/views/vocab.js and js/views/quiz.js already know how to draw.
function decode(i) {
  const [id, hanzi, pinyin, gloss, pos, band, band2025, classifiers] = rows[i];
  return {
    id,
    kanji: [hanzi],
    kana: [pinyin],
    senses: [{ pos: pos ? pos.split(',') : [], gloss, tags: [] }],
    common: false,
    jlpt: band,              // the level slot; for Chinese it holds the HSK band
    band2025: band2025 || 0,
    classifiers: classifiers || [],
  };
}

const keep = (scores, row, score) => {
  if (score > (scores.get(row) || 0)) scores.set(row, score);
};

// Nearer the front and closer to the whole string scores higher, as in the Japanese worker.
function position(text, query, best) {
  const at = text.indexOf(query);
  if (at < 0) return 0;
  const extra = text.length - query.length;
  if (extra === 0) return best;
  if (at === 0) return best * 0.7 - Math.min(20, extra * 2);
  return best * 0.35 - Math.min(15, extra);
}

const HANZI = /[㐀-鿿]/;

function search(query) {
  const text = query.trim();
  if (!text) return [];
  const scores = new Map();

  if (HANZI.test(text)) {
    for (let i = 0; i < hanziText.length; i++) {
      const score = position(hanziText[i], text, 100);
      if (score > 0) keep(scores, i, score);
    }
  } else {
    const lower = text.toLowerCase();
    const asPinyin = plain(text);
    // Tones typed as digits narrow the search; without them every tone matches.
    const wantedTones = (text.match(/[1-5]/g) || []).join('');
    const typedUmlaut = lower.replace(/u:/g, 'ü').replace(/v/g, 'ü').replace(/[^a-zü]/g, '');
    const hasUmlaut = typedUmlaut.includes('ü');
    if (asPinyin) {
      for (let i = 0; i < pinyinText.length; i++) {
        let score = position(pinyinText[i], asPinyin, 100);
        if (score <= 0) continue;
        if (wantedTones && !toneText[i].startsWith(wantedTones)) continue;
        // 绿 lǜ and 路 lù read the same once ü is folded to u, so a typed ü breaks the tie.
        if (hasUmlaut && pinyinUmlaut[i].includes(typedUmlaut)) score += 15;
        keep(scores, i, score);
      }
    }
    for (let i = 0; i < glossText.length; i++) {
      const gloss = glossText[i];
      let score = 0;
      for (const line of gloss.split('\n')) {
        if (line === lower) score = Math.max(score, 90);
        else if (new RegExp(`\\b${lower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(line)) score = Math.max(score, 60);
        else if (line.includes(lower)) score = Math.max(score, 30);
      }
      if (score > 0) keep(scores, i, score);
    }
  }

  const ranked = [...scores.entries()]
    // A tie goes to the easier word: band 1 before band 6.
    .sort((a, b) => b[1] - a[1] || rows[a[0]][5] - rows[b[0]][5]);
  return { total: ranked.length, results: ranked.slice(0, MAX_RESULTS).map(([row]) => decode(row)) };
}

// One band's words, in the order the syllabus lists them, a page at a time.
function band(level, offset = 0, limit = 100) {
  const matching = [];
  for (let i = 0; i < rows.length; i++) if (rows[i][5] === level) matching.push(i);
  return {
    total: matching.length,
    results: matching.slice(offset, offset + limit).map(decode),
  };
}

// Every id in a band, so the whole lot can be saved at once without shipping the words.
function bandIds(level) {
  const ids = [];
  for (const row of rows) if (row[5] === level) ids.push(row[0]);
  return ids;
}

// Wrong answers for a multiple-choice question. Words from the same band make a better
// question than words from anywhere in the list.
function random(count, exclude = [], band = 0) {
  const skip = new Set(exclude.map(Number));
  const pool = [];
  for (let i = 0; i < rows.length; i++) {
    if (skip.has(rows[i][0])) continue;
    if (band && rows[i][5] !== band) continue;
    pool.push(i);
  }
  const wanted = Math.min(count, pool.length);
  const out = [];
  const taken = new Set();
  while (out.length < wanted) {
    const pick = pool[Math.floor(Math.random() * pool.length)];
    if (taken.has(pick)) continue;
    taken.add(pick);
    out.push(decode(pick));
  }
  return out;
}

const get = (ids) => ids.map((id) => idToRow.get(Number(id))).filter((i) => i != null).map(decode);

// Splits Chinese text into the words of the list, longest match first: 我们是朋友 becomes
// 我们 / 是 / 朋友. A character no listed word starts with stands alone with band 0 — not on
// the HSK 1-6 list at all. Anything that is not a character (punctuation, Latin letters,
// spaces) passes through as `other`. Longest-first matching is not a full segmenter — it
// can join the end of one word to the start of the next — but over a learner's sentences
// and a 5,000-word list it gets the words right far more often than not, and it only has
// to be good enough to flag a word for a second look.
function segment(text) {
  const chars = [...String(text || '')];
  const out = [];
  let i = 0;
  while (i < chars.length) {
    if (!HANZI.test(chars[i])) {
      let j = i;
      while (j < chars.length && !HANZI.test(chars[j])) j += 1;
      out.push({ text: chars.slice(i, j).join(''), other: true });
      i = j;
      continue;
    }
    let found = null;
    for (let length = Math.min(longest, chars.length - i); length >= 1; length -= 1) {
      const piece = chars.slice(i, i + length);
      if (piece.some((ch) => !HANZI.test(ch))) continue;
      const hit = byHanzi.get(piece.join(''));
      if (hit) { found = { text: piece.join(''), ...hit }; break; }
    }
    if (!found) found = { text: chars[i], band: 0 };
    out.push(found);
    i += [...found.text].length;
  }
  return out;
}

const HANDLERS = {
  search: ({ query }) => search(query),
  random: ({ count, exclude, band: level }) => random(count, exclude, level),
  get: ({ ids }) => get(ids),
  band: ({ level, offset, limit }) => band(level, offset, limit),
  bandIds: ({ level }) => bandIds(level),
  segment: ({ text }) => segment(text),
};

const loaded = load();
loaded.then(
  () => postMessage({ type: 'ready', count: rows.length, date: listDate }),
  (err) => postMessage({ type: 'failed', message: err.message }),
);

// The worker starts on the first call, so that call arrives while the list is still
// loading. Every request waits for it: answered early, a search finds nothing and a
// sentence splits into single characters that all look unknown.
onmessage = async ({ data }) => {
  const handler = HANDLERS[data.type];
  if (!handler) return;
  try {
    await loaded;
    postMessage({ type: 'reply', id: data.id, result: handler(data) });
  } catch (err) {
    postMessage({ type: 'reply', id: data.id, error: err.message });
  }
};
