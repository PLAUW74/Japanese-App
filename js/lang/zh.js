// Chinese (Mandarin, simplified): the same shape as js/lang/ja.js.
//
// My Words, the quiz, the mistakes list and Stats are the Japanese views unchanged — the
// Chinese word list hands back entries shaped like the Japanese ones (js/lang/zh/dict.js),
// so everything built on a saved word works without knowing which language it is.
import { createZhPlanView } from '../views/zh-plan.js';
import { createZhGrammarView } from '../views/zh-grammar.js';
import { createZhWriteView } from '../views/zh-write.js';
import { createZhDictionaryView } from '../views/zh-dictionary.js';
import { createVocabView } from '../views/vocab.js';
import { createQuizView } from '../views/quiz.js';
import { createMistakesView } from '../views/mistakes.js';
import { createStatsView } from '../views/stats.js';

export default {
  code: 'zh',
  label: 'Chinese',
  short: '中文',
  mark: '汉',
  htmlLang: 'zh-CN',
  voice: 'zh',
  speechTag: 'zh-CN',
  home: 'dictionary',
  level: { label: (n) => `HSK ${n}` },

  tabs: [
    { route: 'dictionary', label: 'Dictionary' },
    { route: 'words', label: 'My Words' },
    { route: 'quiz', label: 'Quiz', badge: true },
    { route: 'grammar', label: 'Grammar' },
    { route: 'write', label: 'Write' },
    { route: 'plan', label: 'Plan' },
    { route: 'stats', label: 'Stats' },
  ],

  routes: {
    dictionary: createZhDictionaryView,
    words: createVocabView,
    quiz: createQuizView,
    mistakes: createMistakesView,
    grammar: createZhGrammarView,
    write: createZhWriteView,
    plan: createZhPlanView,
    stats: createStatsView,
  },

  // The mistakes list lives under the Quiz tab, as it does in Japanese.
  tabFor: { mistakes: 'quiz' },
  quizPages: [['quiz', 'My words'], ['mistakes', 'Mistakes']],
};
