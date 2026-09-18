// Portuguese transcript lexicon (ANALYSIS.md §5). Normalized forms; see lexicon/en.js for conventions.
// "é" is a filler only when pause-bounded (otherwise it is the verb "is").

module.exports = {
  lang: "pt",
  script: "latin",
  pureFillers: ["hã", "ahn", "hum", "hmm", "eh", "ãh", "mm"],
  pauseBoundedFillers: ["é"],
  discourseFillers: ["tipo", "né", "tipo assim", "então", "sabe"],
  allowedRepeats: ["muito", "sim", "não", "já", "tchau", "bem", "vai", "corre", "rápido"],
  abbreviations: ["sr", "sra", "dr", "dra", "etc", "p.ex", "v.exa"],
  ctaPatterns: [
    { id: "subscribe", re: /\binscrev(a|e)[- ]?se\b|\bse inscrev(a|e)\b/ },
    { id: "follow", re: /\bsig(a|am)[- ]?(me|nos)\b|\bme sig(a|am)\b|\bnos sig(a|am)\b/ },
    { id: "like", re: /\b(deixa|deixe|dá|dê) (um |seu |o )?(like|joinha)\b/ },
    { id: "link_in_bio", re: /\blink (na|da) (bio|descrição)\b/ },
    { id: "visit", re: /\bvisit(a|e) (nosso|nossa|meu|minha|o|a)\b/ },
    { id: "comment", re: /\bcomenta(e|m)?\b|\bnos comentários\b|\bdeixa (um|seu) comentário\b/ },
    { id: "sign_up", re: /\bcadastr(a|e)[- ]?se\b|\bse cadastr(a|e)\b/ },
    { id: "download", re: /\bbaix(a|e) (o|a|agora)\b|\bdownload\b/ },
    { id: "share", re: /\bcompartilh(a|e)\b/ },
    { id: "notifications", re: /\bativ(a|e) (o )?sininho\b|\bnotificações\b/ },
  ],
  stopwords: ["o", "a", "os", "as", "um", "uma", "e", "ou", "mas", "de", "do", "da", "em", "no", "na", "com", "por", "para", "que",
    "é", "são", "foi", "eu", "você", "ele", "ela", "nós", "eles", "se", "me", "não", "muito", "mais", "isso", "esse", "essa"],
};
