// Which word list a shared view should ask. The two modules answer the same calls —
// `search`, `random`, `get` and a `status` — so a view that only needs those can be handed
// either and not care which language it is drawing.
//
// This is a module of its own rather than a field on js/lang/*.js because those import the
// views, and a view importing them back would be a cycle.
import * as japanese from './dict.js';
import * as chinese from './lang/zh/dict.js';
import { getLang } from './store.js';

const BY_LANG = { ja: japanese, zh: chinese };

export const current = () => BY_LANG[getLang()] || japanese;

// Calls that only one language's list can answer, such as picking the words out of a
// sentence — Chinese has no segmenter yet. Does nothing rather than throwing.
export function ifAvailable(name, ...args) {
  const dict = current();
  return typeof dict[name] === 'function' ? dict[name](...args) : null;
}
