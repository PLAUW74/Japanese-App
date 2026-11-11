// Keeps saved words, lists and review history in step across devices through the
// learner's Google account (Firebase Auth + Firestore). Data lives at
// users/{uid}/words/{wordId}, users/{uid}/meta/lists, users/{uid}/devices/{deviceId}
// and users/{uid}/answers/{page} (what was typed into a note's blanks).
// The app works the same without it; the Firebase SDK only loads once configured.
//
// Japanese keeps the paths above, the ones it has always used, so nothing already in the
// account has to move and a device still running an older copy of the app keeps syncing.
// Every other language gets its own collections beside them, named with its code.
import config from './firebase-config.js';
import * as store from './store.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.14.1';
const FLUSH_DELAY = 1200;
const BATCH_LIMIT = 450;

const paths = (lang) => (lang === 'ja'
  ? { words: ['words'], lists: ['meta', 'lists'], answers: ['answers'] }
  : { words: [`${lang}_words`], lists: ['meta', `${lang}_lists`], answers: [`${lang}_answers`] });

// state: 'unconfigured' | 'loading' | 'signed-out' | 'connecting' | 'synced' | 'saving' | 'offline' | 'error'
export const status = { state: config ? 'loading' : 'unconfigured', email: '', error: '' };
const listeners = new Set();

let fb = null;           // loaded SDK functions plus auth and db
let session = null;      // { uid, unsubscribers, ready }
let flushTimer;
let flushing = false;

function setStatus(patch) {
  Object.assign(status, patch);
  listeners.forEach((fn) => fn(status));
}

export function onStatus(fn) {
  listeners.add(fn);
  fn(status);
  return () => listeners.delete(fn);
}

const MESSAGES = {
  'auth/unauthorized-domain': `This web address isn't allowed to sign in yet. In the Firebase console, add ${location.hostname} under Authentication → Settings → Authorized domains.`,
  'auth/popup-closed-by-user': 'The sign-in window was closed before finishing.',
  'auth/network-request-failed': 'No connection. Try again when you are online.',
  'permission-denied': 'Your account was refused access. Check the Firestore security rules in the README.',
};
const describe = (err) => MESSAGES[err.code] || err.message || String(err);

async function load() {
  const [app, auth, firestore] = await Promise.all([
    import(`${SDK}/firebase-app.js`),
    import(`${SDK}/firebase-auth.js`),
    import(`${SDK}/firebase-firestore.js`),
  ]);
  const instance = app.initializeApp(config);
  return { ...auth, ...firestore, auth: auth.getAuth(instance), db: firestore.getFirestore(instance) };
}

export async function init() {
  if (!config) return;
  try {
    fb = await load();
  } catch (err) {
    setStatus({ state: 'offline', error: 'Sync could not load. Your words are still saved on this device.' });
    return;
  }
  fb.getRedirectResult(fb.auth).catch((err) => setStatus({ error: describe(err) }));
  fb.onAuthStateChanged(fb.auth, (user) => {
    stop();
    if (user) start(user);
    else setStatus({ state: 'signed-out', email: '' });
  });
  store.onDirty(scheduleFlush);
  window.addEventListener('online', scheduleFlush);
}

export async function signIn() {
  if (!fb) return;
  setStatus({ error: '' });
  const provider = new fb.GoogleAuthProvider();
  try {
    await fb.signInWithPopup(fb.auth, provider);
  } catch (err) {
    // Installed iPhone apps and some browsers can't open the pop-up: use a full-page redirect instead.
    if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment', 'auth/cancelled-popup-request'].includes(err.code)) {
      await fb.signInWithRedirect(fb.auth, provider);
    } else {
      setStatus({ error: describe(err) });
    }
  }
}

export async function signOut() {
  if (!fb) return;
  await flush();
  await fb.signOut(fb.auth);
}

function start(user) {
  const { db, collection, doc, onSnapshot } = fb;
  const base = ['users', user.uid];
  // One of these per language; the first snapshot of each has to arrive before this device
  // can tell what the account is missing.
  const first = Object.fromEntries(store.LANGS.map((lang) => [lang, { words: null, lists: undefined, answers: null }]));
  session = { uid: user.uid, unsubscribers: [], ready: false };
  setStatus({ state: 'connecting', email: user.email || '', error: '' });

  const arrived = (part) => part.words !== null && part.lists !== undefined && part.answers !== null;

  // Once every language's words and lists have arrived, upload what this device has that
  // the account lacks.
  const maybeReady = () => {
    if (session.ready || !store.LANGS.every((lang) => arrived(first[lang]))) return;
    session.ready = true;
    for (const lang of store.LANGS) {
      store.queueNewerThan(lang, first[lang].words, first[lang].lists);
      store.queueAnswersNewerThan(lang, first[lang].answers);
    }
    flush();
  };
  const failed = (err) => setStatus({ state: 'error', error: describe(err) });

  for (const lang of store.LANGS) {
    const where = paths(lang);
    const part = first[lang];

    session.unsubscribers.push(onSnapshot(collection(db, ...base, ...where.words), (snap) => {
      store.applyRemote(lang, { words: snap.docChanges().map((change) => change.doc.data()) });
      if (part.words === null) {
        part.words = Object.fromEntries(snap.docs.map((d) => [d.id, d.data().updatedAt || 0]));
        maybeReady();
      }
    }, failed));

    session.unsubscribers.push(onSnapshot(doc(db, ...base, ...where.lists), (snap) => {
      const data = snap.data();
      if (data) store.applyRemote(lang, { lists: data });
      if (part.lists === undefined) {
        part.lists = data ? data.updatedAt || 0 : null;
        maybeReady();
      }
    }, failed));

    // What was typed into the blanks of each note page.
    session.unsubscribers.push(onSnapshot(collection(db, ...base, ...where.answers), (snap) => {
      store.applyRemote(lang, { answers: snap.docChanges().map((change) => change.doc.data()) });
      if (part.answers === null) {
        part.answers = Object.fromEntries(snap.docs.map((d) => [d.id, d.data().updatedAt || 0]));
        maybeReady();
      }
    }, failed));
  }

  // One document per device, holding every language; the store splits it up on arrival.
  session.unsubscribers.push(onSnapshot(collection(db, ...base, 'devices'), (snap) => {
    const others = {};
    for (const d of snap.docs) if (d.id !== store.deviceId) others[d.id] = d.data();
    store.applyRemote(store.getLang(), { others });
  }, failed));
}

function stop() {
  if (!session) return;
  session.unsubscribers.forEach((unsubscribe) => unsubscribe());
  session = null;
}

function scheduleFlush() {
  clearTimeout(flushTimer);
  flushTimer = setTimeout(flush, FLUSH_DELAY);
}

// Firestore can't store `undefined`; a JSON round trip drops it.
const clean = (value) => JSON.parse(JSON.stringify(value));

async function flush() {
  if (!session || !session.ready || flushing) return;
  const changes = store.takeDirty();
  const writes = changes.device ? [[['devices', store.deviceId], changes.device]] : [];
  for (const [lang, part] of Object.entries(changes.langs)) {
    const where = paths(lang);
    writes.push(
      ...part.words.map((word) => [[...where.words, String(word.id)], word]),
      ...(part.lists ? [[where.lists, part.lists]] : []),
      ...part.answers.map((entry) => [[...where.answers, entry.page], entry]),
    );
  }
  if (!writes.length) return;

  flushing = true;
  setStatus({ state: 'saving' });
  try {
    for (let i = 0; i < writes.length; i += BATCH_LIMIT) {
      const batch = fb.writeBatch(fb.db);
      for (const [path, data] of writes.slice(i, i + BATCH_LIMIT)) {
        batch.set(fb.doc(fb.db, 'users', session.uid, ...path), clean(data));
      }
      await batch.commit();
    }
    if (session) setStatus({ state: 'synced', error: '' });
  } catch (err) {
    store.restoreDirty(changes);
    setStatus({ state: navigator.onLine ? 'error' : 'offline', error: navigator.onLine ? describe(err) : '' });
  } finally {
    flushing = false;
  }
  // Anything changed while uploading goes in the next round.
  if (session) scheduleFlush();
}
