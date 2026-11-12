# Kotoba

A Japanese and Chinese vocab trainer that runs entirely in the browser.

The toggle at the top right switches language. Each one keeps its own words, lists, review
schedule, mistakes and settings, and they sync to the same account; the study streak counts a
day studied in either. The Chinese side is being built — see `CHINESE_MODULE_PROPOSAL.md` for
the plan and the build order.

The Chinese side has a dictionary of the HSK 3.0 word list with tone-coloured pinyin, My
Words and the quiz (including a characters → pinyin question), the grammar syllabus as a
checklist linked to the Chinese Grammar Wiki, a writing page that checks your text against
your HSK band and gets it corrected by Claude through a copied prompt, and the study plan.

The pages below are the Japanese ones.

- **Dictionary**: search 218,000+ words in English, romaji, kana or kanji, with JLPT levels, kanji details and audio.
- **My Words**: save words, sort them into your own lists and add notes.
- **Quiz**: multiple choice and typing questions on your saved words, scheduled with spaced repetition.
- **Kana test**: hiragana and katakana drills (under the Quiz tab) with a chart of which characters you know.
- **Verb form quiz**: see a verb in its ます form and give the て-form or た-form (under the Quiz tab).
- **Grammar quiz**: about 110 N5–N4 questions (fill the gap, JLPT-style word order) in `js/grammar-data.js`.
- **Notes**: formatted study notes from textbook pages, each with a photo of the original page.
- **Reading**: graded N5–N4 passages and folk tales with furigana, translations, word lists and questions.
- **Stats**: study streak, accuracy, word progress and upcoming reviews.

## Run it

Double-click `Start Kotoba.bat`. It starts a small local server and opens http://localhost:5173/ in your browser; close its window to stop. Nothing needs installing on Windows.

The app is plain HTML, CSS and JavaScript with no build step, so any static file server works too.

Saved words and progress live in the browser's local storage. Use **My Words → Export backup** to move them to another browser or device.

## Syncing between devices

Sign in with Google on the Stats page and your words, lists, notes and progress stay the same on every device. It uses a free [Firebase](https://firebase.google.com/) project, set up once:

1. In the [Firebase console](https://console.firebase.google.com/), create a project (Google Analytics is not needed).
2. **Build → Authentication → Get started**, enable the **Google** sign-in provider. Under **Settings → Authorized domains**, add the domain the app is hosted on (for GitHub Pages, `<username>.github.io`).
3. **Build → Firestore Database → Create database**, in production mode, any location. On its **Rules** tab, replace the rules with the block below and publish.
4. **Project settings → Your apps → Web (`</>`)**, register an app (no hosting needed) and copy the `firebaseConfig` object into `js/firebase-config.js` in place of `null`.

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

The config values in `js/firebase-config.js` are not secret; the rules are what keep each person's data private to them. Without a config the app runs exactly as before, storing everything in the browser.

Japanese syncs to `users/{uid}/words`, `meta/lists` and `answers`, the paths it has always used, so nothing already in an account has to move. Each further language gets its own collections beside them (`zh_words`, `meta/zh_lists`, `zh_answers`). The rules above cover all of them, so there is nothing to change in Firebase.

## Layout

| Path | What it is |
| --- | --- |
| `index.html`, `css/`, `js/` | The app |
| `js/lang/` | One module per language: its tabs, pages, brand glyph and voice |
| `js/dict-worker.js` | Loads the dictionary and runs searches off the main thread |
| `js/store.js` | Saved words, lists, review schedule and history, kept per language |
| `js/sync.js`, `js/firebase-config.js` | Optional syncing through Firebase |
| `data/` | Compact Japanese dictionary files the app loads |
| `data/zh/` | The HSK 3.0 word, character, grammar, topic and task lists |
| `data/zh/plan.json` | The 78-week study plan the Chinese dashboard reads. Yours to edit |
| `notes/` | Study notes: `index.json` lists them, each note is an HTML file, photos are in `notes/img/` |
| `reading/` | Graded reading passages, laid out the same way as `notes/` |
| `tools/build-data.ps1` | Rebuilds `data/` from the latest sources |
| `tools/build-zh-data.ps1` | Rebuilds `data/zh/` from the HSK lists and CC-CEDICT |
| `sw.js` | Offline support once the app has been opened online |

## Updating the dictionary

```bash
powershell -ExecutionPolicy Bypass -File tools\build-data.ps1 -Release "<jmdict-simplified release tag>"
```

Afterwards bump `DATA` in `sw.js` so browsers drop the cached copy.

## Updating the Chinese data

```bash
powershell -ExecutionPolicy Bypass -File toolsuild-zh-data.ps1
```

Downloads the HSK 3.0 lists and CC-CEDICT into `data-src/zh/`, then writes `data/zh/`. It
needs Python 3 but nothing installed beyond it, and the generated files are committed, so
this only has to run when the sources change. Add `-Force` to fetch them again. Every run
writes `data-src/zh/build-log.txt`: the band counts checked against the published totals,
and every word whose reading or meaning needed a judgement call.

The topic and task lists come from the syllabus PDF instead, which is a separate step
because it is the one part that needs a package installed:

```bash
pip install --user pymupdf
```

```bash
python -E -P -X utf8 tools/build_zh_topics.py --pdf data-src/zh-pdf/syllabus.pdf --out data/zh
```

## Data sources

- [JMdict and KANJIDIC2](https://www.edrdg.org/) by the Electronic Dictionary Research and Development Group, used under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), in the JSON form published by [jmdict-simplified](https://github.com/scriptin/jmdict-simplified).
- JLPT levels from Jonathan Waller's lists via [yomitan-jlpt-vocab](https://github.com/stephenmk/yomitan-jlpt-vocab) (CC BY). The JLPT publishes no official word lists, so these levels are a guide.
- HSK 3.0 word, character, handwriting and grammar lists, and the BCT lists, from [krmanik/HSK-3.0](https://github.com/krmanik/HSK-3.0).
- Chinese meanings from [CC-CEDICT](https://www.mdbg.net/chinese/dictionary?page=cc-cedict), used under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
- Chinese topics and tasks from the official HSK syllabus (中文水平考试 HSK 考试大纲, CLEC, November 2025). That is CLEC/CTI material, used here for personal study inside the app and not redistributed.

Two editions of the HSK 3.0 lists are in circulation and they disagree. The 2021 standard
(GF 0025-2021) sets each word's band here, because its totals are the ones published
everywhere and the ones the study plan counts against; the 2025 exam syllabus supplies the
word classes, the handwriting list and the grammar, and where it puts a word at a different
level that is kept alongside as `band2025`.
