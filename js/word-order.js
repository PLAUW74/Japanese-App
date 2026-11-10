// A Duolingo-style word order board: tiles start in a bank and are tapped or dragged into an
// answer line between the fixed start and end of the sentence.
//
// - Tap a tile in the bank to add it to the end of the answer; tap one in the answer to send
//   it back. Enter and Space do the same, since the tiles are buttons.
// - Drag a tile into the answer, to a new place in it, or back out to the bank. The tiles
//   already in the answer slide apart to show where it will land.
// - A tile that has left the bank leaves a dashed gap of its own size, so the bank never
//   reflows, and every move slides the tiles to their new places rather than jumping.
import { h, rubyMarkup } from './ui.js';

const MOVE_MS = 250;
const MOVE_EASE = 'cubic-bezier(0.33, 1, 0.68, 1)'; // easeOutCubic
const DRAG_START_PX = 6;
const reduce = matchMedia('(prefers-reduced-motion: reduce)');

// Slides `tiles` from where they were to where `change` puts them.
function slide(tiles, change) {
  const before = new Map(tiles.map((tile) => [tile, tile.getBoundingClientRect()]));
  change();
  if (reduce.matches) return;
  for (const tile of tiles) {
    const was = before.get(tile);
    const now = tile.getBoundingClientRect();
    const dx = was.left - now.left;
    const dy = was.top - now.top;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
    tile.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: MOVE_MS, easing: MOVE_EASE });
  }
}

// `parts` are in the order the tiles start in the bank, in 漢字{かんじ} markup. `onChange` hears
// whether every tile has been placed.
export function wordOrder({ before, parts, after, onChange = () => {} }) {
  const answer = h('div', { class: 'wo-answer', role: 'list', 'aria-label': 'Your sentence' });
  const sentence = h('div', { class: 'wo-sentence', lang: 'ja' },
    before && h('span', { class: 'wo-fixed' }, rubyMarkup(before)),
    answer,
    after && h('span', { class: 'wo-fixed' }, rubyMarkup(after)),
  );
  const tiles = parts.map((text, i) => h('button', { type: 'button', class: 'wo-tile', lang: 'ja', 'data-part': String(i) }, rubyMarkup(text)));
  const homes = tiles.map((tile) => h('span', { class: 'wo-home' }, tile));
  const bank = h('div', { class: 'wo-bank', 'aria-label': 'Word tiles' }, homes);
  const root = h('div', { class: 'word-order' }, sentence, bank);
  let locked = false;

  const inAnswer = (tile) => tile.parentNode === answer;
  const placed = () => [...answer.querySelectorAll('.wo-tile')];
  const changed = () => {
    homes.forEach((home, i) => home.classList.toggle('vacant', inAnswer(tiles[i])));
    bank.classList.toggle('done', placed().length === tiles.length);
    onChange(placed().length === tiles.length);
  };
  // Give each home slot its tile's size, so it keeps its place in the bank while empty.
  const holdSizes = () => homes.forEach((home, i) => {
    if (inAnswer(tiles[i])) return;
    home.style.width = `${tiles[i].offsetWidth}px`;
    home.style.height = `${tiles[i].offsetHeight}px`;
  });

  function toggle(tile) {
    if (locked) return;
    holdSizes();
    slide(tiles, () => {
      if (inAnswer(tile)) homes[tiles.indexOf(tile)].append(tile);
      else answer.append(tile);
    });
    changed();
    tile.focus({ preventScroll: true });
  }

  // ---- dragging ----

  let drag = null; // { tile, startX, startY, offsetX, offsetY, moved, gap }

  // Where in the answer a tile dropped at (x, y) would go, reading row by row. Measured from
  // the layout (offsetLeft/Top) rather than the screen, so tiles still sliding into place
  // don't make the gap jump back and forth.
  function indexAt(x, y) {
    const area = answer.getBoundingClientRect();
    const px = x - area.left;
    const py = y - area.top;
    const others = placed().filter((tile) => tile !== drag.tile);
    for (let i = 0; i < others.length; i++) {
      const { offsetLeft: left, offsetTop: top, offsetWidth: width, offsetHeight: height } = others[i];
      if (py < top) return i;
      if (py <= top + height && px < left + width / 2) return i;
    }
    return others.length;
  }

  function overAnswer(x, y) {
    const box = answer.getBoundingClientRect();
    const reach = 24; // a little give around the line
    return x > box.left - reach && x < box.right + reach && y > box.top - reach && y < box.bottom + reach;
  }

  function startDrag(event) {
    const { tile } = drag;
    holdSizes();
    const box = tile.getBoundingClientRect();
    drag.offsetX = event.clientX - box.left;
    drag.offsetY = event.clientY - box.top;
    drag.gap = h('span', { class: 'wo-gap', 'aria-hidden': 'true' });
    drag.gap.style.width = `${box.width}px`;
    drag.gap.style.height = `${box.height}px`;
    // The gap takes the tile's place in the answer while it is lifted out.
    slide(placed().filter((t) => t !== tile), () => {
      if (inAnswer(tile)) tile.replaceWith(drag.gap);
      tile.classList.add('dragging');
      tile.style.width = `${box.width}px`;
      root.append(tile);
    });
    homes.forEach((home, i) => home.classList.toggle('vacant', tiles[i] === tile || inAnswer(tiles[i])));
    moveDrag(event);
  }

  function moveDrag(event) {
    const { tile, gap } = drag;
    tile.style.left = `${event.clientX - drag.offsetX}px`;
    tile.style.top = `${event.clientY - drag.offsetY}px`;
    const others = placed();
    if (overAnswer(event.clientX, event.clientY)) {
      const at = indexAt(event.clientX, event.clientY);
      const target = others[at] || null;
      if (gap.parentNode !== answer || gap.nextSibling !== target) {
        slide(others, () => answer.insertBefore(gap, target));
      }
    } else if (gap.parentNode) {
      slide(others, () => gap.remove());
    }
  }

  function endDrag() {
    const { tile, gap } = drag;
    const was = tile.getBoundingClientRect();
    tile.classList.remove('dragging');
    tile.style.left = tile.style.top = tile.style.width = '';
    if (gap.parentNode === answer) gap.replaceWith(tile);
    else homes[tiles.indexOf(tile)].append(tile);
    gap.remove();
    // Settle the dropped tile from where it was let go.
    if (!reduce.matches) {
      const now = tile.getBoundingClientRect();
      tile.animate([{ transform: `translate(${was.left - now.left}px, ${was.top - now.top}px)` }, { transform: 'none' }],
        { duration: MOVE_MS, easing: MOVE_EASE });
    }
    changed();
  }

  // The pointer is followed on the window: lifting the tile out moves it in the page, which
  // would drop a pointer capture on the tile itself.
  function onMove(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (!drag.moved) {
      if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < DRAG_START_PX) return;
      drag.moved = true;
      startDrag(event);
      return;
    }
    event.preventDefault();
    moveDrag(event);
  }

  function onUp(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const { tile, moved } = drag;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    if (moved) {
      endDrag();
      // A drag can end in a click on the tile; ignore that one, and only that one.
      tile.dataset.dragged = '1';
      setTimeout(() => { tile.dataset.dragged = ''; }, 0);
    }
    drag = null;
  }

  tiles.forEach((tile) => {
    tile.addEventListener('pointerdown', (event) => {
      if (locked || event.button > 0 || drag) return;
      drag = { tile, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, moved: false };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    });
    tile.addEventListener('click', () => {
      if (tile.dataset.dragged) return;
      toggle(tile);
    });
  });

  return {
    el: root,
    // The parts as arranged, in markup.
    arranged: () => placed().map((tile) => parts[Number(tile.dataset.part)]),
    // Freezes the board and marks each placed tile right or wrong against `order`.
    lock(order) {
      locked = true;
      placed().forEach((tile, i) => tile.classList.add(parts[Number(tile.dataset.part)] === order[i] ? 'right' : 'wrong'));
      tiles.forEach((tile) => { tile.disabled = true; });
    },
  };
}
