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

// ---- picking the words out of a sentence ----
// Input is 漢字{かんじ} markup, as the grammar questions are written. Each annotated kanji run is
// kept whole, and its reading is used to tell 時{じ} from 時{とき}. Matching is greedy, longest
// first, through conjugations too (起{お}きます → 起きる, 勉強{べんきょう}します → 勉強).
const MARKED = /([㐀-鿿々〆ヶ]+)\{([^}]+)\}/g;
const MAX_PIECES = 10;
// Grammar words aren't vocab to collect: particles, auxiliaries (ます), the copula (です).
const FUNCTION_WORD = /^(prt|aux|cop)/;
const HAS_KANJI_OR_KATAKANA = /[㐀-鿿々〆ヶ゠-ヿ]/;

function pieces(markup) {
  const out = [];
  let at = 0;
  const plain = (text) => { for (const ch of text) out.push({ text: ch, reading: ch, annotated: false }); };
  for (const match of markup.matchAll(MARKED)) {
    plain(markup.slice(at, match.index));
    out.push({ text: match[1], reading: match[2], annotated: true });
    at = match.index + match[0].length;
  }
  plain(markup.slice(at));
  return out;
}

// Set phrases (雨が降る, タバコを吸う) would swallow two words the learner wants separately.
const isPhrase = (row) => /(^|,)exp(,|$)/.test(rows[row][3][0][0] || '');
const kanaFirst = (row) => /(^|,)uk(,|$)/.test(rows[row][3][0][2] || '');
// Right after a word, one of these is almost always a particle, not the start of the next
// word: すしがいちばん is すし・が・いちばん, never すし・がいち (外地)・ばん.
const PARTICLE = new Set('がをにでとはもへのやか');
// After a て-form these are grammar (降っている, 書いてある), not vocabulary.
const TE_HELPERS = new Set(['いる', 'ある']);
// Copula and negative endings, stepped over when they follow a word (簡単でした, 暑くないです,
// 晴れるでしょう) so their pieces aren't read as words of their own (でし|た, しょう = 章).
const ENDINGS = ['でしょう', 'でした', 'です', 'だった', 'だろう', 'では', 'じゃ', 'なかった', 'ない', 'ません', 'そうです'];
const HIRAGANA = /[ぁ-ゖ]/;
const KATAKANA = /[ァ-ヺ]/;
// Stock phrases written all in kana with no particle sound in them (ください, いけません) are
// matched so they aren't split into nonsense, but never offered as vocabulary. Others
// (と言う, 雨が降る, より大きい) would swallow the words around them.
const phraseUsable = (written) => isKana(written) && ![...written].some((ch) => PARTICLE.has(ch));

// Scores a candidate row, or returns -1 when it can't be the word. The sentence's reading
// counts most; then being written the way the entry normally is (だれ is 誰, not the katakana
// ダレ; から is the particle, not 空); then how basic the word is, since these are N5–N4
// sentences. When the sentence gives a reading (`annotated`) a row has to match it:
// 7時{じ}に is not 時に{ときに}.
function score(row, readings, written, annotated) {
  const [, kanji, kana, , common, jlpt] = rows[row];
  const readingMatches = readings.some((r) => kana.some((k) => kataToHira(k) === r));
  if (annotated && !readingMatches) return -1;
  let total = readingMatches ? 100 : 0;
  // Katakana is matched to the katakana spelling: ボタン is the button, not 牡丹 (ぼたん).
  if ((kanji[0] || kana[0]) === written || (KATAKANA.test(written) && kana.includes(written))) total += 40;
  if (isKana(written) && kanaFirst(row)) total += 10;
  // Common outweighs the JLPT level, which the data sometimes pins on a namesake: ボタン's N5
  // sits on 牡丹 (peony), not on the common button entry.
  if (common) total += 25;
  return total + jlpt * 4;
}

function best(candidates, readings, written, annotated, penalty = 0) {
  let pick = { row: -1, score: -1 };
  for (const row of candidates) {
    const s = score(row, readings, written, annotated) - penalty;
    if (s >= 0 && s > pick.score) pick = { row, score: s };
  }
  return pick;
}

// The likeliest entry for this stretch of text, as written or with its conjugation undone
// (して is する, not 仕手). Undone forms give way to an equally good match as written.
function lookUp(written, reading, annotated) {
  const w = kataToHira(written);
  const r = kataToHira(reading);
  const usable = (row) => !isPhrase(row) || phraseUsable(written);
  const asWritten = best((exactForms.get(w) || []).filter(usable), [r], written, annotated);
  const undone = [];
  for (const candidate of deinflect(w)) {
    for (const row of exactForms.get(candidate.term) || []) {
      if (hasType(row, candidate.type) && usable(row)) undone.push(row);
    }
  }
  const asConjugated = best(undone, deinflect(r).map((c) => c.term), written, annotated, 10);
  return asConjugated.score > asWritten.score ? asConjugated : asWritten;
}

const isFunctionWord = (row) => (rows[row][3][0][0] || '').split(',').every((tag) => FUNCTION_WORD.test(tag));
const isHidden = (row) => isFunctionWord(row) || isPhrase(row);
const isVocab = (row, written) => !isHidden(row) && (HAS_KANJI_OR_KATAKANA.test(written) || written.length >= 2);

// The longest entry starting at part i: { row, length, written }, or null.
function matchAt(parts, i) {
  for (let j = Math.min(parts.length, i + MAX_PIECES); j > i; j--) {
    const span = parts.slice(i, j);
    const written = span.map((p) => p.text).join('');
    // Hiragana and katakana never make one word here: 有名な|レストラン, not 慣れ (なレ).
    if (HIRAGANA.test(written) && KATAKANA.test(written)) continue;
    const annotated = span.some((p) => p.annotated);
    const found = lookUp(written, span.map((p) => p.reading).join(''), annotated);
    if (found.row < 0) continue;
    // Plain kana ending in a particle sound has to be a very common word to count:
    // 田中さんが is さん・が, not 参賀 (さんが).
    if (!annotated && PARTICLE.has(written.slice(-1)) && written.length > 2 && found.score < 145) continue;
    return { row: found.row, length: j - i, written };
  }
  return null;
}

const endingAt = (parts, i) => {
  const ahead = parts.slice(i, i + 4).map((p) => p.text).join('');
  return ENDINGS.find((ending) => ahead.startsWith(ending));
};

function words(markup) {
  const parts = pieces(markup);
  const seen = new Set();
  const out = [];
  let previous = null; // the last word matched, while nothing else has come between
  for (let i = 0; i < parts.length;) {
    // Spaces between phrases (降って いる) and closing quotes (「ありがとう」と) don't end a
    // word's context.
    if (/^[\s」』）)]$/.test(parts[i].text)) { i += 1; continue; }
    const ending = previous && endingAt(parts, i);
    if (ending) { i += ending.length; previous = null; continue; }
    // A particle after a word: step over just that one character (を, then して is する;
    // taking the longest match would swallow をして as a particle phrase).
    if (previous && PARTICLE.has(parts[i].text)) { i += 1; previous = null; continue; }
    const match = matchAt(parts, i);
    if (!match) { previous = null; i += 1; continue; }
    const helper = previous && /[てで]$/.test(previous.written)
      && rows[match.row][2].some((k) => TE_HELPERS.has(kataToHira(k)));
    if (!helper && isVocab(match.row, match.written) && !seen.has(match.row)) {
      seen.add(match.row);
      out.push(decode(match.row));
    }
    previous = match;
    i += match.length;
  }
  return out;
}

const handlers = {
  words: ({ markup }) => words(markup),
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
