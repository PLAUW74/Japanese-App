// Dropdown (select) — Motion Prompt #053 (ドロップダウン), as a real, keyboard-usable picker:
// https://showheyohtaki.github.io/motion-prompt/#053
//
// From the reference: a 38 px field (radius 8) with the value and a chevron. Opening runs
// 0 → 1 over 0.25 s with easeOutCubic: the list fades in while dropping 6 px, the chevron
// turns 180° and the border becomes 2 px of the accent. Rows sit 26 px apart and the one under
// the pointer is highlighted. Picking closes the list over 0.15 s (1 − easeInOutCubic); the old
// value fades out over 0.1 s and the new one fades in over 0.1 s, 0.02 s later, so the two
// never overlap, and the accent border stays for 0.6 s. The reference starts the fade-out a
// moment before its scripted click; a real click can't be anticipated, so here it starts on it.
//
// Same arguments as segmented() in ui.js, so a setting can switch between the two freely.
import { h, icon } from './ui.js';

const OPEN_MS = 250;
const CLOSE_MS = 150;
const FADE_MS = 100;
const GAP_MS = 20;
const SETTLE_MS = FADE_MS + GAP_MS + FADE_MS; // the new value is fully in
const CHOSEN_MS = 600;                          // 2.3 s → 2.9 s in the reference
const DROP_PX = 6;

const easeOut = (x) => 1 - Math.pow(1 - x, 3);
const easeInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const reduce = matchMedia('(prefers-reduced-motion: reduce)');

// The quiz setups redraw after a setting changes. The dropdown that made the change leaves a
// note so its replacement keeps focus and the lingering accent border.
let handoff = null; // { name, focus, chosenUntil }
let uid = 0;

export function dropdown(name, options, value, onChange) {
  const id = `dropdown-${++uid}`;
  const current = () => options.find(([key]) => key === value) || options[0];

  const valueText = h('span', { class: 'dropdown-value' }, current()[1]);
  const chevron = h('span', { class: 'dropdown-chevron' }, icon('chevron'));
  const field = h('button', {
    type: 'button',
    class: 'dropdown-field',
    role: 'combobox',
    'aria-haspopup': 'listbox',
    'aria-expanded': 'false',
    'aria-controls': `${id}-list`,
    'aria-label': name,
  }, valueText, chevron);
  const items = options.map(([key, label], i) => h('li', {
    id: `${id}-${i}`,
    role: 'option',
    class: 'dropdown-option',
    'aria-selected': String(key === value),
  }, label));
  const list = h('ul', { id: `${id}-list`, class: 'dropdown-list', role: 'listbox', 'aria-label': name, hidden: true }, items);
  const root = h('div', { class: 'dropdown' }, field, list);

  let amount = 0;   // how open, 0–1
  let frame = 0;
  let active = -1;  // highlighted row
  let chosenTimer = 0;

  function draw() {
    list.hidden = amount <= 0;
    list.style.opacity = String(amount);
    list.style.transform = `translateY(${(-DROP_PX * (1 - amount)).toFixed(2)}px)`;
    chevron.style.transform = `rotate(${(180 * amount).toFixed(1)}deg)`;
  }

  // Runs `amount` to `to` along `ease`; an interrupted run carries on from where it was.
  function animate(to, ms, ease) {
    cancelAnimationFrame(frame);
    if (reduce.matches) { amount = to; draw(); return; }
    const from = amount;
    const duration = ms * Math.abs(to - from);
    const start = performance.now();
    const step = (now) => {
      const p = duration ? Math.min(1, Math.max(0, (now - start) / duration)) : 1;
      amount = from + (to - from) * ease(p);
      draw();
      if (p < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
  }

  function highlight(i) {
    active = i;
    items.forEach((item, j) => item.classList.toggle('active', j === i));
    if (i >= 0) {
      field.setAttribute('aria-activedescendant', items[i].id);
      items[i].scrollIntoView({ block: 'nearest' });
    } else {
      field.removeAttribute('aria-activedescendant');
    }
  }

  const isOpen = () => root.classList.contains('open');

  function onOutside(event) {
    if (!root.contains(event.target)) close();
  }

  function open() {
    if (isOpen()) return;
    root.classList.add('open');
    field.setAttribute('aria-expanded', 'true');
    highlight(Math.max(0, options.findIndex(([key]) => key === value)));
    document.addEventListener('pointerdown', onOutside, true);
    animate(1, OPEN_MS, easeOut);
  }

  function close() {
    if (!isOpen()) return;
    root.classList.remove('open');
    field.setAttribute('aria-expanded', 'false');
    highlight(-1);
    document.removeEventListener('pointerdown', onOutside, true);
    animate(0, CLOSE_MS, (p) => easeInOut(p));
  }

  function linger(until) {
    const left = until - performance.now();
    if (left <= 0) return;
    root.classList.add('chosen');
    clearTimeout(chosenTimer);
    chosenTimer = setTimeout(() => root.classList.remove('chosen'), left);
  }

  function choose(i) {
    const [key, label] = options[i];
    close();
    if (key === value) return;
    value = key;
    items.forEach((item, j) => item.setAttribute('aria-selected', String(j === i)));
    linger(performance.now() + CHOSEN_MS);
    const commit = () => {
      handoff = { name, focus: document.activeElement === field, chosenUntil: performance.now() + CHOSEN_MS - SETTLE_MS };
      onChange(key);
    };
    if (reduce.matches) { valueText.textContent = label; commit(); return; }
    // Old value out, a short gap, new value in, then tell the page. Timers run the steps, so
    // the choice always lands even if the animations are held up; the fades are only looks.
    const out = valueText.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FADE_MS, easing: 'linear', fill: 'forwards' });
    setTimeout(() => {
      valueText.textContent = label;
      valueText.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FADE_MS, delay: GAP_MS, easing: 'linear', fill: 'backwards' });
      out.cancel();
    }, FADE_MS);
    setTimeout(commit, SETTLE_MS);
  }

  field.addEventListener('click', () => (isOpen() ? close() : open()));
  field.addEventListener('keydown', (event) => {
    const last = options.length - 1;
    const moves = { ArrowDown: active + 1, ArrowUp: active - 1, Home: 0, End: last };
    if (!isOpen()) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) { event.preventDefault(); open(); }
      return;
    }
    if (event.key in moves) { event.preventDefault(); highlight(Math.min(last, Math.max(0, moves[event.key]))); }
    else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (active >= 0) choose(active); }
    else if (event.key === 'Escape') { event.preventDefault(); close(); }
    else if (event.key === 'Tab') close();
  });
  // Keep focus on the field while the pointer is in the list.
  list.addEventListener('pointerdown', (event) => event.preventDefault());
  items.forEach((item, i) => {
    item.addEventListener('pointermove', () => { if (active !== i) highlight(i); });
    item.addEventListener('click', () => choose(i));
  });

  // Taking over from the dropdown this one replaces.
  if (handoff && handoff.name === name) {
    const { focus, chosenUntil } = handoff;
    handoff = null;
    linger(chosenUntil);
    if (focus) queueMicrotask(() => { if (field.isConnected) field.focus({ preventScroll: true }); });
  }

  return root;
}
