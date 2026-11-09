// Study notes written up from textbook pages. Each note is an HTML file in notes/,
// listed in notes/index.json together with a photo of the original page.
import { h, setChildren, speak } from '../ui.js';

const BASE = new URL('../../notes/', import.meta.url);

let index = null;
function loadIndex() {
  if (!index) {
    index = fetch(new URL('index.json', BASE)).then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    });
    index.catch(() => { index = null; });
  }
  return index;
}

const bodies = new Map();
function loadBody(note) {
  if (!bodies.has(note.id)) {
    const body = fetch(new URL(`${note.id}.html`, BASE)).then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.text();
    });
    body.catch(() => bodies.delete(note.id));
    bodies.set(note.id, body);
  }
  return bodies.get(note.id);
}

const formatDate = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

export function createNotesView() {
  const el = h('section', { class: 'view' });
  let filter = '';
  let openId = null;

  function failed() {
    setChildren(el, h('div', { class: 'view-head' }, h('h1', null, 'Notes')),
      h('p', { class: 'error' }, 'The notes could not be loaded. Check your connection and reload the page.'));
  }

  async function renderList() {
    let notes;
    try { notes = await loadIndex(); } catch (err) { failed(); return; }
    if (openId) return;
    const needle = filter.trim().toLowerCase();
    const shown = notes
      .filter((n) => !needle || [n.title, n.source, ...(n.tags || [])].join(' ').toLowerCase().includes(needle))
      .sort((a, b) => b.added.localeCompare(a.added));

    const search = el.querySelector('.filter-input') || h('input', {
      type: 'search',
      class: 'filter-input',
      placeholder: 'Search notes',
      'aria-label': 'Search notes',
      oninput: (event) => { filter = event.target.value; renderList(); },
    });
    const searching = document.activeElement === search;

    setChildren(el,
      h('div', { class: 'view-head' }, h('h1', null, 'Notes'), h('span', { class: 'muted' }, `${notes.length} ${notes.length === 1 ? 'note' : 'notes'}`)),
      notes.length > 3 && search,
      shown.length === 0
        ? h('p', { class: 'muted empty-line' }, notes.length ? `No notes match “${filter.trim()}”.` : 'No notes yet.')
        : h('div', { class: 'results' }, shown.map((note) => h('a', { class: 'entry note-card', href: `#/notes/${note.id}` },
          note.image && h('img', { class: 'note-thumb', src: new URL(note.image, BASE).href, alt: '', loading: 'lazy' }),
          h('div', { class: 'note-card-body' },
            h('h2', null, note.title),
            h('span', { class: 'muted' }, [note.source, formatDate(note.added)].filter(Boolean).join(' · ')),
            note.tags && h('div', { class: 'badge-row' }, note.tags.map((tag) => h('span', { class: 'badge' }, tag))),
          ),
        ))),
    );
    if (searching) search.focus();
  }

  async function renderNote(id) {
    let notes;
    try { notes = await loadIndex(); } catch (err) { failed(); return; }
    const note = notes.find((n) => n.id === id);
    if (!note) { location.hash = '#/notes'; return; }

    const body = h('div', { class: 'note-body' }, h('p', { class: 'muted' }, 'Loading…'));
    setChildren(el,
      h('a', { class: 'btn btn-quiet back-link', href: '#/notes' }, '← All notes'),
      h('div', { class: 'view-head note-head' },
        h('div', null, h('h1', null, note.title), h('span', { class: 'muted' }, [note.source, `added ${formatDate(note.added)}`].filter(Boolean).join(' · '))),
      ),
      note.image && h('details', { class: 'card note-photo' },
        h('summary', null, 'Original page'),
        h('a', { href: new URL(note.image, BASE).href, target: '_blank', rel: 'noopener' },
          h('img', { src: new URL(note.image, BASE).href, alt: `Photo of ${note.source || note.title}`, loading: 'lazy' })),
      ),
      h('article', { class: 'card' }, body),
    );
    window.scrollTo(0, 0);

    try {
      body.innerHTML = await loadBody(note);
    } catch (err) {
      setChildren(body, h('p', { class: 'error' }, 'This note could not be loaded. Check your connection and reload the page.'));
    }
  }

  // Tapping Japanese in a note reads it aloud.
  el.addEventListener('click', (event) => {
    const target = event.target.closest('.note-body [lang="ja"], .note-body td');
    if (!target || !/[぀-ヿ㐀-鿿]/.test(target.textContent)) return;
    const copy = target.cloneNode(true);
    copy.querySelectorAll('rt').forEach((rt) => rt.remove());
    speak(copy.textContent.trim());
  });

  function show(id) {
    openId = id || null;
    if (openId) renderNote(openId);
    else renderList();
  }

  return {
    el,
    onShow: show,
    onStore: () => {},
  };
}
