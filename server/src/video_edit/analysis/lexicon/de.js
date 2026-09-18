// German transcript lexicon (ANALYSIS.md §5). Normalized forms; see lexicon/en.js for conventions.

module.exports = {
  lang: "de",
  script: "latin",
  pureFillers: ["äh", "ähm", "hm", "hmm", "öh", "ehm", "mm"],
  pauseBoundedFillers: [],
  discourseFillers: ["also", "halt", "sozusagen", "quasi", "irgendwie"],
  allowedRepeats: ["sehr", "ja", "nein", "so", "gut", "hallo", "schnell", "komm", "los"],
  abbreviations: ["z.b", "bzw", "usw", "dr", "nr", "ca", "evtl", "hr", "fr", "u.a"],
  ctaPatterns: [
    { id: "subscribe", re: /\babonnier(e|t|en)\b|\babo\b/ },
    { id: "follow", re: /\bfolg(e|t) (mir|uns)\b/ },
    { id: "like", re: /\b(lass|lasst|gib|gebt) (einen |ein )?(like|daumen hoch)\b/ },
    { id: "link_in_bio", re: /\blink (in der|in meiner|in unserer) (bio|beschreibung|videobeschreibung)\b/ },
    { id: "visit", re: /\bbesuch(e|t) (unsere|meine|die|den)\b/ },
    { id: "comment", re: /\b(in die|in den) kommentare(n)?\b|\bkommentier(e|t)\b/ },
    { id: "sign_up", re: /\bmeld(e|et) (dich|euch) an\b|\bregistrier(e|t) (dich|euch)\b/ },
    { id: "download", re: /\blad(e|et) (die|das|sie|es)? ?(app )?(herunter|runter)\b|\bdownload\b/ },
    { id: "share", re: /\bteil(e|t) (das|dieses|es)\b/ },
    { id: "notifications", re: /\bglocke\b|\bbenachrichtigungen\b/ },
  ],
  stopwords: ["der", "die", "das", "ein", "eine", "und", "oder", "aber", "von", "zu", "mit", "für", "auf", "in", "im", "ist", "sind",
    "war", "ich", "du", "er", "sie", "wir", "ihr", "es", "nicht", "sehr", "auch", "dass", "den", "dem", "des", "so"],
};
