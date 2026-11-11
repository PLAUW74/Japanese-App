// Chinese (Mandarin, simplified): the same shape as js/lang/ja.js. Only the pages that
// exist yet are listed. Stats is shared with Japanese — it reads whichever language is
// showing, and holds the sync and theme settings, which belong to neither.
import { createZhOverviewView } from '../views/zh-overview.js';
import { createStatsView } from '../views/stats.js';

export default {
  code: 'zh',
  label: 'Chinese',
  short: '中文',
  mark: '汉',
  htmlLang: 'zh-CN',
  voice: 'zh',
  speechTag: 'zh-CN',
  home: 'overview',

  tabs: [
    { route: 'overview', label: 'Overview' },
    { route: 'stats', label: 'Stats' },
  ],

  routes: {
    overview: createZhOverviewView,
    stats: createStatsView,
  },

  tabFor: {},
  quizPages: [],
};
