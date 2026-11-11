"""Builds data/zh/ (the Chinese word, character and grammar lists) from the raw sources
in data-src/zh/. Driven by tools/build-zh-data.ps1, which downloads those sources first.

    python -I tools/build_zh_data.py --src data-src/zh --out data/zh

Standard library only, so the build needs nothing installed. Reading the syllabus PDF for
the topic and task lists is a separate, optional step (tools/build_zh_topics.py).

Sources
  HSK 3.0 word and character lists   https://github.com/krmanik/HSK-3.0
  English meanings and pinyin        CC-CEDICT (CC BY-SA 4.0), https://www.mdbg.net/

Two editions of the HSK 3.0 lists exist and they do not agree. The 2021 standard
(GF 0025-2021) is the one whose band totals are published everywhere and the one the study
plan counts against, so it sets each word's band. The 2025 exam syllabus moves a good many
words and marks those that sit at more than one level; where it has an opinion it is kept
alongside, as band2025, rather than thrown away.
"""

import argparse
import gzip
import json
import re
import sys
import unicodedata
from collections import defaultdict
from datetime import date, timezone, datetime
from pathlib import Path

BANDS = range(1, 7)

# Cumulative word and character totals the HSK 3.0 (2021) standard publishes. The build
# checks itself against these and reports anything that does not line up.
EXPECT_WORDS = {1: 500, 2: 1272, 3: 2245, 4: 3245, 5: 4316, 6: 5456}
EXPECT_CHARS = {1: 300, 2: 600, 3: 900, 4: 1200, 5: 1500, 6: 1800}

# The part-of-speech abbreviations the HSK lists use.
POS_EN = {
    "名": "noun", "动": "verb", "形": "adjective", "数": "numeral", "量": "measure word",
    "代": "pronoun", "副": "adverb", "介": "preposition", "连": "conjunction", "助": "particle",
    "叹": "interjection", "拟声": "onomatopoeia", "前缀": "prefix", "后缀": "suffix",
    "区别": "distinguishing word", "成语": "idiom", "习语": "idiom", "短语": "phrase",
    "固定短语": "set phrase", "熟语": "expression", "方位": "locative", "时间": "time word",
}

VOWELS = "aeiouü"
TONE_MARKS = {
    "a": "āáǎàa", "e": "ēéěèe", "i": "īíǐìi",
    "o": "ōóǒòo", "u": "ūúǔùu", "ü": "ǖǘǚǜü",
}
# The four tone marks, as combining characters. The diaeresis of ü is not one of them and
# has to survive: lǜ and lù are different words.
TONE_COMBINERS = "̄́̌̀"


def syllable_to_marked(syllable):
    """ai4 -> ài. CC-CEDICT writes ü as u:, and a neutral tone as 5 (or nothing)."""
    text = syllable.replace("u:", "ü").replace("U:", "Ü").replace("v", "ü")
    match = re.match(r"^([a-zA-Zü]+)([1-5])?$", text)
    if not match:
        return text
    body, tone = match.group(1), int(match.group(2) or 5)
    if tone == 5:
        return body
    lower = body.lower()
    # The mark goes on a, then o, then e; failing those, on the last vowel of the syllable.
    for vowel in "aoe":
        at = lower.find(vowel)
        if at >= 0:
            break
    else:
        at = max((lower.rfind(v) for v in VOWELS), default=-1)
    if at < 0:
        return body
    marked = TONE_MARKS[lower[at]][tone - 1]
    if body[at].isupper():
        marked = marked.upper()
    return body[:at] + marked + body[at + 1:]


def numbered_to_marked(pinyin):
    """'ai4 hao4' -> 'àihào', for comparing against the HSK lists' own spelling."""
    return "".join(syllable_to_marked(s) for s in pinyin.split())


def drop_tone_marks(text):
    """ài -> ai, but lǜ -> lü: only the four tone marks go."""
    decomposed = unicodedata.normalize("NFD", text)
    kept = "".join(c for c in decomposed if c not in TONE_COMBINERS)
    return unicodedata.normalize("NFC", kept)


def toneless(text):
    """A spelling reduced for loose comparison: no tones, no spacing, and ü folded to u.

    The Anki export of the syllabus writes 女 as nǔ, not nǚ — it drops the umlaut, so 16 of
    the 女 words would otherwise look like disagreements with CC-CEDICT, which has it right.
    Folding the two together here only ever widens a fallback match; the exact comparison
    that runs first still tells ü and u apart.
    """
    plain = drop_tone_marks(text.lower()).replace("u:", "ü").replace("v", "ü")
    return re.sub(r"[^a-z]", "", plain.replace("ü", "u"))


def hsk_to_numbered(marked):
    """The HSK lists write a syllable as 'ài4' — the mark and the tone. Make it 'ai4'."""
    out = []
    for syllable in marked.split():
        match = re.match(r"^(.*?)([1-5])$", syllable)
        body, tone = (match.group(1), match.group(2)) if match else (syllable, "5")
        out.append(drop_tone_marks(body).replace("u:", "ü").replace("v", "ü") + tone)
    return " ".join(out)


def normalise_cedict_pinyin(pinyin):
    """CC-CEDICT writes ü as u:. Keep one spelling everywhere."""
    return " ".join(s.replace("u:", "ü").replace("U:", "Ü") for s in pinyin.split())


# ---- reading the sources ----

def read_lines(path):
    return [line.strip() for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def read_hsk2021_words(src):
    """band -> [word], from the 2021 standard's lists."""
    return {band: read_lines(src / "v2021" / f"words_{band}.txt") for band in BANDS}


def read_hsk2021_chars(src):
    return {band: read_lines(src / "v2021" / f"hanzi_{band}.txt") for band in BANDS}


# The 2021 lists also ship as Anki decks, whose pinyin column tags every syllable with its
# tone: <span class="t4">ài</span>. That is the syllabus's own reading for the word, which
# makes it the thing to trust over guessing from a dictionary with several to choose from.
ANKI_PINYIN = re.compile(r'<span class=""?t(\d)""?>([^<]+)</span>')


HANZI = re.compile(r"[㐀-鿿]")


def read_hsk2021_pinyin(src):
    """word -> [numbered pinyin], from the Anki export of the 2021 lists.

    A card for a word with more than one reading lists them all in the one cell, so 炸 comes
    back as 'zha2 zha4' and 正当 as 'zheng4 dang1 zheng4 dang4'. A word of n characters has n
    syllables, so a cell holding a multiple of n is that many alternative readings, not one
    long one. Nearly every word has just the one.
    """
    out = {}
    for band in BANDS:
        path = src / "v2021" / f"pin_{band}.tsv"
        if not path.exists():
            continue
        for line in read_lines(path):
            cols = line.split("\t")
            if len(cols) < 3:
                continue
            word = cols[0].strip()
            found = ANKI_PINYIN.findall(cols[2])
            if not word or found == [] or word in out:
                continue
            # Tone 0 is the neutral tone, which pinyin numbers as 5.
            syllables = [f"{s}{t if t != '0' else '5'}" for t, s in found]
            length = len(HANZI.findall(word)) or 1
            if len(syllables) > length and len(syllables) % length == 0:
                readings = [syllables[i:i + length] for i in range(0, len(syllables), length)]
            else:
                readings = [syllables]
            out[word] = [hsk_to_numbered(" ".join(r)) for r in readings]
    return out


def read_hsk2025_words(src):
    """word -> {'pinyin', 'pos', 'bands'}, from the 2025 exam syllabus.

    Its level column reads like '1（4）': the plain number is where the word is taught, the
    bracketed ones are further levels that use another of its meanings or word classes.
    """
    out = {}
    for band in BANDS:
        path = src / f"words_{band}.tsv"
        if not path.exists():
            continue
        for line in read_lines(path):
            cols = line.split("\t")
            if len(cols) < 4:
                continue
            _, levels, word, pinyin = cols[0], cols[1], cols[2].strip(), cols[3].strip()
            pos = cols[4].strip() if len(cols) > 4 else ""
            found = [int(n) for n in re.findall(r"\d+", levels)]
            entry = out.setdefault(word, {"pinyin": pinyin, "pos": pos, "bands": set()})
            entry["bands"].update(found or [band])
            if not entry["pinyin"]:
                entry["pinyin"] = pinyin
    return out


def read_handwritten(src):
    """The characters a learner has to write by hand, not merely recognise."""
    chars = {}
    for name, bands in (("1-2", (1, 2)), ("3", (3,)), ("4", (4,)), ("5", (5,)), ("6", (6,))):
        path = src / f"handwritten_{name}.txt"
        if not path.exists():
            continue
        for ch in read_lines(path):
            chars.setdefault(ch, min(bands))
    return chars


CEDICT_LINE = re.compile(r"^(\S+)\s+(\S+)\s+\[([^\]]*)\]\s+/(.*)/\s*$")
# CC-CEDICT writes a cross-referenced word as 汉字[han4 zi4]; the reading is noise in a gloss.
GLOSS_REF = re.compile(r"\[[a-zA-Z0-9:\s,·]*\]")


def read_cedict(path):
    """simplified -> [{'pinyin', 'glosses', 'classifiers'}], in file order."""
    entries = defaultdict(list)
    published = ""
    opener = gzip.open if path.suffix == ".gz" else open
    with opener(path, "rt", encoding="utf-8") as handle:
        for line in handle:
            if line.startswith("#"):
                if "#! date=" in line:
                    published = line.split("=", 1)[1].strip()
                continue
            match = CEDICT_LINE.match(line.rstrip("\n"))
            if not match:
                continue
            _trad, simp, pinyin, body = match.groups()
            glosses, classifiers = [], []
            for part in body.split("/"):
                part = part.strip()
                if not part:
                    continue
                if part.startswith("CL:"):
                    for item in part[3:].split(","):
                        word = GLOSS_REF.sub("", item).strip()
                        if word:
                            classifiers.append(word)
                    continue
                glosses.append(GLOSS_REF.sub("", part).strip())
            if glosses:
                entries[simp].append({
                    "pinyin": normalise_cedict_pinyin(pinyin),
                    "glosses": glosses,
                    "classifiers": classifiers,
                })
    return entries, published


# ---- matching a word to its dictionary entry ----

SIDE_ENTRY = re.compile(r"^(variant of|old variant of|surname |abbr\. for|see |used in|Japanese variant)", re.I)


def quality(candidate):
    """How likely a CC-CEDICT entry is to be the everyday word rather than a side entry.

    Higher is better. A capitalised reading is a proper noun — CC-CEDICT lists 别 as the
    surname Biè and 王 as Wáng, and without this those win over the words a learner wants.
    """
    score = 0
    if candidate["pinyin"][:1].isupper():
        score -= 100
    if all(SIDE_ENTRY.match(g) for g in candidate["glosses"]):
        score -= 50
    score += min(len(candidate["glosses"]), 8)
    return score


def choose_entry(word, hsk_readings, candidates, already, log):
    """Picks the CC-CEDICT entry for one listing of an HSK word.

    `hsk_readings` is every reading the syllabus gives the word, so a candidate matching one
    of them wins: on exact tones first, then ignoring them. `already` holds the readings used
    by earlier listings of the same word — the syllabus lists a word once per reading, so a
    repeat asks for the next reading rather than the same one again. With nothing to match
    on, the best-looking entry wins (see quality()).
    """
    fresh = [c for c in candidates if c["pinyin"] not in already]
    if not fresh:
        return None, ("exhausted" if candidates else "missing")

    wanted = [r.lower() for r in hsk_readings if r]
    if wanted:
        exact = [c for c in fresh if c["pinyin"].lower() in wanted]
        if exact:
            return max(exact, key=quality), ("second" if already else "pinyin")
        loose = {toneless(r) for r in wanted}
        near = [c for c in fresh if toneless(c["pinyin"]) in loose]
        if near:
            best = max(near, key=quality)
            log.append(f"  {word}: syllabus says {'/'.join(hsk_readings)}, "
                       f"took the closest reading {best['pinyin']}")
            return best, "toneless"

    best = max(fresh, key=quality)
    if already:
        log.append(f"  {word}: listed again, so another reading — took {best['pinyin']} "
                   f"(already had {', '.join(sorted(already))})")
        return best, "second"
    if wanted:
        log.append(f"  {word}: syllabus says {'/'.join(hsk_readings)}, CC-CEDICT has "
                   f"{', '.join(c['pinyin'] for c in fresh[:4])}; took {best['pinyin']}")
        return best, "disagree"
    if len(fresh) > 1:
        log.append(f"  {word}: {len(fresh)} readings and no syllabus pinyin; took {best['pinyin']}")
        return best, "ambiguous"
    return best, "only"


def word_id(hanzi, pinyin, taken):
    """A stable id built from the word itself, so a rebuild keeps a learner's review history.

    Sequential ids would shift whenever the source lists change and orphan every card.
    """
    text = f"{hanzi}\t{pinyin}"
    value = 5381
    for ch in text:
        value = ((value * 33) ^ ord(ch)) & 0xFFFFFFFF
    value = value % 900000000 + 100000000
    while value in taken:        # a collision is unlikely; resolve it the same way every build
        value = (value + 1 - 100000000) % 900000000 + 100000000
    taken.add(value)
    return value


# ---- building ----

def build_vocab(src, out, log):
    words2021 = read_hsk2021_words(src)
    words2025 = read_hsk2025_words(src)
    pinyin2021 = read_hsk2021_pinyin(src)
    cedict, cedict_date = read_cedict(src / "cedict.txt.gz")
    log.append(f"CC-CEDICT published {cedict_date or 'unknown'}, {len(cedict)} simplified headwords")
    log.append(f"syllabus pinyin for {len(pinyin2021)} words")

    rows, taken = [], set()
    used_readings = defaultdict(set)   # word -> the readings already given an entry
    by_reading = {}                    # (word, reading) -> its row, for merging repeats
    counts = defaultdict(int)
    no_gloss, no_pinyin, merged = [], [], []
    cumulative = 0

    for band in BANDS:
        for word in words2021[band]:
            hsk = words2025.get(word)
            # The syllabus's own readings first; the 2025 list's spelling is only a fallback
            # for the handful the Anki export misses, and carries no tone digits.
            hsk_readings = pinyin2021.get(word) or ([hsk["pinyin"]] if hsk and hsk["pinyin"] else [])
            entry, how = choose_entry(
                word, hsk_readings, cedict.get(word, []), used_readings[word], log)
            counts[how] += 1

            if entry is None:
                # Keep the word: it is on the syllabus whether or not CC-CEDICT knows it.
                unused = [r for r in hsk_readings if r not in used_readings[word]]
                pinyin = (unused or hsk_readings or [""])[0]
                glosses, classifiers = [], []
                if how == "missing":
                    no_gloss.append(word)
            else:
                pinyin = entry["pinyin"]
                glosses, classifiers = entry["glosses"][:8], entry["classifiers"][:3]
            if not pinyin:
                no_pinyin.append(word)
            used_readings[word].add(pinyin)

            pos = ""
            if hsk and hsk["pos"]:
                tags = [POS_EN.get(t.strip("（）() "), t.strip("（）() "))
                        for t in re.split(r"[、,，]", hsk["pos"]) if t.strip("（）() ")]
                pos = ",".join(dict.fromkeys(tags))
            band2025 = min(hsk["bands"]) if hsk and hsk["bands"] else 0

            # A word listed twice usually means two readings, but sometimes two word classes
            # with one reading (好 as "good" and as "very"). That is one card, not two.
            existing = by_reading.get((word, pinyin))
            if existing is not None:
                merged.append(word)
                existing[5] = min(existing[5], band)
                continue

            row = [
                word_id(word, pinyin, taken), word, pinyin, glosses, pos, band,
                band2025 if band2025 != band else 0,
                classifiers,
            ]
            by_reading[(word, pinyin)] = row
            rows.append(row)
        cumulative += len(words2021[band])
        expected = EXPECT_WORDS[band]
        mark = "ok" if cumulative == expected else f"OFF BY {cumulative - expected:+d}"
        log.append(f"  band {band}: {len(words2021[band]):5d} entries, {cumulative:5d} cumulative "
                   f"(published {expected}) {mark}")

    distinct = len(used_readings)
    log.append(f"{cumulative} listings became {len(rows)} cards for {distinct} distinct words: "
               f"{len(rows) - distinct} are a further reading of a word already listed, and "
               f"{len(merged)} repeat listings were the same reading again (a second word "
               f"class, not a second sound) and merged: {' '.join(sorted(set(merged)))}")
    log.append(f"readings: {counts['pinyin']} matched the syllabus exactly, "
               f"{counts['toneless']} matched ignoring tones, {counts['disagree']} disagreed with it, "
               f"{counts['only']} had one candidate, {counts['ambiguous']} had no syllabus pinyin, "
               f"{counts['second']} were a second reading, "
               f"{counts['missing']} are not in CC-CEDICT, {counts['exhausted']} ran out of readings")
    if no_gloss:
        log.append(f"  no English for {len(no_gloss)}: {' '.join(no_gloss)}")
    if no_pinyin:
        log.append(f"  no pinyin for {len(no_pinyin)}: {' '.join(no_pinyin)}")

    write_json(out / "vocab.json", {
        "date": date.today().isoformat(),
        "source": "HSK 3.0 word list (GF 0025-2021) with meanings from CC-CEDICT",
        "cedict": cedict_date,
        # [id, hanzi, pinyin, [gloss], pos, band, band2025 (0 = same as band), [classifier]]
        "words": rows,
    }, "words")
    return rows


def build_characters(src, out, log):
    chars2021 = read_hsk2021_chars(src)
    handwritten = read_handwritten(src)
    rows, seen = [], {}
    cumulative = 0
    for band in BANDS:
        for ch in chars2021[band]:
            if ch in seen:
                log.append(f"  character {ch}: in band {seen[ch]} and again in band {band}; kept the first")
                continue
            seen[ch] = band
            rows.append([ch, band, 1 if ch in handwritten else 0])
        cumulative += len(chars2021[band])
        expected = EXPECT_CHARS[band]
        mark = "ok" if cumulative == expected else f"OFF BY {cumulative - expected:+d}"
        log.append(f"  band {band}: {len(chars2021[band])} characters, {cumulative} cumulative "
                   f"(published {expected}) {mark}")
    write_count = sum(1 for r in rows if r[2])
    unknown = [c for c in handwritten if c not in seen]
    log.append(f"  {write_count} of {len(rows)} are written by hand, not only recognised")
    if unknown:
        log.append(f"  {len(unknown)} handwritten characters are not in the bands 1-6 list: {' '.join(unknown[:20])}")
    write_json(out / "characters.json", {
        "date": date.today().isoformat(),
        "source": "HSK 3.0 character list (GF 0025-2021); handwriting from the 2025 exam syllabus",
        # [hanzi, band, write (1 = has to be written by hand)]
        "chars": rows,
    }, "chars")
    return rows


def build_grammar(src, out, log):
    rows = []
    for band in BANDS:
        path = src / f"grammar_{band}.json"
        if not path.exists():
            log.append(f"  band {band}: no grammar file")
            continue
        items = json.loads(path.read_text(encoding="utf-8"))
        for n, item in enumerate(items):
            category = item.get("类别", "").strip()
            name = item.get("类别名称", "").strip()
            detail = item.get("细目", "").strip()
            content = item.get("语法内容", "").strip()
            if not (name or content):
                continue
            # The content lists its patterns separated by the Chinese enumeration comma.
            patterns = [p.strip() for p in content.split("、") if p.strip()]
            rows.append([f"g{band}-{n + 1}", band, category, name, detail, patterns])
        log.append(f"  band {band}: {sum(1 for r in rows if r[1] == band)} grammar points")
    write_json(out / "grammar.json", {
        "date": date.today().isoformat(),
        "source": "HSK 3.0 grammar syllabus, 2025 edition. Point names are the syllabus's own Chinese.",
        # [id, band, category, name, detail, [pattern]]
        "points": rows,
    }, "points")
    return rows


def build_bct(src, out, log):
    """The Business Chinese Test B word list, the plan's other target."""
    path = src / "bct_b.txt"
    if not path.exists():
        log.append("  no BCT B list")
        return []
    words = []
    for line in read_lines(path):
        cols = line.split("\t")
        word = (cols[1] if len(cols) > 1 else cols[0]).strip()
        if word:
            words.append(word)
    log.append(f"  BCT B: {len(words)} words")
    write_json(out / "bct.json", {
        "date": date.today().isoformat(),
        "source": "Business Chinese Test (BCT) B vocabulary list",
        "words": words,
    }, "words")
    return words


def write_json(path, payload, rows_key):
    """One row per line: readable in a diff, and still a single parse at runtime."""
    rows = payload[rows_key]
    head = {k: v for k, v in payload.items() if k != rows_key}
    parts = [json.dumps(head, ensure_ascii=False)[:-1]]
    parts.append(f', "{rows_key}":[\n')
    parts.append(",\n".join(json.dumps(row, ensure_ascii=False, separators=(",", ":")) for row in rows))
    parts.append("\n]}\n")
    path.write_text("".join(parts), encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--src", required=True, type=Path)
    parser.add_argument("--out", required=True, type=Path)
    args = parser.parse_args()
    src, out = args.src.resolve(), args.out.resolve()
    out.mkdir(parents=True, exist_ok=True)

    log = [f"Chinese data built {datetime.now(timezone.utc).isoformat(timespec='seconds')}", ""]
    log.append("WORDS")
    words = build_vocab(src, out, log)
    log.append("")
    log.append("CHARACTERS")
    chars = build_characters(src, out, log)
    log.append("")
    log.append("GRAMMAR")
    grammar = build_grammar(src, out, log)
    log.append("")
    log.append("BCT")
    build_bct(src, out, log)

    report = "\n".join(log) + "\n"
    (src / "build-log.txt").write_text(report, encoding="utf-8")
    sys.stdout.reconfigure(encoding="utf-8")
    print(report)
    print(f"Wrote {len(words)} words, {len(chars)} characters, {len(grammar)} grammar points to {out}")
    print(f"Full log: {src / 'build-log.txt'}")


if __name__ == "__main__":
    main()
