// Pagination — Motion Prompt #064 (ページネーション), adapted from the Canvas reference to the
// app's tab bar: https://showheyohtaki.github.io/motion-prompt/#064
//
// In the reference a blue circle sits behind the current page number and, on a click, travels
// straight to the new one in 0.2 s with easeInOutCubic, however far that is (two pages at once
// going from 3 back to 1). The number under the middle of the circle is drawn in white, so a
// number it passes over lights up for a moment. Here the circle is a pill the size of the tab
// it marks, in the app's accent instead of the reference's blue; the page dip that goes with
// it lives in app.js.

const MOVE_MS = 200;
// easeInOutCubic, exactly as the reference's kit defines it.
const eio = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const reduce = matchMedia('(prefers-reduced-motion: reduce)');

export function createTabMarker(nav) {
  const tabs = [...nav.querySelectorAll('a')];
  const marker = document.createElement('span');
  marker.className = 'tab-marker';
  marker.setAttribute('aria-hidden', 'true');
  marker.hidden = true;
  nav.prepend(marker);

  let target = null; // the tab the marker is heading for
  let at = null;     // where it is drawn now
  let frame = 0;

  const boxOf = (tab) => ({ x: tab.offsetLeft, y: tab.offsetTop, w: tab.offsetWidth, h: tab.offsetHeight });

  // The tab under the marker's middle reads as current, as the reference's numbers do.
  // Measured both ways, for a row of tabs that wraps onto a second line.
  function light(x, y) {
    let lit = null;
    let nearest = Infinity;
    for (const tab of tabs) {
      const off = Math.hypot(tab.offsetLeft + tab.offsetWidth / 2 - x, tab.offsetTop + tab.offsetHeight / 2 - y);
      if (off < nearest) { nearest = off; lit = tab; }
    }
    for (const tab of tabs) tab.classList.toggle('tab-lit', tab === lit);
  }

  function draw(box) {
    marker.hidden = false;
    marker.style.transform = `translate(${box.x}px, ${box.y}px)`;
    marker.style.width = `${box.w}px`;
    marker.style.height = `${box.h}px`;
    light(box.x + box.w / 2, box.y + box.h / 2);
  }

  function snap() {
    cancelAnimationFrame(frame);
    if (!target) return;
    // Not on the page yet (a quiz page builds its picker before showing it): light the right
    // tab now and measure once it is, which is by the end of the task that built it.
    if (!target.isConnected || !target.offsetWidth) {
      at = null;
      marker.hidden = true;
      for (const tab of tabs) tab.classList.toggle('tab-lit', tab === target);
      queueMicrotask(() => { if (target && target.isConnected && target.offsetWidth) snap(); });
      return;
    }
    at = boxOf(target);
    draw(at);
  }

  function moveTo(tab) {
    if (!tab) {
      cancelAnimationFrame(frame);
      target = at = null;
      marker.hidden = true;
      for (const each of tabs) each.classList.remove('tab-lit');
      return;
    }
    if (tab === target && at) return;
    target = tab;
    // First placement, or nothing to animate from: just put it there.
    if (!at || reduce.matches) { snap(); return; }
    cancelAnimationFrame(frame);
    const from = at;
    const to = boxOf(tab);
    const start = performance.now();
    const step = (now) => {
      // A frame's timestamp can fall just before the click; never ease backwards.
      const p = eio(Math.min(1, Math.max(0, (now - start) / MOVE_MS)));
      at = {
        x: from.x + (to.x - from.x) * p,
        y: from.y + (to.y - from.y) * p,
        w: from.w + (to.w - from.w) * p,
        h: from.h + (to.h - from.h) * p,
      };
      draw(at);
      if (p < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
  }

  // Tabs change size with the window, the phone layout, and the due-count badge.
  const sizes = new ResizeObserver(snap);
  sizes.observe(nav);
  for (const tab of tabs) sizes.observe(tab);

  return { moveTo };
}
