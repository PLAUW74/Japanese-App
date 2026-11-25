// The generated Chinese content files (data/zh/) that are small enough to read on the main
// thread. Only the word list is big enough to need a worker; these are tens of kilobytes,
// and each is fetched once, the first time something asks for it.

const loaded = new Map();

function load(name, key) {
  if (!loaded.has(name)) {
    const wanted = fetch(new URL(`../../../data/zh/${name}.json`, import.meta.url))
      .then((res) => {
        if (!res.ok) throw new Error(`Could not load ${name} (HTTP ${res.status})`);
        return res.json();
      })
      .then((data) => data[key]);
    wanted.catch(() => loaded.delete(name));
    loaded.set(name, wanted);
  }
  return loaded.get(name);
}

// [id, band, category, name, detail, [pattern], [[wiki path, label, search term]]]
export const grammar = () => load('grammar', 'points');
// [band, level 1, level 2, level 3]
export const topics = () => load('topics', 'topics');
// [band, id, task, [can-do statement]]
export const tasks = () => load('tasks', 'tasks');
// The study plan: phases, daily blocks and checkpoints.
export const plan = () => load('plan', 'plan');

// Lessons written for the app, one per grammar point, keyed by the point's id
// (data/zh/lessons-hsk<band>.json). A band without lessons yet gives {}.
const lessonFiles = new Map();
export function lessons(band) {
  if (!lessonFiles.has(band)) {
    const wanted = fetch(new URL(`../../../data/zh/lessons-hsk${band}.json`, import.meta.url))
      .then((res) => (res.ok ? res.json() : { lessons: {} }))
      .then((data) => data.lessons || {}, () => ({}));
    lessonFiles.set(band, wanted);
  }
  return lessonFiles.get(band);
}

// What the syllabus's own category names mean, so the checklist reads in English without
// throwing away the Chinese the syllabus is written in.
export const CATEGORY_EN = {
  语素: 'Word parts',
  词类: 'Word classes',
  短语: 'Phrases',
  句子成分: 'Sentence parts',
  句子的类型: 'Sentence types',
  动作的态: 'Aspect',
  特殊表达法: 'Set ways of saying things',
  固定格式: 'Fixed patterns',
};

export const NAME_EN = {
  前缀: 'prefix', 后缀: 'suffix', 类前缀: 'prefix-like', 类后缀: 'suffix-like',
  名词: 'nouns', 动词: 'verbs', 形容词: 'adjectives', 数词: 'numerals', 量词: 'measure words',
  代词: 'pronouns', 副词: 'adverbs', 介词: 'prepositions', 连词: 'conjunctions',
  助词: 'particles', 叹词: 'interjections',
  主语: 'subject', 谓语: 'predicate', 宾语: 'object', 定语: 'attributive',
  状语: 'adverbial', 补语: 'complement',
  句型: 'sentence patterns', 句类: 'sentence kinds', 复句: 'complex sentences',
  特殊句型: 'special patterns', 特殊句式: 'special constructions',
  功能类型: 'by function', 结构类型: 'by structure', 固定短语: 'set phrases',
  数的表示法: 'saying numbers', 数的表达法: 'saying numbers', 时间表示法: 'saying times',
};

const WIKI = 'https://resources.allsetlearning.com/chinese/grammar';

// Where a grammar pattern's link goes, worked out when data/zh/ was built
// (tools/build_zh_data.py): the article that explains it, or the character's keyword page
// listing every article that uses it, or — when the wiki has neither — its search, for the
// pattern with the syllabus's placeholders taken out. A search for "第—" finds nothing;
// the dash is the syllabus's way of writing "a word goes here".
export function wikiLink([path, label, term] = []) {
  if (path) return { url: `${WIKI}/${encodeURIComponent(path)}`, label, kind: path.startsWith('ASG') ? 'article' : 'keyword' };
  return { url: `${WIKI}/index.php?search=${encodeURIComponent(term || '')}&fulltext=1`, label: `Search the wiki for ${term}`, kind: 'search' };
}
