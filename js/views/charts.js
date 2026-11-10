// The Stats page's bar charts, with an entrance from the Motion Prompt library.
//
// Bar chart — Motion Prompt #002 Stagger: https://showheyohtaki.github.io/motion-prompt/#002
// Motion Prompt #002 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#002
// The numbers carried over: bar i starts at 0.15 + 0.12·i s and grows from the baseline to full
// height in 0.5 s with backOut (s = 2.6), overshooting and settling. The white dot that pops
// 0.34 s after its bar with spring 1 − e^(−7t)·cos(16t) is the bar's value label here. The bars
// keep the app's colours rather than the reference's rotating palette.
import { h } from '../ui.js';
import { backOut, spring } from '../motion-prompt-motion.js';

const reduce = matchMedia('(prefers-reduced-motion: reduce)');

// ---- bars (#002) ----

// The backOut grow and the spring pop, sampled into keyframes for the Web Animations API.
const sampled = (steps, durationS, value, toFrame) => Array.from({ length: steps + 1 }, (_, i) => toFrame(i === steps ? 1 : value((i / steps) * durationS)));
const GROW_S = 0.5;
const POP_S = 0.7; // e^(−7t) is under 1% by here
const growFrames = sampled(40, GROW_S, (t) => backOut(t / GROW_S, 2.6), (v) => ({ transform: `scaleY(${v.toFixed(4)})` }));
const popFrames = sampled(42, POP_S, (t) => spring(t, 16, 7), (v) => ({ transform: `scale(${v.toFixed(4)})` }));

// `since` is when the entrance began (performance.now()), or 0 for none. A chart redrawn
// part-way through (Stats redraws when the sync status changes) carries on from there.
export function barChart(items, emptyText, { since = 0 } = {}) {
  const max = Math.max(...items.map((item) => item.value));
  if (max === 0) return h('p', { class: 'muted' }, emptyText);
  const chart = h('div', { class: 'bars', role: 'img', 'aria-label': items.map((item) => `${item.title}: ${item.value}`).join(', ') },
    items.map((item) => h('div', { class: `bar-col ${item.highlight ? 'today' : ''}`, title: `${item.title}: ${item.value}` },
      h('span', { class: 'bar-value' }, item.value || ''),
      h('div', { class: 'bar', style: `height:${(item.value / max) * 100}%` }),
      h('span', { class: 'bar-label' }, item.label),
    )));
  const elapsed = since ? performance.now() - since : Infinity;
  if (elapsed < 2500 && !reduce.matches) {
    chart.querySelectorAll('.bar-col').forEach((col, i) => {
      const start = (0.15 + 0.12 * i) * 1000 - elapsed; // negative: already under way
      col.querySelector('.bar').animate(growFrames, { duration: GROW_S * 1000, delay: start, easing: 'linear', fill: 'backwards' });
      col.querySelector('.bar-value').animate(popFrames, { duration: POP_S * 1000, delay: start + 340, easing: 'linear', fill: 'backwards' });
    });
  }
  return chart;
}
