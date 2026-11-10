import * as store from '../store.js';
import * as sync from '../sync.js';
import { kataToHira, toHiragana } from '../kana.js';
import {
  h, ja, icon, toast, speakButton, badges, statusBadge, sensesList, headword, reading, meaningText,
  wordEditor, confirmButton, formsPanel, wordTitle, setChildren
} from '../ui.js';

const SORTS = {
  recent: ['Recently added', (a, b) => b.addedAt - a.addedAt],
  due: ['Next review', (a, b) => a.srs.due - b.srs.due],
  kana: ['Reading (あ→ん)', (a, b) => a.kana[0].localeCompare(b.kana[0], 'ja')],
  hardest: ['Most missed', (a, b) => b.stats.wrong - a.stats.wrong || a.stats.correct - b.stats.correct],
};

export function createVocabView() {
  let listId = 'all';
  let filter = '';
  let sort = 'recent';
  let naming = null; // 'new' | 'rename' while the list-name field is open
  const expanded = new Set();

  const el = h('section', { class: 'view' });

  function matches(word, needle) {
    if (!needle) return true;
    const kana = kataToHira(toHiragana(needle));
    return word.kanji.some((k) => k.includes(needle))
      || word.kana.some((k) => kataToHira(k).includes(kana))
      || word.senses.some((s) => s.gloss.some((g) => g.toLowerCase().includes(needle)))
      || (word.note || '').toLowerCase().includes(needle);
  }

  function nameField(initial, onSubmit) {
    const field = h('input', { type: 'text', class: 'chip-input', value: initial, maxLength: 40, placeholder: 'List name', 'aria-label': 'List name' });
    const form = h('form', {
      class: 'chip-form',
      onsubmit: (event) => {
        event.preventDefault();
        const name = field.value.trim();
        naming = null;
        if (name) onSubmit(name);
        render();
      },
    },
      field,
      h('button', { type: 'submit', class: 'btn btn-primary btn-small' }, 'Save'),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Cancel', onclick: () => { naming = null; render(); } }, icon('close')),
    );
    queueMicrotask(() => { field.focus(); field.select(); });
    return form;
  }

  function listBar(state) {
    const tab = (id, name, count) => h('button', {
      type: 'button',
      class: `chip ${listId === id ? 'on' : ''}`,
      'aria-pressed': String(listId === id),
      onclick: () => { listId = id; naming = null; render(); },
    }, name, h('span', { class: 'count' }, count));

    return h('div', { class: 'chips' },
      tab('all', 'All words', store.allWords().length),
      state.lists.map((list) => tab(list.id, list.name, store.wordsInList(list.id).length)),
      naming === 'new'
        ? nameField('', (name) => { listId = store.createList(name).id; })
        : h('button', { type: 'button', class: 'chip chip-add', onclick: () => { naming = 'new'; render(); } }, icon('plus'), 'New list'),
    );
  }

  function listTools(list) {
    if (naming === 'rename') return h('div', { class: 'list-tools' }, nameField(list.name, (name) => store.renameList(list.id, name)));
    return h('div', { class: 'list-tools' },
      h('button', { type: 'button', class: 'btn btn-quiet', onclick: () => { naming = 'rename'; render(); } }, 'Rename list'),
      confirmButton('Delete list', () => {
        store.deleteList(list.id);
        listId = 'all';
        toast(`Deleted “${list.name}”. Its words are still in All words.`);
        render();
      }),
    );
  }

  function wordRow(word) {
    const open = expanded.has(word.id);
    return h('article', { class: `entry word-row ${open ? 'open' : ''}` },
      h('div', { class: 'entry-head' },
        h('button', {
          type: 'button',
          class: 'word-main',
          'aria-expanded': String(open),
          onclick: () => {
            if (open) expanded.delete(word.id);
            else expanded.add(word.id);
            render();
          },
        },
          h('span', { class: 'entry-word' }, wordTitle(word)),
          h('span', { class: 'word-meaning' }, meaningText(word)),
        ),
        h('div', { class: 'entry-actions' }, statusBadge(word), speakButton(word)),
      ),
      word.note && !open && h('p', { class: 'note-preview' }, word.note),
      open && h('div', { class: 'entry-details' },
        h('div', { class: 'badge-row' }, badges(word)),
        sensesList(word),
        formsPanel(word),
        wordEditor(word),
      ),
    );
  }

  function backup() {
    const file = h('input', {
      type: 'file',
      accept: 'application/json,.json',
      hidden: true,
      onchange: async () => {
        if (!file.files[0]) return;
        try {
          const added = store.importData(await file.files[0].text());
          toast(added ? `Imported ${added} new ${added === 1 ? 'word' : 'words'}` : 'Nothing new in that backup');
        } catch (err) {
          toast(err instanceof SyntaxError ? 'That file is not a Kotoba backup' : err.message);
        }
        file.value = '';
      },
    });
    return h('div', { class: 'backup' },
      h('span', { class: 'muted' }, sync.status.email
        ? `Your words sync to ${sync.status.email}.`
        : sync.status.state === 'signed-out'
          ? h('span', null, 'Your words are stored in this browser only. ', h('a', { href: '#/stats' }, 'Sign in on Stats'), ' to sync them between devices.')
          : 'Your words are stored in this browser only.'),
      h('button', {
        type: 'button',
        class: 'btn btn-quiet',
        onclick: () => {
          const url = URL.createObjectURL(new Blob([store.exportData()], { type: 'application/json' }));
          h('a', { href: url, download: `kotoba-backup-${store.dayKey()}.json` }).click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        },
      }, 'Export backup'),
      h('button', { type: 'button', class: 'btn btn-quiet', onclick: () => file.click() }, 'Import backup'),
      file,
    );
  }

  function render() {
    const state = store.getState();
    const list = state.lists.find((l) => l.id === listId);
    if (!list) listId = 'all';
    const pool = list ? store.wordsInList(list.id) : store.allWords();
    const needle = filter.trim().toLowerCase();
    const words = pool.filter((w) => matches(w, needle)).sort(SORTS[sort][1]);
    // Point at today's challenge rather than at how many words are due in all.
    const challengeLeft = store.dailyChallenge().left.length;

    // Keep the filter field (and its focus) across re-renders.
    const filterInput = el.querySelector('.filter-input') || h('input', {
      type: 'search',
      class: 'filter-input',
      placeholder: 'Filter words',
      'aria-label': 'Filter words',
      oninput: (event) => { filter = event.target.value; render(); },
    });
    const filtering = document.activeElement === filterInput;

    let body;
    if (store.allWords().length === 0) {
      body = h('div', { class: 'empty' },
        h('h2', null, 'No words saved yet'),
        h('p', { class: 'muted' }, 'Search the dictionary and press Save on any word to start your collection.'),
        h('a', { class: 'btn btn-primary', href: '#/dictionary' }, 'Open the dictionary'),
      );
    } else if (words.length === 0) {
      body = h('p', { class: 'muted empty-line' }, needle ? `No saved words match “${filter.trim()}”.` : 'This list is empty. Open a word and tick this list to add it.');
    } else {
      body = h('div', { class: 'results' }, words.map(wordRow));
    }

    setChildren(el,
      h('div', { class: 'view-head' },
        h('h1', null, 'My Words'),
        challengeLeft > 0 && h('a', { class: 'btn btn-primary', href: '#/quiz' }, `Daily challenge · ${challengeLeft} left`),
      ),
      listBar(state),
      list && listTools(list),
      pool.length > 0 && h('div', { class: 'toolbar' },
        filterInput,
        h('select', {
          'aria-label': 'Sort words',
          onchange: (event) => { sort = event.target.value; render(); },
        }, Object.entries(SORTS).map(([key, [label]]) => h('option', { value: key, selected: key === sort }, label))),
      ),
      body,
      backup(),
    );
    if (filtering) filterInput.focus();
  }

  render();
  return { el, onShow: render, onStore: render };
}
