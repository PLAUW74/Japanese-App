// Holds the dictionary in memory and answers searches off the main thread.
// Word row: [id, [kanji], [kana], [[pos, [gloss], tags], ...], common, jlpt, [searchOnlyForms]?]
import { toHiragana, kataToHira, hasJapanese, isKana } from './kana.js';
import { deinflect } from './deinflect.js';

const MAX_RESULTS = 50;

let rows = [];
let tagNames = {};
let dictDate = '';
const formText = [];   // every written form, katakana folded to hiragana
const formRow = [];    // row index for formText[i]
const exactForms = new Map(); // form -> row indexes, for looking up de-conjugated input
const glossText = [];  // all glosses of a row, lowercased, one per line
const idToRow = new Map();
const quizPool = [];   // common words with a JLPT level, used as quiz distractors

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load the dictionary (HTTP ${res.status})`);
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
  const data = JSON.parse(await fetchText(new URL('../data/dict.json', import.meta.url)));
  rows = data.words;
  tagNames = data.tags || {};
  dictDate = data.date || '';

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    idToRow.set(row[0], i);
    for (const forms of [row[1], row[2], row[6]]) {
      if (!forms) continue;
      for (const form of forms) {
        const text = kataToHira(form);
        formText.push(text);
        formRow.push(i);
        const sameForm = exactForms.get(text);
        if (sameForm) sameForm.push(i);
        else exactForms.set(text, [i]);
      }
    }
    let glosses = '';
    for (const sense of row[3]) glosses += sense[1].join('\n') + '\n';
    glossText.push(glosses.toLowerCase());
    if (row[4] && row[5]) quizPool.push(i);
  }
}

function decode(i, inflection) {
  const row = rows[i];
  return {
    inflection,
    id: row[0],
    kanji: row[1],
    kana: row[2],
    senses: row[3].map((s) => ({
      pos: s[0] ? s[0].split(',') : [],
      gloss: s[1],
      tags: s[2] ? s[2].split(',') : [],
    })),
    common: !!row[4],
    jlpt: row[5],
  };
}

function keep(scores, row, score) {
  if (score > (scores.get(row) || 0)) scores.set(row, score);
}

function searchForms(query, scores, weight = 1) {
  const q = kataToHira(query);
  for (let f = 0; f < formText.length; f++) {
    const text = formText[f];
    const at = text.indexOf(q);
    if (at < 0) continue;
    const extra = text.length - q.length;
    let score;
    if (extra === 0) score = 100;
    else if (at === 0) score = 70 - Math.min(20, extra * 2);
    else score = 35 - Math.min(15, extra);
    keep(scores, formRow[f], score * weight);
  }
}

const TYPE_CHECKS = {
  v1: /(^|,)v1/,
  v5: /(^|,)v5/,
  adj: /(^|,)adj-i/,
  vk: /(^|,)vk/,
  vs: /(^|,)vs-/,
  'noun-vs': /(^|,)vs(,|$)/,
};
const hasType = (row, type) => rows[row][3].some((sense) => TYPE_CHECKS[type].test(sense[0]));

// Conjugated input: のみます -> 飲む. `notes` records which conjugation led to each row.
function searchInflected(query, scores, notes) {
  for (const candidate of deinflect(kataToHira(query))) {
    for (const row of exactForms.get(candidate.term) || []) {
      if (!hasType(row, candidate.type)) continue;
      // 行って is 行く before it is 遣る (which merely lists 行る as a rare spelling).
      const [, kanji, kana] = rows[row];
      const primary = kataToHira(kanji[0] || '') === candidate.term || kataToHira(kana[0]) === candidate.term;
      const score = 96 - candidate.why.length + (primary ? 3 : 0);
      if (score <= (scores.get(row) || 0)) continue;
      scores.set(row, score);
      notes.set(row, { from: query, steps: candidate.why });
    }
  }
}

const isWordChar =(ch) => ch !== undefined && /[a-z0-9]/.test(ch);
const simplify = (gloss) => gloss.replace(/\s*\([^)]*\)/g, '').replace(/^to /, '').trim();

function scoreGlosses(q, row) {
  const senses = rows[row][3];
  let best = 0;
  for (let si = 0; si < senses.length; si++) {
    const glosses = senses[si][1];
    for (let gi = 0; gi < glosses.length; gi++) {
      const gloss = glosses[gi].toLowerCase();
      let at = gloss.indexOf(q);
      if (at < 0) continue;
      let score = 0;
      if (simplify(gloss) === q) {
        score = 100;
      } else {
        // Only count hits that start a word, so "eat" doesn't match "great".
        for (; at >= 0; at = gloss.indexOf(q, at + 1)) {
          if (isWordChar(gloss[at - 1])) continue;
          const whole = !isWordChar(gloss[at + q.length]);
          const base = whole ? (at === 0 ? 70 : 55) : 30;
          score = Math.max(score, base - Math.min(20, (gloss.length - q.length) * 0.5));
        }
      }
      if (score > 0) best = Math.max(best, score - Math.min(si, 5) * 4 - Math.min(gi, 5) * 1.5, 1);
    }
  }
  return best;
}

function searchEnglish(query, scores) {
  const q = simplify(query.toLowerCase()) || query.toLowerCase();
  for (let i = 0; i < glossText.length; i++) {
    if (glossText[i].indexOf(q) < 0) continue;
    const score = scoreGlosses(q, i);
    if (score > 0) keep(scores, i, score);
  }
}

function search(rawQuery) {
  const query = rawQuery.trim();
  if (!query) return { results: [], total: 0 };
  const scores = new Map();
  const notes = new Map();

  if (hasJapanese(query)) {
    searchForms(query, scores);
    searchInflected(query, scores, notes);
    // Still nothing: fall back to the longest leading part that is in the dictionary.
    for (let stem = query.slice(0, -1); !scores.size && stem.length > 0; stem = stem.slice(0, -1)) {
      searchForms(stem, scores, 0.8);
    }
  } else {
    searchEnglish(query, scores);
    const kana = toHiragana(query);
    if (isKana(kana)) {
      searchForms(kana, scores, 0.97);
      searchInflected(kana, scores, notes);
    }
  }

  const ranked = [...scores.entries()].map(([row, score]) => {
    const r = rows[row];
    return [row, score + (r[4] ? 12 : 0) + r[5] * 2];
  });
  ranked.sort((a, b) => b[1] - a[1] || rows[a[0]][2][0].length - rows[b[0]][2][0].length);
  return {
    results: ranked.slice(0, MAX_RESULTS).map(([row]) => decode(row, notes.get(row))),
    total: ranked.length,
  };
}

function random(count, exclude = []) {
  const skip = new Set(exclude);
  const picked = new Set();
  const out = [];
  const limit = Math.min(count, quizPool.length);
  for (let tries = 0; out.length < limit && tries < count * 20; tries++) {
    const row = quizPool[Math.floor(Math.random() * quizPool.length)];
    if (picked.has(row) || skip.has(rows[row][0])) continue;
    picked.add(row);
    out.push(decode(row));
  }
  return out;
}

// Common verbs at JLPT level `minLevel` or easier (5 = N5), for the verb form quiz.
const VERB = /(^|,)(v1|v5|vk|vs-i)/;
function verbs(count, minLevel) {
  const pool = quizPool.filter((row) => rows[row][5] >= minLevel && VERB.test(rows[row][3][0][0]));
  const out = [];
  while (out.length < count && pool.length) {
    out.push(decode(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]));
  }
  return out;
}

const handlers = {
  verbs: ({ count, minLevel }) => verbs(count, minLevel),
  search: ({ query }) => search(query),
  random: ({ count, exclude }) => random(count, exclude),
  get: ({ ids }) => ids.filter((id) => idToRow.has(id)).map((id) => decode(idToRow.get(id))),
};

const ready = load().then(
  () => postMessage({ type: 'ready', count: rows.length, tags: tagNames, date: dictDate }),
  (err) => { postMessage({ type: 'failed', message: err.message }); throw err; },
);

onmessage = async ({ data }) => {
  try {
    await ready;
    postMessage({ type: 'reply', id: data.id, result: handlers[data.type](data) });
  } catch (err) {
    postMessage({ type: 'reply', id: data.id, error: err.message });
  }
};
