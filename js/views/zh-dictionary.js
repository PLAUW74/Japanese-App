// The Chinese dictionary: search the HSK 3.0 word list, and, with the box empty, work
// through a band and save its words.
//
// The band browser is the point of this page for a learner starting out. Finding 500
// band 1 words one search at a time is not a way to begin, so a band can be added to My
// Words in one go, or in fifties, and the words already saved are marked.
import * as dict from '../lang/zh/dict.js';
import * as store from '../store.js';
import { staggerIn } from '../stagger.js';
import {
  h, icon, toast, speakButton, wordTitle, badges, sensesList, meaningText,
  headword, wordEditor, setChildren, segmented, confirmButton,
} from '../ui.js';

const BANDS = [1, 2, 3, 4, 5, 6];
const PAGE = 100;
const EXAMPLES = ['friend', 'pengyou', '谢谢', 'xie4', 'teacher', 'to study'];

export function createZhDictionaryView() {
  let query = '';
  let results = [];
  let total = 0;
  let searching = false;
  let searchId = 0;
  let debounce;
  let band = 1;
  let shown = PAGE;          // how many of the band's words are listed
  let bandWords = [];
  let bandTotal = 0;
  let busy = false;
  const expanded = new Set();

  const input = h('input', {
    type: 'search',
    class: 'search-input',
    placeholder: 'Search in English, pinyin or characters',
    autocomplete: 'off',
    autocapitalize: 'off',
    spellcheck: false,
    'aria-label': 'Search the word list',
    oninput: () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => runSearch(input.value), 140);
    },
  });
  const loader = h('div', { class: 'loader' });
  const meta = h('p', { class: 'search-meta', 'aria-live': 'polite' });
  const list = h('div', { class: 'results' });
  const el = h('section', { class: 'view' },
    h('div', { class: 'search-box' }, icon('search'), input),
    loader,
    meta,
    list,
  );

  // ---- loading ----

  function renderLoader() {
    const { state, progress, error } = dict.status;
    if (state === 'failed') {
      setChildren(loader, h('p', { class: 'error' }, error || 'The word list could not be loaded.'));
      return;
    }
    if (state === 'ready') {
      setChildren(loader);
      return;
    }
    setChildren(loader,
      h('p', { class: 'muted' }, 'Loading the HSK word list…'),
      h('div', { class: 'progress' }, h('div', { class: 'progress-fill', style: `width:${Math.round(progress * 100)}%` })),
    );
  }

  // ---- searching ----

  async function runSearch(value) {
    query = value.trim();
    const id = ++searchId;
    if (!query) {
      results = [];
      total = 0;
      searching = false;
      render();
      return;
    }
    searching = true;
    renderMeta();
    try {
      const found = await dict.search(query);
      if (id !== searchId) return;
      results = found.results;
      total = found.total;
    } catch (err) {
      if (id !== searchId) return;
      results = [];
      total = 0;
    }
    searching = false;
    expanded.clear();
    render();
    staggerIn([...list.querySelectorAll(':scope > .entry')], performance.now());
  }

  // ---- a band ----

  async function loadBand() {
    const wanted = band;
    try {
      const found = await dict.band(wanted, 0, shown);
      if (wanted !== band) return;
      bandWords = found.results;
      bandTotal = found.total;
    } catch (err) {
      bandWords = [];
      bandTotal = 0;
    }
    render();
  }

  async function saveBand(limit) {
    if (busy) return;
    busy = true;
    render();
    try {
      const ids = await dict.bandIds(band);
      const fresh = ids.filter((id) => !store.hasWord(id));
      const wanted = limit ? fresh.slice(0, limit) : fresh;
      if (!wanted.length) {
        toast('Every word in this band is already saved');
        return;
      }
      // Fetched in one go, then saved one by one: each save is its own card and its own
      // row to sync, as if it had been added from a search.
      const entries = await dict.get(wanted);
      for (const entry of entries) store.addWord(entry);
      // The daily challenge feeds new words in a set number a day, so a whole band saved
      // at once becomes a queue rather than one overwhelming day.
      const perDay = store.getState().settings.newPerDay;
      toast(`Saved ${entries.length} ${entries.length === 1 ? 'word' : 'words'}`
        + (perDay ? `. They come through ${perDay} a day in the daily challenge.` : ' to My Words'));
    } catch (err) {
      toast('Those words could not be saved');
    } finally {
      busy = false;
      await loadBand();
    }
  }

  // ---- drawing ----

  function entryCard(word) {
    const saved = store.hasWord(word.id);
    const open = expanded.has(word.id);
    const toggle = h('button', {
      type: 'button',
      class: `btn btn-small ${saved ? 'btn-quiet' : 'btn-primary'}`,
      'aria-pressed': String(saved),
      onclick: (event) => {
        event.stopPropagation();
        if (saved) {
          expanded.add(word.id);
          render();
          return;
        }
        store.addWord(word);
        toast(`Saved ${headword(word)} to My Words`);
      },
    }, icon(saved ? 'check' : 'plus'), saved ? 'Saved' : 'Save');

    const savedWord = saved ? store.getState().words[word.id] : null;
    return h('article', { class: 'entry' },
      h('div', { class: 'entry-head' },
        h('div', { class: 'entry-word' }, wordTitle(word), speakButton(word)),
        h('div', { class: 'entry-actions' }, toggle),
      ),
      h('div', { class: 'badge-row' },
        ...badges(word),
        word.band2025 > 0 && h('span', { class: 'badge' }, `HSK ${word.band2025} in the 2025 syllabus`),
        word.classifiers.length > 0 && h('span', { class: 'badge' }, `measure word ${word.classifiers.join(' / ')}`),
      ),
      word.senses[0].gloss.length ? sensesList(word, 3) : h('p', { class: 'muted' }, 'No English in CC-CEDICT for this one.'),
      open && savedWord && wordEditor(savedWord),
    );
  }

  function renderMeta() {
    if (searching) {
      meta.textContent = 'Searching…';
      return;
    }
    if (!query) {
      meta.textContent = '';
      return;
    }
    if (!results.length) {
      meta.textContent = `Nothing found for “${query}”.`;
      return;
    }
    meta.textContent = total > results.length
      ? `${results.length} of ${total} matches`
      : `${results.length} ${results.length === 1 ? 'match' : 'matches'}`;
  }

  function bandBrowser() {
    const saved = bandWords.filter((w) => store.hasWord(w.id)).length;
    const unsavedShown = bandWords.length - saved;
    const picker = segmented('HSK band', BANDS.map((n) => [n, `HSK ${n}`]), band, (n) => {
      band = n;
      shown = PAGE;
      bandWords = [];
      render();
      loadBand();
    });
    const more = bandWords.length < bandTotal && h('button', {
      type: 'button',
      class: 'btn btn-quiet',
      onclick: () => { shown += PAGE; loadBand(); },
    }, `Show ${Math.min(PAGE, bandTotal - bandWords.length)} more`);

    return [
      h('div', { class: 'card setup' },
        h('div', { class: 'field' }, h('span', { class: 'label' }, 'Browse a band'), picker),
        h('p', { class: 'muted' }, bandTotal
          ? `${bandTotal} words in HSK ${band}. Showing ${bandWords.length}, of which ${saved} are in My Words. `
            + (store.getState().settings.newPerDay
              ? `Saving a whole band is fine: the daily challenge brings in ${store.getState().settings.newPerDay} new words a day.`
              : '')
          : 'Loading…'),
        bandTotal > 0 && h('div', { class: 'editor-actions' },
          h('button', {
            type: 'button', class: 'btn btn-primary', disabled: busy,
            onclick: () => saveBand(50),
          }, busy ? 'Saving…' : 'Save the next 50'),
          confirmButton(`Save all of HSK ${band}`, () => saveBand(0), 'btn btn-quiet'),
        ),
      ),
      bandWords.length > 0 && h('div', { class: 'results' }, bandWords.map(entryCard)),
      more,
      unsavedShown === 0 && bandWords.length > 0
        && h('p', { class: 'muted' }, 'Every word shown here is saved. Open the Quiz tab to review them.'),
    ];
  }

  function emptyState() {
    if (dict.status.state !== 'ready') return null;
    return h('div', { class: 'empty' },
      h('h2', null, 'Look up a Chinese word'),
      h('p', { class: 'muted' }, 'Type English, pinyin (with or without tones) or characters. Try:'),
      h('div', { class: 'chips' }, EXAMPLES.map((example) => h('button', {
        type: 'button', class: 'chip',
        onclick: () => { input.value = example; runSearch(example); input.focus(); },
      }, example))),
    );
  }

  function render() {
    renderLoader();
    renderMeta();
    if (query) {
      setChildren(list, results.map(entryCard));
      return;
    }
    setChildren(list, emptyState(), dict.status.state === 'ready' && bandBrowser());
  }

  dict.onStatus(() => {
    if (!el.isConnected) return;
    renderLoader();
    if (dict.status.state === 'ready' && !bandWords.length && !query) loadBand();
  });

  render();
  return {
    el,
    onShow: () => {
      render();
      if (dict.status.state === 'ready' && !bandWords.length && !query) loadBand();
      queueMicrotask(() => input.focus());
    },
    onStore: render,
  };
}
