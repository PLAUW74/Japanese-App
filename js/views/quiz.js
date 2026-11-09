import * as dict from '../dict.js';
import * as store from '../store.js';
import { toHiragana, kataToHira } from '../kana.js';
import { h, ja, speakButton, headword, reading, meaningText, posText, sensesList, shuffle, segmented, quizSwitch, wordTitle, toMarkup } from '../ui.js';

const MODES = [['mixed', 'Mixed'], ['choice', 'Multiple choice'], ['typing', 'Typing']];
const DIRECTIONS = [['mixed', 'Mixed'], ['ja-en', 'Japanese → English'], ['en-ja', 'English → Japanese']];
const COUNTS = [[1, '1'], [5, '5'], [10, '10'], [20, '20'], [50, '50'], [0, 'All']];
const CHOICES = 4;

const pick = (items) => items[Math.floor(Math.random() * items.length)];
const wordLabel = (word) => headword(word) + (reading(word) ? `（${reading(word)}）` : '');

// "to eat (a meal)" and "Eat" should count as the same answer.
function normalizeEnglish(text) {
  return text.toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/^\s*(to|a|an|the)\s+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function editDistance(a, b) {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(previous[j] + 1, row[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = row;
  }
  return previous[b.length];
}

function isRightMeaning(word, answer) {
  const given = normalizeEnglish(answer);
  if (!given) return false;
  // Forgive a typo or two in longer answers; short words must be exact ("house" isn't "mouse").
  const slack = given.length >= 10 ? 2 : given.length >= 6 ? 1 : 0;
  return word.senses.some((sense) => sense.gloss.some((gloss) => {
    const target = normalizeEnglish(gloss);
    return target === given || (slack > 0 && Math.abs(target.length - given.length) <= slack && editDistance(target, given) <= slack);
  }));
}

function isRightWord(word, answer) {
  const given = answer.trim();
  if (!given) return false;
  const kana = kataToHira(toHiragana(given));
  return word.kanji.includes(given) || word.kana.some((k) => kataToHira(k) === kana);
}

function sourceWords(source) {
  if (source === 'due') return store.dueWords().sort((a, b) => a.srs.due - b.srs.due);
  if (source === 'all') return shuffle(store.allWords());
  return shuffle(store.wordsInList(source));
}

export function createQuizView() {
  let session = null;
  const el = h('section', { class: 'view quiz' });

  // ---- setup ----

  function renderSetup() {
    const state = store.getState();
    const { settings } = state;
    const total = store.allWords().length;

    const head = h('div', { class: 'view-head' }, h('h1', null, 'Quiz'), quizSwitch('quiz'));

    if (total === 0) {
      el.replaceChildren(head, h('div', { class: 'empty' },
        h('h2', null, 'Nothing to quiz yet'),
        h('p', { class: 'muted' }, 'Save a few words from the dictionary and they will show up here for review. The hiragana and katakana test needs no saved words.'),
        h('a', { class: 'btn btn-primary', href: '#/dictionary' }, 'Open the dictionary'),
      ));
      return;
    }

    const sources = [
      ['due', 'Due for review', store.dueWords().length],
      ['all', 'All words', total],
      ...state.lists.map((list) => [list.id, list.name, store.wordsInList(list.id).length]),
    ];
    if (!sources.some(([key]) => key === settings.source)) settings.source = 'due';
    const set = (patch) => { store.saveSettings(patch); renderSetup(); };
    const available = sources.find(([key]) => key === settings.source)[2];
    const size = settings.count ? Math.min(settings.count, available) : available;

    el.replaceChildren(
      head,
      h('div', { class: 'card setup' },
        h('div', { class: 'field' },
          h('span', { class: 'label' }, 'Words'),
          h('div', { class: 'source-list' }, sources.map(([key, label, count]) => h('button', {
            type: 'button',
            class: `source ${key === settings.source ? 'on' : ''}`,
            'aria-pressed': String(key === settings.source),
            onclick: () => set({ source: key }),
          }, h('span', null, label), h('span', { class: 'count' }, count)))),
        ),
        h('div', { class: 'field' }, h('span', { class: 'label' }, 'Question type'), segmented('Question type', MODES, settings.mode, (mode) => set({ mode }))),
        h('div', { class: 'field' }, h('span', { class: 'label' }, 'Direction'), segmented('Direction', DIRECTIONS, settings.direction, (direction) => set({ direction }))),
        h('div', { class: 'field' }, h('span', { class: 'label' }, 'Questions'), segmented('Questions', COUNTS, settings.count, (count) => set({ count }))),
        available === 0
          ? h('p', { class: 'muted' }, settings.source === 'due'
            ? 'Nothing is due right now. Pick “All words” to practise anyway.'
            : 'This list has no words yet.')
          : h('p', { class: 'muted' }, settings.source === 'due'
            ? 'Right answers push a word’s next review further out; wrong answers bring it back sooner.'
            : 'Practice mode: wrong answers come back for review, right answers leave the schedule alone unless the word was due.'),
        h('button', { type: 'button', class: 'btn btn-primary btn-large', disabled: available === 0, onclick: start },
          available === 0 ? 'Start quiz' : `Start quiz · ${size} ${size === 1 ? 'question' : 'questions'}`),
      ),
    );
  }

  // ---- session ----

  async function start() {
    const { settings } = store.getState();
    let words = sourceWords(settings.source);
    if (settings.count) words = words.slice(0, settings.count);
    if (!words.length) return;

    session = { questions: [], index: 0, right: 0, missed: [], answered: false };
    el.replaceChildren(h('p', { class: 'muted empty-line' }, 'Preparing your quiz…'));

    // Distractors come from the learner's own words first, topped up from the dictionary.
    const own = store.allWords();
    let extra = [];
    if (settings.mode !== 'typing') {
      const lookup = dict.random(40, own.map((w) => w.id)).catch(() => []);
      extra = await Promise.race([lookup, new Promise((resolve) => setTimeout(() => resolve([]), 4000))]);
    }

    session.questions = words.map((word) => {
      const mode = settings.mode === 'mixed' ? pick(['choice', 'typing']) : settings.mode;
      const direction = settings.direction === 'mixed' ? pick(['ja-en', 'en-ja']) : settings.direction;
      const question = { word, mode, direction };
      if (mode === 'choice') {
        const label = direction === 'ja-en' ? meaningText : wordLabel;
        const samePos = (other) => (other.senses[0].pos[0] === word.senses[0].pos[0] ? 0 : 1);
        const candidates = [...shuffle(own), ...shuffle(extra)].sort((a, b) => samePos(a) - samePos(b));
        const seen = new Set([label(word)]);
        const options = [word];
        for (const candidate of candidates) {
          if (options.length >= CHOICES) break;
          if (candidate.id === word.id || seen.has(label(candidate))) continue;
          seen.add(label(candidate));
          options.push(candidate);
        }
        // Too few words to build choices from: ask for a typed answer instead.
        if (options.length < 2) question.mode = 'typing';
        else question.options = shuffle(options);
      }
      return question;
    });
    renderQuestion();
  }

  // `given` is what the learner chose or typed, in 漢字{かんじ} notation.
  function finish(correct, given) {
    const question = session.questions[session.index];
    const { word, direction } = question;
    session.answered = true;
    if (correct) session.right += 1;
    else session.missed.push(word);
    store.recordAnswer(word.id, correct);

    const key = `word:${word.id}:${direction}`;
    if (correct) {
      store.resolveMistake(key);
      return;
    }
    const written = toMarkup(headword(word), reading(word));
    store.recordMistake({
      key,
      quiz: 'words',
      prompt: direction === 'ja-en' ? written : meaningText(word),
      answer: direction === 'ja-en' ? meaningText(word) : written,
      given: given || '',
      note: direction === 'ja-en' ? '' : meaningText(word),
    });
  }

  function feedback(question, correct, note) {
    const { word } = question;
    const last = session.index === session.questions.length - 1;
    const next = h('button', {
      type: 'button',
      class: 'btn btn-primary btn-large',
      onclick: () => {
        session.index += 1;
        session.answered = false;
        if (session.index >= session.questions.length) renderSummary();
        else renderQuestion();
      },
    }, last ? 'See results' : 'Next');
    queueMicrotask(() => next.focus());

    return h('div', { class: `feedback ${correct ? 'right' : 'wrong'}`, role: 'status' },
      h('div', { class: 'feedback-title' }, correct ? 'Correct' : 'Not quite'),
      note && h('p', { class: 'feedback-note' }, note),
      h('div', { class: 'feedback-word' },
        h('div', { class: 'entry-word' }, wordTitle(word)),
        speakButton(word),
      ),
      sensesList(word, 3),
      word.note && h('p', { class: 'note-preview' }, word.note),
      next,
    );
  }

  function prompt(question) {
    const { word, direction } = question;
    if (direction === 'en-ja') {
      return h('div', { class: 'prompt' },
        h('span', { class: 'label' }, 'Which word means'),
        h('div', { class: 'prompt-meaning' }, meaningText(word)),
        posText(word.senses[0]) && h('span', { class: 'pos' }, posText(word.senses[0])),
      );
    }
    const hint = reading(word) && h('button', {
      type: 'button',
      class: 'btn btn-quiet btn-small',
      onclick: () => hint.replaceWith(ja(reading(word), 'entry-reading')),
    }, 'Show reading');
    return h('div', { class: 'prompt' },
      h('span', { class: 'label' }, 'What does this mean?'),
      ja(headword(word), 'prompt-word'),
      hint,
    );
  }

  function choiceBody(question, slot) {
    const { word, direction } = question;
    const buttons = question.options.map((option, i) => h('button', {
      type: 'button',
      class: 'choice',
      lang: direction === 'en-ja' ? 'ja' : null,
      onclick: () => {
        if (session.answered) return;
        const correct = option.id === word.id;
        finish(correct, direction === 'ja-en' ? meaningText(option) : toMarkup(headword(option), reading(option)));
        buttons.forEach((button, j) => {
          button.disabled = true;
          if (question.options[j].id === word.id) button.classList.add('right');
        });
        if (!correct) buttons[i].classList.add('wrong');
        slot.replaceChildren(feedback(question, correct));
      },
    },
      h('kbd', null, String(i + 1)),
      h('span', null, direction === 'ja-en' ? meaningText(option) : wordLabel(option)),
    ));
    return h('div', { class: 'choices' }, buttons);
  }

  function typingBody(question, slot) {
    const { word, direction } = question;
    const toJapanese = direction === 'en-ja';
    const field = h('input', {
      type: 'text',
      class: 'answer-input',
      lang: toJapanese ? 'ja' : null,
      placeholder: toJapanese ? 'Type the word (romaji turns into kana)' : 'Type a meaning in English',
      autocomplete: 'off',
      autocapitalize: 'off',
      spellcheck: false,
      'aria-label': 'Your answer',
      oninput: (event) => {
        // Leave text alone while a Japanese IME is composing.
        if (!toJapanese || event.isComposing) return;
        const converted = toHiragana(field.value, true);
        if (converted !== field.value) field.value = converted;
      },
    });
    const submit = (given) => {
      if (session.answered) return;
      const correct = toJapanese ? isRightWord(word, given) : isRightMeaning(word, given);
      finish(correct, given.trim());
      field.disabled = true;
      controls.hidden = true;
      field.classList.add(correct ? 'right' : 'wrong');
      slot.replaceChildren(feedback(question, correct, !correct && given.trim() ? `You answered “${given.trim()}”.` : null));
    };
    const controls = h('div', { class: 'answer-controls' },
      h('button', { type: 'submit', class: 'btn btn-primary' }, 'Check'),
      h('button', { type: 'button', class: 'btn btn-quiet', onclick: () => submit('') }, 'I don’t know'),
    );
    queueMicrotask(() => field.focus());
    return h('form', {
      class: 'answer-form',
      onsubmit: (event) => {
        event.preventDefault();
        if (field.value.trim()) submit(field.value);
      },
    }, field, controls);
  }

  function renderQuestion() {
    const question = session.questions[session.index];
    const count = session.questions.length;
    const slot = h('div', { class: 'feedback-slot' });
    el.replaceChildren(
      h('div', { class: 'quiz-bar' },
        h('span', { class: 'muted' }, `${session.index + 1} of ${count}`),
        h('div', { class: 'progress' }, h('div', { class: 'progress-fill', style: `width:${(session.index / count) * 100}%` })),
        h('button', { type: 'button', class: 'btn btn-quiet btn-small', onclick: () => (session.index > 0 || session.answered ? renderSummary() : quit()) }, 'End quiz'),
      ),
      h('div', { class: 'card question' },
        prompt(question),
        question.mode === 'choice' ? choiceBody(question, slot) : typingBody(question, slot),
        slot,
      ),
    );
  }

  function quit() {
    session = null;
    renderSetup();
  }

  function renderSummary() {
    const done = session.right + session.missed.length;
    const percent = done ? Math.round((session.right / done) * 100) : 0;
    const missed = [...new Map(session.missed.map((w) => [w.id, w])).values()];
    const again = h('button', { type: 'button', class: 'btn btn-primary btn-large', onclick: quit }, 'Back to quiz setup');
    queueMicrotask(() => again.focus());

    el.replaceChildren(
      h('div', { class: 'card summary' },
        h('div', { class: 'score' }, `${percent}%`),
        h('h2', null, `${session.right} of ${done} correct`),
        h('p', { class: 'muted' }, percent === 100 ? 'A perfect round.' : missed.length ? 'The words you missed are back in your review queue.' : ''),
        missed.length > 0 && h('div', { class: 'missed' },
          h('h4', null, 'Words to revisit'),
          missed.map((word) => h('div', { class: 'missed-row' },
            h('span', null, ja(headword(word), 'missed-word'), reading(word) && ja(reading(word), 'entry-reading')),
            h('span', { class: 'muted' }, meaningText(word, 2)),
            speakButton(word),
          )),
        ),
        again,
      ),
    );
  }

  // Number keys answer multiple-choice questions.
  document.addEventListener('keydown', (event) => {
    if (!session || session.answered || !el.isConnected || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.target instanceof HTMLInputElement) return;
    const button = el.querySelectorAll('.choice')[Number(event.key) - 1];
    if (button) button.click();
  });

  renderSetup();
  return {
    el,
    onShow: () => { if (!session) renderSetup(); },
    onStore: () => { if (!session) renderSetup(); },
  };
}
