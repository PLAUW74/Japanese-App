// Pinyin: the readings in data/zh/vocab.json are stored with tone numbers, as CC-CEDICT
// writes them — ai4 hao4. Numbers keep the data file small and ASCII, and they carry each
// syllable's tone where a tone mark would have to be read back off a letter. This module
// turns them into what a learner reads (àihào), says which tone a syllable has so it can be
// coloured, and loosens a typed answer enough to compare.
//
// It imports nothing, so js/ui.js can use it without the circular import that pulling in a
// language module would cause.

const VOWELS = "aeiouü";
const TONE_MARKS = {
  a: "āáǎàa", e: "ēéěèe", i: "īíǐìi",
  o: "ōóǒòo", u: "ūúǔùu", "ü": "ǖǘǚǜü",
};
// The four tone marks as combining characters. The diaeresis of ü is not one of them and
// has to survive: lǜ (green) and lù (road) are different words.
const TONE_COMBINERS = /[\u0304\u0301\u030c\u0300]/g;
const SYLLABLE = /^([a-zü]+)([1-5])?$/i;

/** The tone of one numbered syllable: 1-4, or 5 for the neutral tone. */
export function toneOf(syllable) {
  const match = SYLLABLE.exec(syllable.replace("u:", "ü").replace(/v/g, "ü"));
  return match && match[2] ? Number(match[2]) : 5;
}

/** ai4 -> ài. */
export function markSyllable(syllable) {
  const text = syllable.replace("u:", "ü").replace("U:", "Ü").replace(/v/g, "ü");
  const match = SYLLABLE.exec(text);
  if (!match) return text;
  const body = match[1];
  const tone = Number(match[2] || 5);
  if (tone === 5) return body;
  const lower = body.toLowerCase();
  // The mark goes on a, then o, then e; failing those, on the syllable's last vowel.
  let at = -1;
  for (const vowel of "aoe") {
    at = lower.indexOf(vowel);
    if (at >= 0) break;
  }
  if (at < 0) {
    for (const vowel of VOWELS) at = Math.max(at, lower.lastIndexOf(vowel));
  }
  if (at < 0) return body;
  let marked = TONE_MARKS[lower[at]][tone - 1];
  if (body[at] !== lower[at]) marked = marked.toUpperCase();
  return body.slice(0, at) + marked + body.slice(at + 1);
}

/** The syllables of a stored reading: ['ai4', 'hao4']. */
export const syllables = (pinyin) => String(pinyin || "").trim().split(/\s+/).filter(Boolean);

/** 'ai4 hao4' -> 'àihào', which is how pinyin is written. */
export const marked = (pinyin) => syllables(pinyin).map(markSyllable).join("");

/** The same, spaced out, for when the syllables need to be told apart. */
export const markedSpaced = (pinyin) => syllables(pinyin).map(markSyllable).join(" ");

/** [{ text, tone }] per syllable, for colouring each one by its tone. */
export const toned = (pinyin) => syllables(pinyin).map((s) => ({ text: markSyllable(s), tone: toneOf(s) }));

/** Tone marks off, ü folded to u, spacing and punctuation gone: for comparing loosely. */
export function plain(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(TONE_COMBINERS, "")
    .normalize("NFC")
    .toLowerCase()
    .replace(/u:/g, "u")
    .replace(/ü/g, "u")
    .replace(/[^a-z]/g, "");
}

/** The tones of a reading as a string, '44', so two spellings can be compared on tone. */
export const toneString = (pinyin) => syllables(pinyin).map(toneOf).join("");

/** What someone typed, reduced the same way as plain() but keeping any tone digits. */
export function typedTones(text) {
  const digits = String(text || "").match(/[1-5]/g);
  return digits ? digits.join("") : "";
}

/**
 * Whether a typed answer gives the word's reading.
 *
 * Tones count when the learner typed them, either as digits (ni3 hao3) or as marks (nǐ hǎo),
 * and are let go when they did not — typing "nihao" is accepted for 你好, because asking for
 * tones from a keyboard that cannot easily produce them would only teach avoidance. A
 * reading can be typed with or without spaces between the syllables.
 */
export function matchesReading(pinyin, answer) {
  const given = String(answer || "").trim();
  if (!given) return false;
  if (plain(given) !== plain(pinyin)) return false;
  const wantedTones = toneString(pinyin);
  const typed = typedTones(given);
  if (typed) return typed === wantedTones;
  // Tone marks instead of digits. Only judge by them when there is one for every syllable:
  // "nǐhǎo" has no syllable breaks to count against, and a half-marked answer would fail
  // for the wrong reason.
  const fromMarks = tonesFromMarks(given);
  if (fromMarks.length === wantedTones.length) return fromMarks === wantedTones;
  return true;
}

const MARK_TONE = (() => {
  const out = {};
  for (const [base, row] of Object.entries(TONE_MARKS)) {
    for (let tone = 1; tone <= 4; tone++) out[row[tone - 1]] = tone;
  }
  return out;
})();

/**
 * The tone marks of a spelling, in the order they appear: 'nǐ hǎo' -> '34'.
 *
 * Unspaced input gives no syllable boundaries to hang a neutral tone on, so this counts
 * only the marks that are there. The caller compares lengths before trusting it.
 */
export function tonesFromMarks(text) {
  let tones = "";
  for (const ch of String(text || "").toLowerCase().normalize("NFC")) {
    const tone = MARK_TONE[ch];
    if (tone) tones += tone;
  }
  return tones;
}
