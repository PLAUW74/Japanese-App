// A shelf of HTML pages listed in an index.json: the Notes tab (study notes from
// textbook pages, newest first) and the Reading tab (graded passages, easiest first).
// Each page can write readings inline as 漢字{かんじ} and may come with a photo.
import * as store from '../store.js';
import { h, setChildren, rubyMarkup, stopSpeaking, route } from '../ui.js';
import { enhanceNote, onWordTap } from './note-tools.js';
import { CHOICE_GROUP, parseGroup, answerKeys, itemAnswers } from '../note-questions.js';
import { staggerIn } from '../stagger.js';

// Notes can write readings inline as 漢字{かんじ}; turn those into furigana.
function addReadings(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const marked = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeValue.includes('{')) marked.push(node);
  }
  for (const node of marked) node.replaceWith(...rubyMarkup(node.nodeValue).childNodes);
}

// Blanks (<span class="gap">) become boxes you can type in. What you type is saved
// per page in the store, which syncs it to the learner's other devices.
const pageKey = (dir, id) => `${dir}~${id}`;

function fitGap(input) {
  const length = [...input.value].reduce((n, ch) => n + (ch.charCodeAt(0) > 0xff ? 1 : 0.55), 0);
  input.style.width = `${Math.max(2.6, length + 1)}em`;
}

// Answers typed before syncing existed were kept under their own localStorage key.
function migrateOldAnswers(dir, id, key) {
  try {
    const old = `kotoba-gaps:${dir}/${id}`;
    const values = JSON.parse(localStorage.getItem(old));
    if (Array.isArray(values) && !store.getAnswers(key).length) store.setAnswers(key, values);
    localStorage.removeItem(old);
  } catch { /* nothing to move */ }
}

// Returns the inputs, or null when the page has no blanks.
function makeGapsEditable(root, key) {
  const gaps = [...root.querySelectorAll('.gap')];
  if (!gaps.length) return null;
  const saved = store.getAnswers(key);
  const inputs = gaps.map((gap, i) => {
    const input = h('input', {
      type: 'text',
      class: 'gap-input',
      lang: 'ja',
      autocomplete: 'off',
      autocapitalize: 'off',
      spellcheck: 'false',
      'aria-label': `Blank ${i + 1}`,
    });
    input.value = saved[i] || '';
    fitGap(input);
    gap.replaceWith(input);
    return input;
  });

  // Save shortly after typing stops, so every keystroke isn't a separate save.
  let timer;
  const save = () => {
    clearTimeout(timer);
    store.setAnswers(key, inputs.map((input) => input.value));
  };
  root.addEventListener('input', (event) => {
    if (!event.target.classList.contains('gap-input')) return;
    fitGap(event.target);
    clearTimeout(timer);
    timer = setTimeout(save, 400);
  });
  root.addEventListener('focusout', (event) => {
    if (event.target.classList.contains('gap-input')) save();
  });
  // Enter jumps to the next blank.
  root.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || event.isComposing || !event.target.classList.contains('gap-input')) return;
    event.preventDefault();
    const next = inputs[inputs.indexOf(event.target) + 1];
    if (next) next.focus();
    else event.target.blur();
  });
  root.append(h('div', { class: 'gap-tools' },
    h('span', { class: 'muted' }, 'Your answers save as you type and sync when you are signed in.'),
    h('button', {
      type: 'button',
      class: 'btn btn-quiet btn-small',
      onclick: () => {
        if (!inputs.some((input) => input.value) || !confirm('Clear everything you typed on this page?')) return;
        inputs.forEach((input) => { input.value = ''; fitGap(input); });
        save();
      },
    }, 'Clear my answers'),
  ));
  return inputs;
}

// Multiple-choice questions — （ a. … b. … ） and ｛…・…｝ — become options to tap, the way
// one would circle them on paper. A tapped option is marked right or wrong against the
// item's answer, and the right one is outlined when the pick was wrong. What was picked is
// saved per page beside the typed answers, so it syncs the same way.
// Run before the readings are drawn: a group then sits in a single text node.
function makeChoicesTappable(root, key) {
  const groups = [];   // { el, buttons, right }
  for (const li of root.querySelectorAll('ol.questions > li')) {
    const p = li.querySelector(':scope > p');
    const details = li.querySelector('details');
    if (!p || p.querySelector('.gap')) continue;
    const nodes = [];
    const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (new RegExp(CHOICE_GROUP.source).test(node.nodeValue)) nodes.push(node);
    }
    if (!nodes.length) continue;
    const found = nodes.flatMap((node) => node.nodeValue.match(new RegExp(CHOICE_GROUP.source, 'g')));
    const keys = details ? answerKeys(itemAnswers(details), found) : null;
    let n = 0;
    for (const node of nodes) {
      const pieces = [];
      let at = 0;
      for (const match of node.nodeValue.matchAll(new RegExp(CHOICE_GROUP.source, 'g'))) {
        pieces.push(node.nodeValue.slice(at, match.index));
        const braced = match[0].startsWith('｛');
        const options = parseGroup(match[0]);
        const right = keys ? keys[n] : null;
        const index = groups.length;
        const buttons = options.map((option) => h('button', {
          type: 'button',
          class: 'pick-opt',
          'data-key': option.key,
          'aria-pressed': 'false',
          onclick: () => pick(index, option.key),
        }, braced ? option.text : `${option.key}. ${option.text}`));
        const el = h('span', { class: 'pick-group', role: 'group', 'aria-label': 'Choose one' },
          braced ? '｛' : '（ ',
          buttons.flatMap((button, i) => (i ? [braced ? '・' : '　', button] : [button])),
          braced ? '｝' : ' ）');
        groups.push({ el, buttons, right });
        pieces.push(el);
        at = match.index + match[0].length;
        n += 1;
      }
      pieces.push(node.nodeValue.slice(at));
      node.replaceWith(...pieces);
    }
  }
  if (!groups.length) return null;

  const page = `${key}~picks`;
  const picks = [...store.getAnswers(page)];

  function draw(index) {
    const { buttons, right } = groups[index];
    const chosen = picks[index] || '';
    for (const button of buttons) {
      const isChosen = button.dataset.key === chosen;
      button.classList.toggle('picked', isChosen);
      button.classList.toggle('right', isChosen && !!right && chosen === right);
      button.classList.toggle('wrong', isChosen && !!right && chosen !== right);
      // A wrong pick shows which one it should have been.
      button.classList.toggle('reveal', !!chosen && !!right && chosen !== right && button.dataset.key === right);
      button.setAttribute('aria-pressed', String(isChosen));
    }
  }

  function pick(index, choice) {
    // Tapping the circled option again takes the circle off.
    picks[index] = picks[index] === choice ? '' : choice;
    draw(index);
    store.setAnswers(page, groups.map((g, i) => picks[i] || ''));
  }

  groups.forEach((g, i) => draw(i));
  return {
    // What was picked on another device, shown when it arrives.
    refresh() {
      const stored = store.getAnswers(page);
      groups.forEach((g, i) => { picks[i] = stored[i] || ''; draw(i); });
    },
  };
}

// Shows answers that arrived from another device, leaving the box being typed in alone.
function refreshGaps(inputs, key) {
  const values = store.getAnswers(key);
  inputs.forEach((input, i) => {
    if (input === document.activeElement || input.value === (values[i] || '')) return;
    input.value = values[i] || '';
    fitGap(input);
  });
}

const plainTitle = (title) => title.replace(/\{[^}]*\}/g, '');

const formatDate = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

// `dir` is the folder (and route) name; `newestFirst` orders the list by date added,
// otherwise it keeps the order of index.json.
export function createNotesView({ dir = 'notes', title = 'Notes', item = 'note', newestFirst = true } = {}) {
  const base = new URL(`../../${dir}/`, import.meta.url);
  const el = h('section', { class: 'view' });
  let filter = '';
  let openId = null;
  let gapPage = null; // { key, inputs } for the open page, if it has blanks
  let pickPage = null; // { refresh } for the open page, if it has choices to tap

  let index = null;
  function loadIndex() {
    if (!index) {
      index = fetch(new URL('index.json', base)).then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      });
      index.catch(() => { index = null; });
    }
    return index;
  }

  const bodies = new Map();
  function loadBody(page) {
    if (!bodies.has(page.id)) {
      const body = fetch(new URL(`${page.id}.html`, base)).then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      });
      body.catch(() => bodies.delete(page.id));
      bodies.set(page.id, body);
    }
    return bodies.get(page.id);
  }

  function failed() {
    setChildren(el, h('div', { class: 'view-head' }, h('h1', null, title)),
      h('p', { class: 'error' }, `The ${item}s could not be loaded. Check your connection and reload the page.`));
  }

  async function renderList() {
    let pages;
    try { pages = await loadIndex(); } catch (err) { failed(); return; }
    if (openId) return;
    const needle = filter.trim().toLowerCase();
    const top = pages.filter((p) => !p.parent);
    const shown = top.filter((p) => !needle ||[plainTitle(p.title), p.source, ...(p.tags || [])].join(' ').toLowerCase().includes(needle));
    if (newestFirst) shown.sort((a, b) => b.added.localeCompare(a.added));

    const search = el.querySelector('.filter-input') || h('input', {
      type: 'search',
      class: 'filter-input',
      placeholder: `Search ${item}s`,
      'aria-label': `Search ${item}s`,
      oninput: (event) => { filter = event.target.value; renderList(); },
    });
    const searching = document.activeElement === search;

    setChildren(el,
      h('div', { class: 'view-head' }, h('h1', null, title), h('span', { class: 'muted' }, `${top.length} ${top.length === 1 ? item : `${item}s`}`)),
      top.length > 3 && search,
      shown.length === 0
        ? h('p', { class: 'muted empty-line' }, top.length ? `Nothing matches “${filter.trim()}”.` : `No ${item}s yet.`)
        : h('div', { class: 'results' }, shown.map((page) => card(page, pages))),
    );
    if (searching) search.focus();
    else entrance();
  }

  // Cards rise in one after another (Motion Prompt #002, js/stagger.js) when a list is opened,
  // timed from when they are drawn, so loading the index first doesn't eat into it. Searching
  // redraws the list without replaying it.
  let enterNext = false;
  function entrance() {
    if (!enterNext) return;
    enterNext = false;
    const results = el.querySelector(':scope > .results');
    if (results) staggerIn([...results.children], performance.now());
  }

  const childrenOf = (page, pages) => pages.filter((p) => p.parent === page.id);

  function card(page, pages) {
    const kids = childrenOf(page, pages).length;
    const meta = kids
      ? [page.source, `${kids} ${kids === 1 ? 'page' : 'pages'}`]
      : [page.source, newestFirst && formatDate(page.added)];
    return h('a', { class: 'entry note-card', href: route(dir, page.id) },
      page.image && h('img', { class: 'note-thumb', src: new URL(page.image, base).href, alt: '', loading: 'lazy' }),
      h('div', { class: 'note-card-body' },
        h('h2', null, rubyMarkup(page.title)),
        h('span', { class: 'muted' }, meta.filter(Boolean).join(' · ')),
        page.tags && h('div', { class: 'badge-row' }, page.tags.map((tag) => h('span', { class: 'badge' }, tag))),
      ),
    );
  }

  // A page with children (such as Homework) is a folder: it lists its pages, in index.json order.
  function renderFolder(page, kids) {
    setChildren(el,
      h('a', { class: 'btn btn-quiet back-link', href: route(dir) }, `← All ${item}s`),
      h('div', { class: 'view-head' }, h('h1', null, rubyMarkup(page.title)), h('span', { class: 'muted' }, `${kids.length} ${kids.length === 1 ? 'page' : 'pages'}`)),
      h('div', { class: 'results' }, kids.map((kid) => card(kid, []))),
    );
    window.scrollTo(0, 0);
    entrance();
  }

  async function renderPage(id) {
    let pages;
    try { pages = await loadIndex(); } catch (err) { failed(); return; }
    const page = pages.find((p) => p.id === id);
    if (!page) { location.hash = route(dir); return; }
    const kids = childrenOf(page, pages);
    if (kids.length) { renderFolder(page, kids); return; }
    const parent = page.parent && pages.find((p) => p.id === page.parent);

    const body = h('div', { class: 'note-body' }, h('p', { class: 'muted' }, 'Loading…'));
    setChildren(el,
      parent
        ? h('a', { class: 'btn btn-quiet back-link', href: route(dir, parent.id) }, h('span', null, '← '), rubyMarkup(parent.title))
        : h('a', { class: 'btn btn-quiet back-link', href: route(dir) }, `← All ${item}s`),
      h('div', { class: 'view-head note-head' },
        h('div', null, h('h1', null, rubyMarkup(page.title)), h('span', { class: 'muted' }, [page.source, newestFirst && `added ${formatDate(page.added)}`].filter(Boolean).join(' · '))),
      ),
      page.image && h('details', { class: 'card note-photo' },
        h('summary', null, 'Original page'),
        h('a', { href: new URL(page.image, base).href, target: '_blank', rel: 'noopener' },
          h('img', { src: new URL(page.image, base).href, alt: `Photo of ${page.source || plainTitle(page.title)}`, loading: 'lazy' })),
      ),
      h('article', { class: 'card' }, body),
    );
    window.scrollTo(0, 0);

    try {
      body.innerHTML = await loadBody(page);
      const key = pageKey(dir, page.id);
      const picks = makeChoicesTappable(body, key);
      if (picks && openId === id) pickPage = picks;
      addReadings(body);
      migrateOldAnswers(dir, page.id, key);
      const inputs = makeGapsEditable(body, key);
      if (inputs && openId === id) gapPage = { key, inputs };
      enhanceNote(body);
    } catch (err) {
      setChildren(body, h('p', { class: 'error' }, `This ${item} could not be loaded. Check your connection and reload the page.`));
    }
  }

  // Tapping a word in a Japanese sentence reads just that word (js/views/note-tools.js).
  el.addEventListener('click', (event) => {
    const body = el.querySelector('.note-body');
    if (body) onWordTap(event, body);
  });

  function show(id) {
    stopSpeaking();
    openId = id || null;
    gapPage = null;
    pickPage = null;
    enterNext = true; // a list or folder drawn for this visit slides in; a note page ignores it
    if (openId) renderPage(openId);
    else renderList();
  }

  return {
    el,
    onShow: show,
    onStore: () => {
      if (gapPage) refreshGaps(gapPage.inputs, gapPage.key);
      if (pickPage) pickPage.refresh();
    },
  };
}
