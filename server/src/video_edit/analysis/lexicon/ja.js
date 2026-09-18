// Japanese transcript lexicon (ANALYSIS.md §5). Normalized forms; see lexicon/en.js for conventions.
// Japanese has no spaces: analysis/transcript.js joins ja sentence tokens without separators and
// CTA patterns are substring matches. Long-mark runs (えーーと) collapse to one ー before matching.

module.exports = {
  lang: "ja",
  script: "cjk",
  joiner: "",
  pureFillers: ["えー", "えーと", "えっと", "あのー", "うーん", "んー", "えーっと", "あー"],
  pauseBoundedFillers: [],
  discourseFillers: ["あの", "その", "まあ", "なんか"],
  allowedRepeats: ["はい", "いえ", "もっと", "どんどん", "ほら", "さあ", "ねえ"],
  abbreviations: [],
  ctaPatterns: [
    { id: "subscribe", re: /チャンネル登録|登録(して|お願い|よろしく)/ },
    { id: "follow", re: /フォロー/ },
    { id: "like", re: /高評価|いいね/ },
    { id: "link_in_bio", re: /概要欄|プロフィールのリンク|リンク(は|を)(概要|下)/ },
    { id: "visit", re: /(サイト|ホームページ)(を|に)(見て|チェック|アクセス)/ },
    { id: "comment", re: /コメント/ },
    { id: "sign_up", re: /(無料)?登録はこちら|サインアップ|申し込み/ },
    { id: "download", re: /ダウンロード/ },
    { id: "share", re: /シェア/ },
    { id: "notifications", re: /通知(を)?オン|ベル(マーク|アイコン)/ },
  ],
  stopwords: ["は", "が", "を", "に", "で", "と", "の", "も", "です", "ます", "これ", "それ", "あれ", "この", "その", "私", "僕"],
};
