// The study plan: which week it is, which band that puts you in, what today's blocks are
// and what the next checkpoint is.
//
// The plan itself lives in data/zh/plan.json and is meant to be edited — this view only
// reads it. What belongs to the learner (the day they started, and which blocks they have
// ticked off today) is kept as marks in the store, so it follows them between devices.
import * as store from '../store.js';
import { plan as loadPlan } from '../lang/zh/content.js';
import { h, setChildren, icon, toast, route, confirmButton } from '../ui.js';
import { staggerIn } from '../stagger.js';

const START = 'plan:start';
const dayMark = (day) => `plan:day:${day}`;

export function createZhPlanView() {
  let plan = null;
  let error = '';
  const el = h('section', { class: 'view' });

  function load() {
    if (plan) return;
    loadPlan().then((data) => { plan = data; render(true); },
      (err) => { error = err.message || 'The study plan could not be loaded.'; render(); });
  }

  // ---- where in the plan we are ----

  const started = () => store.getMark(START);

  function weekNumber(now = Date.now()) {
    const from = started();
    if (!from) return 0;
    const begin = store.startOfDay(new Date(`${from}T00:00:00`).getTime());
    const days = Math.floor((store.startOfDay(now) - begin) / store.DAY);
    return Math.max(1, Math.floor(days / 7) + 1);
  }

  const phaseFor = (week) => plan.phases.find((p) => week >= p.fromWeek && week <= p.toWeek)
    || (week > plan.weeks ? plan.phases[plan.phases.length - 1] : plan.phases[0]);

  const nextCheckpoint = (week) => plan.checkpoints.find((c) => c.week >= week);

  const todaysBlocks = (band) => plan.blocks.filter((b) => !b.fromBand || band >= b.fromBand);

  const doneToday = () => new Set((store.getMark(dayMark(store.dayKey())) || '').split(',').filter(Boolean));

  function toggleBlock(id) {
    const done = doneToday();
    if (done.has(id)) done.delete(id);
    else done.add(id);
    store.setMark(dayMark(store.dayKey()), [...done].join(','));
  }

  // ---- drawing ----

  function blockRow(block, done) {
    const ticked = done.has(block.id);
    const tick = h('button', {
      type: 'button',
      class: `block-tick ${ticked ? 'on' : ''}`,
      'aria-pressed': String(ticked),
      'aria-label': `${block.label}: ${ticked ? 'done' : 'not done'}`,
      onclick: () => { toggleBlock(block.id); render(); },
    }, ticked ? icon('check') : '');

    const open = block.kind === 'app'
      ? h('a', { class: 'btn btn-quiet btn-small', href: route(block.route) }, 'Open')
      : h('a', { class: 'btn btn-quiet btn-small', href: block.url, target: '_blank', rel: 'noopener' }, 'Open');

    return h('div', { class: `block-row ${ticked ? 'is-done' : ''}` },
      tick,
      h('div', { class: 'block-what' },
        h('div', { class: 'block-label' }, block.label),
        block.note && h('div', { class: 'muted small' }, block.note),
      ),
      h('span', { class: 'muted small' }, `${block.minutes} min`),
      open,
    );
  }

  function notStarted() {
    const first = plan.phases[0];
    return h('div', { class: 'card setup' },
      h('h2', null, plan.name),
      h('p', { class: 'muted' }, plan.note),
      h('div', { class: 'tiles' },
        tile(plan.weeks, 'weeks'),
        tile(plan.phases.reduce((n, p) => n + p.words, 0).toLocaleString(), 'words'),
        tile(plan.phases.reduce((n, p) => n + p.grammar, 0), 'grammar points'),
        tile(`${plan.blocks.reduce((n, b) => n + b.minutes, 0)} min`, 'a day'),
      ),
      h('p', null, `Week 1 is the placement week: go through HSK ${first.band} in the dictionary and save what you do not already know.`),
      h('button', {
        type: 'button', class: 'btn btn-primary btn-large',
        onclick: () => { store.setMark(START, store.dayKey()); toast('Week 1 starts today'); render(true); },
      }, 'Start the plan today'),
      phaseTable(0),
    );
  }

  const tile = (value, label) => h('div', { class: 'tile' },
    h('div', { class: 'tile-value' }, String(value)),
    h('div', { class: 'tile-label' }, label));

  function phaseTable(week) {
    return h('table', { class: 'note-table plan-table' },
      h('thead', null, h('tr', null,
        h('th', null, 'Band'), h('th', null, 'Weeks'), h('th', null, 'Words'),
        h('th', null, 'New a day'), h('th', null, 'Focus'))),
      h('tbody', null, plan.phases.map((p) => h('tr', {
        class: week >= p.fromWeek && week <= p.toWeek ? 'is-now' : '',
      },
        h('td', null, `HSK ${p.band}`),
        h('td', null, `${p.fromWeek}–${p.toWeek}`),
        h('td', null, String(p.words)),
        h('td', null, String(p.newPerDay)),
        h('td', { class: 'muted' }, p.focus),
      ))),
    );
  }

  function running() {
    const week = weekNumber();
    const phase = phaseFor(week);
    const checkpoint = nextCheckpoint(week);
    const blocks = todaysBlocks(phase.band);
    const done = doneToday();
    const left = blocks.filter((b) => !done.has(b.id));
    const minutesLeft = left.reduce((n, b) => n + b.minutes, 0);
    const challenge = store.dailyChallenge();
    const overrun = week > plan.weeks;

    const list = h('div', { class: 'card' },
      h('h2', null, left.length ? `Today · ${minutesLeft} minutes left` : 'Today is done'),
      blocks.map((block) => blockRow(block, done)),
      !left.length && h('p', { class: 'muted' }, 'Everything is ticked off. See you tomorrow.'),
    );

    return [
      h('div', { class: 'view-head' },
        h('h1', null, 'Plan'),
        challenge.left.length > 0
          && h('a', { class: 'btn btn-primary', href: route('quiz') }, `Daily challenge · ${challenge.left.length} left`),
      ),
      h('div', { class: 'tiles' },
        tile(overrun ? `${plan.weeks}+` : `Week ${week}`, overrun ? `past week ${plan.weeks}` : `of ${plan.weeks}`),
        tile(`HSK ${phase.band}`, `weeks ${phase.fromWeek}–${phase.toWeek}`),
        tile(`${phase.newPerDay}`, 'new words a day'),
        tile(checkpoint ? `Week ${checkpoint.week}` : '—', checkpoint ? checkpoint.what : 'all checkpoints passed'),
      ),
      h('div', { class: 'card' },
        h('div', { class: 'progress' },
          h('div', { class: 'progress-fill', style: `width:${Math.min(100, (week / plan.weeks) * 100)}%` })),
        h('p', { class: 'muted' }, phase.focus),
        checkpoint && checkpoint.url
          && h('p', { class: 'muted small' }, 'Next checkpoint: ', checkpoint.what, ' · ',
            h('a', { href: checkpoint.url, target: '_blank', rel: 'noopener' }, 'exam dates and mock tests')),
      ),
      list,
      h('details', { class: 'card' },
        h('summary', null, 'The whole plan'),
        h('p', { class: 'muted small' }, plan.note),
        phaseTable(week),
        h('div', { class: 'editor-actions' },
          confirmButton('Reset the start date', () => { store.setMark(START, ''); render(true); }, 'btn btn-quiet'),
        ),
      ),
    ];
  }

  function render(animate = false) {
    if (error) {
      setChildren(el, h('div', { class: 'view-head' }, h('h1', null, 'Plan')), h('p', { class: 'error' }, error));
      return;
    }
    if (!plan) {
      setChildren(el, h('div', { class: 'view-head' }, h('h1', null, 'Plan')),
        h('p', { class: 'muted empty-line' }, 'Loading the study plan…'));
      return;
    }
    if (!started()) {
      setChildren(el, h('div', { class: 'view-head' }, h('h1', null, 'Plan')), notStarted());
      return;
    }
    setChildren(el, running());
    if (animate && el.isConnected) staggerIn([...el.querySelectorAll('.block-row')], performance.now());
  }

  load();
  render();
  return {
    el,
    onShow: () => { load(); render(true); },
    onStore: () => { if (plan) render(); },
  };
}
