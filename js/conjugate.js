// Builds the common conjugated forms of a verb or adjective from its dictionary form.
// Every ending is kana, so the same rewrite works on the kanji spelling and on the reading.

const GODAN = {
  u: 'うくぐすつぬぶむる',
  a: 'わかがさたなばまら',
  i: 'いきぎしちにびみり',
  e: 'えけげせてねべめれ',
  o: 'おこごそとのぼもろ',
  te: ['って', 'いて', 'いで', 'して', 'って', 'んで', 'んで', 'んで', 'って'],
  ta: ['った', 'いた', 'いだ', 'した', 'った', 'んだ', 'んだ', 'んだ', 'った'],
};

function ichidan(text, pos) {
  const s = text.slice(0, -1);
  return {
    polite: s + 'ます', negative: s + 'ない', past: s + 'た', pastNegative: s + 'なかった', te: s + 'て',
    potential: s + 'られる', passive: s + 'られる', causative: s + 'させる', volitional: s + 'よう',
    // くれる is the one common ichidan verb whose command form drops ろ.
    imperative: pos === 'v1-s' ? s : s + 'ろ',
    conditional: s + 'れば', want: s + 'たい',
  };
}

function godan(text, pos) {
  const s = text.slice(0, -1);
  const n = GODAN.u.indexOf(text.slice(-1));
  if (n < 0) return null;
  const [a, i, e, o] = [GODAN.a[n], GODAN.i[n], GODAN.e[n], GODAN.o[n]];
  let [te, ta] = [GODAN.te[n], GODAN.ta[n]];
  if (pos === 'v5k-s') [te, ta] = ['って', 'った'];   // 行く -> 行って
  if (pos === 'v5u-s') [te, ta] = ['うて', 'うた'];   // 問う -> 問うて
  const honorific = pos === 'v5aru';                  // いらっしゃる -> いらっしゃいます
  const forms = {
    polite: s + (honorific ? 'い' : i) + 'ます', negative: s + a + 'ない', past: s + ta, pastNegative: s + a + 'なかった', te: s + te,
    potential: s + e + 'る', passive: s + a + 'れる', causative: s + a + 'せる', volitional: s + o + 'う',
    imperative: s + (honorific ? 'い' : e), conditional: s + e + 'ば', want: s + (honorific ? 'い' : i) + 'たい',
  };
  if (pos === 'v5r-i') {
    // ある: the negative is ない itself, and it has no potential, passive or causative.
    forms.negative = s.slice(0, -1) + 'ない';
    forms.pastNegative = s.slice(0, -1) + 'なかった';
    delete forms.potential;
    delete forms.passive;
    delete forms.causative;
  }
  return forms;
}

function suru(text) {
  const s = text.slice(0, -2);
  return {
    polite: s + 'します', negative: s + 'しない', past: s + 'した', pastNegative: s + 'しなかった', te: s + 'して',
    potential: s + 'できる', passive: s + 'される', causative: s + 'させる', volitional: s + 'しよう',
    imperative: s + 'しろ', conditional: s + 'すれば', want: s + 'したい',
  };
}

function kuru(text) {
  // In kana the stem vowel changes (き / こ / く); the kanji 来 hides it.
  const kanji = text.endsWith('来る');
  const s = text.slice(0, kanji ? -1 : -2);
  const [ki, ko, ku] = kanji ? ['', '', ''] : ['き', 'こ', 'く'];
  return {
    polite: s + ki + 'ます', negative: s + ko + 'ない', past: s + ki + 'た', pastNegative: s + ko + 'なかった', te: s + ki + 'て',
    potential: s + ko + 'られる', passive: s + ko + 'られる', causative: s + ko + 'させる', volitional: s + ko + 'よう',
    imperative: s + ko + 'い', conditional: s + ku + 'れば', want: s + ki + 'たい',
  };
}

function iAdjective(text, pos) {
  // いい conjugates from its older form よい.
  const s = pos === 'adj-ix' && text.endsWith('いい') ? text.slice(0, -2) + 'よ' : text.slice(0, -1);
  return {
    polite: text + 'です', negative: s + 'くない', past: s + 'かった', pastNegative: s + 'くなかった', te: s + 'くて',
    adverb: s + 'く', conditional: s + 'ければ',
  };
}

function naAdjective(text) {
  return {
    attributive: text + 'な', polite: text + 'です', negative: text + 'じゃない', past: text + 'だった',
    pastNegative: text + 'じゃなかった', te: text + 'で', adverb: text + 'に',
  };
}

const LABELS = [
  ['attributive', 'Before a noun'], ['polite', 'Polite'], ['negative', 'Negative'], ['past', 'Past'],
  ['pastNegative', 'Past negative'], ['te', 'て-form'], ['adverb', 'Adverb'], ['potential', 'Potential'],
  ['passive', 'Passive'], ['causative', 'Causative'], ['volitional', 'Volitional'], ['imperative', 'Command'],
  ['conditional', 'Conditional (ば)'], ['want', 'Want to (たい)'],
];

// Word classes in the order they are tried; a 勉強-type noun only becomes a する verb
// when nothing more specific applies.
const CLASSES = [
  [/^v1/, 'Ichidan verb', ichidan],
  [/^v5/, 'Godan verb', godan],
  [/^vk$/, 'Irregular verb (来る)', kuru],
  [/^vs-i$/, 'Irregular verb (する)', suru],
  [/^adj-ix?$/, 'い-adjective', iAdjective],
  [/^vs$/, 'する verb', (text) => suru(text + 'する')],
  [/^adj-na$/, 'な-adjective', naAdjective],
];

// Returns { title, rows: [{ key, label, written, reading }] } or null when the word
// doesn't conjugate. `reading` is '' when the word is written in kana already.
export function conjugations(entry, written, reading) {
  const tags = entry.senses.flatMap((sense) => sense.pos);
  for (const [pattern, title, build] of CLASSES) {
    const pos = tags.find((tag) => pattern.test(tag));
    if (!pos) continue;
    const forms = build(written, pos);
    const readings = reading ? build(reading, pos) : null;
    if (!forms) continue;
    return {
      title,
      rows: LABELS.filter(([key]) => forms[key]).map(([key, label]) => ({
        key,
        label,
        written: forms[key],
        reading: readings ? readings[key] : '',
      })),
    };
  }
  return null;
}
