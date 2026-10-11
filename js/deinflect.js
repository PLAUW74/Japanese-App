// Turns conjugated input (のみます, 食べなかった, 高くない) back into dictionary forms.
//
// Each rule rewrites a word ending. `out` is the word class the rewritten word
// must belong to; `in` is the class the conjugated form itself behaves as, which
// lets rules chain: 食べさせられました -> 食べさせられる (v1) -> 食べさせる (v1) -> 食べる.
// Classes: v1 (ichidan), v5 (godan), vs (する), vk (来る), adj (い-adjective),
// te (a て-form, never a dictionary word), noun-vs (noun that takes する), '' (nothing further).

const RULES = [];
const rule = (from, to, inType, out, why) => RULES.push({ from, to, in: inType, out, why });

// Endings that attach to the ます-stem.
const STEM_ENDINGS = [
  ['ます', '', 'polite'], ['ました', '', 'polite past'], ['ません', '', 'polite negative'],
  ['ませんでした', '', 'polite past negative'], ['ましょう', '', 'polite volitional'],
  ['たい', 'adj', 'want to'], ['なさい', '', 'polite command'], ['ながら', '', 'while doing'],
  ['すぎる', 'v1', 'too much'], ['やすい', 'adj', 'easy to'], ['にくい', 'adj', 'hard to'],
];

// Endings built on a て/た form, given its base ("食べ", "飲ん", "書い") and whether it is voiced (で/だ).
function teRules(base, to, out, voiced) {
  const [te, ta] = voiced ? ['で', 'だ'] : ['て', 'た'];
  rule(base + te, to, 'te', out, 'て-form');
  rule(base + ta, to, '', out, 'past');
  rule(base + ta + 'ら', to, '', out, 'conditional (たら)');
  rule(base + ta + 'り', to, '', out, 'たり form');
}

// Things that follow a て-form. They strip back to the て-form itself.
for (const te of ['て', 'で']) {
  for (const [ending, inType, why] of [
    ['いる', 'v1', 'progressive'], ['る', 'v1', 'progressive'], ['ください', '', 'request'],
    ['おく', 'v5', 'do in advance'], ['しまう', 'v5', 'completely / regrettably'], ['ある', 'v5', 'resulting state'],
    ['みる', 'v1', 'try doing'], ['いく', 'v5', 'go on doing'], ['ほしい', 'adj', 'want someone to'],
    ['あげる', 'v1', 'do for someone'], ['くれる', 'v1', 'do for me'], ['もらう', 'v5', 'have someone do'],
  ]) rule(te + ending, te, inType, 'te', why);
}

// Ichidan verbs: 食べ + ending -> 食べる
for (const [ending, inType, why] of STEM_ENDINGS) rule(ending, 'る', inType, 'v1', why);
rule('ない', 'る', 'adj', 'v1', 'negative');
rule('られる', 'る', 'v1', 'v1', 'passive / potential');
rule('れる', 'る', 'v1', 'v1', 'potential');
rule('させる', 'る', 'v1', 'v1', 'causative');
rule('よう', 'る', '', 'v1', 'volitional');
rule('れば', 'る', '', 'v1', 'conditional (ば)');
rule('ろ', 'る', '', 'v1', 'command');
teRules('', 'る', 'v1', false);

// Godan verbs, one column per dictionary ending.
const GODAN = {
  u: 'うくぐすつぬぶむる',
  a: 'わかがさたなばまら',
  i: 'いきぎしちにびみり',
  e: 'えけげせてねべめれ',
  o: 'おこごそとのぼもろ',
  te: ['っ', 'い', 'い', 'し', 'っ', 'ん', 'ん', 'ん', 'っ'],
};
[...GODAN.u].forEach((u, n) => {
  const [a, i, e, o] = [GODAN.a[n], GODAN.i[n], GODAN.e[n], GODAN.o[n]];
  for (const [ending, inType, why] of STEM_ENDINGS) rule(i + ending, u, inType, 'v5', why);
  rule(a + 'ない', u, 'adj', 'v5', 'negative');
  rule(a + 'れる', u, 'v1', 'v5', 'passive');
  rule(a + 'せる', u, 'v1', 'v5', 'causative');
  rule(a + 'される', u, 'v1', 'v5', 'causative passive');
  rule(e + 'る', u, 'v1', 'v5', 'potential');
  rule(e + 'ば', u, '', 'v5', 'conditional (ば)');
  rule(o + 'う', u, '', 'v5', 'volitional');
  teRules(GODAN.te[n], u, 'v5', 'ぐぬぶむ'.includes(u));
});
// 行く is the one godan verb with an irregular て-form.
for (const iku of ['い', '行']) teRules(iku + 'っ', iku + 'く', 'v5', false);

// い-adjectives: 高 + ending -> 高い
rule('くない', 'い', 'adj', 'adj', 'negative');
rule('かった', 'い', '', 'adj', 'past');
rule('くて', 'い', 'te', 'adj', 'て-form');
rule('く', 'い', '', 'adj', 'adverb form');
rule('ければ', 'い', '', 'adj', 'conditional (ば)');
rule('さ', 'い', '', 'adj', 'noun form');
rule('すぎる', 'い', 'v1', 'adj', 'too much');

// する, and nouns that take it (勉強します -> 勉強する -> 勉強).
for (const [ending, inType, why] of STEM_ENDINGS) rule('し' + ending, 'する', inType, 'vs', why);
rule('しない', 'する', 'adj', 'vs', 'negative');
rule('される', 'する', 'v1', 'vs', 'passive');
rule('させる', 'する', 'v1', 'vs', 'causative');
rule('できる', 'する', 'v1', 'vs', 'potential');
rule('しよう', 'する', '', 'vs', 'volitional');
rule('すれば', 'する', '', 'vs', 'conditional (ば)');
rule('しろ', 'する', '', 'vs', 'command');
teRules('し', 'する', 'vs', false);
rule('する', '', 'vs', 'noun-vs', null);

// 来る, written in kana or with its kanji.
for (const [ki, ko, ku, to] of [['き', 'こ', 'く', 'くる'], ['来', '来', '来', '来る']]) {
  for (const [ending, inType, why] of STEM_ENDINGS) rule(ki + ending, to, inType, 'vk', why);
  rule(ko + 'ない', to, 'adj', 'vk', 'negative');
  rule(ko + 'られる', to, 'v1', 'vk', 'passive / potential');
  rule(ko + 'させる', to, 'v1', 'vk', 'causative');
  rule(ko + 'よう', to, '', 'vk', 'volitional');
  rule(ku + 'れば', to, '', 'vk', 'conditional (ば)');
  rule(ko + 'い', to, '', 'vk', 'command');
  teRules(ki, to, 'vk', false);
}

const MAX_STEPS = 4;
const MAX_CANDIDATES = 300;
// A one-character "verb" or "adjective" is only ever a stray ending.
const MIN_LENGTH = { v1: 2, v5: 2, adj: 2 };

// Returns [{ term, type, why }]: possible dictionary forms of `text`, the word
// class each must have to be a real match, and the conjugations undone to reach
// it, innermost first.
export function deinflect(text) {
  const found = [];
  const seen = new Set();
  const queue = [{ term: text, type: null, why: [] }];
  for (let n = 0; n < queue.length && queue.length < MAX_CANDIDATES; n++) {
    const current = queue[n];
    if (current.why.length >= MAX_STEPS) continue;
    for (const r of RULES) {
      if (current.type !== null && r.in !== current.type) continue;
      if (!current.term.endsWith(r.from)) continue;
      const term = current.term.slice(0, current.term.length - r.from.length) + r.to;
      if (term.length < (MIN_LENGTH[r.out] || 1)) continue;
      const key = `${term}|${r.out}`;
      if (seen.has(key)) continue;
      seen.add(key);
      // The bare て-form step is noise once something more specific followed it (食べている).
      const named = r.why && current.type !== 'te';
      const next = { term, type: r.out, why: named ? [r.why, ...current.why] : current.why };
      queue.push(next);
      if (r.out !== 'te') found.push(next);
    }
  }
  return found;
}
