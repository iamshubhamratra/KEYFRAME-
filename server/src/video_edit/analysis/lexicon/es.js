// Spanish transcript lexicon (ANALYSIS.md §5). Normalized forms; see lexicon/en.js for conventions.
// "este" is a filler only when pause-bounded (otherwise it is the demonstrative "this").

module.exports = {
  lang: "es",
  script: "latin",
  pureFillers: ["eh", "em", "ehm", "mm", "hmm"],
  pauseBoundedFillers: ["este"],
  discourseFillers: ["este", "o sea", "pues", "bueno"],
  allowedRepeats: ["muy", "sí", "si", "no", "ya", "adiós", "más", "poco", "ja", "vamos", "corre", "rápido"],
  abbreviations: ["sr", "sra", "srta", "dr", "dra", "ud", "uds", "etc", "p.ej"],
  ctaPatterns: [
    { id: "subscribe", re: /\bsuscr[ií]b(e|ete|anse|irse|ite)\b/ },
    { id: "follow", re: /\bs[ií]gue?(me|nos)\b|\bs[ií]guenos\b/ },
    { id: "like", re: /\b(dale|deja) (un |tu )?(like|me gusta)\b/ },
    { id: "link_in_bio", re: /\benlace (en|de) (la |mi )?(bio|descripci[oó]n)\b|\blink en (la |mi )?(bio|descripci[oó]n)\b/ },
    { id: "visit", re: /\bvisita(nos)? (nuestra|nuestro|mi|la|el)\b/ },
    { id: "comment", re: /\bcomenta(lo|nos|me)?\b|\ben los comentarios\b|\bdeja (un|tu) comentario\b/ },
    { id: "sign_up", re: /\breg[ií]strate\b|\binscr[ií]bete\b/ },
    { id: "download", re: /\bdescarga(la|lo)?\b/ },
    { id: "share", re: /\bcomp[aá]rte(lo|la)?\b/ },
    { id: "notifications", re: /\b(activa|activen) (las )?notificaciones\b|\bla campanita\b/ },
  ],
  stopwords: ["el", "la", "los", "las", "un", "una", "y", "o", "pero", "de", "del", "a", "al", "en", "con", "por", "para", "que",
    "es", "son", "fue", "era", "lo", "le", "se", "me", "te", "nos", "mi", "tu", "su", "no", "sí", "muy", "más", "este", "esta"],
};
