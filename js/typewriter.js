// Typewriter — Motion Prompt #006 (タイプライター), adapted from the Canvas reference
// to real <input> fields: https://showheyohtaki.github.io/motion-prompt/#006
//
// The reference plays a scripted 4.7 s loop: nine characters land in a white field one
// every 0.24 s, each settling from scale 1.35 with 1 + 0.35·e^(−16t); a coral cursor sits
// after the last character, solid while typing and blinking on a 0.94 s period (0.5 s on)
// otherwise; the send button's disc springs in with 1 − e^(−6.5t)·cos(15t), is pressed with
// a half sine that takes 20% off its size, and the text flies 70 px up as it fades.
//
// Here the same shapes, timings and easings are driven by the person at the keyboard
// instead of by a clock: a character pops when it is actually typed, the cursor goes solid
// while keys are coming and blinks when they stop, and the submit button arms as soon as
// there is something to send. Only the text, colours and assets are the app's own — the
// cursor and the armed button use --accent, which is already this app's coral.
//
// The curves live in css/style.css as keyframes sampled from those formulas, so a keystroke
// costs one span and none of our own animation frames.

// 0.24 s between characters in the reference, plus the 0.1 s the cursor stays solid after
// the last one: how long after a keystroke we still count as "typing".
const TYPING_GRACE = 340;
const PRESS_MS = 250;   // 2.96 s → 3.21 s
const DISARM_MS = 300;  // 3.51 s → 3.81 s
const FLY_MS = 450;     // press → text gone
const FLY_HALF = 310;   // the cursor goes home once the text is half faded

const FIELDS = 'input[type="text"], input[type="search"]';
// Properties the overlay borrows so its characters land exactly where the real ones would.
const COPY = [
  'font', 'letterSpacing', 'textAlign', 'textIndent', 'textTransform', 'direction', 'color',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
  // The wrapper holds the field's margins too, so the overlay insets by the same amount
  // to land on the field itself (homework blanks sit in a line of text with margins).
  'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
];

const reduce = matchMedia('(prefers-reduced-motion: reduce)');
const fields = new WeakMap();
const all = new Set(); // live instances, for the colour-scheme restyle

const chars = (text) => Array.from(text);
// selectionStart counts UTF-16 units; the spans are one per code point.
const caretIndex = (input) => {
  try {
    const at = input.selectionStart;
    return at == null ? chars(input.value).length : chars(input.value.slice(0, at)).length;
  } catch { return chars(input.value).length; }
};
const selecting = (input) => {
  try { return input.selectionStart !== input.selectionEnd; } catch { return false; }
};

// Fields that fill their row get a block wrapper; the rest (homework blanks, list names)
// keep the width they style themselves, so the wrapper only has to shrink around them.
const WIDE = '.search-input, .answer-input, .filter-input';

function wrap(input) {
  const holder = document.createElement('span');
  holder.className = input.matches(WIDE) ? 'tw-field' : 'tw-field tw-inline';
  input.parentNode.insertBefore(holder, input);
  holder.appendChild(input);
  const ghost = document.createElement('span');
  ghost.className = 'tw-ghost';
  ghost.setAttribute('aria-hidden', 'true');
  const row = document.createElement('span');
  row.className = 'tw-row';
  const caret = document.createElement('span');
  caret.className = 'tw-caret';
  row.appendChild(caret);
  ghost.appendChild(row);
  holder.appendChild(ghost);
  return { holder, ghost, row, caret };
}

// The submit button of the form this field belongs to: the reference's send button.
function sendButton(input) {
  const button = input.form && input.form.querySelector('button[type="submit"]');
  if (!button) return null;
  // The arming disc paints behind the label, so the label needs a box of its own.
  for (const node of [...button.childNodes]) {
    if (node.nodeType !== 3 || !node.textContent.trim()) continue;
    const label = document.createElement('span');
    label.className = 'tw-label';
    node.replaceWith(label);
    label.appendChild(node);
  }
  button.classList.add('tw-send');
  return button;
}

class Typewriter {
  constructor(input) {
    this.input = input;
    Object.assign(this, wrap(input));
    this.button = sendButton(input);
    this.shown = [];  // code points currently drawn, one span each
    this.spans = [];
    this.native = false;
    this.graceTimer = 0;
    this.disarmTimer = 0;
    this.flyTimers = [];
    input.classList.add('tw-on');

    this.on('input', () => this.typed());
    this.on('focus', () => { this.restyle(); this.sync(); });
    this.on('blur', () => this.sync());
    // Long text scrolls the field; the overlay has to scroll with it.
    this.on('scroll', () => this.track());
    this.on('keydown', (event) => {
      if (event.key.length === 1 || event.key === 'Backspace' || event.key === 'Delete') this.touch();
    });
    // A Japanese IME draws its own candidate text in the field: stand aside until it commits.
    this.on('compositionstart', () => { this.composing = true; this.setNative(true); });
    this.on('compositionend', () => { this.composing = false; this.setNative(false); this.typed(); });
    if (this.button) {
      this.button.addEventListener('pointerdown', () => this.press());
      if (input.form) input.form.addEventListener('submit', () => this.press());
    }
    this.sizes = new ResizeObserver(() => this.restyle());
    this.sizes.observe(input);
    this.restyle();
    this.sync({ arm: 'instant' });
  }

  on(type, fn) { this.input.addEventListener(type, fn); }

  restyle() {
    const from = getComputedStyle(this.input);
    for (const prop of COPY) this.ghost.style[prop] = from[prop];
  }

  // A keystroke landed: pop whatever is new, hold the cursor solid for a moment.
  typed() { this.touch(); this.sync(); }

  touch() {
    this.caret.classList.add('tw-solid');
    clearTimeout(this.graceTimer);
    this.graceTimer = setTimeout(() => this.caret.classList.remove('tw-solid'), TYPING_GRACE);
  }

  setNative(on) {
    if (this.native === on) return;
    this.native = on;
    this.input.classList.toggle('tw-on', !on);
    this.ghost.classList.toggle('tw-off', on);
  }

  // Redraw the overlay: keep the characters that are still there, pop the ones that aren't.
  sync({ arm } = {}) {
    const input = this.input;
    // A selection would show as highlighted nothing, so hand those back to the browser.
    this.setNative(selecting(input) || this.composing === true);
    const next = chars(input.value);
    let same = 0;
    while (same < next.length && same < this.shown.length && next[same] === this.shown[same]) same += 1;
    for (const span of this.spans.splice(same)) span.remove();
    const pop = !reduce.matches;
    for (let i = same; i < next.length; i += 1) {
      const span = document.createElement('span');
      span.className = pop ? 'tw-ch tw-pop' : 'tw-ch';
      span.textContent = next[i];
      this.row.insertBefore(span, this.caret);
      this.spans.push(span);
    }
    this.shown = next;
    this.placeCaret();
    this.track();
    this.updateSend(arm);
  }

  // Keep the overlay lined up with a field that has scrolled sideways.
  track() {
    if (this.row.classList.contains('tw-sent')) return;
    const by = this.input.scrollLeft;
    this.row.style.transform = by ? `translateX(${-by}px)` : '';
  }

  placeCaret(at = caretIndex(this.input)) {
    const focused = document.activeElement === this.input;
    this.caret.hidden = !focused || this.input.disabled || this.input.readOnly || this.native;
    const before = this.spans[at] || null;
    if (this.caret.nextSibling !== before) this.row.insertBefore(this.caret, before);
  }

  // Grey, then the accent disc springs in as soon as there is something to send.
  updateSend(mode) {
    const button = this.button;
    if (!button) return;
    const ready = this.input.value.trim() !== '';
    const armed = button.classList.contains('tw-armed');
    if (ready === armed) return;
    clearTimeout(this.disarmTimer);
    button.classList.remove('tw-disarming');
    if (ready) {
      button.classList.toggle('tw-instant', mode === 'instant' || reduce.matches);
      button.classList.add('tw-armed');
    } else {
      button.classList.remove('tw-armed', 'tw-instant');
      if (reduce.matches) return;
      button.classList.add('tw-disarming');
      this.disarmTimer = setTimeout(() => button.classList.remove('tw-disarming'), DISARM_MS);
    }
  }

  // Pressed: the button dips by a fifth, and if the field is emptied the text flies up.
  press() {
    const button = this.button;
    if (!button || reduce.matches || !button.classList.contains('tw-armed')) return;
    button.classList.remove('tw-press');
    void button.offsetWidth; // let the animation restart on a second press
    button.classList.add('tw-press');
    setTimeout(() => button.classList.remove('tw-press'), PRESS_MS + 20);
    const sent = this.input.value;
    requestAnimationFrame(() => { if (sent && this.input.value === '') this.fly(); });
  }

  fly() {
    for (const timer of this.flyTimers) clearTimeout(timer);
    this.row.classList.add('tw-sent');
    this.flyTimers = [
      setTimeout(() => this.placeCaret(0), FLY_HALF),
      setTimeout(() => { this.row.classList.remove('tw-sent'); this.sync(); }, FLY_MS),
    ];
  }

  destroy() {
    clearTimeout(this.graceTimer);
    clearTimeout(this.disarmTimer);
    for (const timer of this.flyTimers) clearTimeout(timer);
    this.sizes.disconnect();
    this.input.classList.remove('tw-on');
    this.ghost.remove();
    if (this.holder.isConnected) this.holder.replaceWith(this.input);
    all.delete(this);
  }
}

function add(input) {
  const had = fields.get(input);
  if (had) {
    // A re-render can lift the input back out of its wrapper; give it a fresh one.
    if (had.holder.isConnected && input.parentNode === had.holder) return;
    had.destroy();
  }
  if (input.dataset.noTypewriter != null || !input.parentNode) return;
  const made = new Typewriter(input);
  fields.set(input, made);
  all.add(made);
}

// Views rebuild their fields as people move around the app, so watch for new ones
// rather than asking every view to opt in.
export function enableTypewriter(root = document.body) {
  for (const input of root.querySelectorAll(FIELDS)) add(input);
  new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.matches(FIELDS)) add(node);
        for (const input of node.querySelectorAll(FIELDS)) add(input);
      }
    }
  }).observe(root, { childList: true, subtree: true });

  // Cursor moves that aren't keystrokes: arrow keys, clicks, selections.
  document.addEventListener('selectionchange', () => {
    const live = fields.get(document.activeElement);
    if (live) live.sync();
  });
  for (const query of [matchMedia('(prefers-color-scheme: dark)'), reduce]) {
    query.addEventListener('change', () => { for (const live of all) live.restyle(); });
  }
}
