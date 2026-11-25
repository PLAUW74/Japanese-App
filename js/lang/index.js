// The languages the app teaches, in the order the toggle shows them.
import ja from './ja.js';
import zh from './zh.js';
import { LANGS, DEFAULT_LANG } from '../store.js';

const byCode = { ja, zh };

export const languages = LANGS.map((code) => byCode[code]);
export const language = (code) => byCode[code] || byCode[DEFAULT_LANG];
