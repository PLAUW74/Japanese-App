// Grammar quiz: fill-the-gap and JLPT-style word order questions from js/grammar-data.js.
import * as store from '../store.js';
import { QUESTIONS, TOPICS } from '../grammar-data.js';
import { h, speak, icon, shuffle, segmented, quizSwitch, setChildren, rubyMarkup, markupReading } from '../ui.js';

const LEVELS = [['both', 'N5 + N4'], [5, 'N5'], [4, 'N4']];
const COUNTS = [[1, '1'], [5, '5'], [10, '10'], [20, '20'], [0, 'All']];
const GAP = '（　）';

const matches = ({ grammarLevel, grammarTopic }) => QUESTIONS.filter((q) =>
  (grammarLevel === 'both' || q.level === grammarLevel) && (grammarTopic === 'all' || q.topic === grammarTopic));

// The finished sentence as marked-up text, with the answer wrapped in [[ ]] for highlighting.
export function solved(question) {
  if (question.type === 'pick') return question.q.replace(GAP, `[[${question.options[0]}]]`);
  const words = question.order.map((part, i) => (i === question.star ? `[[${part}]]` : part));
  return [question.before, words.join(' '), question.after].filter(Boolean).join(' ');
}

// Renders text that may contain a [[highlighted]] part and the （　） gap.
export function sentence(text, cls) {
  const el = h('span', { lang: 'ja', class: cls });
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

const spoken = (question) => markupReading(solved(question).replace(/\[\[|\]\]/g, '')).replace(/\s+/g, '');

export function createGrammarView() {
  let session = null;
  const el = h('section', { class: 'view quiz' });

  // ---- setup ----

  function renderSetup() {
    const { settings } = store.getState();
    const set = (patch) => { store.saveSettings(patch); renderSetup(); };
    const available = matches(settings).length;
    const size = settings.grammarCount ? Math.min(settings.grammarCount, available) : available;
    const topics = [['all', 'All topics'], ...Object.entries(TOPICS)];

    setChildren(el,
      h('div', { class: 'view-head' }, h('h1', null, 'Quiz'), quizSwitch('grammar')),
      h('div', { class: 'card setup' },
        h('p', { class: 'muted' }, 'Fill the gap or put the words in order. Readings sit above every kanji.'),
        h('div', { class: 'field' }, h('span', { class: 'label' }, 'Level'), segmented('Level', LEVELS, settings.grammarLevel, (grammarLevel) => set({ grammarLevel }))),
        h('div', { class: 'field' },
          h('span', { class: 'label' }, 'Topic'),
          h('div', { class: 'chips' }, topics.map(([key, label]) => h('button', {
            type: 'button',
            class: `chip ${key === settings.grammarTopic ? 'on' : ''}`,
            'aria-pressed': String(key === settings.grammarTopic),
            onclick: () => set({ grammarTopic: key }),
          }, label))),
        ),
        h('div', { class: 'field' }, h('span', { class: 'label' }, 'Questions'), segmented('Questions', COUNTS, settings.grammarCount, (grammarCount) => set({ grammarCount }))),
        available === 0 && h('p', { class: 'muted' }, 'No questions for that level and topic yet. Try another combination.'),
        h('button', { type: 'button', class: 'btn btn-primary btn-large', disabled: available === 0, onclick: start },
          available === 0 ? 'Start quiz' : `Start quiz · ${size} ${size === 1 ? 'question' : 'questions'}`),
      ),
    );
  }

  // ---- session ----

  function start() {
    const { settings } = store.getState();
    let questions = shuffle(matches(settings));
    if (settings.grammarCount) questions = questions.slice(0, settings.grammarCount);
    if (!questions.length) return;
    session = {
      questions: questions.map((question) => {
        const right = question.type === 'pick' ? question.options[0] : question.order[question.star];
        const choices = question.type === 'pick' ? question.options : question.order;
        return { question, options: shuffle(choices).map((text) => ({ text, correct: text === right })) };
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
      button,
    ));
  }

  function prompt(question) {
    if (question.type === 'pick') {
      return h('div', { class: 'prompt' },
        h('span', { class: 'label' }, `N${question.level} · Choose what goes in the gap`),
        sentence(question.q, 'grammar-question'),
      );
    }
    const blanks = question.order.map((_, i) => h('span', { class: `gap ${i === question.star ? 'star' : ''}` }, i === question.star ? '★' : '　'));
    return h('div', { class: 'prompt' },
      h('span', { class: 'label' }, `N${question.level} · Which word goes in ★?`),
      h('span', { lang: 'ja', class: 'grammar-question' },
        question.before && rubyMarkup(question.before), ' ', ...blanks.flatMap((b) => [b, ' ']), question.after && rubyMarkup(question.after)),
    );
  }

  function renderQuestion() {
    const item = session.questions[session.index];
    const count = session.questions.length;
    const slot = h('div', { class: 'feedback-slot' });
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

    setChildren(el,
      h('div', { class: 'quiz-bar' },
        h('span', { class: 'muted' }, `${session.index + 1} of ${count}`),
        h('div', { class: 'progress' }, h('div', { class: 'progress-fill', style: `width:${(session.index / count) * 100}%` })),
        h('button', { type: 'button', class: 'btn btn-quiet btn-small', onclick: () => (session.index > 0 || session.answered ? renderSummary() : quit()) }, 'End quiz'),
      ),
      h('div', { class: 'card question' }, prompt(item.question), h('div', { class: 'choices' }, buttons), slot),
    );
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
  return {
    el,
    onShow: () => { if (!session) renderSetup(); },
    onStore: () => { if (!session) renderSetup(); },
  };
}
