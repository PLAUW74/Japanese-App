import * as store from './store.js';
import { createDictionaryView } from './views/dictionary.js';
import { createVocabView } from './views/vocab.js';
import { createQuizView } from './views/quiz.js';
import { createKanaView } from './views/kana.js';
import { createVerbsView } from './views/verbs.js';
import { createStatsView } from './views/stats.js';

const factories = {
  dictionary: createDictionaryView,
  words: createVocabView,
  quiz: createQuizView,
  kana: createKanaView,
  verbs: createVerbsView,
  stats: createStatsView,
};
// The kana test and the verb form quiz live under the Quiz tab.
const TAB_FOR = { kana: 'quiz', verbs: 'quiz' };
const views = {};
const main = document.getElementById('view');
const tabs = [...document.querySelectorAll('#tabs a')];
const dueBadge = document.getElementById('due-badge');
let current = '';

function route() {
  const name = location.hash.replace(/^#\/?/, '');
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
  views[current].onShow();
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
// Words become due as time passes, not only when the data changes.
setInterval(updateBadge, 60000);

updateBadge();
route();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
