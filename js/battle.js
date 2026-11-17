// Kotoba Battle: the rules engine. Tiles, the grid and its seeding, what a selection
// spells, and what it costs the enemy. No DOM — js/views/battle.js draws this.

import * as store from './store.js';
import * as dict from './dict.js';
import { conjugations } from './conjugate.js';
import { TOPICS, topicsByKana, parseForm, pinnedKanji, allKana } from './battle-words.js';

// ---- tiles ----

// Small kana ride on the tile before them, so きゃ is one tile and one mora. っ and ん
// stand alone, which is what makes them their own beat in the word too.
const SMALL = 'ゃゅょぁぃぅぇぉ';

export function toTiles(kana) {
  const tiles = [];
  for (const ch of kana) {
    if (SMALL.includes(ch) && tiles.length) tiles[tiles.length - 1] += ch;
    else tiles.push(ch);
  }
  return tiles;
}

export const GRID = 16;

// Can this word be built from these tiles, without using any tile twice?
export function canSpell(tiles, wordTiles) {
  const left = new Map();
  for (const tile of tiles) left.set(tile, (left.get(tile) || 0) + 1);
  for (const tile of wordTiles) {
    const have = left.get(tile) || 0;
    if (!have) return false;
    left.set(tile, have - 1);
  }
  return true;
}

// ---- damage ----

// Every number the fight is balanced on, in one place.
//
// The factors are ADDED and then applied once, rather than multiplied together: five
// multiplied factors gave a 1–32 spread, so a fight was either two jackpot words or
// thirty chip words and there was no length to tune. Added bonuses keep the ceiling at
// about 20x the floor and leave the floor at 2, not 1.
//
// `fresh` replaces the design doc's JLPT multiplier. A word's JLPT level says nothing
// about whether THIS player knows it, and nothing on the grid tells them which spellable
// words are N4, so they could never choose it — it was variance, not a decision. The
// review schedule in js/store.js does know, so damage follows that instead: words that
// are due or still being learned pay the most, a word never met before pays a discovery
// bonus, and words already mastered or already used this battle pay the least. JLPT level
// is still shown on the hit, as information.
//
// `hint` shrinks the BONUS and never the base, so a hinted word always beats a blind
// guess. Multiplying the total instead made tier 3 worth less than guessing, which left
// the system meant to stop the player being stuck making things worse.
export const DAMAGE = {
  moraBase: { 1: 1, 2: 2, 3: 4, 4: 7, 5: 10, 6: 13 },  // 6 covers 6 mora and up
  topic: 1.0,       // the enemy's weakness
  fresh: { due: 1.0, learning: 0.8, new: 0.5, mature: 0, used: 0 },
  conjugated: 0.2,  // a verb played in a conjugated form
  hint: { 0: 1, 1: 0.8, 2: 0.5, 3: 0.2 },
};

export const PLAYER_HP = 40;

// Where a word sits in the player's own study, which is what drives the bonus.
// 'used'    already played in this battle, so repeats stop paying
// 'due'     saved and due for review, or saved and never practised — what needs the work
// 'learning' saved, practised, not yet mature
// 'new'     not in the word list at all: stumbled on, worth finding
// 'mature'  saved and known cold
export function freshness(entry, usedIds) {
  if (usedIds.has(entry.id)) return 'used';
  if (!store.hasWord(entry.id)) return 'new';
  const word = store.getState().words[entry.id];
  const status = store.wordStatus(word);
  if (status === 'new' || status === 'due') return 'due';
  return status === 'mature' ? 'mature' : 'learning';
}

// The damage a play deals, plus the working to show on the hit.
export function damageFor({ mora, onTopic, fresh, conjugated, hintTier = 0 }) {
  const base = DAMAGE.moraBase[Math.min(Math.max(mora, 1), 6)];
  const parts = [];
  let bonus = 0;
  if (onTopic) { bonus += DAMAGE.topic; parts.push({ label: 'weakness', value: DAMAGE.topic }); }
  const freshBonus = DAMAGE.fresh[fresh] || 0;
  if (freshBonus) parts.push({ label: FRESH_LABEL[fresh], value: freshBonus });
  bonus += freshBonus;
  if (conjugated) { bonus += DAMAGE.conjugated; parts.push({ label: 'conjugated', value: DAMAGE.conjugated }); }
  const keep = DAMAGE.hint[hintTier] ?? 1;
  const multiplier = 1 + bonus * keep;
  return {
    base,
    parts,
    hintKeep: keep,
    multiplier,
    total: Math.max(1, Math.round(base * multiplier)),
  };
}

const FRESH_LABEL = {
  due: 'due for review', learning: 'still learning', new: 'new word',
  mature: 'known', used: 'already used',
};

// ---- the word pool ----

// The seven forms the design doc asks for, built from the dictionary form. conjugate.js
// derives them from the entry's word class, so the exceptions (いく → いった) come free.
const FORM_LABELS = {
  polite: 'polite', politePast: 'polite past', politeNegative: 'polite negative',
  past: 'past', te: 'て-form', negative: 'negative', want: 'want to',
};

function battleForms(entry, kana) {
  const built = conjugations(entry, kana, '');
  if (!built) return [];
  const by = {};
  for (const row of built.rows) by[row.key] = row.written;
  if (!by.polite) return [];
  const forms = {
    polite: by.polite,
    politePast: by.polite.replace(/ます$/, 'ました'),
    politeNegative: by.polite.replace(/ます$/, 'ません'),
    past: by.past,
    te: by.te,
    negative: by.negative,
    want: by.want,
  };
  return Object.entries(forms)
    .filter(([, text]) => text && text !== kana)
    .map(([key, text]) => ({ key, text, label: FORM_LABELS[key], base: kana, className: built.title }));
}

// Resolves every curated kana string against the dictionary once, and returns the pool
// the grid seeds from and the lookup the attack button checks against.
//
// byForm maps a spellable kana string -> { entry, kana, tiles, topics, conjugated, form }.
// The dictionary form and all seven conjugations of a verb each get an entry, so
// のみました is found without being written down anywhere.
export async function buildPool() {
  const kanaList = allKana();
  const found = await dict.spell(kanaList);
  const pool = [];
  const byForm = new Map();

  kanaList.forEach((kana, i) => {
    const candidates = found[i] || [];
    if (!candidates.length) return;
    const tags = topicsByKana.get(kana) || [];
    const topics = [...new Set(tags.map((t) => t.topic))];
    // The pinned kanji picks the sense the topic means: かい is 貝, not 会.
    const pin = pinnedKanji(kana);
    const entry = (pin && candidates.find((c) => c.kanji.includes(pin))) || candidates[0];

    const item = { entry, kana, tiles: toTiles(kana), topics, conjugated: false, form: null };
    pool.push(item);
    if (!byForm.has(kana)) byForm.set(kana, item);

    for (const form of battleForms(entry, kana)) {
      const tiles = toTiles(form.text);
      const row = { entry, kana: form.text, tiles, topics, conjugated: true, form };
      pool.push(row);
      if (!byForm.has(form.text)) byForm.set(form.text, row);
    }
  });

  return { pool, byForm, tileWeights: weightsFrom(pool) };
}

// How often each tile shows up across the pool, so a random tile is one that tends to
// build words. Combined tiles come out naturally rare, as the doc wants.
function weightsFrom(pool) {
  const counts = new Map();
  for (const item of pool) {
    for (const tile of item.tiles) counts.set(tile, (counts.get(tile) || 0) + 1);
  }
  return [...counts.entries()].map(([tile, count]) => ({ tile, weight: count }));
}

export function randomTile(weights) {
  const total = weights.reduce((sum, w) => sum + w.weight, 0);
  let roll = Math.random() * total;
  for (const { tile, weight } of weights) {
    roll -= weight;
    if (roll <= 0) return tile;
  }
  return weights[weights.length - 1].tile;
}

// A random tile that the grid does not already hold MAX_COPIES of. ん and う are the
// commonest tiles in the pool by far, and left alone the weighting buried a grid in four
// or five of them — sixteen tiles with five ん spell almost nothing.
const MAX_COPIES = 2;

function freshTile(cells, weights) {
  let tile = randomTile(weights);
  for (let tries = 0; tries < 20; tries++) {
    if (cells.filter((c) => c === tile).length < MAX_COPIES) return tile;
    tile = randomTile(weights);
  }
  return tile;
}

// ---- what the player can spell ----

// The hiragana readings of the player's saved words, as pool rows when the pool has
// them. A saved word the grid could never spell (katakana, kanji-only reading) is skipped.
export function savedRows(byForm) {
  const rows = [];
  for (const word of store.allWords()) {
    for (const kana of word.kana) {
      const row = byForm.get(kana);
      if (row) { rows.push(row); break; }
    }
  }
  return rows;
}

const studied = () => new Set(store.allWords().map((w) => w.id));

// ---- the grid ----

// The seeding rule: every grid, including after a refill, can spell all three of these at
// once without sharing a tile — a long topic word as the jackpot, one word off the
// player's own list, and one topic word they have not studied yet. Returns the chosen
// seeds so the hint system and the refill can keep them true.
function chooseSeeds(pool, byForm, topic) {
  const onTopic = pool.filter((p) => p.topics.includes(topic));
  const known = studied();
  const pick = (list) => (list.length ? list[Math.floor(Math.random() * list.length)] : null);

  for (let tries = 0; tries < 60; tries++) {
    const jackpot = pick(onTopic.filter((p) => p.tiles.length >= 4 && p.tiles.length <= 5));
    const mine = pick(savedRows(byForm).filter((p) => p.tiles.length <= 4))
      || pick(onTopic.filter((p) => p.tiles.length <= 3));
    const fresh = pick(onTopic.filter((p) => !known.has(p.entry.id) && p.tiles.length <= 4));
    const seeds = [jackpot, mine, fresh].filter(Boolean);
    if (!seeds.length) continue;
    const tiles = seeds.flatMap((s) => s.tiles);
    if (tiles.length <= GRID - 2) return { seeds, tiles };
  }
  // Nothing fitted: a short topic word on its own still beats an unseeded grid.
  const fallback = pick(onTopic.filter((p) => p.tiles.length <= 4));
  return fallback ? { seeds: [fallback], tiles: [...fallback.tiles] } : { seeds: [], tiles: [] };
}

// A fresh grid: the seed tiles in random slots, weighted random tiles for the rest.
export function newGrid(pool, byForm, topic, weights) {
  const { seeds, tiles } = chooseSeeds(pool, byForm, topic);
  const slots = Array.from({ length: GRID }, (_, i) => i);
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }
  const cells = new Array(GRID).fill(null);
  tiles.forEach((tile, i) => { cells[slots[i]] = tile; });
  for (let i = 0; i < GRID; i++) if (!cells[i]) cells[i] = freshTile(cells, weights);
  return { cells, seeds };
}

// Used tiles drop out and new ones fall in, and the three seeding promises must still
// hold afterwards. Each one is checked against the board in turn, reserving the slots of
// the words already promised so no two share a tile. A promise the board no longer keeps
// is repaired with the word that needs the fewest new tiles — most of a jackpot is often
// already lying there — and those tiles go into the slots that just emptied. Only when
// they run out does the refill borrow an unreserved tile, so the board barely moves.
export function refill(cells, emptied, pool, byForm, topic, weights) {
  for (const i of emptied) cells[i] = null;
  // Shuffled, so a repaired word never lands on the board in reading order.
  const open = [...emptied].sort(() => Math.random() - 0.5);
  const reserved = new Set();
  const known = studied();
  const onTopic = pool.filter((p) => p.topics.includes(topic));
  const promises = [
    onTopic.filter((p) => p.tiles.length >= 4 && p.tiles.length <= 5),
    savedRows(byForm).filter((p) => p.tiles.length <= 4),
    onTopic.filter((p) => !known.has(p.entry.id) && p.tiles.length <= 4),
  ];

  for (const list of promises) {
    if (!list.length) continue;
    // Kept already? Reserve the slots that spell it and move on.
    const kept = list.find((p) => slotsFor(cells, reserved, p.tiles).length === p.tiles.length);
    if (kept) { for (const s of slotsFor(cells, reserved, kept.tiles)) reserved.add(s); continue; }

    // Repair with the cheapest word: count what each candidate is missing.
    let best = null;
    for (const row of list) {
      const plan = repairPlan(cells, reserved, row.tiles);
      if (!best || plan.missing.length < best.plan.missing.length) best = { row, plan };
      if (best.plan.missing.length <= 1) break;
    }
    const { row, plan } = best;
    const borrowable = cells.map((c, i) => i)
      .filter((i) => cells[i] && !reserved.has(i) && !plan.reuse.includes(i));
    if (plan.missing.length > open.length + borrowable.length) continue;
    for (const s of plan.reuse) reserved.add(s);
    for (const tile of plan.missing) {
      const slot = open.length ? open.shift() : borrowable.splice(Math.floor(Math.random() * borrowable.length), 1)[0];
      cells[slot] = tile;
      reserved.add(slot);
    }
  }

  for (const slot of open) cells[slot] = freshTile(cells, weights);
  return cells;
}

// Which board slots a word could reuse, and which of its tiles would have to be placed.
function repairPlan(cells, reserved, wordTiles) {
  const reuse = [];
  const missing = [];
  for (const tile of wordTiles) {
    const slot = cells.findIndex((c, i) => c === tile && !reserved.has(i) && !reuse.includes(i));
    if (slot < 0) missing.push(tile);
    else reuse.push(slot);
  }
  return { reuse, missing };
}

// ---- hints ----

// What the hint points at: the player's own list first, then the enemy's topic, then
// anything the grid can spell, so there is always something to find.
export function hintTarget(cells, available, pool, byForm, topic, usedIds) {
  const spellable = (list) => list.filter((p) => canSpell(available, p.tiles) && !usedIds.has(p.entry.id));
  const mine = spellable(savedRows(byForm));
  if (mine.length) return mine[Math.floor(Math.random() * mine.length)];
  const onTopic = spellable(pool.filter((p) => p.topics.includes(topic)));
  if (onTopic.length) return onTopic[Math.floor(Math.random() * onTopic.length)];
  const any = spellable(pool);
  return any.length ? any[Math.floor(Math.random() * any.length)] : null;
}

// Which grid slots spell the target word, so tier 2 can light the first one and tier 3
// the lot. Walks the tiles in order and never reuses a slot.
export function slotsFor(cells, blocked, wordTiles) {
  const used = new Set();
  const out = [];
  for (const tile of wordTiles) {
    const slot = cells.findIndex((cell, i) => cell === tile && !used.has(i) && !blocked.has(i));
    if (slot < 0) return [];
    used.add(slot);
    out.push(slot);
  }
  return out;
}

// ---- enemies ----

// HP and attack ranges are the design doc's. The player's 40 HP is up from the doc's 30:
// at 30, a 55 HP enemy demanded an average of 6.4 damage every turn, which no beginner
// playing two- and three-mora words can reach, so the fight was unwinnable rather than
// hard. At 40 the floor strategy — a three-mora on-topic word each turn — wins in seven.
export const ENEMIES = [
  {
    id: 'oni', name: 'Hungry Oni', face: '👹', topic: 'food', hp: 55, attack: [2, 4],
    blurb: 'Clutches a rice bowl. Food words cut deepest.',
  },
  {
    id: 'tanuki', name: 'Forest Tanuki', face: '🦝', topic: 'animals', hp: 60, attack: [2, 5],
    blurb: 'Knows every creature in the wood — and fears being named.',
  },
  {
    id: 'imp', name: 'Thunder Imp', face: '⚡', topic: 'nature', hp: 65, attack: [3, 5],
    blurb: 'Rides the storm. Weather and wild words ground it.',
  },
];

export const ABILITY_CHANCE = 0.65;

export const ABILITIES = {
  lock: { label: 'Locked', turns: 2, note: 'This tile cannot be used.' },
  fog: { label: 'Fogged', turns: 3, note: 'Hidden until you select it.' },
  curse: { label: 'Cursed', turns: Infinity, note: 'Using this tile costs you 3 HP.' },
};

export const CURSE_HP = 3;
export const MAX_LOCKED = 2;

export const topicLabel = (key) => (TOPICS[key] ? TOPICS[key].label : key);
export const topicIcon = (key) => (TOPICS[key] ? TOPICS[key].icon : '');

export { parseForm };
