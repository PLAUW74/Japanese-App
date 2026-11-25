// Getting a piece of Chinese writing corrected by Claude, without an API key: the app
// writes the prompt, the learner pastes it into Claude and pastes the reply back, and the
// app reads the reply. The prompt asks for a fixed set of labelled lines so that each
// correction can be picked out and kept — as a mistake to practise — rather than read once
// and forgotten. It imports nothing, so it can be tested on its own.

export const CLAUDE_URL = 'https://claude.ai/new';

/**
 * The prompt for one piece of writing. `focus` is the grammar point being practised, if
 * any: { name, detail, patterns }. The study plan asks for short, casual feedback.
 */
export function correctionPrompt({ text, band, focus }) {
  const lines = [
    `I'm learning Mandarin Chinese (simplified characters), at about HSK ${band || 1} level. Please correct what I wrote.`,
  ];
  if (focus) {
    const point = [focus.name, focus.detail].filter(Boolean).join(' ');
    const patterns = (focus.patterns || []).join('、');
    lines.push(`I was practising this grammar point: ${point}${patterns ? ` (${patterns})` : ''}.`);
  }
  lines.push(
    '',
    'What I wrote:',
    String(text || '').trim(),
    '',
    'Reply in exactly this format, with nothing before or after it. Keep explanations short and casual:',
    'CORRECTED: <my text, corrected, in simplified characters>',
    'PINYIN: <the corrected text in pinyin with tone marks>',
    'FIX: <the part I got wrong, exactly as I wrote it> => <what it should be> | <one short reason in English>',
    '(One FIX line for each mistake. If it is all correct, write "FIX: none".)',
    'NOTE: <optional, one line: a more natural way to say it, or a tip>',
  );
  return lines.join('\n');
}

const LABEL = /^\s*(?:[-*•]\s*)?(?:\*\*|__)?\s*(CORRECTED|CORRECTION|PINYIN|FIX|NOTE)\s*(?:\*\*|__)?\s*[:：]\s*(?:\*\*|__)?\s*(.*)$/i;
const ARROW = /\s*(?:=>|→|->|⇒|⟶)\s*/;
const REASON = /\s*[|｜]\s*/;

// Takes off the quotes and markdown a reply tends to wrap things in.
const tidy = (text) => String(text || '')
  .replace(/^\s*(?:\*\*|__|`)+|(?:\*\*|__|`)+\s*$/g, '')
  .replace(/^["“「『]+|["”」』]+$/g, '')
  .trim();

/**
 * Reads a reply written in the prompt's format.
 * Returns { corrected, pinyin, fixes: [{ wrong, right, why }], note, recognised }.
 * `recognised` is false when none of the labelled lines were found, so the caller can keep
 * the reply as it is and say why nothing was picked out. Labels are matched loosely —
 * bold, bullets, a full-width colon — and a line with no label continues the one before,
 * for a corrected text that wraps.
 */
export function parseCorrection(reply) {
  const out = { corrected: '', pinyin: '', fixes: [], note: '', recognised: false };
  let last = null;
  for (const raw of String(reply || '').split(/\r?\n/)) {
    const match = LABEL.exec(raw);
    if (!match) {
      const more = tidy(raw);
      if (more && last && last !== 'fix') {
        // Chinese is written without spaces, so a wrapped line of it joins straight on;
        // pinyin and English join with a space.
        const cjk = /[　-〿㐀-鿿＀-￯]/;
        const glue = cjk.test(out[last].slice(-1)) || cjk.test(more[0]) ? '' : ' ';
        out[last] = `${out[last]}${glue}${more}`.trim();
      }
      continue;
    }
    out.recognised = true;
    const label = match[1].toLowerCase();
    const body = match[2].trim();
    if (label === 'fix') {
      last = 'fix';
      if (/^(none|no mistakes|n\/a|-)\.?$/i.test(tidy(body))) continue;
      const [change, ...why] = body.split(REASON);
      const [wrong, ...right] = change.split(ARROW);
      if (!right.length) continue;
      out.fixes.push({ wrong: tidy(wrong), right: tidy(right.join(' ')), why: tidy(why.join(' | ')) });
    } else {
      last = label === 'correction' ? 'corrected' : label;
      out[last] = tidy(body);
    }
  }
  return out;
}

/**
 * The writer's text with one wrong part marked for display, in the [[highlight]] notation
 * the mistakes list already shows. When the part cannot be found as written, the text is
 * returned as it is.
 */
export function markWrong(text, wrong) {
  const source = String(text || '');
  if (!wrong) return source;
  const at = source.indexOf(wrong);
  return at < 0 ? source : `${source.slice(0, at)}[[${wrong}]]${source.slice(at + wrong.length)}`;
}

/** Characters written, the way a Chinese essay is counted: hanzi only. */
export const characterCount = (text) => (String(text || '').match(/[㐀-鿿]/g) || []).length;
