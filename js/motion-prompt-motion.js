// Motion Prompt code used by the Dictionary page's opening (js/views/opening.js): the "motion"
// pack kit and #008 Kinetic typography, whose bounce is used on its own (bounceWord, at the end).
// Changes from the catalog: Windows/Android fonts added to the kit's JP and DISP stacks;
// in #008 the sample word ドン! is replaced with ことば!.
// Motion Prompt #001-024 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#001
//
// Kit for pack "motion" (Motion graphics moves / モーショングラフィックスの動き): the constants and helpers its elements share.
// Elements #001-024 · 539x208 px · cycle 4.7 s. Element code: https://showheyohtaki.github.io/motion-prompt/api/v1/en/e/<id>.txt (or /ja/).
//
// Run one element standalone in a browser:
//   1. paste this file into a <script>,
//   2. paste the element code below it (it assigns CELLS[n - 1], n = the element number inside the pack),
//   3. then add:
//        const c = document.createElement('canvas'); c.width = 539; c.height = 208; document.body.append(c);
//        const k = c.getContext('2d'), cell = CELLS.find(Boolean), t0 = performance.now();
//        (function loop() {
//          const u = ((performance.now() - t0) / 1000) % 4.7;   // seconds, 0 <= u < 4.7
//          k.setTransform(1, 0, 0, 1, 0, 0); k.clearRect(0, 0, 539, 208);
//          k.save(); cell(k, 539, 208, u); k.restore();
//          requestAnimationFrame(loop);
//        })();
// Every cell is a pure function of u, so the same call renders video frames: u = frame / fps.

// @kit
// モーショングラフィックスの演出の名前 24（各カード 539x208・4.7秒周期。各コマは時間 u の純関数）
// カードの中だけ共通パレット（濃紺の地＋青・コーラル・黄・ミント）。
const CW = 539, CH = 208;
const CYC = 4.7;                          // 各カードは4.7秒周期（ループの継ぎ目なし）
const C = {
  navy: '#0F1A3D', navy2: '#1B2A5E', navy3: '#2A3D80', dim: '#7F90C4',
  blue: '#3B7BFF', coral: '#FF6B5C', yel: '#FFC83D', mint: '#2EDBA8', white: '#FFFFFF', cream: '#FFF1D6'
};
const PAL = [C.blue, C.coral, C.yel, C.mint];
const JP = '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic UI", "Meiryo", "Noto Sans JP", sans-serif';
const DISP = '"Avenir Next", "Helvetica Neue", "Segoe UI", system-ui, sans-serif';
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, x) => a + (b - a) * x;
const P = (t, a, b) => clamp((t - a) / (b - a));
const eIO = x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
const eIOs = x => x < .5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
const eOut = x => 1 - Math.pow(1 - x, 3);
const eOut5 = x => 1 - Math.pow(1 - x, 5);
const eIn = x => x * x * x;
const smooth = x => x * x * (3 - 2 * x);
const mod = (a, n) => ((a % n) + n) % n;
const backOut = (x, s = 1.70158) => 1 + (s + 1) * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2);
const backIn = (x, s = 1.70158) => (s + 1) * x * x * x - s * x * x;
const spring = (t, w = 14, d = 7) => t <= 0 ? 0 : 1 - Math.exp(-d * t) * Math.cos(w * t);   // 0→行き過ぎ→1
function mkCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
function txt(ctx, s, x, y, font, col, align = 'left', base = 'alphabetic', ls = '0px') {
  ctx.font = font; ctx.fillStyle = col; ctx.textAlign = align; ctx.textBaseline = base; ctx.letterSpacing = ls; ctx.fillText(s, x, y); ctx.letterSpacing = '0px';
}
function rand(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function hex(c) { return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]; }
function mix(a, b, t) { const A = hex(a), B = hex(b); return `rgb(${Math.round(lerp(A[0], B[0], t))},${Math.round(lerp(A[1], B[1], t))},${Math.round(lerp(A[2], B[2], t))})`; }
function bez(x1, y1, x2, y2) {
  const cx_ = 3 * x1, bx = 3 * (x2 - x1) - cx_, ax = 1 - cx_ - bx;
  const cy_ = 3 * y1, by = 3 * (y2 - y1) - cy_, ay = 1 - cy_ - by;
  const sx = t => ((ax * t + bx) * t + cx_) * t, sy = t => ((ay * t + by) * t + cy_) * t;
  return x => { if (x <= 0) return 0; if (x >= 1) return 1; let lo = 0, hi = 1, t = x; for (let i = 0; i < 40; i++) { if (sx(t) < x) lo = t; else hi = t; t = (lo + hi) / 2; } return sy(t); };
}
function star(k, x, y, R, rot = 0, inner = 0.5, n = 5) { k.beginPath(); for (let i = 0; i < n * 2; i++) { const r = i % 2 ? R * inner : R, a = rot - Math.PI / 2 + i * Math.PI / n; const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r; i ? k.lineTo(px, py) : k.moveTo(px, py); } k.closePath(); }
function heartPath(k, s) { k.beginPath(); k.moveTo(0, s * 0.92); k.bezierCurveTo(-s * 1.75, -s * 0.12, -s * 0.85, -s * 1.2, 0, -s * 0.42); k.bezierCurveTo(s * 0.85, -s * 1.2, s * 1.75, -s * 0.12, 0, s * 0.92); k.closePath(); }
const G0 = mkCanvas(CW, CH), GK0 = G0.getContext('2d', { willReadFrequently: true });
const G1 = mkCanvas(CW, CH), GK1 = G1.getContext('2d', { willReadFrequently: true });
function stage(k, col = C.navy) { k.fillStyle = col; k.fillRect(0, 0, CW, CH); }
// ぬるっとつながる形（描く→ぼかす→しきい値）。paint(ctx) で色を塗った結果のキャンバスを返す
function goo(draw, blur, paint) {
  GK0.setTransform(1, 0, 0, 1, 0, 0); GK0.clearRect(0, 0, CW, CH); GK0.fillStyle = '#fff'; draw(GK0);
  GK1.setTransform(1, 0, 0, 1, 0, 0); GK1.globalCompositeOperation = 'source-over'; GK1.clearRect(0, 0, CW, CH);
  GK1.filter = `blur(${blur}px)`; GK1.drawImage(G0, 0, 0); GK1.filter = 'none';
  const im = GK1.getImageData(0, 0, CW, CH), d = im.data;
  for (let i = 3; i < d.length; i += 4) { const a = d[i]; d[i] = a < 112 ? 0 : a > 144 ? 255 : (a - 112) * 8; }
  GK1.putImageData(im, 0, 0);
  GK1.globalCompositeOperation = 'source-atop'; paint(GK1); GK1.globalCompositeOperation = 'source-over';
  return G1;
}
function chars(k, s, font, ls = 0) { k.font = font; const ws = [...s].map(ch => k.measureText(ch).width + ls); const tot = ws.reduce((a, b) => a + b, 0) - ls; let x = -tot / 2; return [...s].map((ch, i) => { const o = { ch, x: x + (ws[i] - ls) / 2, w: ws[i] - ls }; x += ws[i]; return o; }); }
const CELLS = [];

// @shared
// 画面A＝昼（クリーム・コーラルの太陽）／画面B＝夜（濃紺・黄色の月）。A→B→A で1周期
const SUN = [112, 104], MOON = [CW - 112, 104];
function scrA(k, w, h) {
  k.fillStyle = C.cream; k.fillRect(0, 0, w, h);
  k.fillStyle = '#FFD9A8'; k.beginPath(); k.arc(SUN[0], SUN[1], 66, 0, 7); k.fill();
  k.fillStyle = C.coral; k.beginPath(); k.arc(SUN[0], SUN[1], 44, 0, 7); k.fill();
  txt(k, 'DAY', 214, h / 2 + 4, `800 96px ${DISP}`, C.navy, 'left', 'middle', '2px');
  k.fillStyle = '#fff'; rr(k, 400, 34, 96, 26, 13); k.fill(); rr(k, 430, 20, 50, 26, 13); k.fill();
}
function scrB(k, w, h) {
  k.fillStyle = '#16255A'; k.fillRect(0, 0, w, h);
  k.fillStyle = '#fff';[[40, 30, 3], [150, 170, 2.5], [250, 24, 2.5], [330, 180, 3], [500, 30, 2.5], [20, 150, 2], [300, 100, 0]].forEach(s => { k.beginPath(); k.arc(s[0], s[1], s[2], 0, 7); k.fill(); });
  k.fillStyle = C.yel; k.beginPath(); k.arc(MOON[0], MOON[1], 46, 0, 7); k.fill();
  k.fillStyle = '#16255A'; k.beginPath(); k.arc(MOON[0] + 22, MOON[1] - 14, 38, 0, 7); k.fill();
  txt(k, 'NIGHT', 40, h / 2 + 4, `800 88px ${DISP}`, '#fff', 'left', 'middle', '1px');
}
const SCR = [scrA, scrB];
const SEG3 = CYC / 2;
function abCell(trans) { return (k, w, h, u) => { const sgi = Math.min(1, Math.floor(u / SEG3)), uu = u - sgi * SEG3; trans(k, w, h, uu, sgi, 1 - sgi); }; }
const TA = 0.5, TB = 1.5;

// Motion Prompt #008 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#008
//
// Kinetic typography / キネティックタイポグラフィ
// Pack: motion (Motion graphics moves) · element 08 · Category: Entrances & text
// What happens: Words move the way they mean: one stretches, one bounces, one spins, one slams down.
// Motion spec:
//   - Four words, 1.175 s each (bold 88 px). Each exits in its last 0.2 s, fading out while moving 46 px up (cubic ease-in).
//   - Stretch (blue): horizontal scale 0.3→1 with spring 1 − e^(−4.2t)·cos(12t); vertical scale is 1/√(horizontal).
//   - Bounce (yellow): characters staggered by 0.1 s; height 78 px × |sin(πt/0.4)| × e^(−2.6t); squashed vertically by up to 16% at each contact.
//   - Spin (mint): characters staggered by 0.12 s; rotation −360°→0° over 0.62 s with backOut (s = 1.3); scale 0→1 over 0.25 s, cubic ease-out.
//   - Slam (coral, 100 px, slanted): scale 3.4→1 at 0.02–0.2 s with cubic ease-in.
//   - After impact: horizontal shake 10 px × e^(−9t) × sin(38t), vertical squash 20% × e^(−11t), and 8 radial lines for 0.4 s.
// When to use it: Use it to make key words from narration or lyrics memorable through how they move.
// Tags: kinetic-typography, text, typography, lyric, word, bounce, spin, slam
// Size: 539x208 px · Cycle: 4.7 s
// Needs: kit motion -> https://showheyohtaki.github.io/motion-prompt/api/v1/kit/motion.js
// Live demo: https://showheyohtaki.github.io/motion-prompt/#008
//
// cells[i](k, w, h, u): k = CanvasRenderingContext2D (already cleared and wrapped in save/restore by the caller), w,h = size, u = seconds in [0, cycle). The picture depends only on u.
// Element code starts here. CELLS, constants and helpers live in the kit.

// @element 08
// 08 キネティックタイポグラフィ（言葉の意味に合わせて文字が動く：のびる／はねる／まわる／ドン！）
CELLS[7] = (k, w, h, u) => {
  stage(k);
  const T = CYC / 4, n = Math.min(3, Math.floor(u / T)), lu = u - n * T, X = w / 2, Y = h / 2 + 6;
  const out = P(lu, T - 0.2, T - 0.02), oa = 1 - out, oy = -46 * eIn(out);
  const f = `800 88px ${JP}`;
  k.save(); k.translate(X, Y + oy); k.globalAlpha = oa;
  if (n === 0) {
    const sp = spring(lu - 0.05, 12, 4.2), sx = 0.3 + 0.7 * sp, sy = 1 / Math.sqrt(Math.max(0.75, sx));
    k.globalAlpha = oa * P(lu, 0.03, 0.12); k.scale(sx, sy); txt(k, 'のびる', 0, 0, f, C.blue, 'center', 'middle', '4px');
  } else if (n === 1) {
    chars(k, 'はねる', f, 6).forEach((c, i) => {
      const tt = lu - 0.06 - i * 0.1; if (tt < 0) return;
      const y = -78 * Math.abs(Math.sin(Math.PI * tt / 0.4)) * Math.exp(-2.6 * tt), near = Math.abs(Math.sin(Math.PI * tt / 0.4)) < 0.25 ? 1 : 0;
      const sq = 1 - 0.16 * near * Math.exp(-2.6 * tt), a = P(tt, 0, 0.08);
      k.save(); k.globalAlpha = oa * a; k.translate(c.x, y + 44); k.scale(2 - sq, sq); txt(k, c.ch, 0, -44, f, C.yel, 'center', 'middle'); k.restore();
    });
  } else if (n === 2) {
    chars(k, 'まわる', f, 6).forEach((c, i) => {
      const tt = lu - 0.05 - i * 0.12; if (tt < 0) return;
      const q = backOut(P(tt, 0, 0.62), 1.3), sc = eOut(P(tt, 0, 0.25));
      k.save(); k.translate(c.x, 0); k.rotate((1 - q) * -Math.PI * 2); k.scale(sc, sc); txt(k, c.ch, 0, 0, f, C.mint, 'center', 'middle'); k.restore();
    });
  } else {
    const hit = 0.2, tt = lu - hit, sc = tt < 0 ? lerp(3.4, 1, eIn(P(lu, 0.02, hit))) : 1;
    const dx = tt > 0 ? 10 * Math.exp(-9 * tt) * Math.sin(38 * tt) : 0, sy = tt > 0 ? 1 - 0.2 * Math.exp(-11 * tt) : 1;
    k.globalAlpha = oa * P(lu, 0.02, 0.1);
    if (tt > 0 && tt < 0.4) { const q = eOut(tt / 0.4); k.strokeStyle = C.yel; k.lineWidth = 7 * (1 - q); k.lineCap = 'round'; for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + 0.2, r0 = 120 + 50 * q, r1 = r0 + 26; k.beginPath(); k.moveTo(Math.cos(a) * r0 * 1.35, Math.sin(a) * r0 * 0.5); k.lineTo(Math.cos(a) * r1 * 1.35, Math.sin(a) * r1 * 0.5); if (q < 0.97) k.stroke(); } }
    k.translate(dx, 44); k.scale(sc * (2 - sy), sc * sy); k.transform(1, 0, -0.14, 1, 0, 0); txt(k, 'ことば!', 0, -44, `800 100px ${JP}`, C.coral, 'center', 'middle');
  }
  k.restore();
};

// Motion Prompt #008 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#008
// The bounce from #008 (its はねる word, the n === 1 branch above) on its own, for one word.
// Same stagger (0.1 s), height (78 px × |sin(πt/0.4)| × e^(−2.6t)), squash (16 %) and fade-in.
// Changes: no exit, so the bounce dies away and the word comes to rest; no card background and
// the page's own colour (`color`); weight 700; each character can carry its reading above it
// (`readings[i]`), which bounces with it. The word sits low (`y` = h − 70) to leave room for
// the readings at the top of each hop. By about u = 2.4 s every hop is under half a pixel.
function bounceWord(k, w, h, u, word, readings = [], color = C.yel) {
  const X = w / 2, Y = h - 70;
  const f = `700 88px ${JP}`, rf = `600 26px ${JP}`;
  k.save(); k.translate(X, Y);
  chars(k, word, f, 6).forEach((c, i) => {
    const tt = u - 0.06 - i * 0.1; if (tt < 0) return;
    const y = -78 * Math.abs(Math.sin(Math.PI * tt / 0.4)) * Math.exp(-2.6 * tt), near = Math.abs(Math.sin(Math.PI * tt / 0.4)) < 0.25 ? 1 : 0;
    const sq = 1 - 0.16 * near * Math.exp(-2.6 * tt), a = P(tt, 0, 0.08);
    k.save(); k.globalAlpha = a; k.translate(c.x, y + 44); k.scale(2 - sq, sq);
    txt(k, c.ch, 0, -44, f, color, 'center', 'middle');
    if (readings[i]) txt(k, readings[i], 0, -44 - 44 - 18, rf, color, 'center', 'middle');
    k.restore();
  });
  k.restore();
}

export { bounceWord };
// Kit easings for the Stats bar charts' entrance (js/views/charts.js, Motion Prompt #002).
export { backOut, spring };
export const MOTION = { w: CW, h: CH, cycle: CYC };