// The grammar points of one HSK band, each marked as being practised or done.
//
// The syllabus names its points in Chinese and gives no explanation, so each pattern links
// to the Chinese Grammar Wiki rather than pretending to a definition the syllabus does not
// provide. What a point is called stays in the syllabus's own words, with the category in
// English beside it.
import * as store from '../store.js';
import { grammar, CATEGORY_EN, NAME_EN, wikiLink } from '../lang/zh/content.js';
import { h, setChildren, icon, segmented, toast } from '../ui.js';
import { staggerIn } from '../stagger.js';

const BANDS = [1, 2, 3, 4, 5, 6];
const STATUSES = [['', 'Not started'], ['practising', 'Practising'], ['done', 'Done']];
const NEXT = { '': 'practising', practising: 'done', done: '' };
const STATUS_CLASS = { '': 'new', practising: 'due', done: 'mature' };

export function createZhGrammarView() {
  let points = null;
  let band = Number(store.getState().settings.band) || 1;
  let filter = '';
  let error = '';

  const el = h('section', { class: 'view' });

  function load() {
    if (points) return;
    grammar().then((rows) => {
      points = rows;
      render(true);
    }, (err) => {
      error = err.message || 'The grammar list could not be loaded.';
      render();
    });
  }

  const inBand = () => (points || []).filter((p) => p[1] === band);

  function matches(point, needle) {
    if (!needle) return true;
    const [, , category, name, detail, patterns] = point;
    const haystack = [category, name, detail, CATEGORY_EN[category] || '', NAME_EN[name] || '', ...patterns]
      .join(' ').toLowerCase();
    return haystack.includes(needle);
  }

  function statusButton(point) {
    const id = point[0];
    const status = store.getMark(id);
    const label = STATUSES.find(([key]) => key === status)[1];
    return h('button', {
      type: 'button',
      class: `badge status-${STATUS_CLASS[status]} mark-btn`,
      title: 'Click to change',
      'aria-label': `${label}. Click to change.`,
      onclick: () => {
        store.setMark(id, NEXT[status]);
        render();
      },
    }, status === 'done' && icon('check'), label);
  }

  function pointRow(point) {
    const [id, , category, name, detail, patterns, links = []] = point;
    const heading = [NAME_EN[name] || name, detail].filter(Boolean).join(' · ');
    return h('article', { class: `entry grammar-point mark-${STATUS_CLASS[store.getMark(id)]}` },
      h('div', { class: 'entry-head' },
        h('div', null,
          h('div', { class: 'grammar-name' },
            name && h('span', { lang: 'zh-CN' }, name),
            detail && h('span', { lang: 'zh-CN', class: 'muted' }, ` ${detail}`),
          ),
          h('div', { class: 'muted small' }, heading !== name ? heading : (CATEGORY_EN[category] || category)),
        ),
        statusButton(point),
      ),
      patterns.length > 0 && h('div', { class: 'chips' }, patterns.map((pattern, i) => {
        // Where it goes, said before it is clicked: the article's own title, or that it is
        // a list of articles, or a search.
        const link = wikiLink(links[i] || ['', '', pattern.replace(/[—…⋯]/g, '')]);
        return h('a', {
          class: 'chip',
          lang: 'zh-CN',
          href: link.url,
          target: '_blank',
          rel: 'noopener',
          title: `Chinese Grammar Wiki: ${link.label}`,
          'aria-label': `${pattern}. Opens the Chinese Grammar Wiki: ${link.label}`,
        }, pattern);
      })),
    );
  }

  function render(animate = false) {
    const head = h('div', { class: 'view-head' }, h('h1', null, 'Grammar'));

    if (error) {
      setChildren(el, head, h('p', { class: 'error' }, error));
      return;
    }
    if (!points) {
      setChildren(el, head, h('p', { class: 'muted empty-line' }, 'Loading the grammar syllabus…'));
      return;
    }

    const all = inBand();
    const counts = store.markCounts(all.map((p) => p[0]));
    const done = counts.done || 0;
    const practising = counts.practising || 0;
    const needle = filter.trim().toLowerCase();
    const shown = all.filter((p) => matches(p, needle));

    // Grouped by the syllabus's own categories, in the order it lists them.
    const groups = new Map();
    for (const point of shown) {
      const key = point[2];
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(point);
    }

    const body = h('div', { class: 'results' }, [...groups.entries()].map(([category, rows]) => h('section', { class: 'grammar-group' },
      h('h2', { class: 'grammar-category' },
        CATEGORY_EN[category] || category,
        h('span', { class: 'muted small' }, ` ${category}`),
      ),
      rows.map(pointRow),
    )));

    setChildren(el,
      head,
      h('div', { class: 'card setup' },
        h('div', { class: 'field' },
          h('span', { class: 'label' }, 'Band'),
          segmented('HSK band', BANDS.map((n) => [n, `HSK ${n}`]), band, (n) => {
            band = n;
            store.saveSettings({ band: n });
            render(true);
          }),
        ),
        h('div', { class: 'progress' },
          h('div', { class: 'progress-fill', style: `width:${all.length ? (done / all.length) * 100 : 0}%` })),
        h('p', { class: 'muted' },
          `${all.length} grammar points in HSK ${band}: ${done} done, ${practising} being practised. `
          + 'Tap a point’s label to move it on; tap a pattern to look it up on the Chinese Grammar Wiki.'),
        h('input', {
          type: 'search',
          class: 'search-input',
          placeholder: 'Filter by pattern, word class or category',
          value: filter,
          'aria-label': 'Filter the grammar points',
          oninput: (event) => { filter = event.target.value; renderBody(); },
        }),
      ),
      shown.length ? body : h('p', { class: 'muted empty-line' }, `Nothing in HSK ${band} matches “${filter}”.`),
    );
    if (animate) staggerIn([...body.querySelectorAll('.grammar-point')].slice(0, 12), performance.now());
  }

  // Redrawing replaces the filter field, so the cursor has to be put back where it was.
  // Whether it was focused must be read before the redraw: afterwards the old field is
  // detached and comparing it with activeElement always says no.
  function renderBody() {
    const field = el.querySelector('.search-input');
    const hadFocus = !!field && document.activeElement === field;
    const caret = field ? field.selectionStart : null;
    render();
    if (!hadFocus) return;
    const again = el.querySelector('.search-input');
    if (!again) return;
    again.focus();
    if (caret != null) again.setSelectionRange(caret, caret);
  }

  load();
  render();
  return {
    el,
    onShow: () => { load(); render(true); },
    onStore: () => { if (points) render(); },
  };
}
