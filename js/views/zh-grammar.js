// The grammar points of one HSK band, each marked as being practised or done.
//
// The syllabus names its points in Chinese and gives no explanation, so each pattern links
// to the Chinese Grammar Wiki rather than pretending to a definition the syllabus does not
// provide. What a point is called stays in the syllabus's own words, with the category in
// English beside it.
import * as store from '../store.js';
import { grammar, lessons, CATEGORY_EN, NAME_EN, wikiLink } from '../lang/zh/content.js';
import { h, setChildren, icon, segmented, toast, route, playButton } from '../ui.js';
import { staggerIn } from '../stagger.js';

const BANDS = [1, 2, 3, 4, 5, 6];
const STATUSES = [['', 'Not started'], ['practising', 'Practising'], ['done', 'Done']];
const NEXT = { '': 'practising', practising: 'done', done: '' };
const STATUS_CLASS = { '': 'new', practising: 'due', done: 'mature' };

// Prose that mixes English and Chinese: the Chinese runs are tagged, so they are drawn in
// a Chinese font rather than whatever the page's default reaches first.
// Splitting on a capturing group leaves the Chinese runs at the odd positions.
const CJK_RUN = /([㐀-鿿　-〿＀-￯]+)/;
const mixed = (text) => String(text || '').split(CJK_RUN)
  .map((part, i) => (i % 2 ? h('span', { lang: 'zh-CN' }, part) : part))
  .filter((part) => part !== '');

export function createZhGrammarView() {
  let lessonsFor = {};      // band -> { id: lesson } once loaded
  let openId = null;        // the point whose lesson is open, from #/zh/grammar/<id>
  let listScroll = 0;       // where the list was, to come back to it
  let points = null;
  let band = Number(store.getState().settings.band) || 1;
  let filter = '';
  let error = '';

  const el = h('section', { class: 'view' });

  function loadLessons(level) {
    if (lessonsFor[level]) return;
    lessonsFor[level] = {};
    lessons(level).then((found) => { lessonsFor[level] = found; render(); });
  }

  function load() {
    loadLessons(band);
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

  const lessonOf = (point) => (lessonsFor[point[1]] || {})[point[0]] || null;

  function pointRow(point) {
    const [id, , category, name, detail, patterns, links = []] = point;
    const heading = [NAME_EN[name] || name, detail].filter(Boolean).join(' · ');
    const lesson = lessonOf(point);
    return h('article', { class: `entry grammar-point mark-${STATUS_CLASS[store.getMark(id)]}` },
      h('div', { class: 'entry-head' },
        h('div', null,
          h(lesson ? 'a' : 'div', { class: 'grammar-name', href: lesson ? route('grammar', id) : null },
            name && h('span', { lang: 'zh-CN' }, name),
            detail && h('span', { lang: 'zh-CN', class: 'muted' }, ` ${detail}`),
          ),
          h('div', { class: 'muted small' }, lesson ? lesson.title : heading !== name ? heading : (CATEGORY_EN[category] || category)),
        ),
        h('div', { class: 'grammar-actions' },
          statusButton(point),
          lesson && h('a', { class: 'btn btn-primary btn-small', href: route('grammar', id) }, 'Read the lesson'),
          h('a', { class: 'btn btn-quiet btn-small', href: route('write', id), title: 'Write a sentence using this, and get it corrected' }, 'Write with this'),
        ),
      ),
      patterns.length > 0 && h('div', { class: 'chips' }, patterns.map((pattern, i) => {
        // With a lesson written, a pattern opens the lesson; the wiki is its further reading.
        if (lesson) {
          return h('a', { class: 'chip', lang: 'zh-CN', href: route('grammar', id), title: `Lesson: ${lesson.title}` }, pattern);
        }
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

  function exampleRow([zh, pinyin, en]) {
    return h('li', { class: 'lesson-example' },
      h('div', { class: 'lesson-example-line' },
        h('span', { lang: 'zh-CN', class: 'lesson-zh' }, zh),
        playButton(() => zh, 'Play the sentence'),
      ),
      h('div', { class: 'lesson-pinyin' }, pinyin),
      h('div', { class: 'muted' }, en),
    );
  }

  function renderLesson(point, lesson) {
    const [id, level, category, name, detail, patterns, links = []] = point;
    const inBand = (points || []).filter((p) => p[1] === level && lessonOf(p));
    const at = inBand.findIndex((p) => p[0] === id);
    const before = inBand[at - 1];
    const after = inBand[at + 1];
    const nav = (target, label) => target && h('a', { class: 'btn btn-quiet btn-small', href: route('grammar', target[0]) }, label);

    setChildren(el,
      h('a', { class: 'btn btn-quiet back-link', href: route('grammar') }, `← HSK ${level} grammar`),
      h('article', { class: 'card lesson' },
        h('div', { class: 'lesson-head' },
          h('div', null,
            h('p', { class: 'muted small lesson-kicker' }, CATEGORY_EN[category] || category, ' · ', h('span', { lang: 'zh-CN' }, [name, detail].filter(Boolean).join(' '))),
            h('h1', { class: 'lesson-title' }, mixed(lesson.title)),
          ),
          statusButton(point),
        ),
        h('p', { class: 'lesson-summary' }, mixed(lesson.summary)),
        lesson.sections.map((section) => h('section', { class: 'lesson-section' },
          h('h2', null, mixed(section.heading)),
          h('p', null, mixed(section.text)),
          section.pattern && h('p', { class: 'lesson-pattern' }, h('span', { class: 'label' }, 'Pattern'), ' ', mixed(section.pattern)),
          section.examples && section.examples.length > 0 && h('ul', { class: 'lesson-examples' }, section.examples.map(exampleRow)),
        )),
        lesson.mistakes && lesson.mistakes.length > 0 && h('section', { class: 'lesson-section' },
          h('h2', null, 'Common mistakes'),
          h('ul', { class: 'lesson-mistakes' }, lesson.mistakes.map((m) => h('li', null, mixed(m)))),
        ),
        lesson.tip && h('p', { class: 'tip' }, h('strong', null, 'Tip '), mixed(lesson.tip)),
        h('div', { class: 'editor-actions lesson-actions' },
          h('a', { class: 'btn btn-primary', href: route('write', id) }, 'Write with this'),
        ),
        h('details', { class: 'lesson-further' },
          h('summary', null, 'Further reading on the Chinese Grammar Wiki'),
          h('div', { class: 'chips' }, patterns.map((pattern, i) => {
            const link = wikiLink(links[i] || ['', '', pattern.replace(/[—…⋯]/g, '')]);
            return h('a', { class: 'chip', lang: 'zh-CN', href: link.url, target: '_blank', rel: 'noopener', title: link.label }, pattern);
          })),
        ),
      ),
      h('div', { class: 'lesson-nav' }, nav(before, '← Previous lesson'), h('span'), nav(after, 'Next lesson →')),
    );
  }

  function render(animate = false) {
    if (openId && points) {
      const point = points.find((p) => p[0] === openId);
      if (point) loadLessons(point[1]);
      const lesson = point && lessonOf(point);
      if (point && lesson) { renderLesson(point, lesson); return; }
      if (point && lessonsFor[point[1]] && !Object.keys(lessonsFor[point[1]]).length) {
        // No lesson for this point's band yet: back to the list.
        openId = null;
      } else if (point) {
        setChildren(el, h('p', { class: 'muted empty-line' }, 'Loading the lesson…'));
        return;
      }
    }
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
            loadLessons(n);
            store.saveSettings({ band: n });
            render(true);
          }),
        ),
        h('div', { class: 'progress' },
          h('div', { class: 'progress-fill', style: `width:${all.length ? (done / all.length) * 100 : 0}%` })),
        h('p', { class: 'muted' },
          `${all.length} grammar points in HSK ${band}: ${done} done, ${practising} being practised. `
          + (Object.keys(lessonsFor[band] || {}).length
            ? 'Read the lesson for each one, then tap its label to mark it practising or done.'
            : 'Tap a point’s label to move it on; tap a pattern to look it up on the Chinese Grammar Wiki.')),
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
    // #/zh/grammar/<id> opens that point's lesson; #/zh/grammar is the list, back where
    // it was left.
    onShow: (sub) => {
      load();
      const opening = sub || null;
      if (opening && !openId) listScroll = window.scrollY;
      const closing = !opening && openId;
      openId = opening;
      render(!opening && !closing);
      if (opening) window.scrollTo(0, 0);
      // The list is already drawn by render(), so it can be scrolled straight back.
      else if (closing) window.scrollTo(0, listScroll);
    },
    onStore: () => { if (points) render(); },
  };
}
