// Rows rising in one after another: Motion Prompt #002 Stagger, the same entrance as the Stats
// bar charts (js/views/charts.js), applied to a list.
// Motion Prompt #002 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#002
//
// The numbers carried over: item i starts at 0.15 + 0.12·i s and travels for 0.5 s with backOut
// (s = 2.6), so it overshoots and settles exactly like a bar growing. A bar grows from height 0;
// a row instead slides up from DISTANCE px below (y = DISTANCE·(1 − backOut(p)), rising about
// 0.2·DISTANCE past its place before settling) and fades in over the first 0.15 s.
import { backOut } from './motion-prompt-motion.js';

const RISE_S = 0.5;
const DISTANCE = 40;
const FADE = 0.3; // fraction of the rise spent fading in: 0.15 s
const reduce = matchMedia('(prefers-reduced-motion: reduce)');

const riseFrames = Array.from({ length: 41 }, (_, i) => {
  const p = i / 40;
  const y = i === 40 ? 0 : DISTANCE * (1 - backOut(p, 2.6));
  return { transform: `translateY(${y.toFixed(2)}px)`, opacity: Math.min(1, p / FADE).toFixed(3) };
});

// Staggers the items that are on screen (or just below it); the rest are out of sight anyway.
// `since` is when the entrance began (performance.now()), so a list redrawn part-way through
// carries on from where it was. Returns how many items it animated.
export function staggerIn(items, since) {
  if (reduce.matches || !since) return 0;
  const elapsed = performance.now() - since;
  const limit = innerHeight + DISTANCE;
  let count = 0;
  for (const item of items) {
    if (item.getBoundingClientRect().top > limit) break;
    const delay = (0.15 + 0.12 * count) * 1000 - elapsed;
    if (delay + RISE_S * 1000 > 0) {
      item.animate(riseFrames, { duration: RISE_S * 1000, delay, easing: 'linear', fill: 'backwards' });
    }
    count += 1;
  }
  return count;
}
