import * as store from '../store.js';
import * as sync from '../sync.js';
import { h, ja, icon, headword, reading, meaningText, setChildren, segmented } from '../ui.js';
import { THEMES, themeChoice, setThemeChoice, onThemeChange } from '../theme.js';
import { countUp } from '../countup.js';

const THEME_ICONS = { auto: 'themeAuto', light: 'sun', dark: 'moon' };

// Settings for this device. The theme lives on the device, not in the synced data, so a
// phone can stay dark while a laptop follows the time of day.
function settingsCard() {
  const picker = segmented('Theme',
    THEMES.map(([key, label]) => [key, [icon(THEME_ICONS[key]), label]]),
    themeChoice(),
    (choice) => setThemeChoice(choice));
  picker.classList.add('theme-choice');
  return h('section', { class: 'settings' },
    h('h2', { class: 'settings-title' }, 'Settings'),
    h('div', { class: 'card' },
      h('div', { class: 'setting-row' },
        h('div', null,
          h('div', { class: 'setting-name' }, 'Theme'),
          h('p', { class: 'muted small' }, 'Auto follows your device’s light or dark setting.'),
        ),
        picker,
      ),
    ),
  );
}

const ACTIVITY_DAYS = 14;

function days(count, offset) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const day = new Date(store.startOfDay());
    day.setDate(day.getDate() + offset + i);
    out.push(day);
  }
  return out;
}

function barChart(items, emptyText) {
  const max = Math.max(...items.map((item) => item.value));
  if (max === 0) return h('p', { class: 'muted' }, emptyText);
  return h('div', { class: 'bars', role: 'img', 'aria-label': items.map((item) => `${item.title}: ${item.value}`).join(', ') },
    items.map((item) => h('div', { class: `bar-col ${item.highlight ? 'today' : ''}`, title: `${item.title}: ${item.value}` },
      h('span', { class: 'bar-value' }, item.value || ''),
      h('div', { class: 'bar', style: `height:${(item.value / max) * 100}%` }),
      h('span', { class: 'bar-label' }, item.label),
    )));
}

const SYNC_TEXT = {
  loading: 'Connecting…',
  connecting: 'Connecting…',
  saving: 'Saving…',
  synced: 'Up to date',
  offline: 'Offline: changes will sync when you reconnect',
  error: 'Sync problem',
};

function accountCard() {
  const { state, email, error } = sync.status;
  let body;
  if (state === 'unconfigured') {
    body = h('p', { class: 'muted' }, 'Syncing between devices isn’t set up yet. See “Syncing between devices” in the README.');
  } else if (state === 'signed-out') {
    body = [
      h('p', { class: 'muted' }, 'Sign in to keep your words, lists and progress the same on every device. Without signing in, everything stays on this device only.'),
      h('button', { type: 'button', class: 'btn btn-primary', onclick: () => sync.signIn() }, 'Sign in with Google'),
    ];
  } else if (state === 'loading') {
    body = h('p', { class: 'muted' }, SYNC_TEXT.loading);
  } else {
    body = [
      h('p', null, 'Signed in as ', h('strong', null, email || 'your Google account'), '. Your words sync automatically.'),
      h('div', { class: 'sync-row' },
        h('span', { class: `sync-dot sync-${state}` }),
        h('span', { class: 'muted' }, SYNC_TEXT[state] || ''),
        h('button', { type: 'button', class: 'btn btn-quiet', onclick: () => sync.signOut() }, 'Sign out'),
      ),
    ];
  }
  return h('div', { class: 'card' },
    h('h2', null, 'Sync between devices'),
    body,
    error && h('p', { class: 'error' }, error),
  );
}

export function createStatsView() {
  const el = h('section', { class: 'view' });

  function tile(value, label, note) {
    return h('div', { class: 'tile' },
      h('div', { class: 'tile-value' }, value),
      h('div', { class: 'tile-label' }, label),
      note && h('div', { class: 'muted small' }, note),
    );
  }

  // The tile numbers count up when the page is opened (Motion Prompt #007, js/countup.js);
  // a redraw after a sync or a setting change shows them as they are.
  function render(animate = false) {
    const count = (n) => countUp(n, { animate });
    const log = store.combinedLog();
    const words = store.allWords();
    const now = Date.now();
    const today = log[store.dayKey()] || { reviews: 0, correct: 0 };
    const totals = Object.values(log).reduce((sum, day) => ({ reviews: sum.reviews + day.reviews, correct: sum.correct + day.correct }), { reviews: 0, correct: 0 });
    const streak = store.streak();
    const challengeLeft = store.dailyChallenge(now).left.length;

    const dayLabel = (day) => day.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    const lastTwoWeeks = days(ACTIVITY_DAYS, 1 - ACTIVITY_DAYS);
    const activity = lastTwoWeeks.map((day, i) => ({
      value: (log[store.dayKey(day)] || {}).reviews || 0,
      label: day.getDate(),
      title: dayLabel(day),
      highlight: i === ACTIVITY_DAYS - 1,
    }));
    const added = lastTwoWeeks.map((day, i) => {
      const start = day.getTime();
      return {
        value: words.filter((w) => w.addedAt >= start && w.addedAt < start + store.DAY).length,
        label: day.getDate(),
        title: dayLabel(day),
        highlight: i === ACTIVITY_DAYS - 1,
      };
    });
    // Misses from the My Words quiz plus every question a word appeared in (store.missedWords).
    const toughest = store.missedWords(5);

    setChildren(el,
      h('div', { class: 'view-head' },
        h('h1', null, 'Stats'),
        challengeLeft > 0 && h('a', { class: 'btn btn-primary', href: '#/quiz' }, `Daily challenge · ${challengeLeft} left`),
      ),
      h('div', { class: 'tiles' },
        tile([count(streak), streak === 1 ? ' day' : ' days'], 'Study streak', streak > 0 && !log[store.dayKey()] ? 'Review today to keep it going' : null),
        tile(count(words.length), 'Words saved'),
        tile(count(today.reviews), 'Reviews today', today.reviews ? `${Math.round((today.correct / today.reviews) * 100)}% correct` : null),
        tile(totals.reviews ? [count(Math.round((totals.correct / totals.reviews) * 100)), '%'] : '—', 'Overall accuracy', totals.reviews ? `${totals.reviews.toLocaleString()} reviews` : null),
      ),
      h('div', { class: 'card-pair' },
        h('div', { class: 'card' },
          h('h2', null, 'Reviews, last 14 days'),
          barChart(activity, 'No reviews yet. Finish a quiz to start your streak.'),
        ),
        h('div', { class: 'card' },
          h('h2', null, 'Words added, last 14 days'),
          barChart(added, 'No words added in the last two weeks. Save some from the dictionary.'),
        ),
      ),
      toughest.length > 0 && h('div', { class: 'card' },
        h('h2', null, 'Most missed words'),
        h('p', { class: 'muted small' }, 'Counts every quiz question a word appeared in, not only the My Words quiz.'),
        toughest.map(({ word, wrong, right }) => h('div', { class: 'missed-row' },
          h('span', null, ja(headword(word), 'missed-word'), reading(word) && ja(reading(word), 'entry-reading')),
          h('span', { class: 'muted' }, meaningText(word, 2)),
          h('span', { class: 'muted small' }, `${wrong} wrong · ${right} right`),
        )),
      ),
      accountCard(),
      settingsCard(),
    );
  }

  // Redraw so the picker shows the new choice, including one made in another tab.
  onThemeChange(() => { if (el.isConnected) render(); });
  render();
  return { el, onShow: () => render(true), onStore: () => render(false) };
}
