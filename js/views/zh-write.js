// Writing: a sentence or a journal entry, checked against the learner's HSK band as it is
// typed, and corrected by Claude through a copied prompt and a pasted reply
// (js/lang/zh/correction.js). Each correction is kept twice: with the entry in the
// journal, and as a mistake to practise in the Quiz tab's mistakes list.
//
// The page is built once and updated in place: redrawing the text box on every keystroke
// would throw the cursor out of it — and out of a pinyin input method mid-word.
import * as store from '../store.js';
import * as dict from '../lang/zh/dict.js';
import { grammar, NAME_EN } from '../lang/zh/content.js';
import { correctionPrompt, parseCorrection, markWrong, characterCount, CLAUDE_URL } from '../lang/zh/correction.js';
import { h, setChildren, toast, segmented, confirmButton } from '../ui.js';

const BANDS = [1, 2, 3, 4, 5, 6];

const pointLabel = ([, , , name, detail, patterns]) =>
  [NAME_EN[name] || name, detail].filter(Boolean).join(' · ') + (patterns.length ? ` — ${patterns.slice(0, 3).join('、')}` : '');

const formatDay = (ts) => new Date(ts).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

export function createZhWriteView() {
  let points = null;
  const saved = store.getState().settings.writeDraft || {};
  const draft = { text: saved.text || '', focus: saved.focus || '', reply: saved.reply || '', editing: saved.editing || '' };
  let lastSaved = '';
  let checkId = 0;
  let checkTimer;
  let draftTimer;

  const band = () => Number(store.getState().settings.band) || 1;
  const focusPoint = () => (points || []).find((p) => p[0] === draft.focus) || null;

  function keepDraft() {
    clearTimeout(draftTimer);
    draftTimer = setTimeout(() => store.saveSettings({ writeDraft: { ...draft } }), 300);
  }

  // ---- the pieces that stay put ----

  const focusSelect = h('select', {
    class: 'write-focus',
    'aria-label': 'Grammar point to practise',
    onchange: (event) => { draft.focus = event.target.value; keepDraft(); renderPrompt(); },
  });

  const bandSlot = h('div');
  const textBox = h('textarea', {
    class: 'write-text',
    lang: 'zh-CN',
    rows: 4,
    placeholder: 'Write a sentence or two, in characters, with your pinyin keyboard.',
    'aria-label': 'What you are writing',
    oninput: (event) => {
      draft.text = textBox.value;
      keepDraft();
      renderPrompt();
      // A pinyin input method sends half-typed syllables; check the text once it settles.
      if (!event.isComposing) scheduleCheck();
    },
    oncompositionend: () => scheduleCheck(),
  });
  textBox.value = draft.text;

  const stats = h('p', { class: 'muted small write-stats' });
  const flags = h('div', { class: 'write-flags' });

  const promptText = h('textarea', { class: 'write-prompt', readonly: true, rows: 9, 'aria-label': 'The prompt for Claude' });
  const promptBox = h('details', { class: 'write-prompt-box' }, h('summary', null, 'See the prompt'), promptText);
  const replyBox = h('textarea', {
    class: 'write-reply',
    rows: 6,
    placeholder: 'Paste Claude’s reply here.',
    'aria-label': 'Claude’s reply',
    oninput: () => { draft.reply = replyBox.value; keepDraft(); renderSaveButtons(); },
  });
  replyBox.value = draft.reply;
  const saveButtons = h('div', { class: 'editor-actions' });
  const editingNote = h('p', { class: 'muted small' });

  const correctCard = h('div', { class: 'card' },
    h('h2', null, 'Get it corrected'),
    h('ol', { class: 'write-steps' },
      h('li', null,
        h('button', { type: 'button', class: 'btn btn-primary btn-small', onclick: copyPrompt }, 'Copy the prompt'),
        ' then ',
        h('a', { class: 'btn btn-quiet btn-small', href: CLAUDE_URL, target: '_blank', rel: 'noopener' }, 'Open Claude ↗'),
        h('span', { class: 'muted small' }, ' and paste it in.'),
      ),
      h('li', null, 'Paste Claude’s whole reply here, and save it.'),
    ),
    promptBox,
    replyBox,
    editingNote,
    saveButtons,
  );

  const resultSlot = h('div');
  const journal = h('section', { class: 'journal' });

  const el = h('section', { class: 'view' },
    h('div', { class: 'view-head' }, h('h1', null, 'Write')),
    h('div', { class: 'card setup' },
      h('div', { class: 'field' }, h('span', { class: 'label' }, 'Practising'), focusSelect),
      h('div', { class: 'field' }, h('span', { class: 'label' }, 'Check against'), bandSlot),
      textBox,
      stats,
      flags,
    ),
    correctCard,
    resultSlot,
    journal,
  );

  // ---- the band check ----

  function scheduleCheck() {
    clearTimeout(checkTimer);
    checkTimer = setTimeout(runCheck, 300);
  }

  async function runCheck() {
    const text = draft.text;
    const id = ++checkId;
    const count = characterCount(text);
    if (!count) {
      stats.textContent = '';
      setChildren(flags);
      return;
    }
    let parts;
    try {
      parts = await dict.segment(text);
    } catch (err) {
      stats.textContent = `${count} characters`;
      return;
    }
    if (id !== checkId) return;
    const words = parts.filter((p) => !p.other);
    const level = band();
    const unique = (list) => [...new Map(list.map((p) => [p.text, p])).values()];
    const above = unique(words.filter((p) => p.band > level));
    const unlisted = unique(words.filter((p) => p.band === 0));
    stats.textContent = `${count} ${count === 1 ? 'character' : 'characters'} · ${words.length} ${words.length === 1 ? 'word' : 'words'}`;
    setChildren(flags,
      !above.length && !unlisted.length && h('p', { class: 'muted small' }, `Every word is within HSK ${level}.`),
      above.length > 0 && h('div', { class: 'write-flag' },
        h('span', { class: 'label' }, `Above HSK ${level}`),
        h('div', { class: 'chips' }, above.map((p) => h('span', { class: 'chip', lang: 'zh-CN', title: `HSK ${p.band}` },
          p.text, h('span', { class: 'muted small' }, ` HSK ${p.band}`)))),
      ),
      unlisted.length > 0 && h('div', { class: 'write-flag' },
        h('span', { class: 'label' }, 'Not on the HSK 1–6 list'),
        h('div', { class: 'chips' }, unlisted.map((p) => h('span', { class: 'chip', lang: 'zh-CN' }, p.text))),
        h('p', { class: 'muted small' }, 'Often a typo from the input method, sometimes a word from beyond HSK 6.'),
      ),
    );
  }

  // ---- the prompt and the reply ----

  function prompt() {
    const point = focusPoint();
    return correctionPrompt({
      text: draft.text,
      band: band(),
      focus: point && { name: point[3], detail: point[4], patterns: point[5] },
    });
  }

  function renderPrompt() {
    promptText.value = prompt();
    correctCard.hidden = !characterCount(draft.text);
    renderSaveButtons();
  }

  async function copyPrompt() {
    const text = prompt();
    try {
      await navigator.clipboard.writeText(text);
      toast('Prompt copied. Paste it into Claude.');
    } catch (err) {
      // No clipboard access (an insecure page, or a refused permission): show it to copy.
      promptBox.open = true;
      promptText.focus();
      promptText.select();
      toast('Copy the prompt from the box below.');
    }
  }

  function renderSaveButtons() {
    const hasReply = !!draft.reply.trim();
    editingNote.textContent = draft.editing ? 'Adding a correction to an entry already in your journal.' : '';
    setChildren(saveButtons,
      h('button', { type: 'button', class: 'btn btn-primary', disabled: !hasReply, onclick: saveCorrection }, 'Save the correction'),
      !draft.editing && h('button', { type: 'button', class: 'btn btn-quiet', onclick: saveWithout }, 'Save to the journal without one'),
      draft.editing && h('button', { type: 'button', class: 'btn btn-quiet', onclick: clearDraft }, 'Cancel'),
    );
  }

  function clearDraft() {
    draft.text = '';
    draft.reply = '';
    draft.editing = '';
    textBox.value = '';
    replyBox.value = '';
    store.saveSettings({ writeDraft: { ...draft } });
    renderPrompt();
    runCheck();
  }

  function saveWithout() {
    if (!characterCount(draft.text)) return;
    lastSaved = store.saveJournalEntry({ text: draft.text.trim(), focus: draft.focus, band: band() });
    toast('Saved to your journal');
    clearDraft();
    renderAll();
  }

  // The reply's corrections go two places: onto the entry, and into the mistakes list,
  // one mistake per fix, so each one comes back for practice.
  function saveCorrection() {
    const text = draft.text.trim();
    const parsed = parseCorrection(draft.reply);
    const id = store.saveJournalEntry({
      ...(draft.editing ? { id: draft.editing } : {}),
      text, focus: draft.focus, band: band(),
      reply: draft.reply.trim(),
      corrected: parsed.corrected, pinyin: parsed.pinyin, note: parsed.note,
      fixes: parsed.fixes,
      recognised: parsed.recognised,
    });
    parsed.fixes.forEach((fix, i) => store.recordMistake({
      key: `writing:${id}:${i}`,
      quiz: 'writing',
      prompt: markWrong(text, fix.wrong),
      answer: fix.right || '(leave it out)',
      given: fix.wrong,
      note: fix.why,
    }));
    if (!parsed.recognised) {
      toast('Saved, but the reply wasn’t in the CORRECTED / FIX format, so nothing went to Mistakes.');
    } else if (parsed.fixes.length) {
      toast(`Saved. ${parsed.fixes.length} ${parsed.fixes.length === 1 ? 'correction is' : 'corrections are'} in Mistakes to practise.`);
    } else {
      toast('Saved. Nothing to correct — nice.');
    }
    lastSaved = id;
    clearDraft();
    renderAll();
  }

  // ---- the journal ----

  function entryCard(entry, highlight) {
    const point = (points || []).find((p) => p[0] === entry.focus);
    return h('article', { class: `entry journal-entry ${highlight ? 'is-new' : ''}` },
      h('div', { class: 'mistake-head' },
        h('span', { class: 'muted small' }, formatDay(entry.createdAt)),
        point && h('span', { class: 'badge' }, pointLabel(point).split(' — ')[0]),
        h('span', { class: 'muted small' }, `${characterCount(entry.text)} characters`),
      ),
      h('p', { class: 'journal-text', lang: 'zh-CN' }, entry.text),
      entry.corrected && entry.corrected !== entry.text && h('div', { class: 'journal-corrected' },
        h('span', { class: 'label' }, 'Corrected'),
        h('p', { lang: 'zh-CN' }, entry.corrected),
        entry.pinyin && h('p', { class: 'muted small' }, entry.pinyin),
      ),
      entry.fixes && entry.fixes.length > 0 && h('ul', { class: 'journal-fixes' }, entry.fixes.map((fix) => h('li', null,
        fix.wrong && h('s', { lang: 'zh-CN' }, fix.wrong), fix.wrong && ' → ',
        h('strong', { lang: 'zh-CN' }, fix.right || '(leave it out)'),
        fix.why && h('span', { class: 'muted' }, ` · ${fix.why}`),
      ))),
      entry.recognised && entry.fixes && !entry.fixes.length && h('p', { class: 'muted small' }, 'No corrections needed.'),
      entry.note && h('p', { class: 'muted' }, entry.note),
      entry.reply && !entry.recognised && h('details', null, h('summary', null, 'Claude’s reply'), h('p', { class: 'journal-reply' }, entry.reply)),
      h('div', { class: 'editor-actions' },
        !entry.reply && h('button', {
          type: 'button', class: 'btn btn-quiet btn-small',
          onclick: () => {
            draft.text = entry.text;
            draft.focus = entry.focus || '';
            draft.editing = entry.id;
            draft.reply = '';
            textBox.value = draft.text;
            replyBox.value = '';
            focusSelect.value = draft.focus;
            keepDraft();
            renderPrompt();
            runCheck();
            window.scrollTo({ top: 0, behavior: 'smooth' });
          },
        }, 'Get this corrected'),
        confirmButton('Delete', () => {
          store.deleteJournalEntry(entry.id);
          // Its corrections go from the mistakes list with it.
          store.clearMistakes((entry.fixes || []).map((fix, i) => `writing:${entry.id}:${i}`));
          toast('Deleted from your journal');
        }, 'btn btn-quiet btn-small danger'),
      ),
    );
  }

  function renderJournal() {
    const entries = store.journalEntries();
    const latest = lastSaved && entries.find((e) => e.id === lastSaved);
    setChildren(resultSlot, latest && h('div', { class: 'card' }, h('h2', null, 'Just saved'), entryCard(latest, true)));
    const rest = entries.filter((e) => e.id !== lastSaved);
    // With only the entry just saved, the card above already shows it.
    journal.hidden = !!latest && !rest.length;
    setChildren(journal,
      h('h2', { class: 'grammar-category' }, `Journal`, h('span', { class: 'muted small' }, ` ${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}`)),
      entries.length === 0
        ? h('p', { class: 'muted' }, 'Nothing yet. What you save above collects here, with its corrections.')
        : rest.map((entry) => entryCard(entry)),
    );
  }

  // ---- the parts that change with the data ----

  function renderFocus() {
    const level = band();
    const inBand = (points || []).filter((p) => p[1] === level);
    const practising = inBand.filter((p) => store.getMark(p[0]) === 'practising');
    const others = inBand.filter((p) => store.getMark(p[0]) !== 'practising');
    const option = (p) => h('option', { value: p[0], selected: p[0] === draft.focus }, pointLabel(p));
    // A point chosen from another band (from its grammar card) stays listed.
    const chosen = focusPoint();
    setChildren(focusSelect,
      h('option', { value: '', selected: !draft.focus }, 'No particular point'),
      chosen && chosen[1] !== level && h('optgroup', { label: `HSK ${chosen[1]}` }, option(chosen)),
      practising.length > 0 && h('optgroup', { label: 'Practising' }, practising.map(option)),
      h('optgroup', { label: `HSK ${level}` }, others.map(option)),
    );
    focusSelect.value = draft.focus;
    setChildren(bandSlot, segmented('Band to check against', BANDS.map((n) => [n, `HSK ${n}`]), level, (n) => {
      store.saveSettings({ band: n });
      renderFocus();
      renderPrompt();
      runCheck();
    }));
  }

  function renderAll() {
    renderFocus();
    renderPrompt();
    renderJournal();
  }

  grammar().then((rows) => { points = rows; renderAll(); }, () => { points = []; renderAll(); });
  renderAll();
  runCheck();

  return {
    el,
    // #/zh/write/<grammar id> arrives from a grammar card's "Write with this".
    onShow: (sub) => {
      if (sub && sub !== draft.focus) {
        draft.focus = sub;
        keepDraft();
      }
      renderAll();
      runCheck();
    },
    onStore: () => { renderJournal(); },
  };
}
