// A shelf of HTML pages listed in an index.json: the Notes tab (study notes from
// textbook pages, newest first) and the Reading tab (graded passages, easiest first).
// Each page can write readings inline as 漢字{かんじ} and may come with a photo.
import { h, setChildren, speak, rubyMarkup } from '../ui.js';

// Notes can write readings inline as 漢字{かんじ}; turn those into furigana.
function addReadings(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const marked = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeValue.includes('{')) marked.push(node);
  }
  for (const node of marked) node.replaceWith(...rubyMarkup(node.nodeValue).childNodes);
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
    const shown = pages.filter((p) => !needle || [plainTitle(p.title), p.source, ...(p.tags || [])].join(' ').toLowerCase().includes(needle));
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
      h('div', { class: 'view-head' }, h('h1', null, title), h('span', { class: 'muted' }, `${pages.length} ${pages.length === 1 ? item : `${item}s`}`)),
      pages.length > 3 && search,
      shown.length === 0
        ? h('p', { class: 'muted empty-line' }, pages.length ? `Nothing matches “${filter.trim()}”.` : `No ${item}s yet.`)
        : h('div', { class: 'results' }, shown.map((page) => h('a', { class: 'entry note-card', href: `#/${dir}/${page.id}` },
          page.image && h('img', { class: 'note-thumb', src: new URL(page.image, base).href, alt: '', loading: 'lazy' }),
          h('div', { class: 'note-card-body' },
            h('h2', null, rubyMarkup(page.title)),
            h('span', { class: 'muted' }, [page.source, newestFirst && formatDate(page.added)].filter(Boolean).join(' · ')),
            page.tags && h('div', { class: 'badge-row' }, page.tags.map((tag) => h('span', { class: 'badge' }, tag))),
          ),
        ))),
    );
    if (searching) search.focus();
  }

  async function renderPage(id) {
    let pages;
    try { pages = await loadIndex(); } catch (err) { failed(); return; }
    const page = pages.find((p) => p.id === id);
    if (!page) { location.hash = `#/${dir}`; return; }

    const body = h('div', { class: 'note-body' }, h('p', { class: 'muted' }, 'Loading…'));
    setChildren(el,
      h('a', { class: 'btn btn-quiet back-link', href: `#/${dir}` }, `← All ${item}s`),
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
      addReadings(body);
    } catch (err) {
      setChildren(body, h('p', { class: 'error' }, `This ${item} could not be loaded. Check your connection and reload the page.`));
    }
  }

  // Tapping Japanese reads it aloud.
  el.addEventListener('click', (event) => {
    const target = event.target.closest('.note-body [lang="ja"], .note-body td');
    if (!target || !/[぀-ヿ㐀-鿿]/.test(target.textContent)) return;
    // Read the furigana rather than the kanji, so the voice can't pick the wrong reading.
    const copy = target.cloneNode(true);
    copy.querySelectorAll('ruby').forEach((ruby) => {
      const rt = ruby.querySelector('rt');
      ruby.replaceWith(rt ? rt.textContent : ruby.textContent);
    });
    copy.querySelectorAll('details').forEach((d) => d.remove());
    speak(copy.textContent.replace(/\s+/g, ' ').trim());
  });

  function show(id) {
    openId = id || null;
    if (openId) renderPage(openId);
    else renderList();
  }

  return {
    el,
    onShow: show,
    onStore: () => {},
  };
}
