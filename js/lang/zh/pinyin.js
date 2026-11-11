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

/**
 * Tone marks off, ü folded to u, spacing and punctuation gone: for comparing loosely.
 * A keyboard has no ü, and pinyin input methods take v for it, so lv is lü too.
 */
export function plain(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(TONE_COMBINERS, "")
    .normalize("NFC")
    .toLowerCase()
    .replace(/u:/g, "u")
    .replace(/ü/g, "u")
    .replace(/v/g, "u")
    .replace(/[^a-z]/g, "");
}

/** The tones of a reading as a string, '44', so two spellings can be compared on tone. */
export const toneString = (pinyin) => syllables(pinyin).map(toneOf).join("");

/** What someone typed, reduced the same way as plain() but keeping any tone digits. */
export function typedTones(text) {
  const digits = String(text || "").match(/[0-5]/g);
  return digits ? digits.join("").replace(/0/g, "5") : "";
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

/**
 * Whether a typed answer gives the reading *with its tones*, for the question that asks
 * for exactly that. Returns { ok, missing } — `missing` is true when the syllables were
 * right but no tones were given, so the learner can be told which half to fix.
 *
 * Tones can be typed as digits (hao3, with 5 or 0 or nothing for a neutral tone) or as
 * marks (hǎo). A neutral tone has no mark and is often left without a digit, so both are
 * compared with the neutral tones taken out as well as with them in.
 */
export function matchesReadingWithTones(pinyin, answer) {
  const given = String(answer || "").trim();
  if (!given || plain(given) !== plain(pinyin)) return { ok: false, missing: false };
  const wanted = toneString(pinyin);
  const withoutNeutral = wanted.replace(/5/g, "");
  const typed = typedTones(given) || tonesFromMarks(given);
  if (!typed) return { ok: false, missing: true };
  return { ok: typed === wanted || typed === withoutNeutral || typed.replace(/5/g, "") === withoutNeutral, missing: false };
}

/**
 * Readings that differ from this one by a single tone — 'ai4' gives 'ai1', 'ai2', 'ai3'.
 * As the wrong options of a multiple-choice question they make it a question about tones,
 * which is the half of a reading that is easiest to half-know.
 */
export function toneVariants(pinyin, count = 2) {
  const parts = syllables(pinyin);
  const out = [];
  const seen = new Set([parts.join(" ")]);
  // Change the toned syllables first; a neutral tone given a full tone reads oddly.
  const order = parts.map((s, i) => i).sort((a, b) => (toneOf(parts[a]) === 5) - (toneOf(parts[b]) === 5));
  for (const i of order) {
    const base = parts[i].replace(/[1-5]$/, "");
    for (const tone of [1, 2, 3, 4]) {
      if (out.length >= count) return out;
      if (tone === toneOf(parts[i])) continue;
      const next = [...parts];
      next[i] = `${base}${tone}`;
      const key = next.join(" ");
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(key);
    }
  }
  return out;
}
