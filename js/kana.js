// Kana helpers shared by the page and the dictionary worker.

const TABLE = (() => {
  const t = { a: 'あ', i: 'い', u: 'う', e: 'え', o: 'お', '-': 'ー' };
  const vowels = 'aiueo';
  const rows = {
    k: 'かきくけこ', s: 'さしすせそ', t: 'たちつてと', n: 'なにぬねの', h: 'はひふへほ',
    m: 'まみむめも', r: 'らりるれろ', g: 'がぎぐげご', z: 'ざじずぜぞ', d: 'だぢづでど',
    b: 'ばびぶべぼ', p: 'ぱぴぷぺぽ',
  };
  for (const [consonant, row] of Object.entries(rows)) {
    [...row].forEach((kana, i) => { t[consonant + vowels[i]] = kana; });
  }
  Object.assign(t, {
    ya: 'や', yu: 'ゆ', yo: 'よ', wa: 'わ', wo: 'を', wi: 'うぃ', we: 'うぇ',
    shi: 'し', chi: 'ち', tsu: 'つ', fu: 'ふ', ji: 'じ',
    fa: 'ふぁ', fi: 'ふぃ', fe: 'ふぇ', fo: 'ふぉ',
    va: 'ゔぁ', vi: 'ゔぃ', vu: 'ゔ', ve: 'ゔぇ', vo: 'ゔぉ',
    she: 'しぇ', che: 'ちぇ', je: 'じぇ',
    xa: 'ぁ', xi: 'ぃ', xu: 'ぅ', xe: 'ぇ', xo: 'ぉ',
    xya: 'ゃ', xyu: 'ゅ', xyo: 'ょ', xtu: 'っ', xtsu: 'っ',
  });
  const glides = {
    ky: 'き', gy: 'ぎ', sh: 'し', sy: 'し', ch: 'ち', ty: 'ち', j: 'じ', jy: 'じ', zy: 'じ',
    ny: 'に', hy: 'ひ', by: 'び', py: 'ぴ', my: 'み', ry: 'り', dy: 'ぢ',
  };
  for (const [prefix, kana] of Object.entries(glides)) {
    t[prefix + 'a'] = kana + 'ゃ';
    t[prefix + 'u'] = kana + 'ゅ';
    t[prefix + 'o'] = kana + 'ょ';
  }
  return t;
})();

const VOWEL_OR_Y = /[aiueoy]/;
const DOUBLING = /[bcdfghjkmpqrstvwxyz]/;

// Romaji -> hiragana. Anything that isn't romaji passes through untouched, so a
// result that still holds Latin letters wasn't romaji. `partial` keeps a trailing
// "n" as typed, for converting while the user is still typing.
export function toHiragana(input, partial = false) {
  const s = input.toLowerCase();
  let out = '';
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    const next = s[i + 1];
    if (c === 'n') {
      if (next === "'") { out += 'ん'; i += 2; continue; }
      if (next === 'n') {
        // "konna" -> こんな, but "onna" typed as "onnna" also works.
        const after = s[i + 2];
        out += 'ん';
        i += after && VOWEL_OR_Y.test(after) ? 1 : 2;
        continue;
      }
      if (next === undefined) { out += partial ? input[i] : 'ん'; i += 1; continue; }
      if (!VOWEL_OR_Y.test(next)) { out += 'ん'; i += 1; continue; }
    } else if (DOUBLING.test(c) && (c === next || (c === 't' && next === 'c' && s[i + 2] === 'h'))) {
      out += 'っ';
      i += 1;
      continue;
    }
    let matched = false;
    for (let len = 4; len >= 1; len--) {
      const kana = TABLE[s.substr(i, len)];
      if (kana) { out += kana; i += len; matched = true; break; }
    }
    if (!matched) { out += input[i]; i += 1; }
  }
  return out;
}

export function kataToHira(text) {
  let out = '';
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    out += code >= 0x30a1 && code <= 0x30f6 ? String.fromCharCode(code - 0x60) : ch;
  }
  return out;
}

export function hiraToKata(text) {
  let out = '';
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    out += code >= 0x3041 && code <= 0x3096 ? String.fromCharCode(code + 0x60) : ch;
  }
  return out;
}

export const hasJapanese =(text) => /[぀-ヿ㐀-鿿ｦ-ﾟ々]/.test(text);
export const isKana = (text) => /^[぀-ヿー]+$/.test(text);
export const isKanji = (ch) => /[㐀-鿿々]/.test(ch);
