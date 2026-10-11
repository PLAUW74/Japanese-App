import * as store from '../store.js';
import { h, ja, headword, reading, meaningText, setChildren } from '../ui.js';

const ACTIVITY_DAYS = 14;
const FORECAST_DAYS = 7;

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

export function createStatsView() {
  const el = h('section', { class: 'view' });

  function tile(value, label, note) {
    return h('div', { class: 'tile' },
      h('div', { class: 'tile-value' }, value),
      h('div', { class: 'tile-label' }, label),
      note && h('div', { class: 'muted small' }, note),
    );
  }

  function render() {
    const { log } = store.getState();
    const words = store.allWords();
    const now = Date.now();
    const today = log[store.dayKey()] || { reviews: 0, correct: 0 };
    const totals = Object.values(log).reduce((sum, day) => ({ reviews: sum.reviews + day.reviews, correct: sum.correct + day.correct }), { reviews: 0, correct: 0 });
    const streak = store.streak();
    const counts = { new: 0, due: 0, learning: 0, mature: 0 };
    for (const word of words) counts[store.wordStatus(word, now)] += 1;
    const dueNow = words.filter((w) => store.isDue(w, now)).length;

    const dayLabel = (day) => day.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    const activity = days(ACTIVITY_DAYS, 1 - ACTIVITY_DAYS).map((day, i) => ({
      value: (log[store.dayKey(day)] || {}).reviews || 0,
      label: day.getDate(),
      title: dayLabel(day),
      highlight: i === ACTIVITY_DAYS - 1,
    }));
    const forecast = days(FORECAST_DAYS, 0).map((day, i) => {
      const end = day.getTime() + store.DAY;
      return {
        // Anything overdue is counted with today.
        value: words.filter((w) => w.srs.due < end && (i === 0 || w.srs.due >= day.getTime())).length,
        label: i === 0 ? 'Today' : day.toLocaleDateString(undefined, { weekday: 'short' }),
        title: dayLabel(day),
        highlight: i === 0,
      };
    });
    const toughest = words.filter((w) => w.stats.wrong > 0)
      .sort((a, b) => b.stats.wrong - a.stats.wrong || a.stats.correct - b.stats.correct)
      .slice(0, 5);

    const stages = [
      ['new', 'New', 'Not quizzed yet'],
      ['due', 'Due', 'Waiting for review'],
      ['learning', 'Learning', 'Next review within 3 weeks'],
      ['mature', 'Mastered', 'Review interval of 3 weeks or more'],
    ];

    setChildren(el,
      h('div', { class: 'view-head' },
        h('h1', null, 'Stats'),
        dueNow > 0 && h('a', { class: 'btn btn-primary', href: '#/quiz' }, `Review ${dueNow} due`),
      ),
      h('div', { class: 'tiles' },
        tile(`${streak} ${streak === 1 ? 'day' : 'days'}`, 'Study streak', streak > 0 && !log[store.dayKey()] ? 'Review today to keep it going' : null),
        tile(words.length, 'Words saved'),
        tile(today.reviews, 'Reviews today', today.reviews ? `${Math.round((today.correct / today.reviews) * 100)}% correct` : null),
        tile(totals.reviews ? `${Math.round((totals.correct / totals.reviews) * 100)}%` : '—', 'Overall accuracy', totals.reviews ? `${totals.reviews.toLocaleString()} reviews` : null),
      ),
      h('div', { class: 'card' },
        h('h2', null, 'Word progress'),
        words.length === 0
          ? h('p', { class: 'muted' }, 'Save some words to see how they move from new to mastered.')
          : [
            h('div', { class: 'stack', role: 'img', 'aria-label': stages.map(([key, label]) => `${label}: ${counts[key]}`).join(', ') },
              stages.filter(([key]) => counts[key] > 0).map(([key]) => h('div', { class: `stack-part status-${key}`, style: `flex-grow:${counts[key]}` }))),
            h('div', { class: 'legend' }, stages.map(([key, label, hint]) => h('div', { class: 'legend-item', title: hint },
              h('span', { class: `dot status-${key}` }),
              h('span', null, label),
              h('strong', null, counts[key]),
            ))),
          ],
      ),
      h('div', { class: 'card-pair' },
        h('div', { class: 'card' },
          h('h2', null, 'Reviews, last 14 days'),
          barChart(activity, 'No reviews yet. Finish a quiz to start your streak.'),
        ),
        h('div', { class: 'card' },
          h('h2', null, 'Reviews coming up'),
          barChart(forecast, 'Nothing scheduled for the next week.'),
        ),
      ),
      toughest.length > 0 && h('div', { class: 'card' },
        h('h2', null, 'Most missed words'),
        toughest.map((word) => h('div', { class: 'missed-row' },
          h('span', null, ja(headword(word), 'missed-word'), reading(word) && ja(reading(word), 'entry-reading')),
          h('span', { class: 'muted' }, meaningText(word, 2)),
          h('span', { class: 'muted small' }, `${word.stats.wrong} wrong · ${word.stats.correct} right`),
        )),
      ),
    );
  }

  render();
  return { el, onShow: render, onStore: render };
}
