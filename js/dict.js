// Page-side handle on the dictionary worker.

const worker = new Worker(new URL('./dict-worker.js', import.meta.url), { type: 'module' });
const pending = new Map();
const listeners = new Set();
let nextId = 1;
let kanjiData = null;

export const status = { state: 'loading', progress: 0, count: 0, date: '', tags: {}, error: '' };

function notify() {
  listeners.forEach((fn) => fn(status));
}

worker.onmessage = ({ data }) => {
  if (data.type === 'progress') {
    status.progress = data.value;
    notify();
  } else if (data.type === 'ready') {
    Object.assign(status, { state: 'ready', progress: 1, count: data.count, date: data.date, tags: data.tags });
    notify();
  } else if (data.type === 'failed') {
    Object.assign(status, { state: 'failed', error: data.message });
    notify();
  } else if (data.type === 'reply') {
    const { resolve, reject } = pending.get(data.id);
    pending.delete(data.id);
    if (data.error) reject(new Error(data.error));
    else resolve(data.result);
  }
};

worker.onerror = (event) => {
  Object.assign(status, { state: 'failed', error: event.message || 'The dictionary could not be started' });
  notify();
};

function call(type, payload) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, type, ...payload });
  });
}

export function onStatus(fn) {
  listeners.add(fn);
  fn(status);
  return () => listeners.delete(fn);
}

export const search = (query) => call('search', { query });
export const random = (count, exclude = []) => call('random', { count, exclude });
export const verbs = (count, minLevel) => call('verbs', { count, minLevel });
export const get =(ids) => call('get', { ids });

// { char: { meanings, on, kun, strokes, grade, freq } } for the kanji found in `text`.
export async function kanjiInfo(text) {
  if (!kanjiData) {
    kanjiData = fetch(new URL('../data/kanji.json', import.meta.url)).then((res) => {
      if (!res.ok) throw new Error(`Could not load kanji data (HTTP ${res.status})`);
      return res.json();
    });
    kanjiData.catch(() => { kanjiData = null; });
  }
  const data = await kanjiData;
  const out = [];
  for (const ch of new Set(text)) {
    const row = data[ch];
    if (row) out.push({ char: ch, meanings: row[0], on: row[1], kun: row[2], strokes: row[3], grade: row[4], freq: row[5] });
  }
  return out;
}
