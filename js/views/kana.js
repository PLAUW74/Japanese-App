import * as store from '../store.js';
import { toHiragana, kataToHira, hiraToKata } from '../kana.js';
import { h, ja, speak, icon, shuffle, segmented, quizSwitch, setChildren } from '../ui.js';

const GROUPS = {
  basic: ['Basic (46)',
    [...'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん'],
    'a i u e o ka ki ku ke ko sa shi su se so ta chi tsu te to na ni nu ne no ha hi fu he ho ma mi mu me mo ya yu yo ra ri ru re ro wa wo n'],
  dakuten: ['Dakuten ゛゜ (25)',
    [...'がぎぐげござじずぜぞだぢづでどばびぶべぼぱぴぷぺぽ'],
    'ga gi gu ge go za ji zu ze zo da ji zu de do ba bi bu be bo pa pi pu pe po'],
  combo: ['Combinations (33)',
    'きゃきゅきょしゃしゅしょちゃちゅちょにゃにゅにょひゃひゅひょみゃみゅみょりゃりゅりょぎゃぎゅぎょじゃじゅじょびゃびゅびょぴゃぴゅぴょ'.match(/../g),
    'kya kyu kyo sha shu sho cha chu cho nya nyu nyo hya hyu hyo mya myu myo rya ryu ryo gya gyu gyo ja ju jo bya byu byo pya pyu pyo'],
};
const SCRIPTS = [['hiragana', 'Hiragana'], ['katakana', 'Katakana'], ['both', 'Both']];
const MODES = [['read', 'Choose the reading'], ['type', 'Type the reading'], ['pick', 'Choose the kana']];
const COUNTS = [[10, '10'], [20, '20'], [50, '50'], [0, 'All']];
const CHOICES = 4;
const ADVANCE_MS = 650;

// Every kana as { kana, romaji, hira, group, script }.
const ALL = [];
for (const [group, [, hira, romaji]] of Object.entries(GROUPS)) {
  romaji.split(' ').forEach((r, i) => {
    ALL.push({ kana: hira[i], romaji: r, hira: hira[i], group, script: 'hiragana' });
    ALL.push({ kana: hiraToKata(hira[i]), romaji: r, hira: hira[i], group, script: 'katakana' });
  });
}

function pool({ kanaScript, kanaGroups }) {
  return ALL.filter((k) => kanaGroups.includes(k.group) && (kanaScript === 'both' || k.script === kanaScript));
}

// "shi" and "si" are both fine for し; を also answers to "o".
function isRightReading(item, answer) {
  const given = answer.trim().toLowerCase();
  if (!given) return false;
  return given === item.romaji || kataToHira(toHiragana(given)) === item.hira || (item.hira === 'を' && given === 'o');
}

function mastery(item) {
  const [right, wrong] = store.getState().kana[item.kana] || [0, 0];
  if (right + wrong === 0) return 'unseen';
  return right / (right + wrong) >= 0.8 ? 'good' : 'weak';
}

export function createKanaView() {
  let session = null;
  let timer;
  const el = h('section', { class: 'view quiz' });

  // ---- setup ----

  function renderSetup() {
    const { settings } = store.getState();
    const set = (patch) => { store.saveSettings(patch); renderSetup(); };
    const items = pool(settings);
    const size = settings.kanaCount ? Math.min(settings.kanaCount, items.length) : items.length;

    setChildren(el,
      h('div', { class: 'view-head' }, h('h1', null, 'Quiz'), quizSwitch('kana')),
      h('div', { class: 'card setup' },
        h('div', { class: 'field' }, h('span', { class: 'label' }, 'Script'), segmented('Script', SCRIPTS, settings.kanaScript, (kanaScript) => set({ kanaScript }))),
        h('div', { class: 'field' },
          h('span', { class: 'label' }, 'Characters'),
          h('div', { class: 'chips' }, Object.entries(GROUPS).map(([key, [label]]) => {
            const on = settings.kanaGroups.includes(key);
            return h('button', {
              type: 'button',
              class: `chip ${on ? 'on' : ''}`,
              'aria-pressed': String(on),
              onclick: () => set({ kanaGroups: on ? settings.kanaGroups.filter((g) => g !== key) : [...settings.kanaGroups, key] }),
            }, on && icon('check'), label);
          })),
        ),
        h('div', { class: 'field' }, h('span', { class: 'label' }, 'Question type'), segmented('Question type', MODES, settings.kanaMode, (kanaMode) => set({ kanaMode }))),
        h('div', { class: 'field' }, h('span', { class: 'label' }, 'Questions'), segmented('Questions', COUNTS, settings.kanaCount, (kanaCount) => set({ kanaCount }))),
        h('button', { type: 'button', class: 'btn btn-primary btn-large', disabled: items.length === 0, onclick: start },
          items.length === 0 ? 'Pick at least one group' : `Start test · ${size} ${size === 1 ? 'question' : 'questions'}`),
      ),
      items.length > 0 && h('div', { class: 'card' },
        h('h2', null, 'Your kana chart'),
        h('div', { class: 'kana-chart' }, items.map((item) => h('button', {
          type: 'button',
          class: `kana-cell ${mastery(item)}`,
          title: `Play ${item.romaji}`,
          onclick: () => speak(item.kana),
        }, ja(item.kana), h('span', null, item.romaji)))),
        h('div', { class: 'legend' },
          [['unseen', 'Not tested yet'], ['weak', 'Needs practice'], ['good', 'Known (80%+ right)']].map(([key, label]) => h('div', { class: 'legend-item' }, h('span', { class: `dot kana-${key}` }), label))),
      ),
    );
  }

  // ---- session ----

  function start() {
    const { settings } = store.getState();
    const items = pool(settings);
    if (!items.length) return;

    // Unseen and often-missed kana come first when the test is shorter than the set.
    const need = (item) => {
      const [right, wrong] = store.getState().kana[item.kana] || [0, 0];
      return (right + wrong === 0 ? 0.5 : right / (right + wrong)) + Math.random() * 0.5;
    };
    let chosen = items.map((item) => [need(item), item]).sort((a, b) => a[0] - b[0]).map(([, item]) => item);
    if (settings.kanaCount) chosen = chosen.slice(0, settings.kanaCount);

    session = {
      mode: settings.kanaMode,
      questions: shuffle(chosen).map((item) => {
        const question = { item };
        if (settings.kanaMode !== 'type') {
          // Wrong choices: same script, never another kana with the same reading (じ / ぢ).
          const seen = new Set([item.romaji]);
          const options = [item];
          for (const other of shuffle(ALL.filter((k) => k.script === item.script))) {
            if (options.length >= CHOICES) break;
            if (seen.has(other.romaji)) continue;
            seen.add(other.romaji);
            options.push(other);
          }
          question.options = shuffle(options);
        }
        return question;
      }),
      index: 0,
      right: 0,
      missed: [],
      answered: false,
    };
    renderQuestion();
  }

  function next() {
    clearTimeout(timer);
    session.index += 1;
    session.answered = false;
    if (session.index >= session.questions.length) renderSummary();
    else renderQuestion();
  }

  function finish(question, correct, slot) {
    const { item } = question;
    session.answered = true;
    if (correct) session.right += 1;
    else session.missed.push(item);
    store.recordKana(item.kana, correct);

    if (correct) {
      slot.replaceChildren(h('div', { class: 'feedback right', role: 'status' }, h('div', { class: 'feedback-title' }, 'Correct')));
      timer = setTimeout(next, ADVANCE_MS);
      return;
    }
    const button = h('button', { type: 'button', class: 'btn btn-primary btn-large', onclick: next },
      session.index === session.questions.length - 1 ? 'See results' : 'Next');
    queueMicrotask(() => button.focus());
    slot.replaceChildren(h('div', { class: 'feedback wrong', role: 'status' },
      h('div', { class: 'feedback-title' }, 'Not quite'),
      h('div', { class: 'feedback-word' },
        ja(item.kana, 'entry-headword'),
        h('span', null, `is “${item.romaji}”`),
        h('button', { type: 'button', class: 'icon-btn', title: 'Play pronunciation', 'aria-label': `Play ${item.romaji}`, onclick: () => speak(item.kana) }, icon('speaker')),
      ),
      button,
    ));
  }

  function choiceBody(question, slot) {
    const { item } = question;
    const showKana = session.mode === 'pick';
    const buttons = question.options.map((option, i) => h('button', {
      type: 'button',
      class: `choice ${showKana ? 'choice-kana' : ''}`,
      lang: showKana ? 'ja' : null,
      onclick: () => {
        if (session.answered) return;
        const correct = option.romaji === item.romaji;
        buttons.forEach((button, j) => {
          button.disabled = true;
          if (question.options[j].romaji === item.romaji) button.classList.add('right');
        });
        if (!correct) buttons[i].classList.add('wrong');
        finish(question, correct, slot);
      },
    }, h('kbd', null, String(i + 1)), h('span', null, showKana ? option.kana : option.romaji)));
    return h('div', { class: 'choices' }, buttons);
  }

  function typingBody(question, slot) {
    const field = h('input', {
      type: 'text',
      class: 'answer-input',
      placeholder: 'Type the reading in romaji',
      autocomplete: 'off',
      autocapitalize: 'off',
      spellcheck: false,
      'aria-label': 'Your answer',
    });
    const submit = (given) => {
      if (session.answered) return;
      const correct = isRightReading(question.item, given);
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
    const pick = session.mode === 'pick';
    setChildren(el,
      h('div', { class: 'quiz-bar' },
        h('span', { class: 'muted' }, `${session.index + 1} of ${count}`),
        h('div', { class: 'progress' }, h('div', { class: 'progress-fill', style: `width:${(session.index / count) * 100}%` })),
        h('button', { type: 'button', class: 'btn btn-quiet btn-small', onclick: () => (session.index > 0 || session.answered ? renderSummary() : quit()) }, 'End test'),
      ),
      h('div', { class: 'card question' },
        h('div', { class: 'prompt' },
          h('span', { class: 'label' }, pick ? `Which ${question.item.script} is` : 'How do you read this?'),
          pick ? h('div', { class: 'prompt-word' }, question.item.romaji) : ja(question.item.kana, 'prompt-word prompt-kana'),
        ),
        session.mode === 'type' ? typingBody(question, slot) : choiceBody(question, slot),
        slot,
      ),
    );
  }

  function quit() {
    clearTimeout(timer);
    session = null;
    renderSetup();
  }

  function renderSummary() {
    clearTimeout(timer);
    const done = session.right + session.missed.length;
    const percent = done ? Math.round((session.right / done) * 100) : 0;
    const missed = [...new Set(session.missed)];
    const back = h('button', { type: 'button', class: 'btn btn-primary btn-large', onclick: quit }, 'Back to test setup');
    queueMicrotask(() => back.focus());
    setChildren(el, h('div', { class: 'card summary' },
      h('div', { class: 'score' }, `${percent}%`),
      h('h2', null, `${session.right} of ${done} correct`),
      missed.length === 0
        ? h('p', { class: 'muted' }, 'A perfect round.')
        : h('div', { class: 'missed' },
          h('h4', null, 'Kana to revisit'),
          h('div', { class: 'kana-chart' }, missed.map((item) => h('button', {
            type: 'button', class: 'kana-cell weak', title: `Play ${item.romaji}`, onclick: () => speak(item.kana),
          }, ja(item.kana), h('span', null, item.romaji)))),
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
