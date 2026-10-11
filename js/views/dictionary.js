import * as dict from '../dict.js';
import * as store from '../store.js';
import { toHiragana, isKanji } from '../kana.js';
import { h, ja, icon, toast, speakButton, formsPanel, wordTitle, badges, sensesList, headword, reading, wordEditor } from '../ui.js';

const PREVIEW_SENSES = 3;
const EXAMPLES = ['eat', 'taberu', 'ねこ', '勉強', 'thank you', 'kawaii'];
const GRADES = { 8: 'Secondary school', 9: 'Name kanji', 10: 'Name kanji' };

export function createDictionaryView() {
  let query = '';
  let results = [];
  let total = 0;
  let searching = false;
  let searchId = 0;
  let debounce;
  const expanded = new Set();

  const input = h('input', {
    type: 'search',
    class: 'search-input',
    placeholder: 'Search in English, romaji, kana or kanji',
    autocomplete: 'off',
    autocapitalize: 'off',
    spellcheck: false,
    'aria-label': 'Search the dictionary',
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
  }

  function renderLoader() {
    const { state, progress, error } = dict.status;
    loader.replaceChildren();
    loader.hidden = state === 'ready';
    if (state === 'loading') {
      loader.append(
        h('span', null, `Loading dictionary… ${Math.round(progress * 100)}%`),
        h('div', { class: 'progress' }, h('div', { class: 'progress-fill', style: `width:${progress * 100}%` })),
      );
    } else if (state === 'failed') {
      loader.append(h('span', { class: 'error' }, `The dictionary failed to load: ${error}. Reload the page to try again.`));
    }
  }

  function renderMeta() {
    if (!query) meta.textContent = '';
    else if (searching) meta.textContent = dict.status.state === 'ready' ? 'Searching…' : 'Waiting for the dictionary to finish loading…';
    else if (dict.status.state === 'failed') meta.textContent = '';
    else if (total === 0) meta.textContent = `No matches for “${query}”.`;
    else if (total > results.length) meta.textContent = `Top ${results.length} of ${total.toLocaleString()} matches`;
    else meta.textContent = `${total} ${total === 1 ? 'match' : 'matches'}`;
  }

  function kanjiPanel(entry) {
    const chars = [...(entry.kanji[0] || '')].filter(isKanji).join('');
    if (!chars) return null;
    const panel = h('div', { class: 'kanji-grid' }, h('span', { class: 'muted' }, 'Loading kanji…'));
    dict.kanjiInfo(chars).then((items) => {
      panel.replaceChildren(...items.map((k) => h('div', { class: 'kanji-card' },
        ja(k.char, 'kanji-char'),
        h('div', { class: 'kanji-body' },
          h('div', { class: 'kanji-meaning' }, k.meanings.slice(0, 4).join(', ') || '—'),
          k.on.length > 0 && h('div', null, h('span', { class: 'label' }, 'On'), ja(k.on.join('、'))),
          k.kun.length > 0 && h('div', null, h('span', { class: 'label' }, 'Kun'), ja(k.kun.slice(0, 6).join('、'))),
          h('div', { class: 'muted small' }, [
            k.strokes && `${k.strokes} strokes`,
            k.grade > 0 && (GRADES[k.grade] || `Grade ${k.grade}`),
            k.freq > 0 && `#${k.freq} most used`,
          ].filter(Boolean).join(' · ')),
        ),
      )));
    }, () => panel.replaceChildren(h('span', { class: 'error' }, 'Kanji details could not be loaded.')));
    return h('div', { class: 'detail-block' }, h('h4', null, 'Kanji'), panel);
  }

  function details(entry) {
    const saved = store.getState().words[entry.id];
    const otherForms = [...entry.kanji, ...entry.kana].filter((form) => form !== headword(entry) && form !== reading(entry));
    return h('div', { class: 'entry-details' },
      otherForms.length > 0 && h('div', { class: 'detail-block' },
        h('h4', null, 'Other forms'),
        ja(otherForms.join('、')),
      ),
      formsPanel(entry),
      kanjiPanel(entry),
      saved && h('div', { class: 'detail-block' }, h('h4', null, 'In My Words'), wordEditor(saved)),
    );
  }

  function entryCard(entry) {
    const saved = store.hasWord(entry.id);
    const open = expanded.has(entry.id);
    const more = entry.senses.length - PREVIEW_SENSES;
    return h('article', { class: 'entry' },
      h('div', { class: 'entry-head' },
        h('div', { class: 'entry-word' }, wordTitle(entry)),
        h('div', { class: 'entry-actions' },
          speakButton(entry),
          h('button', {
            type: 'button',
            class: `btn ${saved ? 'btn-saved' : 'btn-primary'}`,
            'aria-pressed': String(saved),
            onclick: () => {
              if (saved) { store.removeWord(entry.id); toast('Removed from My Words'); }
              else { store.addWord(entry); toast('Saved to My Words'); }
            },
          }, icon(saved ? 'check' : 'plus'), saved ? 'Saved' : 'Save'),
        ),
      ),
      h('div', { class: 'badge-row' }, badges(entry)),
      entry.inflection && h('p', { class: 'inflection' },
        ja(entry.inflection.from), ' is a form of ', ja(headword(entry)),
        entry.inflection.steps.length > 0 && `: ${entry.inflection.steps.join(' → ')}`),
      sensesList(entry, open ? Infinity : PREVIEW_SENSES),
      h('button', {
        type: 'button',
        class: `btn btn-quiet toggle ${open ? 'open' : ''}`,
        'aria-expanded': String(open),
        onclick: () => {
          if (open) expanded.delete(entry.id);
          else expanded.add(entry.id);
          render();
        },
      }, icon('chevron'), open ? 'Less' : more > 0 ? `Details and ${more} more ${more === 1 ? 'meaning' : 'meanings'}` : 'Details'),
      open && details(entry),
    );
  }

  function welcome() {
    return h('div', { class: 'welcome' },
      ja('言葉', 'welcome-mark'),
      h('h1', null, 'Look up a Japanese word'),
      h('p', { class: 'muted' }, 'Type English, romaji, kana or kanji. Save the words you want to remember, then quiz yourself on them.'),
      h('div', { class: 'chips center' }, EXAMPLES.map((example) => h('button', {
        type: 'button',
        class: 'chip',
        lang: /[a-z]/i.test(example) ? null : 'ja',
        onclick: () => { input.value = example; runSearch(example); input.focus(); },
      }, example))),
    );
  }

  function render() {
    renderMeta();
    if (!query) {
      list.replaceChildren(welcome());
      return;
    }
    const kana = toHiragana(query);
    const hint = !searching && total === 0 && dict.status.state === 'ready'
      && h('p', { class: 'muted' }, kana !== query ? `Tried it as English and as “${kana}”. Check the spelling or try a shorter word.` : 'Check the spelling or try a shorter word.');
    list.replaceChildren(...results.map(entryCard), ...(hint ? [hint] : []));
  }

  dict.onStatus(() => { renderLoader(); renderMeta(); });
  render();

  return {
    el,
    onShow: () => input.focus({ preventScroll: true }),
    onStore: render,
  };
}
