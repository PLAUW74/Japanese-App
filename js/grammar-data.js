// Grammar quiz questions, JLPT N5–N4.
//
// Notation: 漢字{かんじ} puts the reading above the kanji; （　） is the gap.
// pick:  options[0] is the right answer (choices are shuffled when shown).
// order: `order` is the correct word order for the four blanks between `before`
//        and `after`; the learner picks the word that goes in blank `star` (0-based),
//        as in the JLPT ★ questions.

export const TOPICS = {
  particles: 'Particles',
  verbs: 'Verb forms',
  adjectives: 'Adjectives',
  compare: 'Comparisons',
  giving: 'Giving & receiving',
  expressions: 'Opinions & guesses',
  order: 'Word order (★)',
};

const pick = (topic) => (level, q, options, en, why) => ({ type: 'pick', topic, level, q, options, en, why });
const order = (level, before, parts, star, after, en, why) => ({ type: 'order', topic: 'order', level, before, order: parts, star, after, en, why });

const P = pick('particles');
const V = pick('verbs');
const A = pick('adjectives');
const C = pick('compare');
const G = pick('giving');
const E = pick('expressions');

export const QUESTIONS = [
  // ---- particles ----
  P(5, '図書館{としょかん}（　）勉強{べんきょう}します。', ['で', 'に', 'を', 'へ'], 'I study at the library.', 'で marks the place where an action happens.'),
  P(5, '毎朝{まいあさ} 7時{じ}（　）起{お}きます。', ['に', 'で', 'を', 'が'], 'I get up at 7 every morning.', 'に marks a specific time.'),
  P(5, '私{わたし}は 犬{いぬ}（　）好{す}きです。', ['が', 'を', 'に', 'で'], 'I like dogs.', '好{す}き takes が for the thing you like.'),
  P(5, 'パン（　）食{た}べます。', ['を', 'が', 'に', 'へ'], 'I eat bread.', 'を marks the object of the action.'),
  P(5, '友達{ともだち}（　）映画{えいが}を 見{み}ました。', ['と', 'を', 'に', 'や'], 'I watched a film with a friend.', 'と means “with” a person.'),
  P(5, 'バス（　）学校{がっこう}へ 行{い}きます。', ['で', 'に', 'を', 'と'], 'I go to school by bus.', 'で marks the means of transport.'),
  P(5, '机{つくえ}の 上{うえ}（　）本{ほん}が あります。', ['に', 'で', 'を', 'が'], 'There is a book on the desk.', 'ある・いる take に for where something is.'),
  P(5, 'これは 私{わたし}（　）かさです。', ['の', 'が', 'を', 'に'], 'This is my umbrella.', 'の shows possession: 私{わたし}の = my.'),
  P(5, '田中{たなか}さんは 学生{がくせい}です。私{わたし}（　）学生{がくせい}です。', ['も', 'は', 'が', 'の'], 'Mr Tanaka is a student. I’m a student too.', 'も means “too, also”.'),
  P(5, '9時{じ}（　）5時{じ}まで 働{はたら}きます。', ['から', 'まで', 'に', 'で'], 'I work from 9 to 5.', 'から means “from” a starting point.'),
  P(5, '家{いえ}から 駅{えき}（　）歩{ある}きます。', ['まで', 'から', 'より', 'を'], 'I walk from my house to the station.', 'まで means “as far as, until”.'),
  P(5, 'だれ（　）来{き}ましたか。', ['が', 'は', 'を', 'も'], 'Who came?', 'Question words as the subject take が, never は.'),
  P(5, '電車{でんしゃ}（　）乗{の}ります。', ['に', 'を', 'で', 'が'], 'I get on the train.', '乗{の}る takes に for the vehicle you get on.'),
  P(5, '電車{でんしゃ}（　）降{お}ります。', ['を', 'に', 'で', 'へ'], 'I get off the train.', '降{お}りる takes を for the place you leave.'),
  P(5, '日本語{にほんご}（　）手紙{てがみ}を 書{か}きます。', ['で', 'を', 'に', 'と'], 'I write a letter in Japanese.', 'で marks the language or tool used.'),
  P(5, 'コーヒー（　）紅茶{こうちゃ}、どちらが いいですか。', ['と', 'か', 'や', 'も'], 'Which would you like, coffee or tea?', 'A と B、どちらが…? is the way to ask “A or B?”.'),
  P(5, '今日{きょう}は いい 天気{てんき}です（　）。…ええ、そうですね。', ['ね', 'よ', 'か', 'を'], 'Nice weather today, isn’t it? …Yes, it is.', 'ね checks that the listener agrees.'),
  P(5, '東京{とうきょう}は 大阪{おおさか}（　）大{おお}きいです。', ['より', 'から', 'まで', 'ほど'], 'Tokyo is bigger than Osaka.', 'より means “than”.'),
  P(5, '日本{にほん}（　）行{い}きたいです。', ['へ', 'で', 'を', 'が'], 'I want to go to Japan.', 'へ marks the direction you go.'),
  P(5, '朝{あさ}から 何{なに}（　）食{た}べていません。', ['も', 'を', 'が', 'か'], 'I haven’t eaten anything since morning.', 'Question word + も + negative = “not any”.'),
  P(5, '机{つくえ}の 上{うえ}に 本{ほん}（　）ペンなどが あります。', ['や', 'と', 'か', 'も'], 'On the desk there are books, pens and so on.', 'や lists some examples and goes with など.'),
  P(5, '先生{せんせい}（　）質問{しつもん}します。', ['に', 'を', 'で', 'の'], 'I ask the teacher a question.', 'に marks the person an action is directed at.'),
  P(5, '部屋{へや}（　）猫{ねこ}が います。', ['に', 'で', 'を', 'へ'], 'There is a cat in the room.', 'いる takes に for where something is.'),
  P(5, '雨{あめ}が 降{ふ}っています（　）、傘{かさ}を 持{も}って 行{い}きます。', ['から', 'まで', 'より', 'のに'], 'It’s raining, so I’ll take an umbrella.', 'から after a sentence means “because, so”.'),
  P(5, '毎日{まいにち} 何時{なんじ}に 寝{ね}ます（　）。', ['か', 'ね', 'よ', 'の'], 'What time do you go to bed every day?', 'か turns a sentence into a question.'),
  P(5, '教室{きょうしつ}に だれ（　）いません。', ['も', 'が', 'か', 'は'], 'There is nobody in the classroom.', 'だれ + も + negative = “nobody”.'),
  P(5, '週末{しゅうまつ}は どこ（　）行{い}きませんでした。', ['へも', 'へが', 'へを', 'での'], 'I didn’t go anywhere at the weekend.', 'も goes after へ: どこへも + negative = “nowhere”.'),
  P(5, '日本{にほん}の 料理{りょうり}の 中{なか}で すし（　）いちばん 好{す}きです。', ['が', 'を', 'は', 'で'], 'Of Japanese foods, I like sushi best.', 'The answer to “which is the most…?” takes が.'),
  P(5, '兄{あに}は 銀行{ぎんこう}（　）働{はたら}いて います。', ['で', 'に', 'を', 'へ'], 'My older brother works at a bank.', '働{はたら}く is an action, so the place takes で.'),
  P(5, '私{わたし}は 大阪{おおさか}（　）住{す}んで います。', ['に', 'で', 'を', 'へ'], 'I live in Osaka.', '住{す}む takes に, not で.'),
  P(5, '駅{えき}の 近{ちか}く（　）銀行{ぎんこう}が あります。', ['に', 'で', 'を', 'から'], 'There is a bank near the station.', 'ある takes に for where something is.'),
  P(4, '橋{はし}（　）渡{わた}ります。', ['を', 'で', 'に', 'が'], 'I cross the bridge.', 'Verbs of moving through (渡{わた}る, 歩{ある}く, 通{とお}る) take を for the route.'),
  P(4, '金曜日{きんようび}（　）レポートを 出{だ}してください。', ['までに', 'まで', 'から', 'より'], 'Please hand in the report by Friday.', 'までに = “by” a deadline; まで = “until”, all the time up to it.'),
  P(4, '1時間{じかん}（　）待{ま}ちました。', ['ぐらい', 'ごろ', 'から', 'までに'], 'I waited about an hour.', 'ぐらい is “about” an amount; ごろ is “about” a point in time.'),
  P(4, '100円{えん}（　）ありません。', ['しか', 'だけ', 'を', 'で'], 'I only have 100 yen.', 'しか means “only” and always takes a negative verb.'),
  P(4, '雨{あめ}が 降{ふ}って いる（　）、出{で}かけました。', ['のに', 'ので', 'から', 'と'], 'I went out even though it was raining.', 'のに = “even though”, for an unexpected result.'),
  P(4, '病気{びょうき}（　）学校{がっこう}を 休{やす}みました。', ['で', 'に', 'を', 'から'], 'I was off school because I was ill.', 'Noun + で can give the cause.'),
  P(4, '「ありがとう」（　）言{い}いました。', ['と', 'を', 'に', 'で'], 'I said “thank you”.', 'と marks a quotation.'),
  P(4, 'この 店{みせ}は 安{やす}い（　）、おいしいです。', ['し', 'で', 'くて', 'と'], 'This shop is cheap, and the food is good too.', 'し lists reasons or points: “…, and what’s more, …”.'),

  // ---- verb forms ----
  V(5, '窓{まど}を（　）ください。', ['開{あ}けて', '開{あ}ける', '開{あ}けた', '開{あ}けます'], 'Please open the window.', 'て-form + ください makes a request.'),
  V(5, '朝{あさ}ご飯{はん}を（　）、学校{がっこう}へ 行{い}きます。', ['食{た}べて', '食{た}べる', '食{た}べた', '食{た}べない'], 'I eat breakfast and go to school.', 'The て-form links actions in order.'),
  V(5, '今{いま} 雨{あめ}が（　）います。', ['降{ふ}って', '降{ふ}る', '降{ふ}った', '降{ふ}り'], 'It’s raining now.', 'て-form + いる = something happening now.'),
  V(5, 'ここで たばこを（　）は いけません。', ['吸{す}って', '吸{す}う', '吸{す}わない', '吸{す}った'], 'You must not smoke here.', 'て-form + は いけません = “must not”.'),
  V(5, '写真{しゃしん}を（　）も いいですか。', ['撮{と}って', '撮{と}る', '撮{と}った', '撮{と}らない'], 'May I take a photo?', 'て-form + も いいですか asks for permission.'),
  V(5, '私{わたし}は 漢字{かんじ}を 読{よ}む（　）が できます。', ['こと', 'の', 'もの', 'ところ'], 'I can read kanji.', 'Dictionary form + ことが できます = “can do”.'),
  V(5, '宿題{しゅくだい}を（　）から、遊{あそ}びに 行{い}きます。', ['して', 'した', 'する', 'しない'], 'I’ll go out to play after doing my homework.', 'て-form + から = “after doing”.'),
  V(5, '寝{ね}る 前{まえ}（　）、シャワーを 浴{あ}びます。', ['に', 'で', 'を', 'が'], 'I shower before going to bed.', 'Dictionary form + 前{まえ}に = “before doing”.'),
  V(5, '冷{つめ}たい 水{みず}が 飲{の}み（　）です。', ['たい', 'ほしい', 'ます', 'たがる'], 'I want to drink cold water.', 'ます-stem + たい = “want to do”.'),
  V(5, '母{はは}は 車{くるま}の 運転{うんてん}が（　）。', ['できます', 'します', 'あります', 'なります'], 'My mother can drive.', 'Noun + が できます = “can do (something)”.'),
  V(4, '日本{にほん}へ（　）前{まえ}に、結婚{けっこん}しました。', ['来{く}る', '来{き}た', '来{き}て', '来{こ}ない'], 'I got married before coming to Japan.', '前{まえ}に always takes the dictionary form, even about the past.'),
  V(4, '寝{ね}る（　）に、歯{は}を 磨{みが}きます。', ['前{まえ}', '後{あと}', '中{なか}', '上{うえ}'], 'I brush my teeth before going to bed.', 'Dictionary form + 前{まえ}に = “before”; あとで needs the た-form.'),
  V(4, 'ご飯{はん}を 食{た}べた（　）で、散歩{さんぽ}します。', ['あと', '前{まえ}', 'まで', 'から'], 'I take a walk after eating.', 'た-form + あとで = “after doing”.'),
  V(4, '私{わたし}は 富士山{ふじさん}に（　）ことが あります。', ['登{のぼ}った', '登{のぼ}る', '登{のぼ}って', '登{のぼ}らない'], 'I have climbed Mount Fuji.', 'た-form + ことが あります = “have done (before)”.'),
  V(4, '日曜日{にちようび}は 掃除{そうじ}を（　）、洗濯{せんたく}を したり します。', ['したり', 'して', 'する', 'した'], 'On Sundays I do things like cleaning and laundry.', '～たり～たり します lists example activities.'),
  V(4, '毎日{まいにち} 薬{くすり}を（　）なければ なりません。', ['飲{の}ま', '飲{の}み', '飲{の}む', '飲{の}んで'], 'I have to take medicine every day.', 'ない-form minus い + ければ なりません = “must”.'),
  V(4, '明日{あした}は 学校{がっこう}へ（　）なくても いいです。', ['行{い}か', '行{い}き', '行{い}く', '行{い}って'], 'You don’t have to go to school tomorrow.', 'ない-form minus い + くても いいです = “don’t have to”.'),
  V(4, '図書館{としょかん}では 静{しず}かに して ください。大{おお}きい 声{こえ}で（　）ください。', ['話{はな}さないで', '話{はな}さなくて', '話{はな}さない', '話{はな}して'], 'Please be quiet in the library. Please don’t talk loudly.', 'ない-form + で ください = “please don’t”.'),
  V(4, 'もっと 日本語{にほんご}が 上手{じょうず}に（　）たいです。', ['なり', 'なる', 'なって', 'なった'], 'I want to get better at Japanese.', 'たい attaches to the ます-stem: なります → なりたい.'),
  V(4, '日本語{にほんご}が 話{はな}せる（　）に なりました。', ['よう', 'こと', 'ため', 'の'], 'I have become able to speak Japanese.', 'Dictionary/potential form + ように なる = “come to (be able to)”.'),
  V(4, '空{そら}が 暗{くら}いですね。雨{あめ}が 降{ふ}り（　）です。', ['そう', 'よう', 'らしい', 'みたい'], 'The sky is dark. It looks like it’s going to rain.', 'ます-stem + そうです = “looks like it will”.'),
  V(4, '明日{あした} 雨{あめ}が（　）、試合{しあい}は ありません。', ['降{ふ}ったら', '降{ふ}って', '降{ふ}る', '降{ふ}った'], 'If it rains tomorrow, there won’t be a match.', 'た-form + ら = “if, when”.'),
  V(4, 'この ボタンを（　）、電気{でんき}が つきます。', ['押{お}すと', '押{お}して', '押{お}した', '押{お}そう'], 'When you press this button, the light comes on.', 'Dictionary form + と = “whenever, if” for automatic results.'),
  V(4, '時間{じかん}が（　）、手伝{てつだ}います。', ['あれば', 'あって', 'ある', 'あった'], 'If I have time, I’ll help.', 'The ば form (ある → あれば) = “if”.'),
  V(4, '日本{にほん}へ 行{い}く（　）、日本語{にほんご}を 勉強{べんきょう}しています。', ['ために', 'ように', 'のに', 'まで'], 'I’m studying Japanese in order to go to Japan.', 'Dictionary form + ために = “in order to” (with actions you choose to do).'),
  V(4, '音楽{おんがく}を（　）ながら、勉強{べんきょう}します。', ['聞{き}き', '聞{き}く', '聞{き}いて', '聞{き}いた'], 'I study while listening to music.', 'ます-stem + ながら = “while doing”.'),
  V(4, 'もう 昼{ひる}ご飯{はん}を 食{た}べましたか。…いいえ、まだ（　）。', ['食{た}べていません', '食{た}べません', '食{た}べました', '食{た}べませんでした'], 'Have you eaten lunch yet? …No, not yet.', '“Not yet” is まだ + て-form + いません.'),
  V(4, '私{わたし}は 漢字{かんじ}が（　）。', ['読{よ}めます', '読{よ}みます', '読{よ}まれます', '読{よ}ませます'], 'I can read kanji.', 'The potential form (読{よ}める) means “can”, and takes が.'),
  V(4, '私{わたし}は 先生{せんせい}に（　）。', ['ほめられました', 'ほめました', 'ほめさせました', 'ほめて くれました'], 'I was praised by my teacher.', 'Passive: person + に + passive verb = “was (done) by”.'),
  V(4, '母{はは}は 弟{おとうと}に 野菜{やさい}を（　）。', ['食{た}べさせました', '食{た}べました', '食{た}べたいです', '食{た}べに 行{い}きました'], 'My mother made my younger brother eat vegetables.', 'Causative: させる = “make or let someone do”.'),
  V(4, '食{た}べ（　）て、おなかが 痛{いた}いです。', ['すぎ', 'すぎる', 'たく', 'そう'], 'I ate too much and my stomach hurts.', 'ます-stem + すぎる = “too much”; て-form すぎて.'),
  V(4, 'この ペンは 書{か}き（　）です。', ['やすい', 'たい', 'そう', 'すぎ'], 'This pen is easy to write with.', 'ます-stem + やすい = “easy to”.'),

  // ---- adjectives ----
  A(5, 'この カレーは（　）です。', ['辛{から}い', '辛{から}いだ', '辛{から}な', '辛{から}く'], 'This curry is spicy.', 'い-adjectives go straight before です.'),
  A(5, '昨日{きのう}は とても（　）です。', ['寒{さむ}かった', '寒{さむ}いでした', '寒{さむ}い', '寒{さむ}くて'], 'It was very cold yesterday.', 'Past of an い-adjective: い → かった (not いでした).'),
  A(5, 'この 部屋{へや}は（　）ありません。', ['広{ひろ}く', '広{ひろ}い', '広{ひろ}くて', '広{ひろ}な'], 'This room isn’t big.', 'Negative of an い-adjective: い → くありません / くないです.'),
  A(5, '静{しず}か（　）町{まち}に 住{す}みたいです。', ['な', 'の', 'い', 'で'], 'I want to live in a quiet town.', 'な-adjectives take な before a noun.'),
  A(5, '有名{ゆうめい}（　）レストランで 食{た}べました。', ['な', 'の', 'い', 'に'], 'I ate at a famous restaurant.', 'な-adjectives take な before a noun.'),
  A(5, 'この ホテルは きれい（　）、安{やす}いです。', ['で', 'くて', 'な', 'に'], 'This hotel is clean and cheap.', 'To join a な-adjective to more description, use で.'),
  A(5, 'この 本{ほん}は 安{やす}（　）、おもしろいです。', ['くて', 'で', 'い', 'な'], 'This book is cheap and interesting.', 'To join an い-adjective, い → くて.'),
  A(5, '昨日{きのう}の テストは 簡単{かんたん}（　）。', ['でした', 'かったです', 'いでした', 'なでした'], 'Yesterday’s test was easy.', 'Past of a な-adjective: でした.'),
  A(5, 'この 映画{えいが}は（　）ありませんでした。', ['おもしろく', 'おもしろい', 'おもしろくて', 'おもしろかった'], 'This film wasn’t interesting.', 'Past negative of an い-adjective: くありませんでした.'),
  A(5, '昨日{きのう}は 天気{てんき}が（　）です。', ['よかった', 'いかった', 'いいでした', 'よいかった'], 'The weather was good yesterday.', 'いい conjugates from よい: よかった, よくない.'),
  A(4, '字{じ}を もっと（　）書{か}いてください。', ['大{おお}きく', '大{おお}きい', '大{おお}きな', '大{おお}きくて'], 'Please write the letters bigger.', 'To describe how you do something, い → く.'),
  A(4, '部屋{へや}を きれい（　）しました。', ['に', 'な', 'で', 'く'], 'I tidied the room. (made it clean)', 'な-adjective + に する = “make it …”.'),

  // ---- comparisons ----
  C(5, '電車{でんしゃ}と バスと（　）が 速{はや}いですか。', ['どちら', 'どれ', '何{なに}', 'どこ'], 'Which is faster, the train or the bus?', 'Comparing two things uses どちら.'),
  C(5, '果物{くだもの}の 中{なか}で（　）が いちばん 好{す}きですか。', ['何{なに}', 'どちら', 'どの', 'どう'], 'Which fruit do you like best?', '～の 中{なか}で 何{なに}が いちばん…? asks “which is the most…”.'),
  C(5, '私{わたし}は 夏{なつ}（　）冬{ふゆ}の ほうが 好{す}きです。', ['より', 'から', 'ほど', 'まで'], 'I like winter more than summer.', 'A より B の ほうが… = “B is more … than A”.'),
  C(5, 'バスより 電車{でんしゃ}の（　）が 便利{べんり}です。', ['ほう', 'ほど', 'より', 'まで'], 'The train is more convenient than the bus.', 'の ほうが marks the winner in a comparison.'),
  C(4, '今年{ことし}の 夏{なつ}は 去年{きょねん}（　）暑{あつ}く ないです。', ['ほど', 'より', 'まで', 'から'], 'This summer isn’t as hot as last year.', 'ほど + negative = “not as … as”.'),

  // ---- giving and receiving ----
  G(5, '私{わたし}は 母{はは}（　）時計{とけい}を もらいました。', ['に', 'が', 'を', 'へ'], 'I received a watch from my mother.', 'もらう: the giver takes に (or から).'),
  G(4, '友達{ともだち}が 私{わたし}に 花{はな}を（　）。', ['くれました', 'あげました', 'もらいました', 'やりました'], 'My friend gave me flowers.', 'くれる is used when someone gives to me (or my family).'),
  G(4, '私{わたし}は 妹{いもうと}に 本{ほん}を 読{よ}んで（　）。', ['あげました', 'くれました', 'もらいました', 'ください'], 'I read a book to my younger sister.', 'て-form + あげる = do something for someone else.'),
  G(4, '田中{たなか}さんが 駅{えき}まで 送{おく}って（　）。', ['くれました', 'あげました', 'もらいました', 'いただきました'], 'Mr Tanaka gave me a lift to the station.', 'て-form + くれる = someone does something for me.'),
  G(4, '私{わたし}は 先生{せんせい}に 作文{さくぶん}を 直{なお}して（　）。', ['もらいました', 'くれました', 'あげました', 'やりました'], 'I had my teacher correct my essay.', 'て-form + もらう = I have someone do something for me.'),

  // ---- opinions and guesses ----
  E(4, '今年{ことし}は 日本{にほん}へ 行{い}こう（　）思{おも}って います。', ['と', 'を', 'に', 'が'], 'I’m thinking of going to Japan this year.', 'Volitional + と 思{おも}っています = “I’m thinking of doing”.'),
  E(4, '明日{あした}は 雨{あめ}が 降{ふ}る（　）思{おも}います。', ['と', 'を', 'が', 'に'], 'I think it will rain tomorrow.', 'Plain form + と 思{おも}います = “I think that…”.'),
  E(4, '明日{あした}は たぶん 晴{は}れる（　）。', ['でしょう', 'ましょう', 'ません', 'ください'], 'It will probably be sunny tomorrow.', 'Plain form + でしょう = “probably”.'),
  E(4, '天気予報{てんきよほう}に よると、明日{あした}は 雨{あめ}が 降{ふ}る（　）。', ['そうです', 'ましょう', 'でしょうか', 'ください'], 'According to the forecast, it will rain tomorrow.', 'Plain form + そうです = “I hear that”.'),
  E(4, '道{みち}が わからない（　）は、電話{でんわ}してください。', ['とき', '前{まえ}', 'あと', 'まで'], 'If you don’t know the way, please call.', '～とき = “when, at the time when”.'),

  // ---- word order ----
  order(5, '私{わたし}は', ['漢字{かんじ}', 'を', 'よむ', 'ことが'], 2, 'できます。', 'I can read kanji.', 'Noun を + dictionary form + ことが できます.'),
  order(5, '机{つくえ}の', ['上{うえ}', 'に', '本{ほん}', 'が'], 2, 'あります。', 'There is a book on the desk.', 'Place に + thing が + あります.'),
  order(5, 'これは', ['だれ', 'の', 'かさ', 'です'], 2, 'か。', 'Whose umbrella is this?', 'だれの + noun = “whose …”.'),
  order(5, '駅{えき}の', ['前{まえ}', 'で', '友達{ともだち}を', '待{ま}って'], 2, 'います。', 'I’m waiting for my friend in front of the station.', 'Place で + object を + て-form + います.'),
  order(4, '日本{にほん}へ', ['来{く}る', '前{まえ}', 'に', '日本語{にほんご}を'], 2, '勉強{べんきょう}しました。', 'I studied Japanese before coming to Japan.', 'Dictionary form + 前{まえ}に, then the main action.'),
  order(4, '私{わたし}は', ['富士山{ふじさん}に', '登{のぼ}った', 'こと', 'が'], 2, 'あります。', 'I have climbed Mount Fuji.', 'た-form + ことが あります.'),
  order(4, '雨{あめ}が', ['降{ふ}ったら', '公園{こうえん}', 'へ', 'は'], 2, '行{い}きません。', 'If it rains, I won’t go to the park.', 'た-form + ら, then the place + へは.'),
  order(4, '', ['ご飯{はん}を', '食{た}べる', '前{まえ}', 'に'], 2, '、手{て}を 洗{あら}います。', 'I wash my hands before eating.', 'Dictionary form + 前{まえ}に.'),
  order(4, '私{わたし}の', ['趣味{しゅみ}', 'は', '写真{しゃしん}を', '撮{と}ること'], 2, 'です。', 'My hobby is taking photos.', '趣味{しゅみ}は + dictionary form + ことです.'),
  order(4, '窓{まど}を', ['開{あ}けて', 'も', 'いい', 'です'], 2, 'か。', 'May I open the window?', 'て-form + も いいですか asks for permission.'),
  order(4, '日本語{にほんご}が', ['上手{じょうず}に', '話{はな}せる', 'よう', 'に'], 2, '、毎日{まいにち} 練習{れんしゅう}しています。', 'I practise every day so that I can speak Japanese well.', 'Potential form + ように = “so that”.'),
];
