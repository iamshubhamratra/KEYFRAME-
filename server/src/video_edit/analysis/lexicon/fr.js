// French transcript lexicon (ANALYSIS.md §5). Normalized forms; see lexicon/en.js for conventions.

module.exports = {
  lang: "fr",
  script: "latin",
  pureFillers: ["euh", "heu", "bah", "hum", "hmm", "mm", "ben"],
  pauseBoundedFillers: [],
  discourseFillers: ["genre", "du coup", "en fait", "tu vois", "voilà"],
  allowedRepeats: ["très", "oui", "non", "bon", "vite", "ha", "allez", "trop"],
  abbreviations: ["m", "mme", "mlle", "dr", "etc", "p.ex", "st", "ste"],
  ctaPatterns: [
    { id: "subscribe", re: /\babonne(z)?[- ]?(toi|vous)\b|\bvous abonner\b|\bt'abonner\b/ },
    { id: "follow", re: /\bsui(s|vez)[- ]?(moi|nous)\b/ },
    { id: "like", re: /\b(mets|mettez|laisse|laissez) (un )?(like|pouce bleu)\b/ },
    { id: "link_in_bio", re: /\blien (dans|en) (la |ma )?(bio|description)\b/ },
    { id: "visit", re: /\bvisite(z)? (notre|mon|le|la|nos)\b|\brends[- ]toi sur\b|\brendez[- ]vous sur\b/ },
    { id: "comment", re: /\b(en|dans les) commentaires?\b|\bcommente(z)?\b/ },
    { id: "sign_up", re: /\binscri(s|vez)[- ]?(toi|vous)\b/ },
    { id: "download", re: /\btélécharge(z)?\b/ },
    { id: "share", re: /\bpartage(z)?\b/ },
    { id: "notifications", re: /\b(active|activez) (les )?notifications\b|\bla cloche\b/ },
  ],
  stopwords: ["le", "la", "les", "un", "une", "des", "et", "ou", "mais", "de", "du", "à", "au", "en", "dans", "avec", "pour", "par",
    "que", "qui", "est", "sont", "était", "je", "tu", "il", "elle", "nous", "vous", "ils", "ce", "ça", "on", "ne", "pas", "très"],
};
