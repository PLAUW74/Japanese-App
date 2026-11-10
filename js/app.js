import * as store from './store.js';
import * as sync from './sync.js';
import { enableTypewriter } from './typewriter.js';
import { initTheme } from './theme.js';
import { createTabMarker } from './pager.js';
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

const marker = createTabMarker(document.getElementById('tabs'));
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
// Pagination (Motion Prompt #064): the page dips 1 → 0 → 1, 0.2 s each way, and the new
// view swaps in at the bottom of the dip. The reference starts its dip a moment before the
// click lands; a real click can't be anticipated, so here the dip starts on the click.
const DIP_MS = 200;
let dips = [];         // the fades running on the page, if any
let fadingOut = false;

const isQuizPage = (name) => (TAB_FOR[name] || name) === 'quiz';
const headOf = (view) => view && view.el.querySelector(':scope > .view-head');

// What dips: the whole page, or, between two quiz pages that both show the quiz picker,
// everything below the header, so the picker stays put while its own marker slides.
function fadeTargets(view, keepHead) {
  const head = keepHead && headOf(view);
  const rest = head ? [...view.el.children].filter((child) => child !== head) : [];
  return rest.length ? rest : [main];
}

const fade = (targets, from, to, ms, hold) => targets.map((el) =>
  el.animate([{ opacity: from }, { opacity: to }], { duration: ms, easing: 'linear', fill: hold ? 'forwards' : 'auto' }));

// Routes look like #/words or, for a single note, #/notes/<id>.
function parseRoute() {
  const [name, sub] = location.hash.replace(/^#\/?/, '').split('/');
  return { next: factories[name] ? name : 'dictionary', sub: sub && decodeURIComponent(sub) };
}

function show({ next, sub }) {
  if (next !== current) {
    current = next;
    views[next] = views[next] || factories[next]();
    main.replaceChildren(views[next].el);
    window.scrollTo(0, 0);
  }
  views[current].onShow(sub);
}

function route() {
  const target = parseRoute();
  const tabName = TAB_FOR[target.next] || target.next;
  const tab = tabs.find((each) => each.dataset.tab === tabName);
  for (const each of tabs) {
    if (each === tab) each.setAttribute('aria-current', 'page');
    else each.removeAttribute('aria-current');
  }
  marker.moveTo(tab);

  // A dip already under way shows whatever the address says when it bottoms out.
  if (fadingOut) return;
  // First load, the same view (a different note), or reduced motion: no dip.
  if (!current || target.next === current || reduceMotion.matches) { show(target); return; }

  // Interrupting a fade-in starts the fade-out from wherever it had got to, at the same speed.
  const from = dips.length ? Number(getComputedStyle(dips[0].effect.target).opacity) : 1;
  for (const animation of dips) animation.cancel();
  // Keep the header only if both pages show it. A quiz in progress shows its progress bar
  // instead; a page not opened yet starts on its setup screen, which has the header.
  const keepHead = isQuizPage(current) && isQuizPage(target.next) && !!headOf(views[current])
    && (!views[target.next] || !!headOf(views[target.next]));
  fadingOut = true;
  const outs = fade(fadeTargets(views[current], keepHead), from, 0, DIP_MS * from, true);
  dips = outs;
  outs[0].finished.then(() => {
    fadingOut = false;
    show(parseRoute());
    // Re-check: a click during the fade-out may have led somewhere else.
    const keep = keepHead && isQuizPage(current) && !!headOf(views[current]);
    const ins = fade(fadeTargets(views[current], keep), 0, 1, DIP_MS, false);
    dips = ins;
    for (const animation of outs) animation.cancel(); // drop the held opacity 0 now
    ins[0].finished.then(() => { if (dips === ins) dips = []; }, () => {});
  }, () => {});
}

function updateBadge() {
  // What's left of today's challenge (10 at most), never the total number due.
  const left = store.dailyChallenge().left.length;
  dueBadge.textContent = left;
  dueBadge.hidden = left === 0;
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
// Characters pop in as they are typed, with the accent cursor behind them.
enableTypewriter(main);
initTheme();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
