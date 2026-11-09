// Keeps saved words, lists and review history in step across devices through the
// learner's Google account (Firebase Auth + Firestore). Data lives at
// users/{uid}/words/{wordId}, users/{uid}/meta/lists and users/{uid}/devices/{deviceId}.
// The app works the same without it; the Firebase SDK only loads once configured.
import config from './firebase-config.js';
import * as store from './store.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.14.1';
const FLUSH_DELAY = 1200;
const BATCH_LIMIT = 450;

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
  const first = { words: null, lists: undefined };
  session = { uid: user.uid, unsubscribers: [], ready: false };
  setStatus({ state: 'connecting', email: user.email || '', error: '' });

  // Once both the words and the lists have arrived, upload what this device has that the account lacks.
  const maybeReady = () => {
    if (session.ready || first.words === null || first.lists === undefined) return;
    session.ready = true;
    store.queueNewerThan(first.words, first.lists);
    flush();
  };
  const failed = (err) => setStatus({ state: 'error', error: describe(err) });

  session.unsubscribers.push(onSnapshot(collection(db, ...base, 'words'), (snap) => {
    store.applyRemote({ words: snap.docChanges().map((change) => change.doc.data()) });
    if (first.words === null) {
      first.words = Object.fromEntries(snap.docs.map((d) => [d.id, d.data().updatedAt || 0]));
      maybeReady();
    }
  }, failed));

  session.unsubscribers.push(onSnapshot(doc(db, ...base, 'meta', 'lists'), (snap) => {
    const data = snap.data();
    if (data) store.applyRemote({ lists: data });
    if (first.lists === undefined) {
      first.lists = data ? data.updatedAt || 0 : null;
      maybeReady();
    }
  }, failed));

  session.unsubscribers.push(onSnapshot(collection(db, ...base, 'devices'), (snap) => {
    const others = {};
    for (const d of snap.docs) if (d.id !== store.deviceId) others[d.id] = d.data();
    store.applyRemote({ others });
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
  const writes = [
    ...changes.words.map((word) => [['words', String(word.id)], word]),
    ...(changes.lists ? [[['meta', 'lists'], changes.lists]] : []),
    ...(changes.device ? [[['devices', store.deviceId], changes.device]] : []),
  ];
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
