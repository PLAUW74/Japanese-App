// Kotoba Battle: spell hiragana words from a 4x4 grid to attack. js/battle.js holds the
// rules and the numbers; this file draws them and runs the turn.

import * as store from '../store.js';
import * as dict from '../dict.js';
import { h, ja, icon, speak, setChildren, toast, meaningText, badges } from '../ui.js';
import {
  PLAYER_HP, ENEMIES, ABILITIES, ABILITY_CHANCE, CURSE_HP, MAX_LOCKED,
  buildPool, newGrid, refill, toTiles, damageFor, freshness,
  hintTarget, slotsFor, topicLabel, topicIcon,
} from '../battle.js';

const HIT_MS = 1500;       // how long the hit popup holds before the enemy replies

export function createBattleView() {
  const el = h('div', { class: 'battle-view' });
  let pool = null;          // { pool, byForm, tileWeights }
  let loading = null;
  let game = null;          // the fight in progress, or null on the setup screen

  // ---- loading the word pool ----

  function ensurePool() {
    if (pool || loading) return loading;
    loading = buildPool().then((built) => {
      pool = built;
      loading = null;
      if (!game) renderSetup();
      return built;
    }, (err) => {
      loading = null;
      setChildren(el, h('div', { class: 'card empty' },
        h('h2', null, 'The word list could not be loaded'),
        h('p', { class: 'muted' }, err.message)));
    });
    return loading;
  }

  // ---- the setup screen ----

  function renderSetup() {
    const ready = !!pool;
    setChildren(el,
      h('div', { class: 'view-head' },
        h('h1', null, 'Kotoba Battle'),
        h('p', { class: 'muted' },
          'Spell words from the grid to attack. Longer words hit harder, words the enemy '
          + 'is weak to hit double, and words you owe a review hit hardest of all.')),
      h('div', { class: 'battle-picker' }, ENEMIES.map((enemy) => h('button', {
        type: 'button', class: 'card battle-enemy-card', disabled: !ready,
        onclick: () => start(enemy),
      },
        h('div', { class: 'battle-face' }, enemy.face),
        h('div', { class: 'battle-enemy-body' },
          h('h3', null, enemy.name),
          h('p', { class: 'muted' }, enemy.blurb),
          h('div', { class: 'battle-stats' },
            h('span', { class: 'badge badge-jlpt' }, `${topicIcon(enemy.topic)} weak to ${topicLabel(enemy.topic).toLowerCase()}`),
            h('span', { class: 'badge' }, `${enemy.hp} HP`),
            h('span', { class: 'badge' }, `hits ${enemy.attack[0]}–${enemy.attack[1]}`))),
      ))),
      !ready && h('p', { class: 'muted battle-loading' }, 'Loading the dictionary…'),
    );
  }

  // ---- starting a fight ----

  function start(enemy) {
    const { cells } = newGrid(pool.pool, pool.byForm, enemy.topic, pool.tileWeights);
    game = {
      enemy,
      enemyHp: enemy.hp,
      playerHp: PLAYER_HP,
      cells,
      selected: [],          // slot indexes, in the order tapped
      effects: new Map(),    // slot -> { kind, turns }
      hintTier: 0,
      hintRow: null,
      hintSlots: [],
      usedIds: new Set(),    // entries already played, so repeats stop paying
      log: [],               // { row, damage, hintTier } per attack
      hinted: [],            // rows the player needed a hint for
      found: [],             // rows that were not in the word list
      busy: false,
      over: null,            // 'won' | 'lost'
      match: null,           // the pool row the selection spells, when it does
    };
    renderBattle();
  }

  // ---- the selection ----

  const selectedKana = () => game.selected.map((i) => game.cells[i]).join('');

  // Slots the player cannot use this turn.
  const blockedSlots = () => new Set([...game.effects]
    .filter(([, effect]) => effect.kind === 'lock')
    .map(([slot]) => slot));

  // What the grid can still spell with, for hints and seeding checks.
  const availableTiles = () => game.cells.filter((cell, i) => !blockedSlots().has(i));

  // Looks up what the selection spells. The curated pool answers first, and it holds the
  // seven conjugated forms too, so のみました is found. Anything else goes to the full
  // dictionary, where a real word still counts — it just gets no topic or form bonus.
  async function checkSelection() {
    const kana = selectedKana();
    if (kana.length < 1) { game.match = null; return; }
    const row = pool.byForm.get(kana);
    if (row) { game.match = row; return; }
    const [found] = await dict.spell([kana]);
    if (!game) return;
    if (game.selected.map((i) => game.cells[i]).join('') !== kana) return; // moved on
    game.match = found && found.length
      ? { entry: found[0], kana, tiles: toTiles(kana), topics: [], conjugated: false, form: null }
      : null;
  }

  function toggleSlot(slot) {
    if (game.busy || game.over) return;
    if (blockedSlots().has(slot)) { toast('That tile is locked.'); return; }
    const at = game.selected.indexOf(slot);
    if (at >= 0) game.selected.splice(at, 1);
    else game.selected.push(slot);
    // A fogged tile shows its kana once it is selected.
    const fight = game;
    checkSelection().then(() => { if (game === fight && !game.over) renderBattle(); });
    renderBattle();
  }

  // ---- the attack ----

  function playerAttack() {
    if (game.busy || game.over || !game.match) return;
    const row = game.match;
    const onTopic = row.topics.includes(game.enemy.topic);
    const fresh = freshness(row.entry, game.usedIds);
    const working = damageFor({
      mora: row.tiles.length,
      onTopic,
      fresh,
      conjugated: row.conjugated,
      hintTier: game.hintTier,
    });

    // A cursed tile in the word costs HP whether or not the hit lands well.
    const cursed = game.selected.filter((i) => {
      const effect = game.effects.get(i);
      return effect && effect.kind === 'curse';
    });
    const curseCost = cursed.length * CURSE_HP;

    game.busy = true;
    game.enemyHp = Math.max(0, game.enemyHp - working.total);
    game.playerHp = Math.max(0, game.playerHp - curseCost);
    game.log.push({ row, damage: working.total, hintTier: game.hintTier, fresh });
    if (game.hintTier > 0) game.hinted.push(row);
    if (!store.hasWord(row.entry.id) && !game.found.some((f) => f.entry.id === row.entry.id)) {
      game.found.push(row);
    }
    game.usedIds.add(row.entry.id);

    speak(row.kana);
    showHit(row, working, { onTopic, fresh, curseCost });

    // Used tiles drop out; cursed ones are spent with them.
    const emptied = [...game.selected];
    for (const slot of emptied) game.effects.delete(slot);
    refill(game.cells, emptied, pool.pool, pool.byForm, game.enemy.topic, pool.tileWeights);
    game.selected = [];
    game.match = null;
    clearHint();

    const fight = game;
    setTimeout(() => {
      if (game !== fight) return; // gave up while the hit was showing
      hideHit();
      if (game.enemyHp === 0) { finish('won'); return; }
      if (game.playerHp === 0) { finish('lost'); return; }
      enemyTurn();
    }, HIT_MS);
    renderBattle();
  }

  function enemyTurn() {
    const [low, high] = game.enemy.attack;
    const hit = low + Math.floor(Math.random() * (high - low + 1));
    game.playerHp = Math.max(0, game.playerHp - hit);
    game.lastEnemyHit = hit;

    // Effects tick down before a new one lands, so a 2-turn lock really lasts 2 turns.
    for (const [slot, effect] of [...game.effects]) {
      const turns = effect.turns - 1;
      if (turns <= 0 && effect.kind !== 'curse') game.effects.delete(slot);
      else game.effects.set(slot, { ...effect, turns });
    }
    game.ability = null;
    if (Math.random() < ABILITY_CHANCE) game.ability = castAbility();

    game.busy = false;
    if (game.playerHp === 0) finish('lost');
    else renderBattle();
  }

  // Abilities disrupt the grid rather than adding damage, so the fight stays about words.
  function castAbility() {
    const taken = new Set(game.effects.keys());
    const free = game.cells.map((_, i) => i).filter((i) => !taken.has(i));
    if (!free.length) return null;
    const locked = [...game.effects.values()].filter((e) => e.kind === 'lock').length;
    const kinds = ['fog', 'curse'];
    if (locked < MAX_LOCKED) kinds.push('lock');
    const kind = kinds[Math.floor(Math.random() * kinds.length)];
    const slot = free[Math.floor(Math.random() * free.length)];
    game.effects.set(slot, { kind, turns: ABILITIES[kind].turns });
    return { kind, slot };
  }

  function finish(result) {
    game.over = result;
    game.busy = false;
    renderRecap();
  }

  // ---- hints ----

  function clearHint() {
    game.hintTier = 0;
    game.hintRow = null;
    game.hintSlots = [];
  }

  function takeHint() {
    if (game.busy || game.over || game.hintTier >= 3) return;
    if (!game.hintRow) {
      game.hintRow = hintTarget(game.cells, availableTiles(), pool.pool, pool.byForm, game.enemy.topic, game.usedIds);
      if (!game.hintRow) { toast('Nothing left to point at — try a scramble.'); return; }
    }
    game.hintTier += 1;
    const slots = slotsFor(game.cells, blockedSlots(), game.hintRow.tiles);
    if (game.hintTier === 2) game.hintSlots = slots.slice(0, 1);
    else if (game.hintTier === 3) game.hintSlots = slots;
    else game.hintSlots = [];
    renderBattle();
  }

  function scramble() {
    if (game.busy || game.over) return;
    const { cells } = newGrid(pool.pool, pool.byForm, game.enemy.topic, pool.tileWeights);
    game.cells = cells;
    // A scramble clears curses with the tiles they sat on, as the doc says.
    for (const [slot, effect] of [...game.effects]) if (effect.kind === 'curse') game.effects.delete(slot);
    game.selected = [];
    game.match = null;
    clearHint();
    game.busy = true;
    renderBattle();
    const fight = game;
    setTimeout(() => { if (game === fight) enemyTurn(); }, 300);
  }

  // ---- the hit popup ----

  function showHit(row, working, { onTopic, fresh, curseCost }) {
    game.hit = { row, working, onTopic, fresh, curseCost };
  }
  const hideHit = () => { game.hit = null; };

  function hitPopup() {
    if (!game.hit) return null;
    const { row, working, curseCost } = game.hit;
    const entry = row.entry;
    const written = entry.kanji.length ? entry.kanji[0] : '';
    return h('div', { class: 'battle-hit' },
      h('div', { class: 'battle-hit-card' },
        h('div', { class: 'battle-hit-word' },
          ja(row.kana, 'battle-hit-kana'),
          written && written !== row.kana && ja(written, 'battle-hit-kanji')),
        row.form && h('p', { class: 'battle-hit-form' },
          `${row.form.label} of `, ja(row.form.base)),
        h('p', { class: 'battle-hit-meaning' }, meaningText(entry)),
        h('div', { class: 'badge-row' },
          ...badges(entry).filter(Boolean),
          !store.hasWord(entry.id) && h('span', { class: 'badge status-new' }, 'New'),
        ),
        h('div', { class: 'battle-working' },
          h('span', { class: 'battle-working-base' }, `${row.tiles.length} mora = ${working.base}`),
          ...working.parts.map((part) => h('span', { class: 'battle-working-part' },
            `+${part.value} ${part.label}`)),
          working.hintKeep < 1 && h('span', { class: 'battle-working-hint' },
            `hint keeps ${Math.round(working.hintKeep * 100)}% of the bonus`),
        ),
        h('div', { class: 'battle-hit-total' }, `${working.total} damage`),
        curseCost > 0 && h('p', { class: 'battle-hit-curse' }, `A cursed tile cost you ${curseCost} HP.`),
      ));
  }

  // ---- drawing the fight ----

  function hpBar(label, now, max, cls) {
    return h('div', { class: `battle-hp ${cls}` },
      h('div', { class: 'battle-hp-top' },
        h('span', null, label),
        h('span', { class: 'battle-hp-num' }, `${now} / ${max}`)),
      h('div', { class: 'battle-hp-track' },
        h('div', { class: 'battle-hp-fill', style: `width: ${(now / max) * 100}%` })));
  }

  function tileButton(slot) {
    const effect = game.effects.get(slot);
    const picked = game.selected.includes(slot);
    const order = game.selected.indexOf(slot) + 1;
    const fogged = effect && effect.kind === 'fog' && !picked;
    const classes = ['battle-tile'];
    if (picked) classes.push('picked');
    if (effect) classes.push(`tile-${effect.kind}`);
    if (game.hintSlots.includes(slot)) classes.push('hinted');
    return h('button', {
      type: 'button',
      class: classes.join(' '),
      disabled: game.busy || !!game.over,
      title: effect ? `${ABILITIES[effect.kind].label}: ${ABILITIES[effect.kind].note}` : '',
      onclick: () => toggleSlot(slot),
    },
      ja(fogged ? '？' : game.cells[slot], 'battle-tile-kana'),
      picked && h('span', { class: 'battle-tile-order' }, String(order)),
      effect && effect.kind === 'curse' && h('span', { class: 'battle-tile-mark' }, '✖'),
      effect && effect.kind === 'lock' && h('span', { class: 'battle-tile-mark' }, '🔒'),
    );
  }

  // The damage the selection would deal, shown on the Attack button before it lands.
  function previewDamage() {
    if (!game.match) return null;
    const row = game.match;
    return damageFor({
      mora: row.tiles.length,
      onTopic: row.topics.includes(game.enemy.topic),
      fresh: freshness(row.entry, game.usedIds),
      conjugated: row.conjugated,
      hintTier: game.hintTier,
    });
  }

  function renderBattle() {
    if (!game) return;
    const preview = previewDamage();
    const kana = selectedKana();
    const hintNote = [
      null,
      game.hintRow && `Find the word for “${meaningText(game.hintRow.entry, 1)}”`,
      game.hintRow && `“${meaningText(game.hintRow.entry, 1)}” — first tile lit`,
      game.hintRow && `“${meaningText(game.hintRow.entry, 1)}” — whole word lit`,
    ][game.hintTier];

    setChildren(el,
      h('div', { class: 'battle-top' },
        h('div', { class: 'battle-enemy' },
          h('div', { class: 'battle-face' }, game.enemy.face),
          h('div', { class: 'battle-enemy-info' },
            h('h2', null, game.enemy.name),
            h('span', { class: 'badge badge-jlpt' },
              `${topicIcon(game.enemy.topic)} weak to ${topicLabel(game.enemy.topic).toLowerCase()}`),
            hpBar('Enemy', game.enemyHp, game.enemy.hp, 'enemy'))),
        hpBar('You', game.playerHp, PLAYER_HP, 'player'),
        game.lastEnemyHit != null && !game.busy && h('p', { class: 'battle-note' },
          `${game.enemy.name} hit you for ${game.lastEnemyHit}.`,
          game.ability && ` ${ABILITIES[game.ability.kind].label} a tile.`),
      ),

      h('div', { class: 'battle-word-strip' },
        kana
          ? ja(kana, 'battle-word')
          : h('span', { class: 'muted' }, 'Tap tiles to spell a word'),
        kana && !game.match && h('span', { class: 'battle-word-bad' }, 'not a word yet'),
      ),

      h('div', { class: 'battle-grid' }, game.cells.map((_, i) => tileButton(i))),

      hintNote && h('p', { class: 'battle-hint-note' }, hintNote),

      h('div', { class: 'battle-actions' },
        h('button', {
          type: 'button', class: 'btn btn-primary btn-large battle-attack',
          disabled: !game.match || game.busy || !!game.over,
          onclick: playerAttack,
        }, preview ? `Attack for ${preview.total}` : 'Attack'),
        h('button', {
          type: 'button', class: 'btn btn-quiet',
          disabled: game.busy || !!game.over || game.hintTier >= 3,
          onclick: takeHint,
        }, ['Hint', 'Hint 2 of 3', 'Hint 3 of 3', 'No hints left'][game.hintTier]),
        h('button', {
          type: 'button', class: 'btn btn-quiet',
          disabled: game.busy || !!game.over,
          onclick: scramble,
        }, 'Scramble (costs your turn)'),
        h('button', { type: 'button', class: 'btn btn-quiet', onclick: quit }, 'Give up'),
      ),
      hitPopup(),
    );
  }

  function quit() {
    game = null;
    renderSetup();
  }

  // ---- the recap ----

  function renderRecap() {
    const won = game.over === 'won';
    const rows = [];
    const seen = new Set();
    for (const hit of game.log) {
      if (seen.has(hit.row.kana)) continue;
      seen.add(hit.row.kana);
      rows.push(hit);
    }
    const needHints = game.hinted.filter((row, i, list) =>
      list.findIndex((r) => r.entry.id === row.entry.id) === i);

    setChildren(el,
      h('div', { class: `card battle-recap ${won ? 'won' : 'lost'}` },
        h('div', { class: 'battle-face' }, won ? '🎉' : game.enemy.face),
        h('h2', null, won ? `${game.enemy.name} is beaten` : `${game.enemy.name} wins this time`),
        h('p', { class: 'muted' }, won
          ? `${game.log.length} words, ${game.enemy.hp} damage.`
          : 'Your word list is kept. Try again — the grid will be different.'),

        rows.length > 0 && h('div', { class: 'battle-recap-block' },
          h('h4', null, 'Words you used'),
          h('ul', { class: 'battle-recap-list' }, rows.map((hit) => recapRow(hit.row, `${hit.damage} dmg`)))),

        game.found.length > 0 && h('div', { class: 'battle-recap-block' },
          h('h4', null, 'New words you found'),
          h('ul', { class: 'battle-recap-list' }, game.found.map((row) => recapRow(row, null, true)))),

        needHints.length > 0 && h('div', { class: 'battle-recap-block' },
          h('h4', null, 'Words you needed a hint for'),
          h('ul', { class: 'battle-recap-list' }, needHints.map((row) => recapRow(row, null, true)))),

        h('div', { class: 'battle-recap-actions' },
          h('button', { type: 'button', class: 'btn btn-primary', onclick: () => start(game.enemy) },
            won ? 'Fight again' : 'Try again'),
          h('button', { type: 'button', class: 'btn btn-quiet', onclick: quit }, 'Choose another enemy')),
      ));
  }

  // One recap line. Adding a conjugated form saves the verb it came from, so たべた puts
  // たべる on the list.
  function recapRow(row, note, offerAdd = false) {
    const entry = row.entry;
    const written = entry.kanji.length ? entry.kanji[0] : '';
    const saved = store.hasWord(entry.id);
    const addButton = h('button', {
      type: 'button', class: saved ? 'btn btn-small btn-saved' : 'btn btn-small',
      disabled: saved,
      onclick: () => {
        store.addWord(entry);
        toast(`${entry.kana[0]} added to My Words`);
        renderRecap();
      },
    }, saved ? [icon('check'), ' Saved'] : [icon('plus'), ' Add']);

    return h('li', { class: 'battle-recap-row' },
      h('div', { class: 'battle-recap-word' },
        ja(row.kana, 'battle-recap-kana'),
        written && written !== row.kana && ja(written, 'battle-recap-kanji'),
        row.form && h('span', { class: 'muted' }, ` (${row.form.label} of ${row.form.base})`)),
      h('div', { class: 'battle-recap-meaning' }, meaningText(entry, 2)),
      h('div', { class: 'battle-recap-side' },
        note && h('span', { class: 'badge' }, note),
        offerAdd && addButton),
      h('button', {
        type: 'button', class: 'btn btn-small btn-quiet', title: 'Play',
        onclick: () => speak(row.kana),
      }, icon('speaker')),
    );
  }

  renderSetup();
  ensurePool();

  return {
    el,
    onShow: () => { ensurePool(); if (!game) renderSetup(); },
    onStore: () => { if (!game) renderSetup(); },
  };
}
