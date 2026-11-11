import * as store from './store.js';
import * as sync from './sync.js';
import { languages, language } from './lang/index.js';
import { h, setChildren, setSpeech } from './ui.js';
import { enableTypewriter } from './typewriter.js';
import { initTheme } from './theme.js';
import { createTabMarker } from './pager.js';

// Addresses are #/<language>/<page>, and #/<language>/<page>/<id> for a single note. The
// language comes first so the back button, a bookmark and the installed app all reopen the
// language they were left in. Addresses from before the Chinese module existed had no
// language in them and were Japanese; they still work and are rewritten on arrival.
const views = {};                // 'ja/quiz' -> the built view
const main = document.getElementById('view');
const tabsNav = document.getElementById('tabs');
const toggleNav = document.getElementById('lang-toggle');
const brand = document.getElementById('brand');
const brandMark = document.getElementById('brand-mark');

let current = null;              // key of the page on show: 'ja/quiz'
let shownLang = null;            // the language the topbar is built for
let marker = null;               // the sliding pill behind the current tab
let tabs = [];
let dueBadge = null;

const keyOf = (target) => `${target.lang}/${target.next}`;
const langOf = (key) => key.slice(0, key.indexOf('/'));
const pageOf = (key) => key.slice(key.indexOf('/') + 1);
const address = (lang, page, sub) => `#/${[lang, page, sub].filter((p) => p != null).join('/')}`;

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
// Pagination (Motion Prompt #064): the page dips 1 → 0 → 1, 0.2 s each way, and the new
// view swaps in at the bottom of the dip. The reference starts its dip a moment before the
// click lands; a real click can't be anticipated, so here the dip starts on the click.
const DIP_MS = 200;
let dips = [];         // the fades running on the page, if any
let fadingOut = false;

// Whether a page shows the quiz picker, so two that both do can keep it still between them.
function isQuizPage(key) {
  if (!key) return false;
  const adapter = language(langOf(key));
  const page = pageOf(key);
  return (adapter.tabFor[page] || page) === 'quiz';
}

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

function parseRoute() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  // No language in the address: an old one, which was Japanese, unless it is bare.
  const lang = store.LANGS.includes(parts[0])
    ? parts.shift()
    : (parts.length ? 'ja' : store.getLang());
  const adapter = language(lang);
  const next = adapter.routes[parts[0]] ? parts[0] : adapter.home;
  return { lang, next, sub: parts[1] && decodeURIComponent(parts[1]) };
}

// ---- the topbar ----

// The same page in the other language when it has one, otherwise that language's home.
function toggleAddress(adapter, target) {
  const page = adapter.routes[target.next] ? target.next : adapter.home;
  return address(adapter.code, page);
}

function renderToggle(target) {
  setChildren(toggleNav, languages.map((adapter) => {
    const on = adapter.code === target.lang;
    return h('a', {
      href: toggleAddress(adapter, target),
      class: on ? 'on' : '',
      lang: adapter.htmlLang,
      title: adapter.label,
      'aria-current': on ? 'true' : null,
    }, adapter.short);
  }));
}

// Rebuilt only when the language changes: the tabs, the brand glyph and the marker behind
// the current tab, which holds the tabs it was made for and so is replaced with them.
function buildChrome(lang) {
  const adapter = language(lang);
  shownLang = lang;
  brand.href = address(lang, adapter.home);
  brandMark.textContent = adapter.mark;
  brandMark.lang = adapter.htmlLang;
  setSpeech({ code: lang, tag: adapter.speechTag, match: adapter.voice, label: adapter.label });

  dueBadge = null;
  tabs = adapter.tabs.map((tab) => {
    const link = h('a', { href: address(lang, tab.route), 'data-tab': tab.route }, tab.label);
    if (tab.badge) {
      dueBadge = h('span', { class: 'tab-badge', hidden: true });
      link.append(' ', dueBadge);
    }
    return link;
  });
  if (marker) marker.destroy();
  setChildren(tabsNav, tabs);
  marker = createTabMarker(tabsNav);
}

// ---- pages ----

function show(target) {
  const key = keyOf(target);
  if (key !== current) {
    current = key;
    views[key] = views[key] || language(target.lang).routes[target.next]();
    main.replaceChildren(views[key].el);
    window.scrollTo(0, 0);
  }
  views[current].onShow(target.sub);
}

function route() {
  const target = parseRoute();
  // Put the address into its full form, so every link on the page matches it. This fires no
  // hashchange, so the render below is the only one.
  const canonical = address(target.lang, target.next, target.sub);
  if (location.hash !== canonical) history.replaceState(null, '', canonical);

  if (target.lang !== shownLang) {
    store.setLang(target.lang);
    buildChrome(target.lang);
  }
  renderToggle(target);

  const adapter = language(target.lang);
  const tabName = adapter.tabFor[target.next] || target.next;
  const tab = tabs.find((each) => each.dataset.tab === tabName);
  for (const each of tabs) {
    if (each === tab) each.setAttribute('aria-current', 'page');
    else each.removeAttribute('aria-current');
  }
  marker.moveTo(tab);
  updateBadge();

  // A dip already under way shows whatever the address says when it bottoms out.
  if (fadingOut) return;
  // First load, the same view (a different note), or reduced motion: no dip.
  if (!current || keyOf(target) === current || reduceMotion.matches) { show(target); return; }

  // Interrupting a fade-in starts the fade-out from wherever it had got to, at the same speed.
  const from = dips.length ? Number(getComputedStyle(dips[0].effect.target).opacity) : 1;
  for (const animation of dips) animation.cancel();
  // Keep the header only if both pages show it. A quiz in progress shows its progress bar
  // instead; a page not opened yet starts on its setup screen, which has the header.
  const nextKey = keyOf(target);
  const keepHead = isQuizPage(current) && isQuizPage(nextKey) && !!headOf(views[current])
    && (!views[nextKey] || !!headOf(views[nextKey]));
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
  if (!dueBadge) return;
  // What's left of today's challenge, never the total number due.
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
  if (!views[current] || (pageOf(current) !== 'stats' && account === signedInAs)) return;
  signedInAs = account;
  views[current].onStore();
});
// Words become due as time passes, not only when the data changes.
setInterval(updateBadge, 60000);

route();
sync.init();
// Characters pop in as they are typed, with the accent cursor behind them.
enableTypewriter(main);
initTheme();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
