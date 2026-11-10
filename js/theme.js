// Light / dark / auto. The choice is a per-device preference, so it lives in localStorage
// beside the app data rather than in the synced store. index.html applies it before the
// first paint; this keeps it current, and the Settings card on the Stats page changes it.

const KEY = 'kotoba:theme';
export const THEMES = [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']];
const CHOICES = THEMES.map(([key]) => key);
const system = matchMedia('(prefers-color-scheme: dark)');
const listeners = new Set();

function read() {
  try {
    const saved = localStorage.getItem(KEY);
    return CHOICES.includes(saved) ? saved : 'auto';
  } catch { return 'auto'; }
}

function save(next) {
  try {
    if (next === 'auto') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, next);
  } catch { /* storage blocked: the choice still holds until the page closes */ }
}

let choice = read();

function apply() {
  const dark = choice === 'dark' || (choice === 'auto' && system.matches);
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
}

export const themeChoice = () => choice;

export function setThemeChoice(next) {
  if (!CHOICES.includes(next) || next === choice) return;
  choice = next;
  save(choice);
  apply();
  for (const fn of listeners) fn(choice);
}

export function onThemeChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function initTheme() {
  // In Auto, follow the device when it switches (sunset schedules, a phone's quick toggle).
  system.addEventListener('change', () => { if (choice === 'auto') apply(); });
  // Another tab changed it.
  window.addEventListener('storage', (event) => {
    if (event.key !== KEY && event.key !== null) return;
    choice = read();
    apply();
    for (const fn of listeners) fn(choice);
  });
  apply();
}
