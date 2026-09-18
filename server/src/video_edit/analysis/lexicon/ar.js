// Arabic transcript lexicon (ANALYSIS.md §5). Normalized forms; see lexicon/en.js for conventions.
// analysis/transcript.js folds Arabic before matching: harakat and tatweel removed, أ إ آ ٱ → ا,
// ى → ي, ة → ه. Entries and CTA patterns below are written in that folded form.

module.exports = {
  lang: "ar",
  script: "arabic",
  // NOTE: never list "ام" — after folding it is أم ("or" / "mother"). Elongated forms match via collapse.
  pureFillers: ["اممم", "امم", "اه", "ااه", "همم"],
  pauseBoundedFillers: [],
  discourseFillers: ["يعني", "طيب", "بصراحه"],
  allowedRepeats: ["جدا", "لا", "نعم", "شوي", "يلا", "بسرعه", "كتير"],
  abbreviations: ["د"],
  ctaPatterns: [
    { id: "subscribe", re: /اشترك|اشتركوا|الاشتراك/ },
    { id: "follow", re: /تابعون|تابعني|تابعنا|تابعوا|تابع الحساب|تابع القناه/ },
    { id: "like", re: /لايك|اعجاب/ },
    { id: "link_in_bio", re: /الرابط (في|بال)|رابط (في|بال)(ال)?(وصف|بايو)/ },
    { id: "visit", re: /زوروا|زور (موقع|موقعنا)|قم بزياره/ },
    { id: "comment", re: /علق|علقوا|التعليقات|تعليق/ },
    { id: "sign_up", re: /سجل|سجلوا|التسجيل/ },
    { id: "download", re: /حمل|حملوا|نزل التطبيق|تحميل/ },
    { id: "share", re: /شارك|شاركوا/ },
    { id: "notifications", re: /الجرس|الاشعارات/ },
  ],
  stopwords: ["في", "من", "الي", "علي", "عن", "مع", "و", "او", "لكن", "هذا", "هذه", "ذلك", "انا", "انت", "هو", "هي", "نحن", "هم",
    "كان", "لا", "ما", "ان", "قد", "كل", "يعني"],
};
