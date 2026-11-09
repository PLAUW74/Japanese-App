// Verb form quiz: shows a verb in its ます form and asks for its て-form, た-form or dictionary form.
import * as dict from '../dict.js';
import * as store from '../store.js';
import { conjugations } from '../conjugate.js';
import { toHiragana, kataToHira } from '../kana.js';
import { h, ja, speak, icon, shuffle, segmented, quizSwitch, setChildren, furigana, headword, reading, meaningText } from '../ui.js';

const TARGETS = [['te', 'て-form'], ['past', 'た-form (past)'], ['dict', 'Dictionary form']];
const TARGET_NAMES = { te: 'て-form', past: 'た-form', dict: 'dictionary form' };
const U_ROW = 'うくぐすつぬぶむる';
const I_ROW = 'いきぎしちにびみり';
const MODES = [['type', 'Type the answer'], ['choice', 'Multiple choice']];
const COUNTS = [[10, '10'], [20, '20'], [50, '50']];
const CHOICES = 4;
const SAVED_VERB = /^(v1|v5|vk$|vs-i$|vs$)/;

const isVerb = (word) => word.senses.some((sense) => sense.pos.some((tag) => SAVED_VERB.test(tag)));

// Why the answer is what it is, keyed by the verb's dictionary ending.
const GODAN_RULES = {
  う: 'う, つ, る → って', つ: 'う, つ, る → って', る: 'う, つ, る → って',
  む: 'む, ぶ, ぬ → んで', ぶ: 'む, ぶ, ぬ → んで', ぬ: 'む, ぶ, ぬ → んで',
  く: 'く → いて', ぐ: 'ぐ → いで', す: 'す → して',
};

function ruleFor(title, plain, target) {
  if (target === 'dict') {
    if (title.startsWith('Ichidan')) return 'Group II (ichidan) verb: drop ます and add る.';
    if (title.startsWith('Godan')) {
      const u = plain.slice(-1);
      return `Group I (godan) verb: change the い-row sound before ます into the う-row sound (${I_ROW[U_ROW.indexOf(u)] || ''} → ${u}).`;
    }
    if (plain.endsWith('する')) return 'Group III: します → する.';
    return 'Group III: 来ます (きます) → 来る (くる).';
  }
  if (title.startsWith('Ichidan')) return 'Ichidan verb: drop ます and add て.';
  if (title.startsWith('Godan')) {
    if (/(行|い)く$/.test(plain) && plain.length <= 2) return '行く is the exception among く verbs: 行って, not 行いて.';
    return `Godan verb ending in ${plain.slice(-1)}: ${GODAN_RULES[plain.slice(-1)] || ''}.`;
  }
  if (plain.endsWith('する')) return 'する is irregular: します → して.';
  return '来る is irregular: 来ます → 来て (きて).';
}

// A verb turned into a question, or null when it can't be conjugated.
function toQuestion(word, target) {
  const written = headword(word);
  const table = conjugations(word, written, reading(word));
  if (!table) return null;
  const form = (key) => table.rows.find((row) => row.key === key);
  const polite = form('polite');
  if (!polite || !form('want')) return null;
  // 勉強-type nouns are quizzed as 勉強する.
  const suffix = table.title === 'する verb' ? 'する' : '';
  const plain = { written: written + suffix, reading: reading(word) && reading(word) + suffix };
  const answer = target === 'dict' ? plain : form(target);
  if (!answer) return null;
  return { word, polite, answer, plain, rule: ruleFor(table.title, plain.written, target) };
}

// Wrong answers a learner might really give, built on the same ます stem: the other
// て-form endings, or for the dictionary form, る and the other う-row endings.
// `short` (a one-character stem like 見ます) is decided from the written form so the
// written and reading lists line up item for item.
function wrongForms(polite, target, short) {
  const stem = polite.slice(0, -2);
  const base = stem.slice(0, -1);
  if (target === 'dict') {
    return short
      ? [stem + 'る', stem + 'う', stem + 'く', stem + 'す']
      : [stem + 'る', ...[...U_ROW].map((u) => base + u)];
  }
  const forms = [stem + 'て', stem + 'って', stem + 'んで', stem + 'いて'];
  if (!short) forms.push(base + 'って', base + 'んで', base + 'いて', base + 'いで', base + 'して');
  return target === 'past' ? forms.map((f) => f.slice(0, -1) + (f.endsWith('で') ? 'だ' : 'た')) : forms;
}

function options(question, target) {
  const short = question.polite.written.length <= 3;
  const written = wrongForms(question.polite.written, target, short);
  const readings = question.polite.reading ? wrongForms(question.polite.reading, target, short) : [];
  const seen = new Set([question.answer.written]);
  const out = [{ ...question.answer, correct: true }];
  for (const i of shuffle(written.map((_, n) => n))) {
    if (out.length >= CHOICES) break;
    if (seen.has(written[i])) continue;
    seen.add(written[i]);
    out.push({ written: written[i], reading: readings[i] || '', correct: false });
  }
  return shuffle(out);
}

export function createVerbsView() {
  let session = null;
  const el = h('section', { class: 'view quiz' });

  // ---- setup ----

  function renderSetup(message) {
    const { settings } = store.getState();
    const set = (patch) => { store.saveSettings(patch); renderSetup(); };
    const saved = store.allWords().filter(isVerb).length;
    const sources = [['n5', 'Common verbs · JLPT N5'], ['n4', 'Common verbs · JLPT N5–N4'], ['mine', 'My saved verbs', saved]];
    const empty = settings.verbSource === 'mine' && saved === 0;

    setChildren(el,
      h('div', { class: 'view-head' }, h('h1', null, 'Quiz'), quizSwitch('verbs')),
      h('div', { class: 'card setup' },
        h('p', { class: 'muted' }, 'You see a verb in its ます form and give the form asked for.'),
        h('div', { class: 'field' },
          h('span', { class: 'label' }, 'Verbs'),
          h('div', { class: 'source-list' }, sources.map(([key, label, count]) => h('button', {
            type: 'button',
            class: `source ${key === settings.verbSource ? 'on' : ''}`,
            'aria-pressed': String(key === settings.verbSource),
            onclick: () => set({ verbSource: key }),
          }, h('span', null, label), count !== undefined && h('span', { class: 'count' }, count)))),
        ),
        h('div', { class: 'field' }, h('span', { class: 'label' }, 'Convert ます form to'), segmented('Target form', TARGETS, settings.verbTarget, (verbTarget) => set({ verbTarget }))),
        h('div', { class: 'field' }, h('span', { class: 'label' }, 'Question type'), segmented('Question type', MODES, settings.verbMode, (verbMode) => set({ verbMode }))),
        h('div', { class: 'field' }, h('span', { class: 'label' }, 'Questions'), segmented('Questions', COUNTS, settings.verbCount, (verbCount) => set({ verbCount }))),
        empty && h('p', { class: 'muted' }, 'You have no verbs in My Words yet. Save some from the dictionary, or pick a common verb set.'),
        message && h('p', { class: 'error' }, message),
        h('button', { type: 'button', class: 'btn btn-primary btn-large', disabled: empty, onclick: start }, 'Start quiz'),
      ),
    );
  }

  // ---- session ----

  async function start() {
    const { settings } = store.getState();
    setChildren(el, h('p', { class: 'muted empty-line' }, 'Preparing your quiz…'));
    let words;
    try {
      words = settings.verbSource === 'mine'
        ? shuffle(store.allWords().filter(isVerb)).slice(0, settings.verbCount)
        : await dict.verbs(settings.verbCount, settings.verbSource === 'n5' ? 5 : 4);
    } catch (err) {
      renderSetup('The dictionary could not be loaded, so there are no verbs to quiz. Reload the page and try again.');
      return;
    }
    const questions = words.map((word) => toQuestion(word, settings.verbTarget)).filter(Boolean);
    if (!questions.length) {
      renderSetup('No verbs to quiz in that set.');
      return;
    }
    if (settings.verbMode === 'choice') {
      for (const question of questions) question.options = options(question, settings.verbTarget);
    }
    session = { questions, target: settings.verbTarget, mode: settings.verbMode, index: 0, right: 0, missed: [], answered: false };
    renderQuestion();
  }

  function next() {
    session.index += 1;
    session.answered = false;
    if (session.index >= session.questions.length) renderSummary();
    else renderQuestion();
  }

  function finish(question, correct, slot) {
    session.answered = true;
    if (correct) session.right += 1;
    else session.missed.push(question);
    store.recordDrill(correct);

    const { answer } = question;
    const last = session.index === session.questions.length - 1;
    const button = h('button', { type: 'button', class: 'btn btn-primary btn-large', onclick: next }, last ? 'See results' : 'Next');
    queueMicrotask(() => button.focus());
    setChildren(slot, h('div', { class: `feedback ${correct ? 'right' : 'wrong'}`, role: 'status' },
      h('div', { class: 'feedback-title' }, correct ? 'Correct' : 'Not quite'),
      h('div', { class: 'feedback-word' },
        furigana(answer.written, answer.reading, 'entry-headword'),
        h('button', { type: 'button', class: 'icon-btn', title: 'Play pronunciation', 'aria-label': 'Play the answer', onclick: () => speak(answer.reading || answer.written) }, icon('speaker')),
      ),
      session.target === 'dict'
        ? h('p', null, meaningText(question.word, 2))
        : h('p', null, 'Dictionary form: ', furigana(question.plain.written, question.plain.reading), ` · ${meaningText(question.word, 2)}`),
      !correct && session.target !== 'past' && h('p', { class: 'muted' }, question.rule),
      button,
    ));
  }

  function choiceBody(question, slot) {
    const buttons = question.options.map((option, i) => h('button', {
      type: 'button',
      class: 'choice choice-kana',
      onclick: () => {
        if (session.answered) return;
        buttons.forEach((button, j) => {
          button.disabled = true;
          if (question.options[j].correct) button.classList.add('right');
        });
        if (!option.correct) buttons[i].classList.add('wrong');
        finish(question, option.correct, slot);
      },
    }, h('kbd', null, String(i + 1)), furigana(option.written, option.reading)));
    return h('div', { class: 'choices' }, buttons);
  }

  function typingBody(question, slot) {
    const field = h('input', {
      type: 'text',
      class: 'answer-input',
      lang: 'ja',
      placeholder: 'Type the answer (romaji turns into kana)',
      autocomplete: 'off',
      autocapitalize: 'off',
      spellcheck: false,
      'aria-label': 'Your answer',
      oninput: (event) => {
        // Leave text alone while a Japanese IME is composing.
        if (event.isComposing) return;
        const converted = toHiragana(field.value, true);
        if (converted !== field.value) field.value = converted;
      },
    });
    const submit = (given) => {
      if (session.answered) return;
      const { answer } = question;
      const typed = given.trim();
      const correct = typed !== '' && (typed === answer.written || kataToHira(toHiragana(typed)) === kataToHira(answer.reading || answer.written));
      field.disabled = true;
      controls.hidden = true;
      field.classList.add(correct ? 'right' : 'wrong');
      finish(question, correct, slot);
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
    setChildren(el,
      h('div', { class: 'quiz-bar' },
        h('span', { class: 'muted' }, `${session.index + 1} of ${count}`),
        h('div', { class: 'progress' }, h('div', { class: 'progress-fill', style: `width:${(session.index / count) * 100}%` })),
        h('button', { type: 'button', class: 'btn btn-quiet btn-small', onclick: () => (session.index > 0 || session.answered ? renderSummary() : quit()) }, 'End quiz'),
      ),
      h('div', { class: 'card question' },
        h('div', { class: 'prompt' },
          h('span', { class: 'label' }, `Change to the ${TARGET_NAMES[session.target]}`),
          h('div', { class: 'prompt-line' },
            furigana(question.polite.written, question.polite.reading, 'prompt-word'),
            h('button', {
              type: 'button',
              class: 'icon-btn',
              title: 'Play pronunciation',
              'aria-label': 'Play the verb',
              onclick: () => speak(question.polite.reading || question.polite.written),
            }, icon('speaker')),
          ),
          h('span', { class: 'muted' }, meaningText(question.word, 2)),
        ),
        session.mode === 'choice' ? choiceBody(question, slot) : typingBody(question, slot),
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
    const back = h('button', { type: 'button', class: 'btn btn-primary btn-large', onclick: quit }, 'Back to quiz setup');
    queueMicrotask(() => back.focus());
    setChildren(el, h('div', { class: 'card summary' },
      h('div', { class: 'score' }, `${percent}%`),
      h('h2', null, `${session.right} of ${done} correct`),
      session.missed.length === 0
        ? h('p', { class: 'muted' }, 'A perfect round.')
        : h('div', { class: 'missed' },
          h('h4', null, 'Verbs to revisit'),
          session.missed.map((question) => h('div', { class: 'missed-row' },
            furigana(question.polite.written, question.polite.reading, 'missed-word'),
            h('span', null, '→ ', furigana(question.answer.written, question.answer.reading, 'missed-word')),
            h('span', { class: 'muted small' }, meaningText(question.word, 1)),
          )),
        ),
      back,
    ));
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
