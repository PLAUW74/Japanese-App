import * as store from './store.js';
import * as sync from './sync.js';
import { enableTypewriter } from './typewriter.js';
import { createDictionaryView } from './views/dictionary.js';
import { createVocabView } from './views/vocab.js';
import { createQuizView } from './views/quiz.js';
import { createKanaView } from './views/kana.js';
import { createVerbsView } from './views/verbs.js';
import { createGrammarView } from './views/grammar.js';
import { createMistakesView } from './views/mistakes.js';
import { createNotesView } from './views/notes.js';
import { createStatsView } from './views/stats.js';

const factories = {
  dictionary: createDictionaryView,
  words: createVocabView,
  quiz: createQuizView,
  kana: createKanaView,
  verbs: createVerbsView,
  grammar: createGrammarView,
  mistakes: createMistakesView,
  notes: () => createNotesView(),
  reading: () => createNotesView({ dir: 'reading', title: 'Reading', item: 'passage', newestFirst: false }),
  stats: createStatsView,
};
// The kana test, verb form quiz, grammar quiz and mistakes list live under the Quiz tab.
const TAB_FOR = { kana: 'quiz', verbs: 'quiz', grammar: 'quiz', mistakes: 'quiz' };
const views = {};
const main = document.getElementById('view');
const tabs = [...document.querySelectorAll('#tabs a')];
const dueBadge = document.getElementById('due-badge');
let current = '';

// Routes look like #/words or, for a single note, #/notes/<id>.
function route() {
  const [name, sub] = location.hash.replace(/^#\/?/, '').split('/');
  const next = factories[name] ? name : 'dictionary';
  if (next !== current) {
    current = next;
    views[next] = views[next] || factories[next]();
    main.replaceChildren(views[next].el);
    window.scrollTo(0, 0);
  }
  for (const tab of tabs) {
    if (tab.dataset.tab === (TAB_FOR[current] || current)) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  }
  views[current].onShow(sub && decodeURIComponent(sub));
}

function updateBadge() {
  const due = store.dueWords().length;
  dueBadge.textContent = due > 99 ? '99+' : due;
  dueBadge.hidden = due === 0;
}

store.subscribe(() => {
  updateBadge();
  if (views[current]) views[current].onStore();
});
window.addEventListener('hashchange', route);
// Stats shows live sync status. Other views only care about signing in or out, and
// re-rendering them on every save would knock the cursor out of a note being typed.
let signedInAs = null;
sync.onStatus((status) => {
  const account = `${status.state === 'signed-out'}|${status.email}`;
  if (!views[current] || (current !== 'stats' && account === signedInAs)) return;
  signedInAs = account;
  views[current].onStore();
});
// Words become due as time passes, not only when the data changes.
setInterval(updateBadge, 60000);

updateBadge();
route();
sync.init();
// Characters pop in as they are typed, with a coral cursor behind them.
enableTypewriter(main);

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
