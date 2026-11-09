// Everything the learner owns (saved words, lists, review history) lives in localStorage.
// Changes are also tracked so js/sync.js can copy them to the learner's account.

const KEY = 'kotoba:v1';
const DEVICE_KEY = 'kotoba:device';
export const DAY = 86400000;
const MAX_SENSES = 8;

const blank = () => ({
  version: 1,
  words: {},     // id -> saved word
  lists: [],     // [{ id, name }]
  listsAt: 0,    // when the lists last changed, for syncing
  deleted: {},   // id -> when a word was removed, so sync doesn't bring it back
  log: {},       // this device's 'YYYY-MM-DD' -> { reviews, correct }
  kana: {},      // this device's kana character -> [right, wrong] from the kana test
  mistakes: [],  // this device's wrong answers: [{ key, quiz, prompt, answer, given, note, en, at }]
  cleared: {},   // mistake key -> when it was answered right or dismissed
  others: {},    // the same log, kana tallies and mistakes from the learner's other devices
  settings: {
    source: 'due', mode: 'mixed', direction: 'mixed', count: 10,
    kanaScript: 'hiragana', kanaGroups: ['basic'], kanaMode: 'read', kanaCount: 20,
    verbSource: 'n5', verbTarget: 'te', verbMode: 'type', verbCount: 10,
    grammarLevel: 'both', grammarTopic: 'all', grammarCount: 10,
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
export const deviceId = readDeviceId();
const subscribers = new Set();

// What has changed locally since sync last took it.
const dirty = { words: new Set(), lists: false, device: false };
const dirtyListeners = new Set();
const isDirty = () => dirty.words.size > 0 || dirty.lists || dirty.device;

function commit(silent = false) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (err) {
    console.error('Could not save data', err);
  }
  if (!silent) subscribers.forEach((fn) => fn(state));
  if (isDirty()) dirtyListeners.forEach((fn) => fn());
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

function touch(word) {
  word.updatedAt = Date.now();
  dirty.words.add(String(word.id));
}

function touchLists() {
  state.listsAt = Date.now();
  dirty.lists = true;
}

// ---- words ----

export const hasWord = (id) => id in state.words;
export const allWords = () => Object.values(state.words);

export function addWord(entry, listId = null) {
  if (state.words[entry.id]) return;
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
  state.words[entry.id] = word;
  delete state.deleted[entry.id];
  touch(word);
  commit();
}

export function removeWord(id) {
  delete state.words[id];
  state.deleted[id] = Date.now();
  dirty.words.add(String(id));
  commit();
}

export function updateWord(id, patch, { silent = false } = {}) {
  const word = state.words[id];
  if (!word) return;
  Object.assign(word, patch);
  touch(word);
  commit(silent);
}

export function resetProgress(id) {
  const word = state.words[id];
  if (!word) return;
  word.srs = freshSrs(Date.now());
  word.stats = { correct: 0, wrong: 0, last: 0 };
  touch(word);
  commit();
}

// ---- lists ----

export function createList(name) {
  const list = { id: `l${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name };
  state.lists.push(list);
  touchLists();
  commit();
  return list;
}

export function renameList(id, name) {
  const list = state.lists.find((l) => l.id === id);
  if (!list) return;
  list.name = name;
  touchLists();
  commit();
}

export function deleteList(id) {
  state.lists = state.lists.filter((l) => l.id !== id);
  for (const word of allWords()) {
    if (!word.listIds.includes(id)) continue;
    word.listIds = word.listIds.filter((l) => l !== id);
    touch(word);
  }
  touchLists();
  commit();
}

export function toggleWordList(wordId, listId) {
  const word = state.words[wordId];
  if (!word) return;
  word.listIds = word.listIds.includes(listId)
    ? word.listIds.filter((l) => l !== listId)
    : [...word.listIds, listId];
  touch(word);
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

  touch(word);
  logAnswer(now, correct);
  commit();
}

function logAnswer(now, correct) {
  const day = state.log[dayKey(now)] || (state.log[dayKey(now)] = { reviews: 0, correct: 0 });
  day.reviews += 1;
  if (correct) day.correct += 1;
  dirty.device = true;
}

// Kana test answers count towards the streak and daily totals like word reviews do.
export function recordKana(char, correct) {
  const tally = state.kana[char] || (state.kana[char] = [0, 0]);
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

export function recordMistake(entry) {
  state.mistakes = [{ ...entry, at: Date.now() }, ...state.mistakes.filter((m) => m.key !== entry.key)].slice(0, MAX_MISTAKES);
  dirty.device = true;
  commit(true);
}

export function clearMistakes(keys) {
  const now = Date.now();
  for (const key of keys) state.cleared[key] = now;
  const entries = Object.entries(state.cleared);
  if (entries.length > MAX_CLEARED) {
    state.cleared = Object.fromEntries(entries.sort((a, b) => b[1] - a[1]).slice(0, MAX_CLEARED));
  }
  dirty.device = true;
  commit();
}

const allDevices = () => [state, ...Object.values(state.others)];

// Open mistakes from every device, newest first.
export function openMistakes() {
  const clearedAt = {};
  for (const device of allDevices()) {
    for (const [key, at] of Object.entries(device.cleared || {})) clearedAt[key] = Math.max(clearedAt[key] || 0, at);
  }
  const latest = new Map();
  for (const device of allDevices()) {
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

// Each device keeps its own log and kana tallies; these add up every device's.
export function combinedLog() {
  const out = {};
  for (const log of [state.log, ...Object.values(state.others).map((d) => d.log || {})]) {
    for (const [day, entry] of Object.entries(log)) {
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
  for (const kana of [state.kana, ...Object.values(state.others).map((d) => d.kana || {})]) {
    const tally = kana[char];
    if (tally) { right += tally[0]; wrong += tally[1]; }
  }
  return [right, wrong];
}

export function streak(now = Date.now()) {
  const log = combinedLog();
  // A streak survives until the end of the day after the last review.
  const day = new Date(startOfDay(now));
  if (!log[dayKey(day)]) day.setDate(day.getDate() - 1);
  let days = 0;
  while (log[dayKey(day)]) {
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
    if (list && list.id && list.name && !state.lists.some((l) => l.id === list.id)) {
      state.lists.push(list);
      touchLists();
    }
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
    delete state.deleted[word.id];
    touch(state.words[word.id]);
    added += 1;
  }
  for (const [char, tally] of Object.entries(incoming.kana || {})) {
    if (!state.kana[char] && Array.isArray(tally) && tally.length === 2) {
      state.kana[char] = tally;
      dirty.device = true;
    }
  }
  for (const [day, entry] of Object.entries(incoming.log || {})) {
    if (!state.log[day] && entry && typeof entry.reviews === 'number') {
      state.log[day] = entry;
      dirty.device = true;
    }
  }
  commit();
  return added;
}

// ---- sync hooks (used by js/sync.js) ----

// Words saved before syncing existed have no updatedAt; their save time stands in.
const changedAt = (word) => word.updatedAt || word.addedAt || 0;

const wordTime = (id) => {
  const word = state.words[id];
  return word ? changedAt(word) : state.deleted[id] || 0;
};

export function onDirty(fn) {
  dirtyListeners.add(fn);
  return () => dirtyListeners.delete(fn);
}

// Hands over (and clears) everything changed since the last call, ready to upload.
export function takeDirty() {
  const out = {
    words: [...dirty.words].map((id) => state.words[id]
      ? { ...state.words[id] }
      : { id: Number(id) || id, deleted: true, updatedAt: state.deleted[id] || Date.now() }),
    lists: dirty.lists ? { lists: state.lists, updatedAt: state.listsAt } : null,
    device: dirty.device
      ? { log: state.log, kana: state.kana, mistakes: state.mistakes, cleared: state.cleared, updatedAt: Date.now() }
      : null,
  };
  dirty.words.clear();
  dirty.lists = false;
  dirty.device = false;
  return out;
}

// Puts back changes an upload failed to save.
export function restoreDirty(taken) {
  for (const word of taken.words) dirty.words.add(String(word.id));
  if (taken.lists) dirty.lists = true;
  if (taken.device) dirty.device = true;
}

// After first connecting, queue whatever this device has that the account lacks
// or holds an older copy of. `remote` maps word id -> updatedAt.
export function queueNewerThan(remoteWords, remoteListsAt) {
  // Give older data a real timestamp before upload, or other devices would treat
  // it as older than having nothing and ignore it.
  for (const word of allWords()) if (!word.updatedAt) word.updatedAt = word.addedAt || 1;
  if (!state.listsAt && state.lists.length) state.listsAt = 1;
  for (const id of Object.keys(state.words)) {
    if (wordTime(id) > (remoteWords[id] ?? -1)) dirty.words.add(id);
  }
  for (const [id, at] of Object.entries(state.deleted)) {
    if (id in remoteWords && at > remoteWords[id]) dirty.words.add(id);
  }
  if (state.listsAt > (remoteListsAt ?? -1) && (state.lists.length || remoteListsAt != null)) dirty.lists = true;
  dirty.device = true;
  commit(true);
}

// Applies changes from the account. The newer copy of each word wins.
export function applyRemote({ words = [], lists = null, others = null }) {
  let changed = false;
  for (const doc of words) {
    const id = String(doc.id);
    const remoteAt = doc.deleted ? doc.updatedAt || 0 : changedAt(doc);
    if (remoteAt <= wordTime(id)) continue;
    if (doc.deleted) {
      delete state.words[id];
      state.deleted[id] = doc.updatedAt;
    } else {
      const { deleted, ...word } = doc;
      state.words[id] = { ...word, updatedAt: remoteAt };
      delete state.deleted[id];
    }
    changed = true;
  }
  // Lists uploaded before this fix carry updatedAt 0; any non-empty set still beats having none.
  const listsAt = lists ? lists.updatedAt || ((lists.lists || []).length ? 1 : 0) : 0;
  if (lists && listsAt > state.listsAt) {
    state.lists = lists.lists || [];
    state.listsAt = listsAt;
    const known = new Set(state.lists.map((l) => l.id));
    for (const word of allWords()) word.listIds = word.listIds.filter((l) => known.has(l));
    changed = true;
  }
  if (others) {
    state.others = others;
    changed = true;
  }
  if (changed) commit();
}
