// Wrong answers from every quiz, kept until the same question is answered right or dismissed,
// with a practice round that asks them again.
import { current as dictFor, ifAvailable } from '../dicts.js';
import * as store from '../store.js';
import {
  h, icon, speak, shuffle, quizSwitch, setChildren, confirmButton, markupReading,
  headword, reading, meaningText, toMarkup, questionSpeaker, wordSaver,
} from '../ui.js';
import { QUESTIONS } from '../grammar-data.js';
import { sentence, solved, questionId } from './grammar.js';
import { kanaQuestion } from './kana.js';
import { toQuestion as verbQuestion, options as verbOptions, TARGET_NAMES } from './verbs.js';

const QUIZZES = { words: 'My words', kana: 'Hiragana & katakana', verbs: 'Verb forms', grammar: 'Grammar' };
const JAPANESE = /[぀-ヿ㐀-鿿]/;
const PRACTICE_MAX = 20;
const CHOICES = 4;

const formatWhen = (ts) => new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

// Kana for the voice: readings instead of kanji, without highlight marks or the “→ て-form” label.
const toSpeech = (text) => markupReading(text.replace(/\[\[|\]\]/g, '').replace(/ → .*$/, '')).replace(/\s+/g, '');
// A practice question read aloud with a pause for each gap (（　）, ★ ＿ ＿), so it doesn't
// say the answer.
const questionSpeech = (prompt) => toSpeech(prompt.replace(/（[\s　]*）|[★＿](?:\s*[★＿])*/g, '、'));
// Kana questions ask about the sound itself, and an English prompt is no use to a Japanese
// voice, so only Japanese prompts from the other quizzes get a speaker.
const canSpeak = (item) => item.mistake.quiz !== 'kana' && JAPANESE.test(item.prompt);
// Quizzes whose answers are made of dictionary words worth collecting.
const SAVES_WORDS = { grammar: 'Words in this sentence', verbs: 'Save this verb' };

// ---- turning a stored mistake back into a question ----
// Each returns { prompt, options: [{ text, correct }], answer, note, en } in 漢字{かんじ}
// notation, or null when the question can't be rebuilt (say, a word since deleted).

async function wordItem(mistake, id, direction) {
  const word = store.getState().words[id];
  if (!word) return null;
  const label = direction === 'ja-en' ? (w) => meaningText(w) : (w) => toMarkup(headword(w), reading(w));
  let others = shuffle(store.allWords().filter((w) => w.id !== word.id));
  if (others.length < CHOICES - 1) others = others.concat(await dictFor().random(6, [word.id]).catch(() => []));
  const seen = new Set([label(word)]);
  const options = [{ text: label(word), correct: true }];
  for (const other of others) {
    if (options.length >= CHOICES) break;
    if (seen.has(label(other))) continue;
    seen.add(label(other));
    options.push({ text: label(other), correct: false });
  }
  const written = toMarkup(headword(word), reading(word));
  return {
    prompt: direction === 'ja-en' ? written : meaningText(word),
    options: shuffle(options),
    answer: direction === 'ja-en' ? meaningText(word) : written,
    note: direction === 'ja-en' ? written : meaningText(word),
  };
}

function kanaItem(mistake, char, mode) {
  const question = kanaQuestion(char, mode);
  if (!question) return null;
  return { prompt: question.prompt, options: question.options, answer: mode === 'pick' ? question.item.kana : question.item.romaji, note: mistake.note };
}

async function verbItem(mistake, id, target) {
  const word = store.getState().words[id] || (await dictFor().get([id]).catch(() => []))[0];
  const question = word && verbQuestion(word, target);
  if (!question) return null;
  return {
    prompt: `${toMarkup(question.polite.written, question.polite.reading)} → ${TARGET_NAMES[target]}`,
    options: verbOptions(question, target).map((o) => ({ text: toMarkup(o.written, o.reading), correct: o.correct })),
    answer: toMarkup(question.answer.written, question.answer.reading),
    note: target === 'past' ? '' : question.rule,
    en: meaningText(word, 2),
  };
}

function grammarItem(mistake, id) {
  const question = QUESTIONS.find((q) => questionId(q) === id);
  if (!question) return null;
  const right = question.type === 'pick' ? question.options[0] : question.order[question.star];
  const choices = question.type === 'pick' ? question.options : question.order;
  return {
    prompt: mistake.prompt,
    options: shuffle(choices).map((text) => ({ text, correct: text === right })),
    answer: solved(question),
    note: question.why,
    en: question.en,
  };
}

async function practiceItem(mistake) {
  const [quiz, ...rest] = mistake.key.split(':');
  let item = null;
  if (quiz === 'word') item = await wordItem(mistake, rest[0], rest[1]);
  else if (quiz === 'kana') item = kanaItem(mistake, rest[0], rest[1]);
  else if (quiz === 'verb') item = await verbItem(mistake, Number(rest[0]), rest[1]);
  else if (quiz === 'grammar') item = grammarItem(mistake, rest[0]);
  return item && { ...item, mistake };
}

export function createMistakesView() {
  const el = h('section', { class: 'view quiz' });
  let filter = 'all';
  let practice = null;   // { items, index, right, answered } during a practice round

  function playButton(text) {
    return text && h('button', {
      type: 'button', class: 'icon-btn icon-btn-small', title: 'Play pronunciation', 'aria-label': 'Play the answer',
      onclick: () => speak(toSpeech(text)),
    }, icon('speaker'));
  }

  function card(mistake) {
    return h('article', { class: 'entry mistake' },
      h('div', { class: 'mistake-head' },
        h('span', { class: 'badge' }, QUIZZES[mistake.quiz] || mistake.quiz),
        h('span', { class: 'muted small' }, formatWhen(mistake.at)),
      ),
      sentence(mistake.prompt, 'mistake-prompt'),
      h('div', { class: 'mistake-answers' },
        h('div', { class: 'mistake-line wrong' }, h('span', { class: 'label' }, 'You answered'),
          mistake.given ? sentence(mistake.given) : h('span', { class: 'muted' }, 'No answer')),
        h('div', { class: 'mistake-line right' }, h('span', { class: 'label' }, 'Correct'),
          sentence(mistake.answer),
          playButton([mistake.answer, mistake.prompt].find((text) => JAPANESE.test(text)))),
      ),
      mistake.en && h('p', null, mistake.en),
      mistake.note && h('p', { class: 'muted' }, sentence(mistake.note)),
      h('div', { class: 'editor-actions' },
        h('button', { type: 'button', class: 'btn btn-quiet', onclick: () => store.clearMistakes([mistake.key]) }, icon('check'), 'Got it, remove'),
      ),
    );
  }

  const shownMistakes = () => {
    const all = store.openMistakes();
    return filter === 'all' ? all : all.filter((m) => m.quiz === filter);
  };

  function render() {
    const all = store.openMistakes();
    const counts = {};
    for (const m of all) counts[m.quiz] = (counts[m.quiz] || 0) + 1;
    if (filter !== 'all' && !counts[filter]) filter = 'all';
    const shown = shownMistakes();
    const round = Math.min(shown.length, PRACTICE_MAX);

    const chip = (key, label, count) => h('button', {
      type: 'button',
      class: `chip ${filter === key ? 'on' : ''}`,
      'aria-pressed': String(filter === key),
      onclick: () => { filter = key; render(); },
    }, label, h('span', { class: 'count' }, count));

    setChildren(el,
      h('div', { class: 'view-head' }, h('h1', null, 'Quiz'), quizSwitch('mistakes')),
      all.length === 0
        ? h('div', { class: 'empty' },
          h('h2', null, 'No mistakes to review'),
          h('p', { class: 'muted' }, 'Wrong answers from every quiz collect here. Each one stays until you get that question right or remove it.'),
        )
        : [
          h('p', { class: 'muted' }, 'Wrong answers from every quiz. Each one clears itself when you get that question right.'),
          h('div', { class: 'chips' },
            chip('all', 'All', all.length),
            Object.entries(QUIZZES).filter(([key]) => counts[key]).map(([key, label]) => chip(key, label, counts[key]))),
          h('button', { type: 'button', class: 'btn btn-primary btn-large practise-btn', onclick: start },
            `Practise ${round === shown.length ? '' : `the latest ${round} of `}${shown.length === 1 ? 'this mistake' : `${shown.length} mistakes`}`),
          h('div', { class: 'results' }, shown.map(card)),
          h('div', { class: 'backup' },
            h('span', { class: 'muted' }, `${shown.length} ${shown.length === 1 ? 'mistake' : 'mistakes'} shown`),
            confirmButton(filter === 'all' ? 'Clear all' : 'Clear these', () => store.clearMistakes(shown.map((m) => m.key))),
          ),
        ],
    );
  }

  // ---- practice round ----

  async function start() {
    const chosen = shuffle(shownMistakes().slice(0, PRACTICE_MAX));
    setChildren(el, h('p', { class: 'muted empty-line' }, 'Preparing your practice…'));
    const items = (await Promise.all(chosen.map(practiceItem))).filter(Boolean);
    if (!items.length) {
      render();
      return;
    }
    practice = { items, index: 0, right: 0, answered: false };
    renderQuestion();
  }

  function finish(item, option, slot) {
    practice.answered = true;
    const { mistake } = item;
    store.recordDrill(option.correct);
    // The words in the question share the result: a saved word by its id, a sentence or verb
    // form by the words the dictionary finds in it. Kana questions have no vocabulary.
    const [quizKey, id] = mistake.key.split(':');
    if (quizKey === 'word' && store.getState().words[id]) store.recordContext([store.getState().words[id]], option.correct);
    else if (quizKey === 'grammar' || quizKey === 'verb') {
      Promise.resolve(ifAvailable('words', item.answer.replace(/\[\[|\]\]/g, '')) || []).then((entries) => store.recordContext(entries, option.correct), () => {});
    }
    if (option.correct) {
      practice.right += 1;
      store.clearMistakes([mistake.key]);
    } else {
      const { key, quiz, prompt, answer, note, en } = mistake;
      store.recordMistake({ key, quiz, prompt, answer, note, en, given: option.text });
    }

    const last = practice.index === practice.items.length - 1;
    const next = h('button', {
      type: 'button',
      class: 'btn btn-primary btn-large',
      onclick: () => {
        practice.index += 1;
        practice.answered = false;
        if (practice.index >= practice.items.length) renderSummary();
        else renderQuestion();
      },
    }, last ? 'See results' : 'Next');
    queueMicrotask(() => next.focus());
    setChildren(slot, h('div', { class: `feedback ${option.correct ? 'right' : 'wrong'}`, role: 'status' },
      h('div', { class: 'feedback-title' }, option.correct ? 'Correct, removed from your mistakes' : 'Not quite, it stays on your list'),
      h('div', { class: 'feedback-word' }, sentence(item.answer, 'grammar-sentence'),
        playButton([item.answer, item.prompt].find((text) => JAPANESE.test(text)))),
      item.en && h('p', null, item.en),
      item.note && h('p', { class: 'muted' }, sentence(item.note)),
      SAVES_WORDS[mistake.quiz] && wordSaver(item.answer.replace(/\[\[|\]\]/g, ''), SAVES_WORDS[mistake.quiz]),
      next,
    ));
  }

  function renderQuestion() {
    const item = practice.items[practice.index];
    const count = practice.items.length;
    const slot = h('div', { class: 'feedback-slot' });
    const buttons = item.options.map((option, i) => h('button', {
      type: 'button',
      class: 'choice choice-kana',
      onclick: () => {
        if (practice.answered) return;
        buttons.forEach((button, j) => {
          button.disabled = true;
          if (item.options[j].correct) button.classList.add('right');
        });
        if (!option.correct) buttons[i].classList.add('wrong');
        finish(item, option, slot);
      },
    }, h('kbd', null, String(i + 1)), sentence(option.text)));

    setChildren(el,
      h('div', { class: 'quiz-bar' },
        h('span', { class: 'muted' }, `${practice.index + 1} of ${count}`),
        h('div', { class: 'progress' }, h('div', { class: 'progress-fill', style: `width:${(practice.index / count) * 100}%` })),
        h('button', { type: 'button', class: 'btn btn-quiet btn-small', onclick: () => (practice.index > 0 || practice.answered ? renderSummary() : quit()) }, 'End practice'),
      ),
      h('div', { class: 'card question' },
        h('div', { class: 'prompt' },
          h('span', { class: 'label' }, `Mistake practice · ${QUIZZES[item.mistake.quiz] || ''}`),
          h('div', { class: 'prompt-line' },
            sentence(item.prompt, 'grammar-question'),
            canSpeak(item) && questionSpeaker(questionSpeech(item.prompt)),
          ),
        ),
        h('div', { class: 'choices' }, buttons),
        slot,
      ),
    );
  }

  function quit() {
    practice = null;
    render();
  }

  function renderSummary() {
    const done = practice.index + (practice.answered ? 1 : 0);
    const left = store.openMistakes().length;
    const back = h('button', { type: 'button', class: 'btn btn-primary btn-large', onclick: quit }, 'Back to my mistakes');
    queueMicrotask(() => back.focus());
    setChildren(el, h('div', { class: 'card summary' },
      h('div', { class: 'score' }, `${practice.right}/${Math.min(done, practice.items.length)}`),
      h('h2', null, practice.right === 1 ? '1 mistake fixed' : `${practice.right} mistakes fixed`),
      h('p', { class: 'muted' }, left === 0 ? 'Your mistakes list is empty. Nice work.' : `${left} still on your list.`),
      back,
    ));
  }

  // Number keys answer.
  document.addEventListener('keydown', (event) => {
    if (!practice || practice.answered || !el.isConnected || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.target instanceof HTMLInputElement) return;
    const button = el.querySelectorAll('.choice')[Number(event.key) - 1];
    if (button) button.click();
  });

  render();
  return {
    el,
    onShow: () => { if (!practice) render(); },
    onStore: () => { if (!practice) render(); },
  };
}
