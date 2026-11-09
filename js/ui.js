// Small DOM helpers and the pieces every view shares.
import * as dict from './dict.js';
import * as store from './store.js';
import { conjugations } from './conjugate.js';
import { kataToHira } from './kana.js';

export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value == null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
    else if (key in el) el[key] = value;
    else el.setAttribute(key, value === true ? '' : value);
  }
  el.append(...children.flat(Infinity).filter((c) => c != null && c !== false));
  return el;
}

// replaceChildren that, like h(), skips the null/false left behind by `condition && element`.
export function setChildren(el, ...children) {
  el.replaceChildren(...children.flat(Infinity).filter((c) => c != null && c !== false));
}

const ICONS = {
  speaker: '<path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
};

export function icon(name) {
  const span = h('span', { class: 'icon', 'aria-hidden': 'true' });
  span.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;
  return span;
}

export const ja = (text, cls) => h('span', { lang: 'ja', class: cls }, text);

let toastTimer;
export function toast(message) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

export function speak(text) {
  if (!('speechSynthesis' in window)) {
    toast('This browser cannot play audio');
    return;
  }
  const voices = speechSynthesis.getVoices();
  const voice = voices.find((v) => v.lang.replace('_', '-').toLowerCase().startsWith('ja'));
  if (voices.length && !voice) {
    toast('No Japanese voice is installed on this device');
    return;
  }
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'ja-JP';
  utterance.rate = 0.9;
  if (voice) utterance.voice = voice;
  speechSynthesis.cancel();
  speechSynthesis.speak(utterance);
}

export function speakButton(word) {
  return h('button', {
    type: 'button',
    class: 'icon-btn',
    title: 'Play pronunciation',
    'aria-label': `Play pronunciation of ${word.kana[0]}`,
    onclick: (event) => { event.stopPropagation(); speak(word.kana[0]); },
  }, icon('speaker'));
}

// A button that needs a second click before it does something destructive.
export function confirmButton(label, onConfirm, cls = 'btn btn-quiet danger') {
  let armed = false;
  let timer;
  const button = h('button', {
    type: 'button',
    class: cls,
    onclick: () => {
      if (armed) { clearTimeout(timer); onConfirm(); return; }
      armed = true;
      button.textContent = 'Click again to confirm';
      timer = setTimeout(() => { armed = false; button.textContent = label; }, 3000);
    },
  }, label);
  return button;
}

// ---- word helpers ----

// Words marked "usually kana" (コーヒー, ありがとう) are shown in kana, not their rare kanji.
const usuallyKana = (word) => word.senses[0].tags.includes('uk');
export const headword = (word) => (word.kanji.length && !usuallyKana(word) ? word.kanji[0] : word.kana[0]);
export const reading = (word) => (headword(word) === word.kana[0] ? '' : word.kana[0]);
export const meaningText = (word, max = 3) => word.senses[0].gloss.slice(0, max).join('; ');

const KANA = /[぀-ヿ]/;

// Lines the reading up against the written word so it sits over the kanji only:
// 乗る + のる → [乗/の][る]. Returns [{ text, rt }], rt empty for kana.
function alignReading(written, wordReading) {
  if (!wordReading || written === wordReading) return [{ text: written, rt: '' }];
  // Split 食べ物 into [食][べ][物]: kana runs are fixed text, the rest take whatever reading fits.
  const parts = written.match(/[぀-ヿ]+|[^぀-ヿ]+/g);
  const pattern = parts.map((part) => (KANA.test(part) ? kataToHira(part) : '(.+?)')).join('');
  const match = new RegExp(`^${pattern}$`).exec(kataToHira(wordReading));
  if (!match) return [{ text: written, rt: wordReading }];
  let at = 0;
  let group = 1;
  return parts.map((part) => {
    const length = KANA.test(part) ? part.length : match[group++].length;
    const rt = KANA.test(part) ? '' : wordReading.slice(at, at + length);
    at += length;
    return { text: part, rt };
  });
}

// The same word in 漢字{かんじ} notation, for storing text that rubyMarkup can show later.
export const toMarkup = (written, wordReading) =>
  alignReading(written, wordReading).map(({ text, rt }) => (rt ? `${text}{${rt}}` : text)).join('');

// Writes the reading above the kanji only: 乗る gets の over 乗, and る is left alone.
export function furigana(written, wordReading, cls) {
  const el = h('span', { lang: 'ja', class: cls });
  for (const { text, rt } of alignReading(written, wordReading)) {
    el.append(rt ? h('ruby', null, text, h('rt', null, rt)) : text);
  }
  return el;
}

// Text written with readings inline, 勉強{べんきょう}します, rendered with each reading
// above its kanji.
const MARKED = /([㐀-鿿々〆ヶ]+)\{([^}]+)\}/g;

export function rubyMarkup(text, cls) {
  const el = h('span', { lang: 'ja', class: cls });
  let at = 0;
  for (const match of text.matchAll(MARKED)) {
    el.append(text.slice(at, match.index), h('ruby', null, match[1], h('rt', null, match[2])));
    at = match.index + match[0].length;
  }
  el.append(text.slice(at));
  return el;
}

// The same text as kana only, for reading aloud: 勉強{べんきょう} → べんきょう.
export const markupReading = (text) => text.replace(MARKED, '$2');

// A word's headline: the headword with furigana.
export const wordTitle = (word) => furigana(headword(word), reading(word), 'entry-headword');

const POS = {
  n: 'noun', pn: 'pronoun', v1: 'ichidan verb', vs: 'suru verb', 'vs-i': 'suru verb', 'vs-s': 'suru verb',
  vk: 'kuru verb', vt: 'transitive', vi: 'intransitive', 'adj-i': 'i-adjective', 'adj-ix': 'i-adjective',
  'adj-na': 'na-adjective', 'adj-no': 'no-adjective', 'adj-pn': 'pre-noun adjectival', 'adj-t': 'taru adjective',
  adv: 'adverb', 'adv-to': 'to-adverb', exp: 'expression', prt: 'particle', int: 'interjection',
  conj: 'conjunction', ctr: 'counter', suf: 'suffix', pref: 'prefix', 'n-suf': 'noun suffix',
  'n-pref': 'noun prefix', 'aux-v': 'auxiliary verb', aux: 'auxiliary', cop: 'copula', num: 'numeric',
  uk: 'usually kana', abbr: 'abbreviation', col: 'colloquial', sl: 'slang', hon: 'honorific',
  hum: 'humble', pol: 'polite', arch: 'archaic', obs: 'obsolete', fam: 'familiar', derog: 'derogatory',
  'on-mim': 'onomatopoeia', id: 'idiom', vulg: 'vulgar', fem: 'feminine', male: 'masculine',
};

export function tagLabel(tag) {
  if (POS[tag]) return POS[tag];
  if (/^v5/.test(tag)) return 'godan verb';
  const full = dict.status.tags[tag];
  return full ? full.replace(/\s*\([^)]*\)/g, '') : tag;
}

export const posText = (sense) => [...new Set(sense.pos.map(tagLabel))].join(', ');

export function badges(word) {
  return [
    word.common && h('span', { class: 'badge badge-common' }, 'common'),
    word.jlpt > 0 && h('span', { class: `badge badge-jlpt n${word.jlpt}` }, `JLPT N${word.jlpt}`),
  ];
}

const STATUS_LABEL = { new: 'New', due: 'Due', learning: 'Learning', mature: 'Mastered' };

export function statusBadge(word) {
  const status = store.wordStatus(word);
  return h('span', { class: `badge status-${status}` }, STATUS_LABEL[status]);
}

export function sensesList(word, limit = Infinity) {
  let previous = '';
  return h('ol', { class: 'senses' }, word.senses.slice(0, limit).map((sense) => {
    const pos = posText(sense);
    const showPos = pos && pos !== previous;
    previous = pos;
    return h('li', null,
      showPos && h('span', { class: 'pos' }, pos),
      h('span', { class: 'gloss' }, sense.gloss.join('; ')),
      sense.tags.length > 0 && h('span', { class: 'sense-tags' }, sense.tags.map(tagLabel).join(' · ')),
    );
  }));
}

// Conjugation table for a verb or adjective; null for words that don't conjugate.
export function formsPanel(word) {
  const table = conjugations(word, headword(word), reading(word));
  if (!table) return null;
  return h('div', { class: 'detail-block' },
    h('h4', null, `Forms · ${table.title}`),
    h('dl', { class: 'forms-grid' }, table.rows.map((row) => h('div', { class: 'form-row' },
      h('dt', null, row.label),
      h('dd', null,
        furigana(row.written, row.reading, 'form-written'),
        h('button', {
          type: 'button', class: 'icon-btn icon-btn-small', title: 'Play pronunciation', 'aria-label': `Play ${row.reading || row.written}`,
          onclick: () => speak(row.reading || row.written),
        }, icon('speaker')),
      ),
    ))),
  );
}

export function formatDue(word, now = Date.now()) {
  if (store.isDue(word, now)) return 'now';
  const days = Math.round((store.startOfDay(word.srs.due) - store.startOfDay(now)) / store.DAY);
  if (days <= 0) return 'later today';
  if (days === 1) return 'tomorrow';
  if (days < 30) return `in ${days} days`;
  return new Date(word.srs.due).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// Lists, note and progress controls for a saved word.
export function wordEditor(word) {
  const { lists } = store.getState();
  const { correct, wrong } = word.stats;
  let noteTimer;

  return h('div', { class: 'editor' },
    h('div', { class: 'editor-row' },
      h('span', { class: 'label' }, 'Lists'),
      lists.length === 0
        ? h('span', { class: 'muted' }, 'No lists yet. Create one in My Words.')
        : h('div', { class: 'chips' }, lists.map((list) => {
          const on = word.listIds.includes(list.id);
          return h('button', {
            type: 'button',
            class: `chip ${on ? 'on' : ''}`,
            'aria-pressed': String(on),
            onclick: () => store.toggleWordList(word.id, list.id),
          }, on && icon('check'), list.name);
        })),
    ),
    h('label', { class: 'editor-row' },
      h('span', { class: 'label' }, 'Note'),
      h('textarea', {
        rows: 2,
        placeholder: 'Mnemonic, example sentence, where you saw it…',
        value: word.note || '',
        // Saved quietly while typing so the view doesn't re-render under the cursor.
        oninput: (event) => {
          const note = event.target.value;
          clearTimeout(noteTimer);
          noteTimer = setTimeout(() => store.updateWord(word.id, { note }, { silent: true }), 300);
        },
        onblur: (event) => {
          clearTimeout(noteTimer);
          store.updateWord(word.id, { note: event.target.value }, { silent: true });
        },
      }),
    ),
    h('div', { class: 'editor-row' },
      h('span', { class: 'label' }, 'Progress'),
      h('span', { class: 'muted' },
        correct + wrong === 0
          ? 'Not quizzed yet'
          : `${correct} right, ${wrong} wrong · next review ${formatDue(word)}`),
    ),
    h('div', { class: 'editor-actions' },
      correct + wrong > 0 && confirmButton('Reset progress', () => store.resetProgress(word.id), 'btn btn-quiet'),
      confirmButton('Remove word', () => { store.removeWord(word.id); toast('Removed from My Words'); }),
    ),
  );
}

export function segmented(name, options, value, onChange) {
  return h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': name }, options.map(([key, label]) => h('button', {
    type: 'button',
    role: 'radio',
    class: key === value ? 'on' : '',
    'aria-checked': String(key === value),
    onclick: () => onChange(key),
  }, label)));
}

// Switches the Quiz tab between the saved-words quiz, the kana test and the verb form quiz.
export function quizSwitch(active) {
  return h('nav', { class: 'segmented', 'aria-label': 'Quiz type' },
    [['quiz', 'My words'], ['kana', 'Hiragana & katakana'], ['verbs', 'Verb forms'], ['grammar', 'Grammar'], ['mistakes', 'Mistakes']].map(([route, label]) => {
      const count = route === 'mistakes' ? store.openMistakes().length : 0;
      return h('a', {
        href: `#/${route}`,
        class: route === active ? 'on' : '',
        'aria-current': route === active ? 'page' : null,
      }, label, count > 0 && h('span', { class: 'count' }, ` ${count}`));
    }));
}

export function shuffle(items) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
