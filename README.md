# Kotoba

A Japanese dictionary and vocab trainer that runs entirely in the browser.

- **Dictionary**: search 218,000+ words in English, romaji, kana or kanji, with JLPT levels, kanji details and audio.
- **My Words**: save words, sort them into your own lists and add notes.
- **Quiz**: multiple choice and typing questions on your saved words, scheduled with spaced repetition.
- **Kana test**: hiragana and katakana drills (under the Quiz tab) with a chart of which characters you know.
- **Verb form quiz**: see a verb in its ます form and give the て-form or た-form (under the Quiz tab).
- **Stats**: study streak, accuracy, word progress and upcoming reviews.

## Run it

Double-click `Start Kotoba.bat`. It starts a small local server and opens http://localhost:5173/ in your browser; close its window to stop. Nothing needs installing on Windows.

The app is plain HTML, CSS and JavaScript with no build step, so any static file server works too.

Saved words and progress live in the browser's local storage. Use **My Words → Export backup** to move them to another browser or device.

## Layout

| Path | What it is |
| --- | --- |
| `index.html`, `css/`, `js/` | The app |
| `js/dict-worker.js` | Loads the dictionary and runs searches off the main thread |
| `js/store.js` | Saved words, lists, review schedule and history |
| `data/` | Compact dictionary files the app loads |
| `tools/build-data.ps1` | Rebuilds `data/` from the latest sources |
| `sw.js` | Offline support once the app has been opened online |

## Updating the dictionary

```bash
powershell -ExecutionPolicy Bypass -File tools\build-data.ps1 -Release "<jmdict-simplified release tag>"
```

Afterwards bump `DATA` in `sw.js` so browsers drop the cached copy.

## Data sources

- [JMdict and KANJIDIC2](https://www.edrdg.org/) by the Electronic Dictionary Research and Development Group, used under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), in the JSON form published by [jmdict-simplified](https://github.com/scriptin/jmdict-simplified).
- JLPT levels from Jonathan Waller's lists via [yomitan-jlpt-vocab](https://github.com/stephenmk/yomitan-jlpt-vocab) (CC BY). The JLPT publishes no official word lists, so these levels are a guide.
