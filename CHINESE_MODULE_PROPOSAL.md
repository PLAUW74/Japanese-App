# Chinese module: analysis and proposal

Answer to `CHINESE_MODULE_BUILD_PLAN.md` §2 / milestone M1 — the existing-app review and the
language-split proposal, plus feature ideas on top of the plan.

Written against the app as it stands at `ae2b26d`.

---

## 1. What the app is today

Plain ES modules, no build step, PWA, static-hostable. 4,650 lines of JS, 990 of CSS.

| Piece | Where | Notes |
|---|---|---|
| Router | `js/app.js` | Hash routes (`#/words`), a flat `factories` map, cross-fade between pages |
| Store | `js/store.js` | One `localStorage` key, `kotoba:v1`. Words, lists, SRS schedule, daily log, kana tallies, mistakes, note answers, settings |
| SRS | `js/store.js` | SM-2-ish: `interval`, `ease`, `reps`, `lapses`. Wrong answers reset; right answers only extend when the card was actually due |
| Daily challenge | `js/store.js` | `CHALLENGE_SIZE = 10`, picked once a day from the most overdue |
| Sync | `js/sync.js` | Firebase Auth + Firestore, `users/{uid}/words/{id}`, `/meta/lists`, `/devices/{id}`, `/answers/{page}`. Per-device logs merged on read, so two devices never clobber each other |
| Dictionary | `js/dict.js`, `js/dict-worker.js` | 26 MB `data/dict.json` parsed in a worker. Protocol: `search`, `random`, `verbs`, `get`, `words`, `segments` |
| Shared UI | `js/ui.js` | `h()`, toasts, `speak()`, furigana, ruby markup, word-saver chips, word editor, segmented controls, quiz switcher |
| Views | `js/views/*.js` | dictionary, vocab, quiz, kana, verbs, grammar, mistakes, notes, reading, stats, charts |
| Content shelves | `notes/`, `reading/` | `index.json` + one HTML file each, `<span class="gap">` blanks become synced inputs |
| Motion | `pager.js`, `popin.js`, `stagger.js`, `countup.js`, `typewriter.js` | Pure presentation, no language in them |

**There is no AI integration anywhere.** `grep` for anthropic/claude/openai across `js/` returns
nothing. The build plan's §4.4, §4.6 and §6 all say "the same Claude correction flow as Japanese" —
that flow does not exist yet and has to be built from scratch. See §6 below; it is the one item
that needs a decision before building.

---

## 2. The toggle: yes, but language-prefixed routes

Recommendation: **one app, one store, one sync account, a toggle in the topbar** — not a fork, and
not two independent apps sharing a repo.

The reasons are concrete, not tidiness:

- The SRS engine, the mistakes list with its cross-device merge, the streak, the stats page, the
  sync layer and every motion module are already language-neutral. Forking means maintaining two
  copies of `store.js` and `sync.js`, which is where all the subtle code lives.
- One Firestore account, one streak, one theme choice.
- **Nigel already knows kanji.** A shared store makes "this hanzi is in your Japanese words — here
  is its Japanese reading and meaning" a lookup, not an integration. No other app can do that.
  See §5, idea 4.

### Routes

Namespace them: `#/zh/quiz`, `#/ja/quiz`. The toggle is then a link that keeps the sub-route when
both languages have it and falls back to that language's home when they don't. Deep links and the
back button keep working, and the installed PWA reopens where it was left.

`js/app.js` changes shape slightly: `parseRoute()` returns `{ lang, next, sub }`, the tab bar is
built from the adapter rather than hardcoded in `index.html`, and `factories` becomes per-language.

### Store

Today the state is flat. Namespace the learner-owned collections per language and keep the rest
shared:

```
kotoba:v1
  settings      shared: theme-adjacent prefs
  langs
    ja  { words, lists, deleted, log, mistakes, cleared, vocab, answers, settings, kana }
    zh  { words, lists, deleted, log, mistakes, cleared, vocab, answers, settings,
          grammar, plan, journal, checkpoints }
    others   per-device merge, as now, one level deeper
```

- `streak()` sums `log` across both languages — one study habit, one streak. Per-language accuracy
  stays available because the logs are separate.
- `dueWords`, `recordAnswer`, `dailyChallenge`, `recordMistake` etc. all take a `lang` or read a
  current-language module variable. The internals do not change at all.
- Migration: on first load, if the old flat shape is present, move it under `langs.ja` and bump to
  `v2`. One function, ~15 lines, and `importData` keeps accepting old backups.
- Firestore paths gain a segment: `users/{uid}/langs/{lang}/words/{id}`. `takeDirty` /
  `applyRemote` already pass documents around opaquely, so this is a path change plus a loop over
  two languages.

### `CHALLENGE_SIZE = 10` will not work for this plan

Worth flagging early. 78 weeks is 546 days. HSK bands 1–6 is 5,456 words, so 10 cards a day does
not even introduce each word once, let alone review it. At ~7 reviews per word over its life the
plan implies roughly **75 reviews a day**, with maybe 20–40 *new* cards a day during the heavy
phases.

So the challenge needs to become per-language and split into two limits — new cards and reviews —
in `settings`, rather than one shared constant. This is a real change to `store.js`, not a config
tweak, because `pickDue()` currently has no notion of "new".

---

## 3. The language-agnostic split

A language adapter, one module per language, passed to the views:

```js
// js/lang/zh.js
export default {
  code: 'zh',
  label: '中文',
  mark: '汉',                 // the topbar brand glyph
  htmlLang: 'zh-CN',
  voice: 'zh',                // for ui.js speak()
  level: { key: 'band', label: (n) => `HSK ${n}`, max: 6 },
  tabs: [...],                 // what the topbar shows
  routes: { ... },             // view factories, incl. the Chinese-only ones
  dict: zhDict,                // same worker protocol as dict.js
  ruby: { render, toMarkup, markupReading },
  answer: { matchesWord, matchesMeaning, normalizeInput },
};
```

### Reuse unchanged

`pager.js`, `popin.js`, `stagger.js`, `countup.js`, `typewriter.js`, `theme.js`, `dropdown.js`,
`motion-prompt-motion.js`, `views/charts.js`, `sw.js` (bump the cache names).

### Reuse with a parameter

| Module | What is Japanese about it | Change |
|---|---|---|
| `store.js` | nothing in the SRS itself; `kana` tallies are JA-only | namespace per language; `kana` lives under `langs.ja` |
| `sync.js` | nothing | add a `lang` path segment, loop over languages |
| `ui.js` | `speak()` hardcodes `ja-JP` and filters voices on `startsWith('ja')`; `alignReading`/`furigana` are kana-aware; `badges()` is JLPT | `speak(text, { lang })`; move alignment into the adapter; badges read `adapter.level` |
| `views/quiz.js` | `isRightWord` folds katakana; `wordLabel` uses furigana; distractor `pos` matching | the session machinery, feedback, mistake keys and summary are all reusable — swap in `adapter.answer` |
| `views/vocab.js` | `SORTS.kana` sorts with `localeCompare(…, 'ja')` | adapter-supplied sort and headword renderer |
| `views/dictionary.js` | assumes the JA entry shape and the kanji panel | a `zh` worker answering the same protocol; the kanji panel becomes a hanzi panel |
| `views/mistakes.js`, `views/stats.js` | display helpers only | adapter for rendering |
| `views/notes.js`, `views/note-tools.js` | the shelf is fully generic | per-language dirs: `notes/ja/`, `notes/zh/`, `reading/zh/` |

**A happy accident worth knowing:** the ruby markup regex in `ui.js`,
`/([㐀-鿿々〆ヶ]+)\{([^}]+)\}/g`, covers the whole CJK ideograph block, so `汉字{hàn zì}` already
parses with zero changes. Verified. That means `rubyMarkup`, `markupReading` and the note/reading
shelves accept Chinese content as-is. Only `alignReading` (which distributes a kana reading across
kanji) needs a Chinese sibling — and it is *easier* there, because one hanzi is exactly one
syllable.

### Stays Japanese-only, untouched

`kana.js`, `conjugate.js`, `deinflect.js`, `word-order.js`, `grammar-data.js`, `views/kana.js`,
`views/verbs.js`, `views/grammar.js`. They move under `js/lang/ja/` for tidiness, or stay where
they are and are simply never imported by the `zh` adapter.

### New, Chinese-only

- `js/lang/zh/pinyin.js` — numbered to diacritic (`ni3 hao3` → `nǐ hǎo`), tone extraction for
  colouring, tone-insensitive and tone-strict answer matching, syllable splitting.
- `js/lang/zh/ruby.js` — pinyin over hanzi, tone-coloured.
- `data/zh/` — the generated JSON from §4.
- Views: `plan`, `characters`, `session` (the runner), `journal`, `speaking`.

---

## 4. Data pipeline: invert the plan's source order

The build plan makes the 400-page syllabus PDF the primary source and
[krmanik/HSK-3.0](https://github.com/krmanik/HSK-3.0) the cross-check. Recommend the reverse:

1. **Primary: the krmanik lists.** Already clean, already split by band, already machine-readable.
   Hours of work saved and no OCR risk.
2. **Cross-check: the PDF.** Parse it for what the lists do not carry — the task syllabus
   (`tasks.json`), the topic hierarchy (`topics.json`) and the grammar syllabus — and to validate
   counts. Python 3.12 is installed, so `pymupdf` is available.
3. **Glosses: CC-CEDICT**, matched on pinyin for multi-reading words, exactly as the plan says.
   Licence-wise this is the same situation as JMdict (CC BY-SA), which the README already
   attributes, so add a matching entry.

Output goes to `data/zh/` as compact arrays in the style of `data/dict.json` (not the verbose
objects in the plan's §3) so the worker can hold it cheaply — the whole of bands 1–6 should land
well under 1 MB, versus 26 MB for the Japanese dictionary.

The script fits as `tools/build-zh-data.ps1` next to the existing `build-data.ps1`, shelling out to
Python for the PDF step. Validate against the published cumulative totals (500 / 1,272 / 2,245 /
3,245 / 4,316 / 5,456) and log mismatches, as the plan asks. Commit the generated JSON; never parse
the PDF at runtime.

---

## 5. Feature ideas

### 5a. The plan's features, mapped to what exists

| Plan item | Reuse | Genuinely new |
|---|---|---|
| 4.1 Plan dashboard | stats tiles, `barChart`, `countUp` | plan JSON loader, phase/week maths, today's blocks |
| 4.2 Vocab SRS | **the whole engine, quiz view and My Words** | tone-coloured pinyin, audio→hanzi card type, bulk "I already know this" for placement week |
| 4.3 Grammar checklist | chips, `statusBadge`, the grammar-data pattern | per-point status, Grammar Wiki links |
| 4.4 Sentence correction | mistakes list, quiz feedback shell | **the AI call — see §6** |
| 4.5 Session runner | — | timer, block list, external-link ticks |
| 4.6 Writing journal | the note-answers storage pattern | editor, word count, band checker |
| 4.7 Speaking | — | MediaRecorder, **IndexedDB** for the blobs |
| 4.8 Progress + checkpoints | the stats view almost wholesale | checkpoint model, hand-entered mock scores |
| 4.9 Workplace deck | **already exists** — lists + SRS | just a seeded list plus hand-written card creation |

4.9 is essentially free. 4.2 is the big win: the engine, the scheduler, the challenge, the mistake
recording and the cross-device merge all come along for nothing.

### 5b. Ideas the plan does not have

1. **Tone drills, and a tone-confusion grid.** The plan has no tone practice at all, which is the
   biggest Mandarin-specific weakness for a rusty learner. `views/kana.js` is already almost the
   right shape: a drill plus a chart of which characters you know. Swap the kana grid for a
   tone-pair grid (2nd vs 3rd, 1st vs 4th, neutral) built from `store.kana`-style tallies, and it
   shows exactly which contrasts are failing. Cheap, high value.

2. **Stroke practice with Hanzi Writer.** Free, MIT, CDN-loadable, animates stroke order and grades
   handwriting in the browser. This is the honest answer to `characters.json`'s
   `type: "write"`, instead of sending Nigel off to an Anki deck.

3. **Hanzi component breakdown.** The dictionary already has a kanji detail panel driven by
   `data/kanji.json`. The Chinese equivalent is [Make Me a Hanzi](https://github.com/skishore/makemeahanzi)
   (free) — radicals, components and stroke data, for mnemonics. Same panel, different data file.

4. **Cross-language hanzi links — the thing only this app can do.** Nigel has a My Words list full
   of kanji. When a Chinese card shows 勉强, the panel can say: *you know 勉強 in Japanese
   ("study") — in Chinese it means "reluctantly"*. A false-friend list built by intersecting the
   two `words` collections, plus "characters you already recognise from Japanese" to skip during
   placement week. This is the strongest argument for the single-app toggle, and it is a join over
   two objects you already have.

5. **A timed mock-exam mode** over the existing quiz machinery. HSK reading and listening are
   time-pressured; the quiz view already has a progress bar and a summary screen.

6. **Anki / Pleco export.** `store.exportData()` exists; add a CSV export of the mistakes list and
   the current band's cards, so the free Anki and Pleco paths in §6 of the plan actually connect to
   the app.

7. **Retrofit the generic new features to Japanese.** The session runner, the writing journal, the
   speaking recorder and the correction flow are all language-neutral. Built once for Chinese, they
   become new Japanese features for free — which matters, since the Japanese side is the one with
   live homework.

---

## 6. The one decision that blocks building: the AI correction flow

Three routes, free-tier compatible:

| Route | How | Cost | Trade-off |
|---|---|---|---|
| **A. Key in the browser** | Nigel pastes an Anthropic API key into Settings, stored in `localStorage`; `fetch` straight to the API with `anthropic-dangerous-direct-browser-access` | API usage only | Key sits in `localStorage` on each device. Fine for a personal app on a personal device; not fine if the site is ever shared |
| **B. Tiny proxy** | A ~15-line Cloudflare Worker or Vercel function holds the key; the app calls it | Free tier, comfortably | Key never leaves the server. One more thing to deploy, and the app stops being purely static |
| **C. Copy-paste prompt** | A "copy prompt" button formats the sentence plus today's grammar and vocab; Nigel pastes it into Claude and pastes the correction back into the mistakes list | Free, no key | Manual, but works offline and needs no infrastructure at all |

**Recommendation: build C first, then A.** C is a day's work, needs no key and no account, honours
the "free materials only" constraint literally, and gets the mistakes-list plumbing right. A then
drops in behind the same interface as an automatic path once the flow has proved itself. B only
becomes worth it if the app is ever shared beyond Nigel's own devices.

Whichever route, the correction UI is the same: a text box, the correction with a short
explanation (Nigel prefers concise and casual, per the plan's §7), and a save into the existing
mistakes list so corrections join the SRS.

---

## 7. Other things to settle

- **Storage ceiling.** `localStorage` is ~5 MB per origin and the state is one JSON blob.
  5,456 cards plus a journal will get close. **Speaking recordings must go to IndexedDB** — audio
  blobs in `localStorage` will break the app outright. Worth planning the journal and recordings as
  IndexedDB from day one rather than migrating later.
- **`zh-CN` voice on Windows.** `ui.js` already toasts "no Japanese voice is installed" when the
  voice list has no match. Windows 10 usually ships Huihui/Yaoyao, but only with the language pack.
  Check before relying on `speechSynthesis` for the audio→hanzi card type; if it is missing, the
  card type should degrade rather than fail.
- **Speech-to-text for shadowing** (plan §4.7) is Chrome-only and needs a network connection.
  Treat the diff as optional; the recording itself is the valuable part.
- **Branding.** App is "Kotoba", icon is 言, repo is `Japanese-App`. Per-language marks (言 / 汉)
  with the app keeping one name is the cheapest answer. Renaming the repo is optional and purely
  cosmetic.
- **Exam dates.** As the plan says: no hard-coded dates, link to chinesetest.cn. HSK 3.0 launches
  13 Dec 2026.
- **Syllabus licence.** CLEC/CTI material, personal study only, not redistributed — so the
  generated `data/zh/` should stay in this private-use app and the README should say so, the same
  way it already attributes JMdict.

---

## 8. Suggested order

Slightly re-cut from the plan's M1–M6, to get Nigel studying sooner:

| # | Deliverable | Done when |
|---|---|---|
| **M1** | This proposal approved; `store.js` namespaced to `langs.{ja,zh}` with migration, `zh` adapter stub, topbar toggle | Japanese works exactly as before, with the toggle showing an empty Chinese side |
| **M2** | `data/zh/` pipeline from the krmanik lists, PDF cross-check, CC-CEDICT glosses | Bands 1–6 counts validated, mismatch log reviewed |
| **M3** | Chinese dictionary + My Words + vocab SRS with tone-coloured pinyin and configurable new/review limits | **Nigel can start the placement week and band 1–3 review** |
| M4 | Plan dashboard + grammar checklist | Today's blocks and the current band's grammar visible |
| M5 | Sentence correction (route C) + journal with band checker | Corrections land in the mistakes list |
| M6 | Session runner + speaking recorder (IndexedDB) + checkpoints | A full day's plan runs in-app; week-1 baseline recording saved |
| M7 | Tone drills, stroke practice, cross-language hanzi links | — |

The plan's "ship M3 fast" still holds. The difference is that M1 here is deliberately thin — a
namespace change and a toggle, no view refactoring — so the risky part (touching `store.js` and
`sync.js`, which hold all the real state) happens once, early, while the Japanese side is the only
thing that can regress and is therefore easy to verify.
