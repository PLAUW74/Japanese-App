// The Dictionary page's opening: 言葉 bounces in character by character, each with its reading
// (こと・ば) above it, and comes to rest. Drawn in the page's blue text colour, with no background.
// The bounce of Motion Prompt #008 Kinetic typography, played once and held on the resting word.
// Motion Prompt #008 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#008
import { bounceWord, MOTION } from '../motion-prompt-motion.js';
import { h } from '../ui.js';

// The card is the motion pack's width, made a little taller so the readings clear the top of
// the first, highest hop.
const W = MOTION.w;
const H = 240;
const WORD = '言葉';
const READINGS = ['こと', 'ば'];
// By 2.4 s the last character's hops are under half a pixel; the resting frame is drawn at a
// time far past that, where the characters sit exactly on the line.
const END = 2.4;
const REST = 30;

export function createOpening() {
  const canvas = h('canvas', {
    class: 'opening',
    role: 'img',
    'aria-label': '言葉 (ことば, Kotoba), bouncing in',
    title: 'Tap to play again',
    width: W,
    height: H,
  });
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let start = 0;
  let raf = 0;

  // Draws the frame at `t` seconds, at the canvas's on-screen size so text stays sharp, in the
  // colour the stylesheet gives the canvas (the theme's blue text colour).
  function draw(t) {
    const cssWidth = canvas.clientWidth || W;
    const pixels = Math.round(cssWidth * (window.devicePixelRatio || 1));
    if (canvas.width !== pixels) {
      canvas.width = pixels;
      canvas.height = Math.round((pixels * H) / W);
    }
    const k = canvas.getContext('2d');
    const scale = canvas.width / W;
    k.setTransform(1, 0, 0, 1, 0, 0);
    k.clearRect(0, 0, canvas.width, canvas.height);
    k.save();
    k.scale(scale, scale);
    k.beginPath();
    k.rect(0, 0, W, H);
    k.clip();
    bounceWord(k, W, H, Math.max(0, t), WORD, READINGS, getComputedStyle(canvas).color);
    k.restore();
  }

  function frame(now) {
    const t = (now - start) / 1000;
    if (t < END) { draw(t); raf = requestAnimationFrame(frame); }
    else { draw(REST); raf = 0; }
  }

  function rest() {
    cancelAnimationFrame(raf);
    raf = 0;
    draw(REST);
  }

  function play() {
    if (reduceMotion.matches) { rest(); return; }
    cancelAnimationFrame(raf);
    start = performance.now();
    raf = requestAnimationFrame(frame);
  }

  const redraw = () => { if (!raf) draw(REST); };
  canvas.addEventListener('click', play);
  // Keep the resting word sharp when resized, and in the right colour when the theme changes.
  new ResizeObserver(redraw).observe(canvas);
  new MutationObserver(redraw).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', redraw);
  draw(REST);
  return { el: canvas, play, rest };
}
