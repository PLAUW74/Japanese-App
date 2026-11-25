// Grammar quiz: fill-the-gap and JLPT-style word order questions from js/grammar-data.js,
// and every answered question in the study notes (js/note-questions.js).
import * as dict from '../dict.js';
import * as store from '../store.js';
import { QUESTIONS, TOPICS } from '../grammar-data.js';
import { h, speak, icon, shuffle, segmented, quizSwitch, setChildren, rubyMarkup, markupReading, questionSpeaker, wordSaver, scriptTag } from '../ui.js';
import { dropdown } from '../dropdown.js';
import { wordOrder } from '../word-order.js';
import { noteQuestions } from '../note-questions.js';

const LEVELS = [['both', 'N5 + N4'], [5, 'N5'], [4, 'N4']];
const COUNTS = [[1, '1'], [5, '5'], [10, '10'], [20, '20'], [0, 'All']];
const GAP = '（　）';

// The written questions, joined by the notes' once they have been read. They are read when
// the grammar quiz is first opened, not when the app starts.
let pool = QUESTIONS;
let poolLoading = null;
export function grammarPool() {
  if (!poolLoading) {
    poolLoading = noteQuestions().then((fromNotes) => {
      pool = [...QUESTIONS, ...fromNotes];
      return pool;
    }, () => pool);
  }
  return poolLoading;
}

const matches = ({ grammarLevel, grammarTopic }) => pool.filter((q) =>
  (grammarLevel === 'both' || q.level === grammarLevel) && (grammarTopic === 'all' || q.topic === grammarTopic));

// When each question was last asked, on this device. A quiz takes the questions asked
// longest ago (or never) first, so it works through everything before it repeats any.
const lastAsked = () => store.getState().settings.grammarSeen || {};
const leastRecent = (questions) => {
  const seen = lastAsked();
  // Shuffled first, so questions asked equally long ago come in a random order.
  return shuffle(questions).sort((a, b) => (seen[questionId(a)] || 0) - (seen[questionId(b)] || 0));
};

// The finished sentence as marked-up text, with the answer wrapped in [[ ]] for highlighting.
export function solved(question) {
  if (question.type === 'pick') return question.q.replace(GAP, `[[${question.options[0]}]]`);
  const words = question.order.map((part, i) => (i === question.star ? `[[${part}]]` : part));
  return [question.before, words.join(' '), question.after].filter(Boolean).join(' ');
}

// Renders text that may contain a [[highlighted]] part and the （　） gap.
// It is shared with the mistakes list, which shows Chinese too, so it takes the language
// on show rather than assuming Japanese.
export function sentence(text, cls) {
  const el = h('span', { lang: scriptTag(), class: cls });
  for (const [i, part] of text.split(/\[\[|\]\]/).entries()) {
    const pieces = part.split(GAP);
    pieces.forEach((piece, j) => {
      if (j > 0) el.append(h('span', { class: 'gap', 'aria-label': 'blank' }, '　'));
      const node = rubyMarkup(piece);
      el.append(i % 2 ? h('b', null, node) : node);
    });
  }
  return el;
}

// A short stable id for a question, so a mistake can be matched when it comes up again.
export function questionId(question) {
  const text = question.type === 'pick' ? question.q : question.before + question.order.join('') + question.after;
  let hash = 5381;
  for (const ch of text) hash = ((hash * 33) ^ ch.codePointAt(0)) >>> 0;
  return hash.toString(36);
}

// The parts in a new order, never the right one, so a word order question isn't solved on sight.
function scrambled(parts) {
  let out = parts;
  for (let tries = 0; tries < 10 && out.join('|') === parts.join('|'); tries++) out = shuffle(parts);
  return out;
}

const spoken = (question) => markupReading(solved(question).replace(/\[\[|\]\]/g, '')).replace(/\s+/g, '');
// The question as asked, for reading aloud: a pause where the gap or the ★ blanks are, so
// hearing it doesn't give the answer away.
const spokenQuestion = (question) => {
  const text = question.type === 'pick' ? question.q : [question.before, GAP, question.after].filter(Boolean).join(' ');
  // The gap first: its full-width space would go with the other spaces.
  return markupReading(text.split(GAP).join('、')).replace(/\s+/g, '');
};

export function createGrammarView() {
  let session = null;
  const el = h('section', { class: 'view quiz' });

  // ---- setup ----

  function renderSetup() {
    const { settings } = store.getState();
    const set = (patch) => { store.saveSettings(patch); renderSetup(); };
    const matching = matches(settings);
    const available = matching.length;
    const size = settings.grammarCount ? Math.min(settings.grammarCount, available) : available;
    const seen = lastAsked();
    const fresh = matching.filter((q) => !seen[questionId(q)]).length;
    const topics = [['all', 'All topics'], ...Object.entries(TOPICS)];

    setChildren(el,
      h('div', { class: 'view-head' }, h('h1', null, 'Quiz'), quizSwitch('grammar')),
      h('div', { class: 'card setup' },
        h('p', { class: 'muted' }, 'Fill the gap or put the words in order. Readings sit above every kanji.'),
        h('div', { class: 'field' }, h('span', { class: 'label' }, 'Level'), segmented('Level', LEVELS, settings.grammarLevel, (grammarLevel) => set({ grammarLevel }))),
        h('div', { class: 'field' }, h('span', { class: 'label' }, 'Topic'), dropdown('Topic', topics, settings.grammarTopic, (grammarTopic) => set({ grammarTopic }))),
        h('div', { class: 'field' }, h('span', { class: 'label' }, 'Questions'), segmented('Questions', COUNTS, settings.grammarCount, (grammarCount) => set({ grammarCount }))),
        available === 0 && h('p', { class: 'muted' }, 'No questions for that level and topic yet. Try another combination.'),
        available > 0 && h('p', { class: 'muted small' }, fresh
          ? `${available} questions here, ${fresh} of them not asked yet. Unasked questions come first, then the ones asked longest ago.`
          : `${available} questions here, all asked at least once. The ones asked longest ago come first.`),
        h('button', { type: 'button', class: 'btn btn-primary btn-large', disabled: available === 0, onclick: start },
          available === 0 ? 'Start quiz' : `Start quiz · ${size} ${size === 1 ? 'question' : 'questions'}`),
      ),
    );
  }

  // ---- session ----

  function start() {
    const { settings } = store.getState();
    let questions = leastRecent(matches(settings));
    if (settings.grammarCount) questions = questions.slice(0, settings.grammarCount);
    if (!questions.length) return;
    session = {
      questions: questions.map((question) => {
        if (question.type === 'order') return { question, tiles: scrambled(question.order) };
        const right = question.options[0];
        return { question, options: shuffle(question.options).map((text) => ({ text, correct: text === right })) };
      }),
      index: 0,
      right: 0,
      missed: [],
      answered: false,
    };
    renderQuestion();
  }

  function next() {
    session.index += 1;
    session.answered = false;
    if (session.index >= session.questions.length) renderSummary();
    else renderQuestion();
  }

  function playButton(question, label = 'Play the sentence') {
    return h('button', {
      type: 'button', class: 'icon-btn', title: 'Play pronunciation', 'aria-label': label,
      onclick: () => speak(spoken(question)),
    }, icon('speaker'));
  }

  function finish(item, correct, slot, given) {
    const { question } = item;
    session.answered = true;
    if (correct) session.right += 1;
    else session.missed.push(question);
    store.recordDrill(correct);
    store.saveSettings({ grammarSeen: { ...lastAsked(), [questionId(question)]: Date.now() } });
    // Every word in the sentence shares the result (for Most missed words on the Stats page).
    dict.words(solved(question).replace(/\[\[|\]\]/g, '')).then((entries) => store.recordContext(entries, correct), () => {});

    const key = `grammar:${questionId(question)}`;
    if (correct) store.resolveMistake(key);
    else {
      store.recordMistake({
        key,
        quiz: 'grammar',
        prompt: question.type === 'pick'
          ? question.q
          : [question.before, question.order.map((_, i) => (i === question.star ? '★' : '＿')).join(' '), question.after].filter(Boolean).join(' '),
        answer: solved(question),
        given: given || '',
        note: question.why,
        en: question.en,
      });
    }

    const last = session.index === session.questions.length - 1;
    const button = h('button', { type: 'button', class: 'btn btn-primary btn-large', onclick: next }, last ? 'See results' : 'Next');
    queueMicrotask(() => button.focus());
    setChildren(slot, h('div', { class: `feedback ${correct ? 'right' : 'wrong'}`, role: 'status' },
      h('div', { class: 'feedback-title' }, correct ? 'Correct' : 'Not quite'),
      h('div', { class: 'feedback-word' }, sentence(solved(question), 'grammar-sentence'), playButton(question)),
      h('p', null, question.en),
      h('p', { class: 'muted' }, rubyMarkup(question.why)),
      wordSaver(solved(question).replace(/\[\[|\]\]/g, '')),
      button,
    ));
  }

  function prompt(question) {
    if (question.type === 'pick') {
      return h('div', { class: 'prompt' },
        h('span', { class: 'label' }, `N${question.level} · Choose what goes in the gap`),
        h('div', { class: 'prompt-line' }, sentence(question.q, 'grammar-question'), questionSpeaker(spokenQuestion(question))),
      );
    }
    // Word order: the sentence itself is on the tile board below.
    return h('div', { class: 'prompt' },
      h('div', { class: 'prompt-line' },
        h('span', { class: 'label' }, `N${question.level} · Put the words in order`),
        questionSpeaker(spokenQuestion(question)),
      ),
      h('p', { class: 'muted' }, question.en),
    );
  }

  // Tiles to tap or drag into place, then Check.
  function orderBody(item, slot) {
    const { question } = item;
    const check = h('button', { type: 'button', class: 'btn btn-primary btn-large', disabled: true }, 'Check');
    const board = wordOrder({
      before: question.before,
      parts: item.tiles,
      after: question.after,
      onChange: (complete) => { check.disabled = !complete; },
    });
    check.addEventListener('click', () => {
      if (session.answered) return;
      const given = board.arranged();
      const correct = given.every((part, i) => part === question.order[i]);
      board.lock(question.order);
      check.hidden = true;
      finish(item, correct, slot, given.join(' '));
    });
    return [board.el, h('div', { class: 'wo-actions' }, check)];
  }

  function renderQuestion() {
    const item = session.questions[session.index];
    const count = session.questions.length;
    const slot = h('div', { class: 'feedback-slot' });
    const body = item.question.type === 'order' ? orderBody(item, slot) : choicesBody(item, slot);
    setChildren(el,
      h('div', { class: 'quiz-bar' },
        h('span', { class: 'muted' }, `${session.index + 1} of ${count}`),
        h('div', { class: 'progress' }, h('div', { class: 'progress-fill', style: `width:${(session.index / count) * 100}%` })),
        h('button', { type: 'button', class: 'btn btn-quiet btn-small', onclick: () => (session.index > 0 || session.answered ? renderSummary() : quit()) }, 'End quiz'),
      ),
      h('div', { class: 'card question' }, prompt(item.question), body, slot),
    );
  }

  // Fill the gap: four choices, also answered with the number keys.
  function choicesBody(item, slot) {
    const buttons = item.options.map((option, i) => h('button', {
      type: 'button',
      class: 'choice choice-kana',
      onclick: () => {
        if (session.answered) return;
        buttons.forEach((button, j) => {
          button.disabled = true;
          if (item.options[j].correct) button.classList.add('right');
        });
        if (!option.correct) buttons[i].classList.add('wrong');
        finish(item, option.correct, slot, option.text);
      },
    }, h('kbd', null, String(i + 1)), rubyMarkup(option.text)));
    return h('div', { class: 'choices' }, buttons);
  }

  function quit() {
    session = null;
    renderSetup();
  }

  function renderSummary() {
    const done = session.right + session.missed.length;
    const percent = done ? Math.round((session.right / done) * 100) : 0;
    const back = h('button', { type: 'button', class: 'btn btn-primary btn-large', onclick: quit }, 'Back to quiz setup');
    queueMicrotask(() => back.focus());
    setChildren(el, h('div', { class: 'card summary' },
      h('div', { class: 'score' }, `${percent}%`),
      h('h2', null, `${session.right} of ${done} correct`),
      session.missed.length === 0
        ? h('p', { class: 'muted' }, 'A perfect round.')
        : h('div', { class: 'missed' },
          h('h4', null, 'Sentences to revisit'),
          session.missed.map((question) => h('div', { class: 'missed-sentence' },
            h('div', { class: 'feedback-word' }, sentence(solved(question), 'grammar-sentence'), playButton(question)),
            h('span', { class: 'muted' }, question.en),
          )),
        ),
      back,
    ));
  }

  // Number keys answer.
  document.addEventListener('keydown', (event) => {
    if (!session || session.answered || !el.isConnected || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.target instanceof HTMLInputElement) return;
    const button = el.querySelectorAll('.choice')[Number(event.key) - 1];
    if (button) button.click();
  });

  renderSetup();
  // The notes' questions arrive a moment later; the counts change when they do.
  grammarPool().then(() => { if (!session) renderSetup(); });
  return {
    el,
    onShow: () => { if (!session) renderSetup(); },
    onStore: () => { if (!session) renderSetup(); },
  };
}
