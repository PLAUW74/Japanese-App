// Everything the learner owns (saved words, lists, review history) lives in localStorage.
// Changes are also tracked so js/sync.js can copy them to the learner's account.
//
// The app teaches more than one language, so each one owns its own words, lists, schedule,
// mistakes and settings under `langs`. Most of this module works on whichever language is
// showing, set by js/app.js through setLang(), so a view can call allWords() without
// knowing or caring which language it is drawing. forLang() reaches another one, which is
// how a Chinese card can mention the hanzi already saved as Japanese kanji.
//
// The study log is kept per language too, but the streak counts a day studied in any of
// them: one habit, one streak.

const KEY = 'kotoba:v1';
const DEVICE_KEY = 'kotoba:device';
export const DAY = 86400000;
const MAX_SENSES = 8;

export const LANGS = ['ja', 'zh'];
export const DEFAULT_LANG = 'ja';

// Quiz settings every language has, then the ones only one of them uses. These live here
// rather than in js/lang/*.js so the store keeps importing nothing: the language modules
// import the views, which import the store.
const BASE_SETTINGS = {
  source: 'challenge', mode: 'mixed', direction: 'mixed', count: 10,
  challengeSize: 10,
};
const LANG_SETTINGS = {
  ja: {
    kanaScript: 'hiragana', kanaGroups: ['basic'], kanaMode: 'read', kanaCount: 20,
    verbSource: 'n5', verbTarget: 'te', verbMode: 'type', verbCount: 10,
    grammarLevel: 'both', grammarTopic: 'all', grammarCount: 10,
  },
  // HSK bands 1-6 are 5,456 words in 78 weeks, so the Chinese side needs a far bigger
  // daily helping than the Japanese one. Separate new-card and review limits come with
  // the Chinese SRS itself (M3); this is the single cap until then.
  zh: {
    challengeSize: 40,
    band: 1,
  },
};

const blankLang = (code) => ({
  words: {},     // id -> saved word
  lists: [],     // [{ id, name }]
  listsAt: 0,    // when the lists last changed, for syncing
  deleted: {},   // id -> when a word was removed, so sync doesn't bring it back
  log: {},       // this device's 'YYYY-MM-DD' -> { reviews, correct }
  kana: {},      // this device's character -> [right, wrong] from the character test
  mistakes: [],  // this device's wrong answers: [{ key, quiz, prompt, answer, given, note, en, at }]
  cleared: {},   // mistake key -> when it was answered right or dismissed
  vocab: {},     // this device's word id -> { wrong, right, at, entry }: words met inside quiz questions
  answers: {},   // note page -> { values, updatedAt }: what was typed into its blanks
  settings: { ...BASE_SETTINGS, ...LANG_SETTINGS[code] },
});

const blank = () => ({
  version: 2,
  lang: DEFAULT_LANG,  // the language last shown, so the app reopens where it was left
  langs: Object.fromEntries(LANGS.map((code) => [code, blankLang(code)])),
  others: {},          // deviceId -> { ja: {...}, zh: {...} }: the other devices' logs and mistakes
});

// Version 1 held one language, flat, and it was Japanese.
function migrate(saved) {
  if (saved.version >= 2) return saved;
  const { version, others, ...japanese } = saved;
  const fresh = blank();
  return {
    ...fresh,
    langs: { ...fresh.langs, ja: { ...fresh.langs.ja, ...japanese, settings: { ...fresh.langs.ja.settings, ...japanese.settings } } },
    // The same shape deviceDoc() writes, so deviceBucket() reads these the same way.
    others: Object.fromEntries(Object.entries(others || {}).map(([id, doc]) => [id, { ...doc, langs: { ja: doc } }])),
  };
}

function fill(saved) {
  const fresh = blank();
  const langs = {};
  for (const code of LANGS) {
    const own = (saved.langs && saved.langs[code]) || {};
    langs[code] = { ...fresh.langs[code], ...own, settings: { ...fresh.langs[code].settings, ...own.settings } };
  }
  return { ...fresh, ...saved, langs };
}

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return fill(migrate(JSON.parse(raw)));
  } catch (err) {
    console.error('Could not read saved data', err);
  }
  return blank();
}

function readDeviceId() {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch (err) {
    return 'unknown';
  }
}

let state = read();
let current = LANGS.includes(state.lang) ? state.lang : DEFAULT_LANG;
export const deviceId = readDeviceId();
const subscribers = new Set();

// Whichever language is showing. Everything below works on this one unless told otherwise.
const bucket = (lang = current) => state.langs[lang] || state.langs[DEFAULT_LANG];

export const getLang = () => current;

export function setLang(lang) {
  if (!LANGS.includes(lang) || lang === current) return false;
  current = lang;
  state.lang = lang;
  commit(true);
  return true;
}

// What has changed locally since sync last took it, per language.
const freshDirty = () => ({ words: new Set(), lists: false, device: false, answers: new Set() });
const dirty = Object.fromEntries(LANGS.map((code) => [code, freshDirty()]));
const dirtyListeners = new Set();
const langDirty = (d) => d.words.size > 0 || d.lists || d.device || d.answers.size > 0;
const isDirty = () => LANGS.some((code) => langDirty(dirty[code]));

function commit(silent = false) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (err) {
    console.error('Could not save data', err);
  }
  if (!silent) subscribers.forEach((fn) => fn(state));
  if (isDirty()) dirtyListeners.forEach((fn) => fn());
}

// The language on show. A view reads `lists` and `settings` off this, as it always has.
export const getState = () => bucket();
// Everything, every language: for backups and syncing.
export const getRoot = () => state;

export function subscribe(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

export function dayKey(ts = Date.now()) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function startOfDay(ts = Date.now()) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

const freshSrs = (now) => ({ due: now, interval: 0, ease: 2.5, reps: 0, lapses: 0 });

function touch(word, lang = current) {
  word.updatedAt = Date.now();
  dirty[lang].words.add(String(word.id));
}

function touchLists(lang = current) {
  bucket(lang).listsAt = Date.now();
  dirty[lang].lists = true;
}

// ---- words ----

export const hasWord = (id) => id in bucket().words;
export const allWords = () => Object.values(bucket().words);

export function addWord(entry, listId = null) {
  const words = bucket().words;
  if (words[entry.id]) return;
  const now = Date.now();
  const word = {
    id: entry.id,
    kanji: entry.kanji,
    kana: entry.kana,
    senses: entry.senses.slice(0, MAX_SENSES),
    common: entry.common,
    jlpt: entry.jlpt,
    addedAt: now,
    listIds: listId ? [listId] : [],
    note: '',
    srs: freshSrs(now),
    stats: { correct: 0, wrong: 0, last: 0 },
  };
  words[entry.id] = word;
  delete bucket().deleted[entry.id];
  touch(word);
  commit();
}

export function removeWord(id) {
  delete bucket().words[id];
  bucket().deleted[id] = Date.now();
  dirty[current].words.add(String(id));
  commit();
}

export function updateWord(id, patch, { silent = false } = {}) {
  const word = bucket().words[id];
  if (!word) return;
  Object.assign(word, patch);
  touch(word);
  commit(silent);
}

export function resetProgress(id) {
  const word = bucket().words[id];
  if (!word) return;
  word.srs = freshSrs(Date.now());
  word.stats = { correct: 0, wrong: 0, last: 0 };
  touch(word);
  commit();
}

// ---- lists ----

export function createList(name) {
  const list = { id: `l${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name };
  bucket().lists.push(list);
  touchLists();
  commit();
  return list;
}

export function renameList(id, name) {
  const list = bucket().lists.find((l) => l.id === id);
  if (!list) return;
  list.name = name;
  touchLists();
  commit();
}

export function deleteList(id) {
  bucket().lists = bucket().lists.filter((l) => l.id !== id);
  for (const word of allWords()) {
    if (!word.listIds.includes(id)) continue;
    word.listIds = word.listIds.filter((l) => l !== id);
    touch(word);
  }
  touchLists();
  commit();
}

export function toggleWordList(wordId, listId) {
  const word = bucket().words[wordId];
  if (!word) return;
  word.listIds = word.listIds.includes(listId)
    ? word.listIds.filter((l) => l !== listId)
    : [...word.listIds, listId];
  touch(word);
  commit();
}

export const wordsInList = (listId) => allWords().filter((w) => w.listIds.includes(listId));

// ---- another language ----
// A read-only handle on a language that isn't showing, for the places where one language
// has something to say about the other.
export const forLang = (lang) => ({
  words: () => Object.values(bucket(lang).words),
  word: (id) => bucket(lang).words[id],
  lists: () => bucket(lang).lists,
});

// ---- spaced repetition ----

export const isDue = (word, now = Date.now()) => word.srs.due <= now;
export const dueWords = (now = Date.now()) => allWords().filter((w) => isDue(w, now));

// ---- daily challenge ----
// Instead of facing every due word at once, the learner gets a helping a day: the most
// overdue ones, picked the first time the day's challenge is asked for and kept for the rest
// of the day. A word counts as done once it has been answered today, right or wrong. When
// all are done, another helping can be added. The pick lives in this device's settings.
// How big a helping is depends on the language (settings.challengeSize).
export const CHALLENGE_SIZE = 10;

const challengeSize = (lang = current) => bucket(lang).settings.challengeSize || CHALLENGE_SIZE;

const reviewedToday = (word, now) => word.stats.last >= startOfDay(now);

function pickDue(now, taken) {
  return dueWords(now)
    .filter((word) => !taken.includes(word.id) && !reviewedToday(word, now))
    .sort((a, b) => a.srs.due - b.srs.due)
    .slice(0, challengeSize())
    .map((word) => word.id);
}

// A challenge worth less than a full helping, that the learner has not started. Growing it
// is fair; growing one already under way would move the finish line while they worked.
function shortAndUnstarted(pick, now) {
  const words = bucket().words;
  const picked = pick.ids.map((id) => words[id]).filter(Boolean);
  return picked.length < challengeSize() && !picked.some((word) => reviewedToday(word, now));
}

function todaysPick(now) {
  const day = dayKey(now);
  const { settings, words } = bucket();
  let pick = settings.challenge;
  if (!pick || pick.day !== day) {
    pick = { day, ids: pickDue(now, []) };
    settings.challenge = pick;
    commit(true);
  } else if (!pick.ids.some((id) => words[id]) || shortAndUnstarted(pick, now)) {
    // Picked when nothing was waiting, or when less was waiting than a full helping and
    // none of it has been answered yet. Either way the day's words are still open, so take
    // them again: saving a band of words should give a full challenge, not the one word
    // that happened to be saved first.
    const ids = pickDue(now, []);
    if (ids.length) {
      pick.ids = ids;
      commit(true);
    }
  }
  return pick;
}

// { words, done, left, more }: today's words, how many are done, the ones still to do, and
// whether another helping could be added. Never the total number due.
export function dailyChallenge(now = Date.now()) {
  const pick = todaysPick(now);
  const words = pick.ids.map((id) => bucket().words[id]).filter(Boolean);
  const left = words.filter((word) => !reviewedToday(word, now));
  return {
    words,
    done: words.length - left.length,
    left,
    more: left.length === 0 && pickDue(now, pick.ids).length > 0,
    size: challengeSize(),
  };
}

export function extendChallenge(now = Date.now()) {
  const pick = todaysPick(now);
  pick.ids = pick.ids.concat(pickDue(now, pick.ids));
  commit();
}

export function wordStatus(word, now = Date.now()) {
  if (!word.stats.correct && !word.stats.wrong) return 'new';
  if (isDue(word, now)) return 'due';
  return word.srs.interval >= 21 ? 'mature' : 'learning';
}

// A wrong answer always brings the word back for review. A right answer only
// pushes the next review out when the word was actually due, so extra practice
// can't inflate the schedule.
export function recordAnswer(id, correct) {
  const word = bucket().words[id];
  if (!word) return;
  const now = Date.now();
  const { srs, stats } = word;

  stats.last = now;
  if (correct) stats.correct += 1;
  else stats.wrong += 1;

  if (!correct) {
    if (srs.reps > 0) srs.lapses += 1;
    srs.reps = 0;
    srs.interval = 0;
    srs.ease = Math.max(1.3, srs.ease - 0.2);
    srs.due = now;
  } else if (srs.due <= now) {
    if (srs.reps === 0) srs.interval = 1;
    else if (srs.reps === 1) srs.interval = 3;
    else srs.interval = Math.round(srs.interval * srs.ease);
    srs.reps += 1;
    srs.due = startOfDay(now) + srs.interval * DAY;
  }

  touch(word);
  logAnswer(now, correct);
  commit();
}

function logAnswer(now, correct) {
  const log = bucket().log;
  const day = log[dayKey(now)] || (log[dayKey(now)] = { reviews: 0, correct: 0 });
  day.reviews += 1;
  if (correct) day.correct += 1;
  dirty[current].device = true;
}

// Character test answers count towards the streak and daily totals like word reviews do.
export function recordKana(char, correct) {
  const kana = bucket().kana;
  const tally = kana[char] || (kana[char] = [0, 0]);
  tally[correct ? 0 : 1] += 1;
  logAnswer(Date.now(), correct);
  commit(true);
}

// Verb form answers only feed the streak and daily totals.
export function recordDrill(correct) {
  logAnswer(Date.now(), correct);
  commit(true);
}

// ---- mistakes ----
// Every quiz records wrong answers here. Text fields use 漢字{かんじ} notation.
// A mistake disappears once the same question is answered right or dismissed, on any device.

const MAX_MISTAKES = 300;
const MAX_CLEARED = 600;

// ---- words inside quiz questions ----
// A question's words share its result: answer a grammar sentence wrong and every word in it
// counts as missed once (and as understood once when it is answered right), on the view that
// a wrong answer can come from not knowing any of them. Each tally keeps a small copy of the
// word, so words that aren't saved can still be listed.
const MAX_VOCAB = 500;
const compact = (entry) => ({
  id: entry.id,
  kanji: entry.kanji.slice(0, 1),
  kana: entry.kana.slice(0, 1),
  senses: [{ gloss: entry.senses[0].gloss.slice(0, 3), pos: [], tags: entry.senses[0].tags || [] }],
});

export function recordContext(entries, correct) {
  if (!entries.length) return;
  const now = Date.now();
  const vocab = bucket().vocab;
  for (const entry of entries) {
    const tally = vocab[entry.id] || { wrong: 0, right: 0 };
    if (correct) tally.right += 1;
    else tally.wrong += 1;
    tally.at = now;
    tally.entry = compact(entry);
    vocab[entry.id] = tally;
  }
  const ids = Object.keys(vocab);
  if (ids.length > MAX_VOCAB) {
    ids.sort((a, b) => vocab[a].at - vocab[b].at);
    for (const id of ids.slice(0, ids.length - MAX_VOCAB)) delete vocab[id];
  }
  dirty[current].device = true;
  commit(true);
}

// A device document written before the app knew about more than one language was flat,
// and everything in it was Japanese.
function deviceBucket(doc, lang) {
  if (!doc) return {};
  if (doc.langs) return doc.langs[lang] || {};
  return lang === 'ja' ? doc : {};
}

// This device's copy of a per-device collection, plus every other device's.
const everyDevice = (lang = current) =>
  [bucket(lang), ...Object.values(state.others).map((doc) => deviceBucket(doc, lang))];

// The most missed words across every quiz and device: a saved word's own My Words quiz
// results, plus each time it was part of a question answered wrong (or right).
// [{ word, wrong, right }], most missed first.
export function missedWords(limit = 5) {
  const totals = new Map();
  const words = bucket().words;
  const add = (id, wrong, right, word) => {
    const total = totals.get(id) || { word: null, wrong: 0, right: 0 };
    total.wrong += wrong;
    total.right += right;
    total.word = words[id] || total.word || word;
    totals.set(id, total);
  };
  for (const word of allWords()) add(String(word.id), word.stats.wrong, word.stats.correct, word);
  for (const device of everyDevice()) {
    for (const [id, tally] of Object.entries(device.vocab || {})) add(String(id), tally.wrong || 0, tally.right || 0, tally.entry);
  }
  return [...totals.values()]
    .filter((total) => total.wrong > 0 && total.word)
    .sort((a, b) => b.wrong - a.wrong || a.right - b.right)
    .slice(0, limit);
}

export function recordMistake(entry) {
  const own = bucket();
  own.mistakes = [{ ...entry, at: Date.now() }, ...own.mistakes.filter((m) => m.key !== entry.key)].slice(0, MAX_MISTAKES);
  dirty[current].device = true;
  commit(true);
}

export function clearMistakes(keys) {
  const now = Date.now();
  const own = bucket();
  for (const key of keys) own.cleared[key] = now;
  const entries = Object.entries(own.cleared);
  if (entries.length > MAX_CLEARED) {
    own.cleared = Object.fromEntries(entries.sort((a, b) => b[1] - a[1]).slice(0, MAX_CLEARED));
  }
  dirty[current].device = true;
  commit();
}

// Open mistakes from every device, newest first.
export function openMistakes() {
  const clearedAt = {};
  for (const device of everyDevice()) {
    for (const [key, at] of Object.entries(device.cleared || {})) clearedAt[key] = Math.max(clearedAt[key] || 0, at);
  }
  const latest = new Map();
  for (const device of everyDevice()) {
    for (const mistake of device.mistakes || []) {
      if (mistake.at <= (clearedAt[mistake.key] || 0)) continue;
      const seen = latest.get(mistake.key);
      if (!seen || seen.at < mistake.at) latest.set(mistake.key, mistake);
    }
  }
  return [...latest.values()].sort((a, b) => b.at - a.at);
}

// A right answer settles an open mistake for the same question.
export function resolveMistake(key) {
  if (openMistakes().some((m) => m.key === key)) clearMistakes([key]);
}

// Each device keeps its own log; this adds up every device's, for one language.
export function combinedLog(lang = current) {
  const out = {};
  for (const device of everyDevice(lang)) {
    for (const [day, entry] of Object.entries(device.log || {})) {
      const sum = out[day] || (out[day] = { reviews: 0, correct: 0 });
      sum.reviews += entry.reviews || 0;
      sum.correct += entry.correct || 0;
    }
  }
  return out;
}

export function kanaTally(char) {
  let right = 0;
  let wrong = 0;
  for (const device of everyDevice()) {
    const tally = (device.kana || {})[char];
    if (tally) { right += tally[0]; wrong += tally[1]; }
  }
  return [right, wrong];
}

// A day studied in any language keeps the streak: one habit, one streak.
export function streak(now = Date.now()) {
  const studied = new Set();
  for (const lang of LANGS) for (const day of Object.keys(combinedLog(lang))) studied.add(day);
  // A streak survives until the end of the day after the last review.
  const day = new Date(startOfDay(now));
  if (!studied.has(dayKey(day))) day.setDate(day.getDate() - 1);
  let days = 0;
  while (studied.has(dayKey(day))) {
    days += 1;
    day.setDate(day.getDate() - 1);
  }
  return days;
}

// ---- typed answers in notes ----
// Keyed by page, e.g. 'notes~homework-1' (no slashes, so it can be a Firestore document id).

export const getAnswers = (page) => (bucket().answers[page] && bucket().answers[page].values) || [];

export function setAnswers(page, values) {
  bucket().answers[page] = { values: [...values], updatedAt: Date.now() };
  dirty[current].answers.add(page);
  commit(true);
}

// ---- settings and backup ----

export function saveSettings(patch) {
  Object.assign(bucket().settings, patch);
  commit(true);
}

export const exportData = () => JSON.stringify(state, null, 2);

// Merges a backup into the current data: nothing already here is overwritten. Backups made
// before the app knew about more than one language hold Japanese at the top level.
export function importData(json) {
  const incoming = JSON.parse(json);
  if (!incoming || typeof incoming !== 'object') throw new Error('That file is not a Kotoba backup');
  const byLang = incoming.version >= 2 && incoming.langs
    ? incoming.langs
    : { ja: incoming };
  let any = false;
  for (const part of Object.values(byLang)) {
    if (part && typeof part.words === 'object' && Array.isArray(part.lists)) any = true;
  }
  if (!any) throw new Error('That file is not a Kotoba backup');

  let added = 0;
  for (const [lang, part] of Object.entries(byLang)) {
    if (!LANGS.includes(lang) || !part || typeof part.words !== 'object') continue;
    const own = bucket(lang);
    for (const list of part.lists || []) {
      if (list && list.id && list.name && !own.lists.some((l) => l.id === list.id)) {
        own.lists.push(list);
        touchLists(lang);
      }
    }
    const listIds = new Set(own.lists.map((l) => l.id));
    for (const word of Object.values(part.words)) {
      if (!word || !word.id || !Array.isArray(word.kana) || !Array.isArray(word.senses) || own.words[word.id]) continue;
      const now = Date.now();
      own.words[word.id] = {
        kanji: [], common: false, jlpt: 0, addedAt: now, note: '',
        ...word,
        listIds: (word.listIds || []).filter((l) => listIds.has(l)),
        srs: { ...freshSrs(now), ...word.srs },
        stats: { correct: 0, wrong: 0, last: 0, ...word.stats },
      };
      delete own.deleted[word.id];
      touch(own.words[word.id], lang);
      added += 1;
    }
    for (const [char, tally] of Object.entries(part.kana || {})) {
      if (!own.kana[char] && Array.isArray(tally) && tally.length === 2) {
        own.kana[char] = tally;
        dirty[lang].device = true;
      }
    }
    for (const [day, entry] of Object.entries(part.log || {})) {
      if (!own.log[day] && entry && typeof entry.reviews === 'number') {
        own.log[day] = entry;
        dirty[lang].device = true;
      }
    }
  }
  commit();
  return added;
}

// ---- sync hooks (used by js/sync.js) ----

// Words saved before syncing existed have no updatedAt; their save time stands in.
const changedAt = (word) => word.updatedAt || word.addedAt || 0;

const wordTime = (lang, id) => {
  const word = bucket(lang).words[id];
  return word ? changedAt(word) : bucket(lang).deleted[id] || 0;
};

export function onDirty(fn) {
  dirtyListeners.add(fn);
  return () => dirtyListeners.delete(fn);
}

// Hands over (and clears) everything changed since the last call, ready to upload.
// Words, lists and answers go per language; the device document carries every language at
// once, because there is one of it per device.
export function takeDirty() {
  const langs = {};
  let anyDevice = false;
  for (const lang of LANGS) {
    const own = bucket(lang);
    const mine = dirty[lang];
    langs[lang] = {
      words: [...mine.words].map((id) => own.words[id]
        ? { ...own.words[id] }
        : { id: Number(id) || id, deleted: true, updatedAt: own.deleted[id] || Date.now() }),
      lists: mine.lists ? { lists: own.lists, updatedAt: own.listsAt } : null,
      answers: [...mine.answers].filter((page) => own.answers[page]).map((page) => ({ page, ...own.answers[page] })),
      device: mine.device,
    };
    if (mine.device) anyDevice = true;
    mine.words.clear();
    mine.lists = false;
    mine.device = false;
    mine.answers.clear();
  }
  return { langs, device: anyDevice ? deviceDoc() : null };
}

// One document per device, holding every language. The Japanese fields are also written at
// the top level, where a copy of the app from before the Chinese module looks for them.
function deviceDoc() {
  const part = (lang) => {
    const { log, kana, mistakes, cleared, vocab } = bucket(lang);
    return { log, kana, mistakes, cleared, vocab };
  };
  return {
    ...part('ja'),
    langs: Object.fromEntries(LANGS.map((lang) => [lang, part(lang)])),
    updatedAt: Date.now(),
  };
}

// Puts back changes an upload failed to save.
export function restoreDirty(taken) {
  for (const [lang, part] of Object.entries(taken.langs || {})) {
    if (!dirty[lang]) continue;
    for (const word of part.words) dirty[lang].words.add(String(word.id));
    if (part.lists) dirty[lang].lists = true;
    if (part.device) dirty[lang].device = true;
    for (const entry of part.answers || []) dirty[lang].answers.add(entry.page);
  }
}

// After first connecting, queue typed answers the account lacks or holds an older copy of.
// `remote` maps page -> updatedAt.
export function queueAnswersNewerThan(lang, remote) {
  for (const [page, entry] of Object.entries(bucket(lang).answers)) {
    if ((entry.updatedAt || 0) > (remote[page] ?? -1)) dirty[lang].answers.add(page);
  }
  commit(true);
}

// After first connecting, queue whatever this device has that the account lacks
// or holds an older copy of. `remoteWords` maps word id -> updatedAt.
export function queueNewerThan(lang, remoteWords, remoteListsAt) {
  const own = bucket(lang);
  // Give older data a real timestamp before upload, or other devices would treat
  // it as older than having nothing and ignore it.
  for (const word of Object.values(own.words)) if (!word.updatedAt) word.updatedAt = word.addedAt || 1;
  if (!own.listsAt && own.lists.length) own.listsAt = 1;
  for (const id of Object.keys(own.words)) {
    if (wordTime(lang, id) > (remoteWords[id] ?? -1)) dirty[lang].words.add(id);
  }
  for (const [id, at] of Object.entries(own.deleted)) {
    if (id in remoteWords && at > remoteWords[id]) dirty[lang].words.add(id);
  }
  if (own.listsAt > (remoteListsAt ?? -1) && (own.lists.length || remoteListsAt != null)) dirty[lang].lists = true;
  dirty[lang].device = true;
  commit(true);
}

// Applies changes from the account. The newer copy of each word wins. `others` is not
// language-specific: one document per device holds them all.
export function applyRemote(lang, { words = [], lists = null, others = null, answers = [] }) {
  const own = bucket(lang);
  let changed = false;
  for (const doc of answers) {
    if (!doc.page || !Array.isArray(doc.values)) continue;
    const local = own.answers[doc.page];
    if ((doc.updatedAt || 0) <= ((local && local.updatedAt) || 0)) continue;
    own.answers[doc.page] = { values: doc.values, updatedAt: doc.updatedAt };
    changed = true;
  }
  for (const doc of words) {
    const id = String(doc.id);
    const remoteAt = doc.deleted ? doc.updatedAt || 0 : changedAt(doc);
    if (remoteAt <= wordTime(lang, id)) continue;
    if (doc.deleted) {
      delete own.words[id];
      own.deleted[id] = doc.updatedAt;
    } else {
      const { deleted, ...word } = doc;
      own.words[id] = { ...word, updatedAt: remoteAt };
      delete own.deleted[id];
    }
    changed = true;
  }
  // Lists uploaded before this fix carry updatedAt 0; any non-empty set still beats having none.
  const listsAt = lists ? lists.updatedAt || ((lists.lists || []).length ? 1 : 0) : 0;
  if (lists && listsAt > own.listsAt) {
    own.lists = lists.lists || [];
    own.listsAt = listsAt;
    const known = new Set(own.lists.map((l) => l.id));
    for (const word of Object.values(own.words)) word.listIds = word.listIds.filter((l) => known.has(l));
    changed = true;
  }
  if (others) {
    state.others = others;
    changed = true;
  }
  if (changed) commit();
}
