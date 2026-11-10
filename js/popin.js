// Pop-in — Motion Prompt #001 (ポップイン): https://showheyohtaki.github.io/motion-prompt/#001
//
// From the reference: the element scales 0 → 1 on the spring 1 − e^(−6.5t)·cos(15t), which
// overshoots to about 1.26, while it turns from −0.35 rad (about −20°) to upright on the spring
// 1 − e^(−6t)·cos(11t). It leaves over 0.26 s with its scale multiplied by 1 − backIn(s = 2.2),
// so it swells a little and then shrinks to nothing. The keyframes are sampled from those
// formulas here rather than copied out by hand.

const spring = (t, w, d) => (t <= 0 ? 0 : 1 - Math.exp(-d * t) * Math.cos(w * t));
// The kit's backIn.
const backIn = (x, s = 1.70158) => (s + 1) * x * x * x - s * x * x;

const POP_S = 0.9;   // both springs have settled (e^(−6t) < 0.5%) by here
const OUT_S = 0.26;  // 1.86 s → 2.12 s in the reference
const STEP_S = 1 / 60;
const reduce = matchMedia('(prefers-reduced-motion: reduce)');

const popFrames = (() => {
  const frames = [];
  const count = Math.round(POP_S / STEP_S);
  for (let i = 0; i <= count; i++) {
    const t = (i / count) * POP_S;
    const scale = i === count ? 1 : spring(t, 15, 6.5);
    const turn = i === count ? 0 : (1 - spring(t, 11, 6)) * -0.35;
    frames.push({ transform: `rotate(${turn.toFixed(4)}rad) scale(${scale.toFixed(4)})` });
  }
  return frames;
})();

const running = new WeakMap();

function play(el, frames, seconds) {
  const before = running.get(el);
  const animation = el.animate(frames, { duration: seconds * 1000, easing: 'linear', fill: 'forwards' });
  if (before) before.cancel();
  running.set(el, animation);
  return animation;
}

// Shows `el` with the pop. `instant` skips the motion (a field that already has text).
export function popIn(el, { instant = false } = {}) {
  el.hidden = false;
  if (instant || reduce.matches) {
    const before = running.get(el);
    if (before) before.cancel();
    return;
  }
  play(el, popFrames, POP_S);
}

// Hides `el` with the reference's exit, starting from wherever a pop-in had got to.
export function popOut(el) {
  if (el.hidden) return;
  if (reduce.matches) {
    const before = running.get(el);
    if (before) before.cancel();
    el.hidden = true;
    return;
  }
  const now = new DOMMatrix(getComputedStyle(el).transform === 'none' ? undefined : getComputedStyle(el).transform);
  const scale = Math.hypot(now.a, now.b);
  const turn = Math.atan2(now.b, now.a);
  const frames = [];
  const count = Math.round(OUT_S / STEP_S);
  for (let i = 0; i <= count; i++) {
    const s = scale * (1 - backIn(i / count, 2.2));
    frames.push({ transform: `rotate(${turn.toFixed(4)}rad) scale(${Math.max(0, s).toFixed(4)})` });
  }
  const animation = play(el, frames, OUT_S);
  // A pop-in that starts before this ends cancels it, which rejects `finished`.
  animation.finished.then(() => {
    if (running.get(el) !== animation) return;
    el.hidden = true;
    animation.cancel();
  }, () => {});
}
