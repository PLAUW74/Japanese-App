// Japanese: which pages the app shows, what they are called, and how to speak and
// label the language. js/app.js reads this to build the topbar and route the pages.
//
// The store knows nothing about this file (it keeps its own settings defaults, so it can
// import nothing). Everything here is about the interface.
import { createDictionaryView } from '../views/dictionary.js';
import { createVocabView } from '../views/vocab.js';
import { createQuizView } from '../views/quiz.js';
import { createKanaView } from '../views/kana.js';
import { createVerbsView } from '../views/verbs.js';
import { createGrammarView } from '../views/grammar.js';
import { createMistakesView } from '../views/mistakes.js';
import { createNotesView } from '../views/notes.js';
import { createStatsView } from '../views/stats.js';

export default {
  code: 'ja',
  label: 'Japanese',
  short: '日本語',
  mark: '言',          // the glyph beside the app name in the topbar
  htmlLang: 'ja',
  voice: 'ja',         // what ui.js speak() looks for in the device's voices
  speechTag: 'ja-JP',  // the tag it reads text out with
  home: 'dictionary',

  tabs: [
    { route: 'dictionary', label: 'Dictionary' },
    { route: 'words', label: 'My Words' },
    { route: 'quiz', label: 'Quiz', badge: true },
    { route: 'notes', label: 'Notes' },
    { route: 'reading', label: 'Reading' },
    { route: 'stats', label: 'Stats' },
  ],

  routes: {
    dictionary: createDictionaryView,
    words: createVocabView,
    quiz: createQuizView,
    kana: createKanaView,
    verbs: createVerbsView,
    grammar: createGrammarView,
    mistakes: createMistakesView,
    notes: () => createNotesView(),
    reading: () => createNotesView({ dir: 'reading', title: 'Reading', item: 'passage', newestFirst: false }),
    stats: createStatsView,
  },

  // The kana test, verb form quiz, grammar quiz and mistakes list live under the Quiz tab.
  tabFor: { kana: 'quiz', verbs: 'quiz', grammar: 'quiz', mistakes: 'quiz' },

  // The pages that share the quiz picker, in the order it lists them.
  quizPages: [
    ['quiz', 'My words'],
    ['kana', 'Hiragana & katakana'],
    ['verbs', 'Verb forms'],
    ['grammar', 'Grammar'],
    ['mistakes', 'Mistakes'],
  ],
};
