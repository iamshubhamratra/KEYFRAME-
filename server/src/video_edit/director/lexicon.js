// VIDEO EDIT DIRECTOR LEXICON — the small per-language word tables the deterministic director reads.
//
// WHY THIS EXISTS. The heuristic director (EDIT_PLAN.md §6) must still produce a watchable edit when
// every LLM is down, in all eight supported languages (en/hi/es/fr/de/pt/ar/ja). Its decisions are
// lexical: is this a call-to-action, is this sentence first-person emotional, is this word a
// superlative / a number / a unit / an emphasis marker, is this token a noun-like visual subject. If
// each module kept its own word lists they would disagree (the CTA the heuristic protects must be the
// CTA the rhythm engine protects), and a language added in one place would silently fall back to
// English in another. So the tables and the text helpers that read them live here, once.
// Lists are deliberately short and conservative: a missed punch-in is invisible, a wrong one is not.
// The director's fuzzy phrase matcher lives here too, because it needs the same normalisation and
// number equivalence ("3" == "three") as the heuristic.
//
// CONTRACT (pure, deterministic):
//   LANGS · langCode(lang) -> one of LANGS ('en' fallback) · lexiconFor(lang) -> Lexicon
//   normWord(text) -> NFKC lowercase, edge punctuation stripped (inner apostrophes kept)
//   tokenize(text, lang) -> [{ text, norm }]  (Intl.Segmenter word-like segments)
//   stem(norm, lang) -> crude plural-stripped key for TF-IDF / keyword matching
//   isStopword · isFirstPerson · isEmotional · isSuperlative · isEmphasisWord · isUnit · isStatUnit (norm, lang)
//   numberValue(norm, lang) -> number|null · isNounLike(norm, lang) -> boolean
//   ctaMatch(text, lang) -> { index, match } | null   (language patterns, then English patterns)
//   matchPhrase(words, w0, w1, text, lang, { minScore=0.6 }) -> { w0, w1, score } | null
//     fuzzy match of `text` inside words[w0..w1] (token alignment, then a no-space substring fallback)

const LANGS = Object.freeze(["en", "hi", "es", "fr", "de", "pt", "ar", "ja"]);

const set = (s) => new Set(String(s).trim().split(/\s+/).filter(Boolean).map((w) => w.normalize("NFKC").toLowerCase()));
const nums = (pairs) => new Map(Object.entries(pairs).map(([k, v]) => [k.normalize("NFKC").toLowerCase(), v]));
const B0 = "(?<![\\p{L}\\p{M}\\p{N}])";
const B1 = "(?![\\p{L}\\p{M}\\p{N}])";
const bounded = (alts) => alts.map((a) => new RegExp(`${B0}(?:${a})${B1}`, "iu"));
const unbounded = (alts) => alts.map((a) => new RegExp(`(?:${a})`, "u"));

const LEXICON = {
  en: {
    stopwords: set(`a about above after again against all almost also although always am among an and another any anybody anyone
      anything anyway are aren't around as at away back be became because become been before being below between both but by
      can can't cannot could couldn't did didn't do does doesn't doing don't done down during each either else enough even ever
      every everybody everyone everything everywhere few for from further get gets getting got gotten had hadn't has hasn't have
      haven't having he he'd he'll he's her here here's hers herself him himself his how how's however i i'd i'll i'm i've if in
      into is isn't it it's its itself just let's like likely lot lots made make makes making many may maybe me might mine more
      most much must my myself near need needs never next no nobody none nor not nothing now of off often oh ok okay on once one
      ones only onto or other others otherwise ought our ours ourselves out over own per perhaps please pretty quite rather really
      right same see seem seemed seems several shall she she'd she'll she's should shouldn't since so some somebody someone
      something sometimes somewhat soon still such sure than that that's the their theirs them themselves then there there's these
      they they'd they'll they're they've thing things this those though through thus till to too toward towards under until up
      upon us very via was wasn't way we we'd we'll we're we've well went were weren't what what's whatever when whenever where
      where's whether which while who who's whom whose why will with within without won't would wouldn't yeah yes yet you you'd
      you'll you're you've your yours yourself yourselves um uh erm er ah hmm mm actually basically literally honestly kind sort
      stuff`),
    // common verbs, adjectives, adverbs and generic nouns that are never a stock-footage subject
    nonNouns: set(`use used using check checked checks keep kept stay stays stayed go goes going gone come came coming take took taken
      give gave given tell told say said says know knew known think thought want wanted try tried feel feels felt look looked
      looking find found start started stop stopped change changed changes happen happened notice noticed turn turned show showed
      shown call called ask asked help helped follow followed share shared treat treated waste wasted ship shipped block blocked put
      let work worked works mean means meant becomes believe learn learned love loved hate hated build built create created run
      ran save saved spend spent read watch watched hear heard talk talked speak spoke wait waited remember forget forgot leave left
      bring brought hold held sit stand live lived buy bought pay paid sell sold send sent open opened close closed win won lose lost
      grow grew set sets makes simple easy hard good great bad new old big small high low long short early late weird real true full
      whole better worse sure able completely totally truly exactly especially probably finally first last second third people
      person guys everyone time times lot part bit point reason fact idea rest thing way something anything nothing everything
      someone anyone today tomorrow yesterday helped matter matters happens stick sticks`),
    firstPerson: set("i me my mine myself we us our ours ourselves i'm i've i'd i'll we're we've we'd we'll"),
    emotional: set(`love loved hate hated scared afraid fear feel feels felt feeling heart hurt cry cried crying sad happy proud grateful
      thankful sorry lonely anxious anxiety struggle struggled painful pain excited nervous ashamed embarrassed miss missed tears
      overwhelmed depressed honestly`),
    superlatives: set(`most least best worst biggest smallest fastest slowest easiest hardest greatest highest lowest largest longest
      shortest cheapest simplest strongest latest newest oldest ultimate`),
    superlativeSuffix: /^[a-z]{3,}est$/,
    notSuperlative: set(`rest test interest honest forest request suggest invest harvest protest contest digest west nest guest chest
      quest modest earnest manifest arrest pest vest zest jest lest crest detest attest priest breast`),
    emphasis: set("key secret important crucial essential critical vital mistake truth game-changer"),
    numbers: nums({ two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
      thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30,
      forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100, thousand: 1000, million: 1e6, billion: 1e9,
      twice: 2, double: 2, triple: 3, half: 0.5, dozen: 12 }),
    // "one" is deliberately absent: it is an article far more often than an emphasised number.
    units: set(`hour hours hr hrs minute minutes min mins second seconds sec secs day days week weeks month months year years percent %
      x times dollar dollars bucks euro euros pound pounds k thousand million billion people users customers subscribers followers
      views kg lb lbs km miles mph gb mb tb am pm`),
    nonStatUnits: set("am pm"),
    ctaPatterns: [
      // bare "follow" only as a clause-initial imperative ("…, follow for more"), never "I follow one rule"
      /(?<=^|[,.;:!?]\s*|(?<![\p{L}\p{M}\p{N}])(?:and|please|so|then|now)\s+)follow(?![\p{L}\p{M}\p{N}])/iu,
      ...bounded([
      "follow (?:me|us|along|for more)", "subscribe", "sign up", "link in (?:my |the )?bio", "check out (?:the |my )?link",
      "visit (?:our|my|the) (?:site|website|page|store|link|channel)", "download (?:the |our |my )?(?:app|guide|template|free)",
      "comment below", "drop a comment", "let me know in the comments", "dm me", "send me a dm", "share (?:this|it)",
      "hit the (?:bell|like|follow)", "join (?:us|our|my|the)", "click the link", "tap the link", "save this", "turn on notifications",
      "smash (?:that|the) like",
      ]),
    ],
  },
  es: {
    stopwords: set(`a al algo algunas algunos ante antes aquí así aun aunque bien cada casi como con contra cual cuando de del desde donde
      dos durante e el él ella ellas ellos en entre era eres es esa ese eso esta está están este esto estos fue fueron ha han hasta hay
      la las le les lo los más me mi mis mucho muy nada ni no nos nosotros o os otra otro para pero poco por porque que qué se sea ser
      si sí sin sobre solo son su sus también tan te tengo ti tiene todo todos tu tus un una uno unos y ya yo eh em pues bueno
      entonces tipo cosa cosas`),
    nonNouns: set("hacer hice hago tener tuve usar uso usé cambiar cambió empezar empecé sentir siento sentí ver vi decir dije mejor peor"),
    firstPerson: set("yo me mi mis mío mía conmigo nosotros nosotras nos nuestro nuestra"),
    emotional: set("amo odio miedo siento sentí corazón triste feliz orgulloso orgullosa agradecido agradecida lloré dolor emocionado nervioso"),
    superlatives: set("mejor peor máximo mínimo"),
    superlativeSuffix: /ísim[oa]s?$/u,
    notSuperlative: set(""),
    emphasis: set("clave secreto importante esencial crucial"),
    numbers: nums({ dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, veinte: 20, treinta: 30,
      cien: 100, mil: 1000, millón: 1e6, millones: 1e6, doble: 2, mitad: 0.5 }),
    units: set("horas hora minutos minuto segundos días día semanas semana meses mes años año por ciento % veces dólares euros personas usuarios seguidores"),
    nonStatUnits: set(""),
    ctaPatterns: bounded(["sígueme", "síguenos", "suscríbete", "suscribete", "(?:enlace|link) en (?:la |mi )?bio", "visita", "descarga",
      "comenta", "comparte", "regístrate", "únete", "dale like"]),
  },
  fr: {
    stopwords: set(`à au aux avec ce ces cet cette dans de des du elle elles en est et eux il ils je la le les leur leurs lui ma mais me même
      mes moi mon ne nous on ou où par pas pour qu que qui sa se ses son sur ta te tes toi ton tu un une vos votre vous y c'est j'ai euh
      heu bah ben alors donc voilà très plus tout tous chose choses`),
    nonNouns: set("faire fait utiliser changer changé commencer sentir voir dire dit meilleur pire"),
    firstPerson: set("je j' j'ai moi me m' mon ma mes nous notre nos"),
    emotional: set("aime adore déteste peur sens senti coeur cœur triste heureux heureuse fier fière reconnaissant merci pleuré douleur"),
    superlatives: set("meilleur meilleure meilleurs pire"),
    superlativeSuffix: null,
    notSuperlative: set(""),
    emphasis: set("clé secret important essentiel crucial"),
    numbers: nums({ deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, vingt: 20, trente: 30, cent: 100,
      mille: 1000, million: 1e6, double: 2, moitié: 0.5 }),
    units: set("heures heure minutes secondes jours jour semaines semaine mois ans an pour cent % fois euros dollars personnes utilisateurs abonnés"),
    nonStatUnits: set(""),
    ctaPatterns: bounded(["abonne-toi", "abonnez-vous", "suis-moi", "suivez-moi", "lien (?:en|dans la) bio", "visitez", "télécharge(?:z)?",
      "commente(?:z)?", "partage(?:z)?", "inscris-toi", "inscrivez-vous", "rejoins"]),
  },
  de: {
    stopwords: set(`aber als also am an auch auf aus bei bin bis bist da damit dann das dass dein deine dem den der des die dies diese dir
      doch du durch ein eine einem einen einer es für hab habe hat hatte ich ihr im in ist ja jetzt kann kein mal man mein meine mich mir
      mit nach nicht noch nur oder schon sehr sein sich sie sind so über um und uns unser von vor war was weil wenn wie wir wird zu zum zur
      äh ähm hm halt eben eigentlich sache`),
    nonNouns: set("machen gemacht benutzen ändern geändert anfangen fühlen sehen sagen gesagt besser schlechter"),
    firstPerson: set("ich mich mir mein meine meinen meinem wir uns unser unsere"),
    emotional: set("liebe hasse angst fühle gefühlt herz traurig glücklich stolz dankbar geweint schmerz aufgeregt"),
    superlatives: set("beste besten bester meisten größte größten schnellste einfachste wichtigste"),
    superlativeSuffix: null,
    notSuperlative: set(""),
    emphasis: set("schlüssel geheimnis wichtig wichtigste entscheidend"),
    numbers: nums({ zwei: 2, drei: 3, vier: 4, fünf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10, zwanzig: 20, dreißig: 30,
      hundert: 100, tausend: 1000, million: 1e6, doppelt: 2, hälfte: 0.5 }),
    units: set("stunden stunde minuten sekunden tage tag wochen woche monate monat jahre jahr prozent % mal euro dollar leute nutzer follower"),
    nonStatUnits: set(""),
    ctaPatterns: bounded(["abonnier(?:e|t)?", "folg(?:e|t) (?:mir|uns)", "link in (?:der )?bio", "besuch(?:e|t)", "herunterladen",
      "kommentier(?:e|t)", "teil(?:e|t) (?:das|es)", "meld(?:e|et) (?:dich|euch) an"]),
  },
  pt: {
    stopwords: set(`a ao aos as com como da das de do dos e é ela ele eles em entre era essa esse eu foi há isso isto já lhe mais mas me meu
      minha muito na não nas no nos nós o os ou para pela pelo por porque que quando se sem seu sua também te tem tu um uma você vocês
      hã ahn né tipo então coisa coisas`),
    nonNouns: set("fazer fiz usar mudar mudou começar sentir ver dizer disse melhor pior"),
    firstPerson: set("eu me mim meu minha meus minhas nós nos nosso nossa comigo"),
    emotional: set("amo odeio medo sinto senti coração triste feliz orgulhoso orgulhosa grato grata chorei dor animado"),
    superlatives: set("melhor pior máximo mínimo"),
    superlativeSuffix: /íssim[oa]s?$/u,
    notSuperlative: set(""),
    emphasis: set("chave segredo importante essencial crucial"),
    numbers: nums({ dois: 2, duas: 2, três: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, vinte: 20, trinta: 30,
      cem: 100, mil: 1000, milhão: 1e6, dobro: 2, metade: 0.5 }),
    units: set("horas hora minutos segundos dias dia semanas semana meses mês anos ano por cento % vezes reais dólares pessoas usuários seguidores"),
    nonStatUnits: set(""),
    ctaPatterns: bounded(["siga", "sigam", "se inscreva", "inscreva-se", "link na bio", "visite", "baixe", "comente", "compartilhe",
      "cadastre-se", "curta"]),
  },
  hi: {
    stopwords: set(`और का के की को है हैं था थे में से पर यह वह ये वो एक भी तो ही न नहीं कि जो क्या हम मैं आप तुम इस उस लिए साथ अब बहुत कुछ
      अं उम्म हम्म मतलब यानी`),
    // inflected verbs / adjectives / adverbs that are never a stock-footage subject
    nonNouns: set(`करना किया किए कीं करें करो करते करता करती करके देखो देखा देखी बोलो बोला बोली मैंने हमने मिलती मिलता मिलते मिली मिला
      चलती चलता चलते चली चला खरीदी खरीदा खरीदे खरीद होता होती होते हुआ हुई हुए गया गई गए रहा रही रहे सकता सकती सकते लगता लगती
      हूँ हूं हो था थी थे नई नया नए तेज़ तेज बहुत सच्चा अच्छा अच्छी अच्छे बड़ा बड़ी बड़े छोटा छोटी छोटे`),
    firstPerson: set("मैं मैंने मुझे मेरा मेरी मेरे हम हमने हमें हमारा हमारी"),
    emotional: set("प्यार डर दिल दुख खुश गर्व शुक्रिया धन्यवाद महसूस रोया दर्द"),
    superlatives: set("सबसे बेहतरीन"),
    superlativeSuffix: null,
    notSuperlative: set(""),
    emphasis: set("राज़ राज जरूरी ज़रूरी महत्वपूर्ण खास"),
    numbers: nums({ "दो": 2, "तीन": 3, "चार": 4, "पांच": 5, "पाँच": 5, "छह": 6, "सात": 7, "आठ": 8, "नौ": 9, "दस": 10, "बीस": 20,
      "सौ": 100, "हज़ार": 1000, "हजार": 1000, "लाख": 1e5, "करोड़": 1e7 }),
    units: set("घंटे घंटा मिनट सेकंड दिन हफ्ते हफ़्ते महीने साल प्रतिशत % बार रुपये लोग"),
    nonStatUnits: set(""),
    ctaPatterns: bounded(["सब्सक्राइब", "फॉलो", "लाइक", "कमेंट", "शेयर", "डाउनलोड", "बायो में लिंक", "लिंक बायो", "जुड़ें"]),
  },
  ar: {
    stopwords: set("في من على إلى عن مع هذا هذه ذلك التي الذي هو هي أنا نحن أنت هم كان كانت لا ما لم لن قد ثم أو و يا كل بعض عند اممم آه يعني"),
    nonNouns: set("أفعل فعلت استخدم غيرت أشعر"),
    firstPerson: set("أنا نحن لي لنا"),
    emotional: set("أحب حب خوف قلبي حزين سعيد فخور شكرا أشعر بكيت ألم"),
    superlatives: set("أكثر أفضل أسوأ أكبر أصغر أسرع أهم"),
    superlativeSuffix: null,
    notSuperlative: set(""),
    emphasis: set("سر مهم المفتاح أساسي ضروري"),
    numbers: nums({ "اثنان": 2, "ثلاثة": 3, "أربعة": 4, "خمسة": 5, "ستة": 6, "سبعة": 7, "ثمانية": 8, "تسعة": 9, "عشرة": 10, "عشرين": 20,
      "مئة": 100, "ألف": 1000, "مليون": 1e6 }),
    units: set("ساعات ساعة دقائق دقيقة ثواني أيام يوم أسابيع أسبوع أشهر شهر سنوات سنة بالمئة % مرات دولار أشخاص"),
    nonStatUnits: set(""),
    ctaPatterns: bounded(["اشترك", "اشتركوا", "تابع", "تابعني", "تابعونا", "الرابط في البايو", "شارك", "شاركوا", "علق", "حمل", "سجل"]),
  },
  ja: {
    stopwords: set("は が を に で と の も へ や から まで より て し た だ です ます する いる ある こと もの それ これ あれ その この あの えー えーと あのー まあ ね よ か な"),
    nonNouns: set("する した して なる なった"),
    firstPerson: set("私 わたし 僕 ぼく 俺 おれ 私たち 僕ら"),
    emotional: set("好き 大好き 嫌い 怖い 心 悲しい 嬉しい うれしい 誇り ありがとう 感じ 泣い 痛い"),
    superlatives: set("最も 一番 最高 最大 最強 最速"),
    superlativeSuffix: null,
    notSuperlative: set(""),
    emphasis: set("秘密 重要 大事 大切 ポイント 鍵"),
    numbers: nums({ "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9, "十": 10, "百": 100, "千": 1000, "万": 10000 }),
    units: set("時間 分 秒 日 週間 ヶ月 か月 年 パーセント % 倍 円 ドル 人"),
    nonStatUnits: set(""),
    ctaPatterns: unbounded(["チャンネル登録", "フォロー", "高評価", "コメント", "シェア", "ダウンロード", "プロフィールのリンク", "登録して"]),
  },
};

function langCode(lang) {
  const c = String(lang || "en").toLowerCase().slice(0, 2);
  return LANGS.includes(c) ? c : "en";
}

function lexiconFor(lang) { return LEXICON[langCode(lang)]; }

const LEAD_RE = /^["'“‘«¿¡(\[{]+/u;
const TRAIL_RE = /["'”’»)\]}.,!?;:…、。，！？।॥؟،]+$/u;

function normWord(text) {
  return String(text == null ? "" : text).normalize("NFKC").toLowerCase().replace(LEAD_RE, "").replace(TRAIL_RE, "").replace(/[’‘]/g, "'");
}

const segmenters = new Map();
function tokenize(text, lang) {
  const code = langCode(lang);
  let seg = segmenters.get(code);
  if (!seg) { seg = new Intl.Segmenter(code, { granularity: "word" }); segmenters.set(code, seg); }
  const out = [];
  for (const s of seg.segment(String(text == null ? "" : text).normalize("NFKC"))) {
    if (!s.isWordLike) continue;
    const norm = normWord(s.segment);
    if (norm) out.push({ text: s.segment, norm });
  }
  return out;
}

const LATIN_LANGS = new Set(["en", "es", "fr", "de", "pt"]);

function stem(norm, lang) {
  const n = String(norm || "");
  const code = langCode(lang);
  if (code === "en") {
    if (n.length > 4 && n.endsWith("ies")) return `${n.slice(0, -3)}y`;
    if (n.length > 4 && n.endsWith("s") && !n.endsWith("ss") && !n.endsWith("us") && !n.endsWith("is")) return n.slice(0, -1);
    return n;
  }
  if ((code === "es" || code === "pt" || code === "fr") && n.length > 4 && n.endsWith("s")) return n.slice(0, -1);
  return n;
}

const has = (setName) => (norm, lang) => lexiconFor(lang)[setName].has(String(norm || ""));
const isStopword = has("stopwords");
const isFirstPerson = has("firstPerson");
const isEmotional = has("emotional");
const isEmphasisWord = has("emphasis");
const isUnit = has("units");

function isStatUnit(norm, lang) {
  const lex = lexiconFor(lang);
  return lex.units.has(norm) && !lex.nonStatUnits.has(norm);
}

function isSuperlative(norm, lang) {
  const lex = lexiconFor(lang);
  const n = String(norm || "");
  if (lex.superlatives.has(n)) return true;
  return !!(lex.superlativeSuffix && lex.superlativeSuffix.test(n) && !lex.notSuperlative.has(n) && !lex.stopwords.has(n));
}

const DIGIT_RE = /^[$€£₹¥]?(\d+(?:[.,]\d+)?)(%|x|k|m|b|bn)?$/i;
function numberValue(norm, lang) {
  const n = String(norm || "");
  const m = DIGIT_RE.exec(n);
  if (m) return Number(m[1].replace(",", "."));
  const v = lexiconFor(lang).numbers.get(n);
  return v == null ? null : v;
}

const WHITELIST_ACRONYMS = new Set(["ai", "vr", "ar", "5g", "ux", "ui", "seo", "api", "crm", "b2b"]);
const HIRAGANA_ONLY = /^[\p{Script=Hiragana}ー]+$/u;

function isNounLike(norm, lang) {
  const code = langCode(lang);
  const lex = lexiconFor(code);
  const n = String(norm || "");
  if (!n || lex.stopwords.has(n) || lex.nonNouns.has(n)) return false;
  if (numberValue(n, code) != null || lex.units.has(n) || lex.superlatives.has(n)) return false;
  if (WHITELIST_ACRONYMS.has(n)) return true;
  if (code === "ja") return n.length >= 2 && !HIRAGANA_ONLY.test(n);
  if (!/\p{L}/u.test(n)) return false;
  if (LATIN_LANGS.has(code)) {
    if (n.length < 3) return false;
    if (code === "en" && n.length > 4 && (/ly$/.test(n) || /ing$/.test(n) || /ed$/.test(n))) return false;
    if ((code === "es" || code === "pt") && /mente$/.test(n)) return false;
    if (code === "fr" && n.length > 6 && /ment$/.test(n)) return false;
    return true;
  }
  return n.length >= 2;
}

function ctaMatch(text, lang) {
  const s = String(text == null ? "" : text).normalize("NFKC");
  const code = langCode(lang);
  const patterns = code === "en" ? LEXICON.en.ctaPatterns : [...LEXICON[code].ctaPatterns, ...LEXICON.en.ctaPatterns];
  let best = null;
  for (const re of patterns) {
    const m = re.exec(s);
    if (m && (!best || m.index < best.index)) best = { index: m.index, match: m[0] };
  }
  return best;
}

// ---------------------------------------------------------------- fuzzy phrase matching
function levenshtein(a, b) {
  const s = [...a].slice(0, 40), t = [...b].slice(0, 40);
  let prev = Array.from({ length: t.length + 1 }, (_, j) => j);
  for (let i = 1; i <= s.length; i++) {
    const cur = [i];
    for (let j = 1; j <= t.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (s[i - 1] === t[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[t.length];
}

function tokenSim(a, b, lang) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const na = numberValue(a, lang), nb = numberValue(b, lang);
  if (na != null && nb != null) return na === nb ? 1 : 0;
  if (stem(a, lang) === stem(b, lang)) return 0.95;
  const la = [...a].length, lb = [...b].length;
  if (Math.min(la, lb) >= 4 && (a.startsWith(b) || b.startsWith(a))) return 0.85;
  const r = 1 - levenshtein(a, b) / Math.max(la, lb);
  return r >= 0.6 ? r : 0;
}

function matchPhrase(words, w0, w1, text, lang = "en", { minScore = 0.6 } = {}) {
  if (!Array.isArray(words) || !Number.isInteger(w0) || !Number.isInteger(w1) || w1 < w0) return null;
  const target = tokenize(text, lang).map((t) => t.norm);
  if (!target.length) return null;
  const cand = [];
  for (let i = Math.max(0, w0); i <= Math.min(words.length - 1, w1); i++) cand.push({ i, norm: normWord(words[i] && words[i].text) });
  if (!cand.length) return null;
  const n = target.length;
  let best = null;
  for (let m = Math.max(1, n - 1); m <= Math.min(cand.length, n + 1); m++) {
    for (let s = 0; s + m <= cand.length; s++) {
      const win = cand.slice(s, s + m);
      const sim = win.map((c) => target.map((t) => tokenSim(t, c.norm, lang)));
      const dp = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));
      for (let a = 1; a <= n; a++) {
        for (let b = 1; b <= m; b++) dp[a][b] = Math.max(dp[a - 1][b], dp[a][b - 1], dp[a - 1][b - 1] + sim[b - 1][a - 1]);
      }
      const score = dp[n][m] / Math.max(n, m);
      if (score < minScore - 1e-9) continue;
      let lo = 0, hi = m - 1;
      while (lo < hi && Math.max(...sim[lo]) < 0.6) lo++;
      while (hi > lo && Math.max(...sim[hi]) < 0.6) hi--;
      const c = { w0: win[lo].i, w1: win[hi].i, score: Math.round(score * 1000) / 1000, sizeDiff: Math.abs(m - n) };
      if (!best || c.score > best.score + 1e-9
        || (Math.abs(c.score - best.score) <= 1e-9 && (c.sizeDiff < best.sizeDiff || (c.sizeDiff === best.sizeDiff && c.w0 < best.w0)))) best = c;
    }
  }
  if (best) return { w0: best.w0, w1: best.w1, score: best.score };

  // No-space scripts and joined names ("GoogleCalendar"): substring over the concatenated norms.
  const needle = target.join("");
  if ([...needle].length < 2) return null;
  let acc = "";
  const starts = [];
  for (const c of cand) { starts.push(acc.length); acc += c.norm.replace(/\s+/g, ""); }
  const at = acc.indexOf(needle);
  if (at < 0) return null;
  const end = at + needle.length;
  let a = 0, b = 0;
  for (let k = 0; k < cand.length; k++) { if (starts[k] <= at) a = k; if (starts[k] < end) b = k; }
  return { w0: cand[a].i, w1: cand[b].i, score: 0.9 };
}

module.exports = {
  LANGS, LEXICON, langCode, lexiconFor, normWord, tokenize, stem,
  isStopword, isFirstPerson, isEmotional, isSuperlative, isEmphasisWord, isUnit, isStatUnit, numberValue, isNounLike,
  ctaMatch, matchPhrase, tokenSim, levenshtein,
};
