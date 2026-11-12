// The questions in the study notes (notes/*.html), read straight out of the pages: for the
// note pages, to make their multiple-choice questions tappable, and for the grammar quiz,
// to turn every answered question into a quiz question of its own.
//
// It reads the notes as they are written, so a homework page added later feeds the quiz
// without anything else being done. The pages follow a few fixed shapes:
//   - a blank:        （<span class="gap">　</span>）, the answers in order, split by ／
//   - a lettered choice: （ a. 座{すわ}りましょうか　b. 座{すわ}っても いいですか ）, answered "b. …"
//   - a word choice:  ｛チケット・スイッチ・エアコン｝, answered with the word
// each with its answers in the item's <details>.

const NOTES = new URL('../notes/', import.meta.url);

// A lettered group (a. … b. … c. …) inside full-width brackets, or words in full-width braces.
export const CHOICE_GROUP = /（\s*[a-z]\.[^（）]*?）|｛[^｛｝]*｝/g;

// Sections whose answers are the learner's own, a whole sentence, or about a passage the
// quiz would not show.
const SKIP_SECTION = /yourself|make a sentence|reading/i;
// An answer this long (not counting readings) is a sentence, not a word to choose.
const LONGEST_ANSWER = 14;
// Wrong options for a particle blank when its section has too few answers of its own.
const PARTICLES = ['は', 'が', 'を', 'に', 'で', 'へ', 'と', 'も', 'の', 'から', 'まで', 'より', 'や'];

// What a reader sees of 漢字{かんじ} markup: the readings left out.
export const visible = (markup) => String(markup || '').replace(/\{[^}]*\}/g, '').trim();

/**
 * One choice group's options: [{ key, text }], keyed by letter (a, b…) for a lettered
 * group and by the word itself for a braced one.
 */
export function parseGroup(group) {
  if (group.startsWith('｛')) {
    return group.slice(1, -1).split('・').map((w) => w.trim()).filter(Boolean).map((w) => ({ key: visible(w), text: w }));
  }
  const pieces = group.slice(1, -1).split(/(?:^|[\s　]+)([a-z])\.\s*/);
  const options = [];
  for (let i = 1; i < pieces.length; i += 2) options.push({ key: pieces[i], text: pieces[i + 1].trim() });
  return options;
}

/**
 * The right key for each choice group, from the item's answer: letters for lettered groups
 * ("a. 知って いますか ／ b. 知りません" -> ['a', 'b']), the word for braced ones. Returns
 * null when the answer does not line up with the groups.
 */
export function answerKeys(answers, groups) {
  if (answers.length !== groups.length) return null;
  const keys = groups.map((group, i) => {
    const answer = answers[i].trim();
    if (group.startsWith('｛')) {
      const word = visible(answer);
      return parseGroup(group).some((o) => o.key === word) ? word : null;
    }
    const letter = /^([a-z])[.\s　]/.exec(answer);
    return letter && parseGroup(group).some((o) => o.key === letter[1]) ? letter[1] : null;
  });
  return keys.every(Boolean) ? keys : null;
}

/** The answers of one item, every paragraph of its <details>, split at ／. */
export function itemAnswers(details) {
  const paragraphs = [...details.querySelectorAll('p')].map((p) => p.textContent);
  return paragraphs.join(' ／ ').split(/\s*[／]\s*/).map((a) => a.trim()).filter(Boolean);
}

/**
 * A blank's answer, tidied for use as an option: a trailing explanation ("5つ: count the
 * chairs…"), a letter in front ("f いいですよ"), and anything in brackets go. Alternatives
 * the note accepts ("いくつ（どのくらい also works）", "雨（or くもり）") are kept apart, so
 * they are never offered as wrong answers.
 */
export function cleanAnswer(raw) {
  let text = raw.split(/:\s/)[0].trim();
  const alts = [];
  const lettered = /^[a-z]（(.+)）$/.exec(text);
  if (lettered) text = lettered[1];
  text = text.replace(/^[a-z](?:\.|\s|　)+/, '');
  text = text.replace(/[（(]([^）)]*)[）)]/g, (match, inner) => {
    const also = /^(.*?)\s*also works$/.exec(inner.trim());
    const or = /^or\s+(.+)$/.exec(inner.trim());
    if (also) alts.push(also[1].trim());
    else if (or) alts.push(or[1].trim());
    return '';
  });
  return { text: text.trim(), alts };
}

const textOf = (el) => {
  const copy = el.cloneNode(true);
  copy.querySelectorAll('br').forEach((br) => br.replaceWith(' '));
  return copy;
};

function hash(text) {
  let value = 5381;
  for (const ch of text) value = ((value * 33) ^ ch.codePointAt(0)) >>> 0;
  return value;
}

// ---- the questions of one page ----

function pageQuestions(doc, title) {
  const out = [];
  for (const section of doc.querySelectorAll('section')) {
    const heading = section.querySelector('h3');
    if (!heading) continue;
    const headingCopy = heading.cloneNode(true);
    headingCopy.querySelectorAll('.muted').forEach((m) => m.remove());
    const sectionTitle = headingCopy.textContent.trim();
    if (SKIP_SECTION.test(sectionTitle)) continue;
    const tip = section.querySelector('p.tip');
    const why = `From ${title} · ${sectionTitle}.${tip ? ` ${tip.textContent.trim()}` : ''}`;

    const items = [...section.querySelectorAll('ol.questions > li')]
      .map((li) => ({ p: li.querySelector(':scope > p'), details: li.querySelector('details') }))
      .filter((item) => item.p && item.details);

    // The answers to the section's blanks, by their place in the item: the wrong options
    // for each other blank in that place. An item can mix kinds — a verb in its first blank
    // and a clause in its second — and a clause is no wrong answer for a verb.
    const byPlace = [];
    const everyAnswer = [];
    for (const { p, details } of items) {
      if (!p.querySelector('.gap')) continue;
      itemAnswers(details).forEach((answer, place) => {
        const text = cleanAnswer(answer).text;
        (byPlace[place] = byPlace[place] || []).push(text);
        everyAnswer.push(text);
      });
    }

    items.forEach(({ p, details }, itemIndex) => {
      const answers = itemAnswers(details);
      const gapCount = p.querySelectorAll('.gap').length;
      const copy = textOf(p);

      if (gapCount) {
        if (answers.length !== gapCount) return;
        const cleaned = answers.map(cleanAnswer);
        if (cleaned.some((a) => !a.text || visible(a.text).length > LONGEST_ANSWER)) return;
        [...copy.querySelectorAll('.gap')].forEach((gap, i) => gap.replaceWith(`\u0001${i}\u0002`));
        // A blank can carry the word to put into shape inside its own brackets:
        // 靴を（脱ぎます…＿）ください. The hint is kept, in brackets of its own, and noted.
        const hints = [];
        const text = copy.textContent.replace(/\s+/g, ' ').trim()
          .replace(/（([^（）\u0001]*?)…\s*\u0001(\d+)\u0002\s*）/g, (m, hint, i) => {
            hints[Number(i)] = hint.trim();
            return `\u0001${i}\u0002`;
          });
        cleaned.forEach((answer, k) => {
          const taken = new Set([visible(answer.text), ...answer.alts.map(visible)]);
          const wrong = [];
          const offer = (option) => {
            if (option && !taken.has(visible(option))) { wrong.push(option); taken.add(visible(option)); }
          };
          // With a hint, the wrong options are other shapes of the same word: the hint as
          // given and, for a verb, its stem. Options from other verbs would give the answer
          // away — only one of them would be the verb asked about.
          const hint = hints[k];
          if (hint) {
            offer(hint);
            if (hint.endsWith('ます')) offer(hint.slice(0, -2));
          }
          if (wrong.length < 2) for (const other of byPlace[k] || []) offer(other);
          if (wrong.length < 3 && (PARTICLES.includes(answer.text) || answer.text === '×')) PARTICLES.forEach(offer);
          if (wrong.length < 2 && !hint) everyAnswer.forEach(offer);
          if (!wrong.length) return;
          // A different three each time, so a section's questions don't all offer the same.
          const start = hint ? 0 : (itemIndex + k) % wrong.length;
          const chosen = [...wrong.slice(start), ...wrong.slice(0, start)].slice(0, 3);
          const q = text.replace(/（?\s*\u0001(\d+)\u0002\s*）?/g, (m, i) => {
            const n = Number(i);
            if (n === k) return hints[n] ? `〔${hints[n]}〕（　）` : '（　）';
            // × is the notes' "no particle here": nothing goes in the sentence.
            return cleaned[n].text === '×' ? '' : cleaned[n].text;
          });
          out.push({ type: 'pick', topic: 'notes', level: 5, q, options: [answer.text, ...chosen], en: '', why, source: title });
        });
        return;
      }

      const text = copy.textContent.replace(/\s+/g, ' ').trim();
      const groups = text.match(CHOICE_GROUP) || [];
      if (!groups.length) return;
      const keys = answerKeys(answers, groups);
      if (!keys) return;
      groups.forEach((group, k) => {
        const options = parseGroup(group);
        const right = options.find((o) => o.key === keys[k]);
        if (!right || options.length < 2) return;
        let n = -1;
        const q = text.replace(CHOICE_GROUP, (match) => {
          n += 1;
          if (n === k) return '（　）';
          return parseGroup(match).find((o) => o.key === keys[n]).text;
        });
        out.push({ type: 'pick', topic: 'notes', level: 5, q, options: [right.text, ...options.filter((o) => o !== right).map((o) => o.text)], en: '', why, source: title });
      });
    });
  }
  return out;
}

// ---- every page ----

let all = null;

/** Every question in the notes, in the grammar quiz's own shape, read once and kept. */
export function noteQuestions() {
  if (!all) {
    all = (async () => {
      const index = await fetch(new URL('index.json', NOTES)).then((res) => res.json());
      // An entry other notes name as their parent is a folder (Homework), with no page.
      const folders = new Set(index.map((page) => page.parent).filter(Boolean));
      const pages = await Promise.all(index.filter((page) => !folders.has(page.id)).map(async (page) => {
        try {
          const res = await fetch(new URL(`${page.id}.html`, NOTES));
          if (!res.ok) return [];
          const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
          return pageQuestions(doc, page.title);
        } catch (err) {
          return [];
        }
      }));
      // The same sentence asked twice (an example repeated as a question) is one question.
      const seen = new Set();
      return pages.flat().filter((q) => {
        const id = hash(q.q);
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      });
    })();
    all.catch(() => { all = null; });
  }
  return all;
}
