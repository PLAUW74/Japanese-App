// Topic tags for the battle grid. Only the kana and the topic are written here; the
// kanji, meaning, JLPT level and verb class all come from the dictionary at run time
// through dict.spell(), so nothing in this file can fall out of step with data/dict.json.
//
// A topic does two jobs: it is an enemy's weakness (words in it deal double damage) and
// it is what the grid seeds, so every list wants enough short words to be spellable from
// sixteen tiles. A word may sit in more than one topic — さかな is food and an animal —
// and gets the bonus for whichever enemy is in front of the player.
//
// Verbs are listed in their dictionary form. js/conjugate.js builds the other forms from
// the dictionary entry's word class, so たべる also covers たべます, たべた, たべて and
// the rest without any of them being written down.
//
// `kana|kanji` pins which entry a kana string means, because plenty of short words are
// homographs and the dictionary cannot guess: かい is 貝 here and not 会, たか is 鷹 and
// not 高. The kanji is only a selector — the player never has to read or type it. Two
// topics may pin the same kana differently, which is how あつい is 熱い for food (hot to
// the touch) and 暑い for weather, and くも is 蜘蛛 for animals and 雲 for nature.

export const TOPICS = {
  food: {
    label: 'Food',
    icon: '🍚',
    words: [
      'ごはん', 'ぱん', 'にく', 'さかな', 'やさい', 'くだもの', 'たまご', 'みず', 'おちゃ',
      'ぎゅうにゅう', 'さとう', 'しお', 'しょうゆ', 'あさごはん', 'ひるごはん', 'ばんごはん',
      'りょうり', 'たべもの', 'のみもの', 'おかし', 'たまねぎ', 'にんじん', 'きゅうり',
      'こめ', 'みそ', 'とうふ', 'べんとう', 'すし', 'そば|蕎麦', 'うどん', 'おさけ', 'ちゃ',
      'やきざかな', 'りんご', 'みかん', 'いちご|苺', 'ぶどう|葡萄', 'もも|桃', 'なし|梨',
      'たべる', 'のむ', 'つくる', 'やく|焼く', 'きる|切る', 'あじ|味',
      'おいしい', 'あまい', 'からい', 'にがい', 'すっぱい', 'あつい|熱い',
    ],
  },
  animals: {
    label: 'Animals',
    icon: '🐾',
    words: [
      'いぬ', 'ねこ', 'とり|鳥', 'さかな', 'うま|馬', 'うし|牛', 'ぶた', 'ひつじ|羊',
      'とら|虎', 'くま|熊', 'さる|猿', 'ねずみ', 'うさぎ', 'きつね', 'たぬき', 'しか|鹿',
      'ぞう|象', 'きりん', 'かえる|蛙', 'へび', 'かめ|亀', 'むし|虫', 'はち|蜂', 'あり|蟻',
      'くも|蜘蛛', 'とんぼ', 'せみ', 'にわとり', 'ひよこ', 'あひる', 'かも|鴨', 'からす',
      'すずめ', 'はと|鳩', 'わし|鷲', 'たか|鷹', 'いるか', 'くじら', 'さめ|鮫', 'たこ|蛸',
      'いか|烏賊', 'えび|海老', 'かに|蟹', 'かい|貝',
      'どうぶつ', 'しっぽ', 'つの|角', 'はね|羽', 'なく|鳴く', 'とぶ', 'およぐ', 'はしる',
    ],
  },
  nature: {
    label: 'Nature',
    icon: '🌿',
    words: [
      'やま', 'かわ|川', 'うみ|海', 'そら', 'つち|土', 'いし|石', 'はな|花', 'くさ|草',
      'もり|森', 'はやし|林', 'たに|谷', 'みずうみ', 'いけ|池', 'しま|島', 'すな|砂',
      'たき|滝', 'おんせん', 'しぜん',
      'あめ|雨', 'ゆき|雪', 'かぜ|風', 'くも|雲', 'かみなり', 'きり|霧', 'つゆ|梅雨',
      'たいふう', 'てんき|天気', 'はれ|晴れ', 'くもり', 'にじ|虹', 'ひかり|光', 'かげ|影',
      'たいよう|太陽', 'つき|月', 'ほし|星', 'よる|夜', 'あさ|朝', 'ゆうがた', 'ひる|昼',
      'はる|春', 'なつ|夏', 'あき|秋', 'ふゆ|冬', 'きせつ',
      'あつい|暑い', 'さむい', 'すずしい', 'あたたかい',
      'ふる|降る', 'はれる|晴れる', 'さく|咲く', 'ふく|吹く',
    ],
  },
  daily: {
    label: 'Daily life',
    icon: '🏠',
    words: [
      'ひと|人', 'かぞく', 'ちち|父', 'はは|母', 'あに|兄', 'あね|姉', 'おとうと|弟',
      'いもうと|妹', 'こども', 'おとな', 'せんせい|先生', 'がくせい', 'ともだち', 'なまえ',
      'いえ|家', 'へや|部屋', 'まど', 'つくえ', 'いす', 'ふく|服', 'くつ|靴', 'ぼうし|帽子',
      'かばん', 'とけい', 'でんわ', 'てがみ', 'しんぶん', 'ほん|本', 'えんぴつ', 'かみ|紙',
      'みち|道', 'えき|駅', 'でんしゃ', 'くるま|車', 'じてんしゃ', 'ひこうき',
      'まち|町', 'むら|村', 'しごと', 'おかね', 'みせ|店', 'びょういん', 'ぎんこう',
      'としょかん', 'こうえん|公園', 'がっこう', 'かいしゃ', 'きょうしつ',
      'いく|行く', 'くる|来る', 'みる|見る', 'きく|聞く', 'よむ|読む', 'かく|書く',
      'はなす|話す', 'あるく', 'はたらく', 'やすむ', 'ねる|寝る', 'おきる', 'あう|会う',
      'かう|買う', 'まつ|待つ', 'わかる', 'おもう', 'いう|言う', 'もつ|持つ', 'はいる',
      'でる', 'おしえる', 'ならう', 'かえる|帰る', 'べんきょう',
    ],
  },
};

// A written entry is 'かな' or 'かな|漢字'. Split once, here, so nothing downstream has
// to think about the syntax.
export const parseForm = (written) => {
  const bar = written.indexOf('|');
  return bar < 0 ? { kana: written, kanji: '' } : { kana: written.slice(0, bar), kanji: written.slice(bar + 1) };
};

// kana -> [{ topic, kanji }]. A word in two lists gets an entry for each, so the enemy in
// front of the player decides both which bonus applies and which sense is shown.
export const topicsByKana = (() => {
  const map = new Map();
  for (const [topic, { words }] of Object.entries(TOPICS)) {
    for (const written of new Set(words)) {
      const { kana, kanji } = parseForm(written);
      const already = map.get(kana);
      if (already) already.push({ topic, kanji });
      else map.set(kana, [{ topic, kanji }]);
    }
  }
  return map;
})();

// Which topics a kana string belongs to, for the damage bonus.
export const topicsOf = (kana) => (topicsByKana.get(kana) || []).map((t) => t.topic);

// The kanji pinned for a kana string, preferring the enemy's topic when it is pinned
// differently there (くも is 蜘蛛 against the tanuki, 雲 against the imp).
export function pinnedKanji(kana, topic) {
  const entries = topicsByKana.get(kana);
  if (!entries) return '';
  const match = (topic && entries.find((e) => e.topic === topic && e.kanji)) || entries.find((e) => e.kanji);
  return match ? match.kanji : '';
}

// Every curated kana form, for resolving the whole pool against the dictionary at startup.
export const allKana = () => [...topicsByKana.keys()];
