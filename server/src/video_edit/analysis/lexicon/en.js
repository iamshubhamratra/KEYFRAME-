// English transcript lexicon (ANALYSIS.md §5): fillers, legit repeats, abbreviations, CTA patterns.
//
// Entries are written in NORMALIZED form (NFKC, lowercase, punctuation stripped, apostrophes kept) —
// the same form analysis/transcript.js produces for `word.norm` and sentence match text.
// Pure fillers match with elongation collapse (umm, uhhh); discourse fillers are candidates only
// (pause-touching) and removed only under removeFillers:'aggressive' after the content verdict.

module.exports = {
  lang: "en",
  script: "latin",
  pureFillers: ["um", "uh", "erm", "er", "ah", "hmm", "hm", "mm", "uhm", "umm"],
  pauseBoundedFillers: [],
  discourseFillers: ["like", "you know", "i mean", "basically", "actually", "so", "literally"],
  allowedRepeats: ["very", "really", "so", "no", "yes", "yeah", "bye", "ha", "hey", "go", "many", "more", "much", "long", "far",
    "again", "ok", "okay", "now", "knock", "blah", "tick", "bang", "boom", "had", "that", "is", "please", "wait", "come", "on"],
  abbreviations: ["mr", "mrs", "ms", "dr", "prof", "st", "vs", "etc", "e.g", "i.e", "jr", "sr", "inc", "ltd", "approx"],
  ctaPatterns: [
    { id: "subscribe", re: /\bsubscrib(e|ed|ing)\b/ },
    { id: "follow", re: /\bfollow (me|us|for|along|my|our)\b/ },
    { id: "like", re: /\b(smash|hit|leave|give) (that |the |this |a )?(like|thumbs up)\b|\blike and subscribe\b/ },
    { id: "link_in_bio", re: /\blinks? (is |are )?(in|below|down below)( the| my| our)?( bio| description)?\b/ },
    { id: "visit", re: /\bvisit (our|my|the|us|www)\b|\bhead (over )?to\b/ },
    { id: "comment", re: /\b(in the comments|comment (below|down below)|leave a comment|drop a comment|let me know (below|in the comments))\b/ },
    { id: "sign_up", re: /\bsign (up|in)\b|\bregister (now|today|here)\b/ },
    { id: "download", re: /\bdownload\b/ },
    { id: "dm", re: /\b(dm|message) (me|us)\b|\bsend (me|us) a (dm|message)\b/ },
    { id: "share", re: /\bshare (this|it|with)\b/ },
    { id: "notifications", re: /\bturn on (the |post )?notifications\b|\b(hit|ring|tap) the bell\b/ },
    { id: "check_out", re: /\bcheck (it|us|me|them) out\b|\bcheck out (the|our|my)\b/ },
    { id: "click", re: /\b(click|tap) (the|on|below|here)\b/ },
    { id: "join", re: /\bjoin (us|our|the|my)\b/ },
    { id: "book", re: /\bbook (a|your) (call|demo|consultation|session)\b/ },
    { id: "buy", re: /\b(buy|order|shop) (now|today|here)\b|\bget yours\b/ },
  ],
  stopwords: ["a", "an", "the", "and", "or", "but", "if", "then", "so", "to", "of", "in", "on", "at", "for", "with", "by", "from",
    "is", "are", "was", "were", "be", "been", "am", "it", "it's", "this", "that", "these", "those", "i", "you", "he", "she", "we",
    "they", "me", "my", "your", "our", "their", "do", "does", "did", "have", "has", "had", "not", "no", "just", "very", "can",
    "will", "would", "what", "which", "who", "how", "when", "there", "here", "um", "uh", "like", "about", "up", "out", "all"],
};
