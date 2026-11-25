// Page-side handle on the Chinese word list worker, the same shape as js/dict.js so a view
// can be handed either one. The worker starts on the first call rather than when this
// module loads, so opening the app in Japanese never fetches the Chinese list.

let worker = null;
const pending = new Map();
const listeners = new Set();
let nextId = 1;

export const status = { state: 'idle', progress: 0, count: 0, date: '', tags: {}, error: '' };

function notify() {
  listeners.forEach((fn) => fn(status));
}

function start() {
  if (worker) return worker;
  status.state = 'loading';
  worker = new Worker(new URL('./dict-worker.js', import.meta.url), { type: 'module' });

  worker.onmessage = ({ data }) => {
    if (data.type === 'progress') {
      status.progress = data.value;
      notify();
    } else if (data.type === 'ready') {
      Object.assign(status, { state: 'ready', progress: 1, count: data.count, date: data.date });
      notify();
    } else if (data.type === 'failed') {
      Object.assign(status, { state: 'failed', error: data.message });
      notify();
    } else if (data.type === 'reply') {
      const waiting = pending.get(data.id);
      if (!waiting) return;
      pending.delete(data.id);
      if (data.error) waiting.reject(new Error(data.error));
      else waiting.resolve(data.result);
    }
  };

  worker.onerror = (event) => {
    Object.assign(status, { state: 'failed', error: event.message || 'The word list could not be started' });
    notify();
  };
  return worker;
}

function call(type, payload) {
  const w = start();
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    w.postMessage({ id, type, ...payload });
  });
}

export function onStatus(fn) {
  listeners.add(fn);
  start();
  fn(status);
  return () => listeners.delete(fn);
}

export const search = (query) => call('search', { query });
export const random = (count, exclude = [], level = 0) => call('random', { count, exclude, band: level });
export const get = (ids) => call('get', { ids });
// { total, results }: one band's words, a page at a time.
export const band = (level, offset = 0, limit = 100) => call('band', { level, offset, limit });
// Every id in a band, for saving the lot in one go.
export const bandIds = (level) => call('bandIds', { level });
// [{ text, band, pinyin, id } | { text, other: true }]: Chinese text split into the words
// of the HSK list, longest match first. Band 0 means a character on no listed word.
export const segment = (text) => call('segment', { text });
