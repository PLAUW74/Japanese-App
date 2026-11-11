// The Chinese side's home page while the rest of it is being built. It says what is here,
// what is coming next, and what the study plan is aiming at, so the toggle lands somewhere
// that makes sense rather than on an empty page.
import * as store from '../store.js';
import { h, setChildren } from '../ui.js';
import { staggerIn } from '../stagger.js';

const MILESTONES = [
  ['M1', 'Language split and toggle', 'done'],
  ['M2', 'HSK 3.0 syllabus → data/zh/', 'done'],
  ['M3', 'Dictionary, My Words and vocab SRS with tone-coloured pinyin', 'done'],
  ['M4', 'Plan dashboard and grammar checklist', 'next'],
  ['M5', 'Sentence correction and writing journal', 'later'],
  ['M6', 'Session runner, speaking recorder, checkpoints', 'later'],
  ['M7', 'Tone drills, stroke practice, cross-language hanzi links', 'later'],
];

const STATUS = { done: 'Done', next: 'Next', later: 'Later' };

export function createZhOverviewView() {
  const el = h('section', { class: 'view' });

  // The rows rise in when the page is opened, not when a save redraws it.
  function render(animate = false) {
    const words = store.allWords().length;
    const list = h('ol', { class: 'milestones' }, MILESTONES.map(([id, what, status]) => h('li', { class: `milestone is-${status}` },
      h('span', { class: 'milestone-id' }, id),
      h('span', { class: 'milestone-what' }, what),
      h('span', { class: `badge status-${status === 'done' ? 'mature' : 'new'}` }, STATUS[status]),
    )));

    setChildren(el,
      h('div', { class: 'view-head' }, h('h1', null, 'Chinese')),
      h('div', { class: 'card' },
        h('h2', null, '中文 · HSK 3.0'),
        h('p', { class: 'muted' },
          'Work-level Mandarin over 78 weeks, aiming at HSK 3.0 band 6 and BCT B, from free materials only. ',
          'The plan and the build order live in ',
          h('code', null, 'CHINESE_MODULE_PROPOSAL.md'),
          '.'),
        words > 0 && h('p', null, `${words} ${words === 1 ? 'word' : 'words'} saved so far.`),
      ),
      h('div', { class: 'card' },
        h('h2', null, 'What is built'),
        h('p', { class: 'muted small' },
          'Your words, lists, review schedule, mistakes and daily log are kept separately for each language, ',
          'and sync to the same account. The study streak counts a day studied in either one.'),
        list,
      ),
    );
    if (animate && el.isConnected) staggerIn([...list.children], performance.now());
  }

  render();
  return { el, onShow: () => render(true), onStore: () => render(false) };
}
