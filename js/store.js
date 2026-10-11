// Everything the learner owns (saved words, lists, review history) lives in localStorage.

const KEY = 'kotoba:v1';
export const DAY = 86400000;
const MAX_SENSES = 8;

const blank = () => ({
  version: 1,
  words: {},   // id -> saved word
  lists: [],   // [{ id, name }]
  log: {},     // 'YYYY-MM-DD' -> { reviews, correct }
  kana: {},    // kana character -> [right, wrong] from the kana test
  settings: {
    source: 'due', mode: 'mixed', direction: 'mixed', count: 10,
    kanaScript: 'hiragana', kanaGroups: ['basic'], kanaMode: 'read', kanaCount: 20,
  },
});

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      return { ...blank(), ...saved, settings: { ...blank().settings, ...saved.settings } };
    }
  } catch (err) {
    console.error('Could not read saved data', err);
  }
  return blank();
}

let state = read();
const subscribers = new Set();

function commit(silent = false) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (err) {
    console.error('Could not save data', err);
  }
  if (!silent) subscribers.forEach((fn) => fn(state));
}

export const getState = () => state;

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

// ---- words ----

export const hasWord = (id) => id in state.words;
export const allWords = () => Object.values(state.words);

export function addWord(entry, listId = null) {
  if (state.words[entry.id]) return;
  const now = Date.now();
  state.words[entry.id] = {
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
  commit();
}

export function removeWord(id) {
  delete state.words[id];
  commit();
}

export function updateWord(id, patch, { silent = false } = {}) {
  if (!state.words[id]) return;
  Object.assign(state.words[id], patch);
  commit(silent);
}

export function resetProgress(id) {
  const word = state.words[id];
  if (!word) return;
  word.srs = freshSrs(Date.now());
  word.stats = { correct: 0, wrong: 0, last: 0 };
  commit();
}

// ---- lists ----

export function createList(name) {
  const list = { id: `l${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name };
  state.lists.push(list);
  commit();
  return list;
}

export function renameList(id, name) {
  const list = state.lists.find((l) => l.id === id);
  if (!list) return;
  list.name = name;
  commit();
}

export function deleteList(id) {
  state.lists = state.lists.filter((l) => l.id !== id);
  for (const word of allWords()) word.listIds = word.listIds.filter((l) => l !== id);
  commit();
}

export function toggleWordList(wordId, listId) {
  const word = state.words[wordId];
  if (!word) return;
  word.listIds = word.listIds.includes(listId)
    ? word.listIds.filter((l) => l !== listId)
    : [...word.listIds, listId];
  commit();
}

export const wordsInList = (listId) => allWords().filter((w) => w.listIds.includes(listId));

// ---- spaced repetition ----

export const isDue = (word, now = Date.now()) => word.srs.due <= now;
export const dueWords = (now = Date.now()) => allWords().filter((w) => isDue(w, now));

export function wordStatus(word, now = Date.now()) {
  if (!word.stats.correct && !word.stats.wrong) return 'new';
  if (isDue(word, now)) return 'due';
  return word.srs.interval >= 21 ? 'mature' : 'learning';
}

// A wrong answer always brings the word back for review. A right answer only
// pushes the next review out when the word was actually due, so extra practice
// can't inflate the schedule.
export function recordAnswer(id, correct) {
  const word = state.words[id];
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

  logAnswer(now, correct);
  commit();
}

function logAnswer(now, correct) {
  const day = state.log[dayKey(now)] || (state.log[dayKey(now)] = { reviews: 0, correct: 0 });
  day.reviews += 1;
  if (correct) day.correct += 1;
}

// Kana test answers count towards the streak and daily totals like word reviews do.
export function recordKana(char, correct) {
  const tally = state.kana[char] || (state.kana[char] = [0, 0]);
  tally[correct ? 0 : 1] += 1;
  logAnswer(Date.now(), correct);
  commit(true);
}

export function streak(now = Date.now()) {
  // A streak survives until the end of the day after the last review.
  const day = new Date(startOfDay(now));
  if (!state.log[dayKey(day)]) day.setDate(day.getDate() - 1);
  let days = 0;
  while (state.log[dayKey(day)]) {
    days += 1;
    day.setDate(day.getDate() - 1);
  }
  return days;
}

// ---- settings and backup ----

export function saveSettings(patch) {
  Object.assign(state.settings, patch);
  commit(true);
}

export const exportData = () => JSON.stringify(state, null, 2);

// Merges a backup into the current data: nothing already here is overwritten.
export function importData(json) {
  const incoming = JSON.parse(json);
  if (!incoming || typeof incoming.words !== 'object' || !Array.isArray(incoming.lists)) {
    throw new Error('That file is not a Kotoba backup');
  }
  let added = 0;
  for (const list of incoming.lists) {
    if (list && list.id && list.name && !state.lists.some((l) => l.id === list.id)) state.lists.push(list);
  }
  const listIds = new Set(state.lists.map((l) => l.id));
  for (const word of Object.values(incoming.words)) {
    if (!word || !word.id || !Array.isArray(word.kana) || !Array.isArray(word.senses) || state.words[word.id]) continue;
    const now = Date.now();
    state.words[word.id] = {
      kanji: [], common: false, jlpt: 0, addedAt: now, note: '',
      ...word,
      listIds: (word.listIds || []).filter((l) => listIds.has(l)),
      srs: { ...freshSrs(now), ...word.srs },
      stats: { correct: 0, wrong: 0, last: 0, ...word.stats },
    };
    added += 1;
  }
  for (const [char, tally] of Object.entries(incoming.kana || {})) {
    if (!state.kana[char] && Array.isArray(tally) && tally.length === 2) state.kana[char] = tally;
  }
  for (const [day, entry] of Object.entries(incoming.log || {})) {
    if (!state.log[day] && entry && typeof entry.reviews === 'number') state.log[day] = entry;
  }
  commit();
  return added;
}
