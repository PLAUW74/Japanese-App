// Count-up — Motion Prompt #007 (カウントアップ): https://showheyohtaki.github.io/motion-prompt/#007
//
// From the reference: the number runs from 0 to its target between 0.45 s and 2.9 s as
// round(target × (1 − (1 − p)^4)), fast at first and slow at the end. Digits are all the same
// width and the number is right-aligned in the space its final value needs, so it never
// jitters sideways; thousands get a separator. When it lands, its colour switches (the
// reference's white → yellow is the app's ink → accent) and its scale bounces with
// 1 + 0.07·e^(−7t)·cos(15t).

const START_MS = 450;
const RUN_MS = 2450;  // 0.45 s → 2.9 s
const BOUNCE_S = 0.7; // e^(−7t) is under 1% by here
const reduce = matchMedia('(prefers-reduced-motion: reduce)');

const bounceFrames = (() => {
  const frames = [];
  const steps = 42;
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * BOUNCE_S;
    const scale = i === steps ? 1 : 1 + 0.07 * Math.exp(-7 * t) * Math.cos(15 * t);
    frames.push({ transform: `scale(${scale.toFixed(4)})` });
  }
  return frames;
})();

const plain = (n) => n.toLocaleString('en-US');

// A number that counts up to `target`. `animate` false shows the final value straight away
// (a page redrawn after a sync shouldn't count again).
export function countUp(target, { animate = true, format = plain } = {}) {
  const final = format(target);
  const el = document.createElement('span');
  el.className = 'count-up';
  // Room for the final value, digits tabular, number pushed to the right edge.
  el.style.minWidth = `${final.length}ch`;
  el.textContent = final;
  // Shown without counting, it is already in its landed state.
  if (!animate || reduce.matches || target === 0) { el.classList.add('landed'); return el; }

  el.textContent = format(0);
  let frame = 0;
  let start = 0;
  const step = (now) => {
    if (!el.isConnected) { cancelAnimationFrame(frame); return; } // the page was redrawn
    if (!start) start = now;
    const p = Math.min(1, Math.max(0, (now - start - START_MS) / RUN_MS));
    el.textContent = format(Math.round(target * (1 - Math.pow(1 - p, 4))));
    if (p < 1) { frame = requestAnimationFrame(step); return; }
    el.classList.add('landed');
    el.animate(bounceFrames, { duration: BOUNCE_S * 1000, easing: 'linear' });
  };
  frame = requestAnimationFrame(step);
  return el;
}
