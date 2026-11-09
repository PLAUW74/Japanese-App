# Kotoba

A Japanese dictionary and vocab trainer that runs entirely in the browser.

- **Dictionary**: search 218,000+ words in English, romaji, kana or kanji, with JLPT levels, kanji details and audio.
- **My Words**: save words, sort them into your own lists and add notes.
- **Quiz**: multiple choice and typing questions on your saved words, scheduled with spaced repetition.
- **Kana test**: hiragana and katakana drills (under the Quiz tab) with a chart of which characters you know.
- **Verb form quiz**: see a verb in its ます form and give the て-form or た-form (under the Quiz tab).
- **Grammar quiz**: about 110 N5–N4 questions (fill the gap, JLPT-style word order) in `js/grammar-data.js`.
- **Notes**: formatted study notes from textbook pages, each with a photo of the original page.
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

## Layout

| Path | What it is |
| --- | --- |
| `index.html`, `css/`, `js/` | The app |
| `js/dict-worker.js` | Loads the dictionary and runs searches off the main thread |
| `js/store.js` | Saved words, lists, review schedule and history |
| `js/sync.js`, `js/firebase-config.js` | Optional syncing through Firebase |
| `data/` | Compact dictionary files the app loads |
| `notes/` | Study notes: `index.json` lists them, each note is an HTML file, photos are in `notes/img/` |
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
