// Study tools on note and reading pages:
// - tap a word in a Japanese sentence to hear just that word;
// - a play button beside each question, example and passage reads all of it (tap again to stop);
// - answers stay blurred until tapped, then offer a word lookup and the question's words to save.
import * as dict from '../dict.js';
import * as store from '../store.js';
import { kataToHira } from '../kana.js';
import { h, setChildren, speak, playButton, wordSaver, furigana, headword, reading, meaningText, icon, toast } from '../ui.js';

const KANJI_RUN = /^[㐀-鿿々〆ヶ]+$/;
const SKIPPED = 'details, button, .answer-tools, rt, rp, script, style';

// ---- a sentence as pieces ----
// One piece per character, and one per ruby (漢字 with its reading), in the order shown. Each
// keeps the DOM node it came from, so a tap can be traced back to a piece and the word around
// it highlighted. Answers (details), buttons and tools inside the element are left out.
function collectParts(root) {
  const parts = [];
  const walk = (node) => {
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        let offset = 0;
        for (const ch of child.nodeValue) {
          parts.push({ text: ch, reading: ch, annotated: false, node: child, offset, len: ch.length });
          offset += ch.length;
        }
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        // A typed answer is read aloud with the sentence, but never joins a word.
        if (child.matches('input')) { parts.push({ text: ' ', reading: ` ${child.value} `, annotated: false, node: child, input: true }); continue; }
        if (child.matches('br')) { parts.push({ text: ' ', reading: ' ', annotated: false, node: child }); continue; }
        if (child.matches(SKIPPED)) continue;
        if (child.matches('ruby')) {
          const rt = [...child.querySelectorAll('rt')].map((r) => r.textContent).join('');
          const base = [...child.childNodes].filter((n) => !(n.nodeType === Node.ELEMENT_NODE && n.matches('rt, rp'))).map((n) => n.textContent).join('');
          if (rt && KANJI_RUN.test(base)) parts.push({ text: base, reading: rt, annotated: true, node: child });
          else for (const ch of base) parts.push({ text: ch, reading: ch, annotated: false, node: child });
          continue;
        }
        walk(child);
      }
    }
  };
  walk(root);
  return parts;
}

const plain = (parts) => parts.map(({ text, reading: r, annotated }) => ({ text, reading: r, annotated }));

// How an element sounds: readings instead of kanji, typed answers in their blanks.
const spokenText = (el) => collectParts(el).map((p) => p.reading).join('').replace(/\s+/g, ' ').trim();

// ---- tap a word ----

const segmented = new WeakMap(); // element -> { parts, spans: Promise<[{ from, to, reading }]> }

function segmentsFor(el) {
  let entry = segmented.get(el);
  if (!entry) {
    const parts = collectParts(el);
    entry = { parts, spans: dict.segments([plain(parts)]).then((lists) => lists[0]) };
    segmented.set(el, entry);
  }
  return entry;
}

// Works out the words of every sentence on the page in the background, so a tap can speak
// at once (phones only allow audio straight after the tap).
function presegment(root) {
  const els = [...root.querySelectorAll('[lang="ja"]:not(input), td')].filter((el) => !segmented.has(el));
  for (let i = 0; i < els.length; i += 25) {
    const batch = els.slice(i, i + 25).map((el) => ({ el, parts: collectParts(el) }));
    const answer = dict.segments(batch.map((b) => plain(b.parts)));
    answer.catch(() => {});
    batch.forEach(({ el, parts }, j) => segmented.set(el, { parts, spans: answer.then((lists) => lists[j]) }));
  }
}

function caretAt(x, y) {
  if (document.caretPositionFromPoint) {
    const pos = document.caretPositionFromPoint(x, y);
    return pos && { node: pos.offsetNode, offset: pos.offset };
  }
  if (document.caretRangeFromPoint) {
    const range = document.caretRangeFromPoint(x, y);
    return range && { node: range.startContainer, offset: range.startOffset };
  }
  return null;
}

// The piece under the pointer, or -1.
function partAt(parts, event) {
  const ruby = event.target.closest('ruby');
  if (ruby) return parts.findIndex((p) => p.node === ruby);
  const pos = caretAt(event.clientX, event.clientY);
  if (!pos || pos.node.nodeType !== Node.TEXT_NODE) return -1;
  // The caret can land on either side of the character that was tapped: check both.
  for (const offset of [pos.offset, pos.offset - 1]) {
    if (offset < 0 || offset >= pos.node.length) continue;
    const range = document.createRange();
    range.setStart(pos.node, offset);
    range.setEnd(pos.node, offset + 1);
    const box = range.getBoundingClientRect();
    if (event.clientX < box.left - 1 || event.clientX > box.right + 1 || event.clientY < box.top - 2 || event.clientY > box.bottom + 2) continue;
    return parts.findIndex((p) => p.node === pos.node && p.offset <= offset && offset < p.offset + p.len);
  }
  return -1;
}

const canHighlight = () => typeof Highlight === 'function' && window.CSS && CSS.highlights;

function highlight(parts, span) {
  if (!canHighlight()) return;
  const first = parts[span.from];
  const last = parts[span.to - 1];
  const range = document.createRange();
  if (first.len) range.setStart(first.node, first.offset); else range.setStartBefore(first.node);
  if (last.len) range.setEnd(last.node, last.offset + last.len); else range.setEndAfter(last.node);
  CSS.highlights.set('spoken-word', new Highlight(range));
}

const clearHighlight = () => { if (canHighlight()) CSS.highlights.delete('spoken-word'); };

export async function onWordTap(event, root) {
  const { target } = event;
  if (target.closest('input, textarea, button, summary, a, .answer-tools, .answer-box.blurred')) return;
  const el = target.closest('[lang="ja"]:not(input), td');
  if (!el || !root.contains(el) || !/[぀-ヿ㐀-鿿]/.test(el.textContent)) return;
  const { parts, spans } = segmentsFor(el);
  const index = partAt(parts, event);
  if (index < 0) return;
  let list = null;
  try { list = await spans; } catch { /* dictionary unavailable */ }
  if (!list) { speak(spokenText(el)); return; }
  const span = list.find((s) => s.from <= index && index < s.to);
  if (!span) return;
  highlight(parts, span);
  if (!speak(span.reading, { onend: clearHighlight })) clearHighlight();
}

// ---- play buttons ----

function addPlayButtons(root) {
  for (const li of root.querySelectorAll('.questions > li')) {
    li.prepend(h('span', { class: 'qn-play' }, playButton(() => spokenText(li), 'Play this question')));
  }
  root.querySelectorAll('ol.questions').forEach((ol) => ol.classList.add('with-play'));

  for (const story of root.querySelectorAll('.story')) {
    const paras = story.querySelectorAll(':scope > .para');
    const blocks = paras.length ? [...paras] : [...story.querySelectorAll(':scope > p[lang="ja"]')];
    if (!blocks.length) continue;
    story.before(h('div', { class: 'passage-play' },
      playButton(() => blocks.map(spokenText).join(' '), 'Play the whole passage'),
      h('span', { class: 'muted' }, 'Play the whole passage'),
    ));
    for (const block of blocks) {
      block.classList.add('with-play');
      block.prepend(h('span', { class: 'line-play' }, playButton(() => spokenText(block), 'Play this paragraph')));
    }
  }

  for (const line of root.querySelectorAll('.example, .examples li')) {
    line.prepend(h('span', { class: 'line-play inline' }, playButton(() => spokenText(line), 'Play this sentence')));
  }
}

// ---- answers ----

const ANSWER = /^(answer|example)s?$/i;

function setupAnswers(root) {
  for (const details of root.querySelectorAll('details')) {
    const summary = details.querySelector(':scope > summary');
    if (!summary || !ANSWER.test(summary.textContent.trim())) continue;
    const content = h('div', { class: 'answer-content' });
    content.append(...[...details.childNodes].filter((n) => n !== summary));
    content.inert = true;
    const reveal = h('button', { type: 'button', class: 'answer-reveal' }, 'Tap to reveal');
    const box = h('div', { class: 'answer-box blurred' }, content, reveal);
    details.append(box);
    reveal.addEventListener('click', () => {
      box.classList.remove('blurred');
      content.inert = false;
      reveal.remove();
      details.append(answerTools(details, content));
    });
  }
}

// The lookup and the question's unsaved words, under a revealed answer.
function answerTools(details, content) {
  const context = details.closest('.questions > li') || details.parentElement;
  const parts = [...collectParts(context), { text: '。', reading: '。', annotated: false }, ...collectParts(content)];
  const found = dict.wordsInParts(plain(parts)).then(tidy);
  found.catch(() => {});
  return h('div', { class: 'answer-tools' },
    lookup(found),
    wordSaver(found, 'Add words from this question', { hideSaved: true }),
  );
}

const firstPos = (entry) => (entry.senses[0] && entry.senses[0].pos) || [];
const isVerb = (entry) => firstPos(entry).some((pos) => /^(v1|v5|vk|vs)/.test(pos));

// Words worth saving: no grammar endings (たい), and no ます stems read as nouns when the verb
// itself is there (読み "reading" next to 読む, from an answer like 読{よ}みたい).
function tidy(entries) {
  return entries.filter((entry) => {
    if (firstPos(entry).some((pos) => pos.startsWith('aux'))) return false;
    if (isVerb(entry) || !entry.kanji.length) return true;
    const kanji = entry.kanji[0][0];
    return !entries.some((other) => other !== entry && isVerb(other) && other.kanji.some((k) => k[0] === kanji));
  });
}

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Does a question word fit what was typed? Its kana or kanji, or a whole word of a meaning
// ("read" fits 読む "to read", not いい "ready").
function fits(entry, query) {
  const q = kataToHira(query.toLowerCase());
  if ([...entry.kanji, ...entry.kana].some((form) => kataToHira(form).includes(q))) return true;
  const word = new RegExp(`(^|[^a-z])${escapeRegex(q)}($|[^a-z])`);
  return entry.senses.some((sense) => sense.gloss.some((gloss) => word.test(gloss.toLowerCase())));
}

function saveToggle(entry) {
  let addedHere = false;
  const button = h('button', { type: 'button', class: 'btn btn-quiet btn-small lookup-save' });
  const draw = () => {
    const saved = store.hasWord(entry.id);
    button.replaceChildren(icon(saved ? 'check' : 'plus'), saved ? 'Saved' : 'Add');
    button.classList.toggle('on', saved);
    button.title = saved && !addedHere ? 'Already in My Words' : saved ? 'Saved. Tap again to undo.' : 'Save to My Words';
  };
  button.addEventListener('click', () => {
    const saved = store.hasWord(entry.id);
    if (saved && !addedHere) { toast('Already in My Words'); return; }
    if (saved) { store.removeWord(entry.id); addedHere = false; toast(`Removed ${headword(entry)} from My Words`); }
    else { store.addWord(entry); addedHere = true; toast(`Saved ${headword(entry)} to My Words`); }
    draw();
  });
  draw();
  return button;
}

function resultRow(entry, inQuestion) {
  return h('div', { class: `lookup-row ${inQuestion ? 'in-question' : ''}` },
    h('button', {
      type: 'button', class: 'lookup-word', title: 'Play pronunciation', 'aria-label': `Play ${entry.kana[0]}`,
      onclick: () => speak(entry.kana[0]),
    }, furigana(headword(entry), reading(entry))),
    h('div', { class: 'lookup-meaning' },
      inQuestion && h('span', { class: 'badge badge-question' }, 'in this question'),
      h('span', null, meaningText(entry, 3)),
    ),
    saveToggle(entry),
  );
}

// A dictionary search that puts the words used in this question first, so かえる finds the
// 帰る of the sentence rather than 変える or 返る.
function lookup(found) {
  const input = h('input', {
    type: 'search', class: 'lookup-input', placeholder: 'Look up a word: English, kana or kanji',
    'aria-label': 'Look up a word', autocomplete: 'off', autocapitalize: 'off', spellcheck: false,
  });
  const results = h('div', { class: 'lookup-results', 'aria-live': 'polite' });
  let timer;
  let latest = 0;

  async function run() {
    const query = input.value.trim();
    const ticket = ++latest;
    if (!query) { setChildren(results); return; }
    let hits;
    let inQuestion;
    try {
      [hits, inQuestion] = await Promise.all([dict.search(query), found.catch(() => [])]);
    } catch {
      if (ticket === latest) setChildren(results, h('p', { class: 'muted' }, 'The dictionary is still loading. Try again in a moment.'));
      return;
    }
    if (ticket !== latest) return;
    // A question word goes first when it fits what was typed, or when the dictionary itself
    // ranks it near the top (a conjugated search such as すてて finds 捨てる).
    const matching = new Set(inQuestion
      .filter((entry) => fits(entry, query) || hits.results.slice(0, 10).some((hit) => hit.id === entry.id))
      .map((entry) => entry.id));
    const fromQuestion = inQuestion.filter((entry) => matching.has(entry.id) && !hits.results.some((hit) => hit.id === entry.id));
    const ranked = [...fromQuestion, ...hits.results]
      .sort((a, b) => Number(matching.has(b.id)) - Number(matching.has(a.id)))
      .slice(0, 5);
    setChildren(results, ranked.length
      ? ranked.map((entry) => resultRow(entry, matching.has(entry.id)))
      : h('p', { class: 'muted' }, `No words match “${query}”.`));
  }

  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 250); });
  input.addEventListener('keydown', (event) => { if (event.key === 'Enter') { clearTimeout(timer); run(); } });
  return h('div', { class: 'lookup' },
    h('label', { class: 'lookup-field' }, icon('search'), input),
    results,
  );
}

// ---- all together ----

export function enhanceNote(body) {
  setupAnswers(body);
  addPlayButtons(body);
  presegment(body);
}
