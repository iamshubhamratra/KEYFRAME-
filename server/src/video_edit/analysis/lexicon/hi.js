// Hindi transcript lexicon (ANALYSIS.md §5). Normalized forms; see lexicon/en.js for conventions.
// Devanagari has no case and no \b word boundary in JS regex, so CTA patterns are substring matches
// on the space-joined normalized sentence. Latin-script (Hinglish) sentences are also checked
// against the English patterns by analysis/transcript.js.

module.exports = {
  lang: "hi",
  script: "devanagari",
  pureFillers: ["अं", "उम्म", "हम्म", "अम्म", "ऊं", "हं"],
  pauseBoundedFillers: [],
  discourseFillers: ["मतलब", "यानी", "matlab", "basically"],
  allowedRepeats: ["बहुत", "हाँ", "हां", "नहीं", "जल्दी", "धीरे", "कभी", "बार", "अरे", "चलो"],
  abbreviations: ["डॉ", "श्री"],
  ctaPatterns: [
    { id: "subscribe", re: /सब्सक्राइब|सब्स्क्राइब|subscribe/ },
    { id: "follow", re: /फॉलो|फोलो|follow/ },
    { id: "like", re: /लाइक (करें|करो|कीजिए|कर दें|कर दो|ज़रूर)/ },
    { id: "link_in_bio", re: /लिंक .{0,20}(डिस्क्रिप्शन|बायो|नीचे)/ },
    { id: "visit", re: /विज़िट|विजिट/ },
    { id: "comment", re: /कमेंट|कॉमेंट|टिप्पणी/ },
    { id: "sign_up", re: /साइन अप|रजिस्टर (करें|करो|कीजिए)/ },
    { id: "download", re: /डाउनलोड/ },
    { id: "share", re: /शेयर (करें|करो|कीजिए|कर दें|ज़रूर)/ },
    { id: "notifications", re: /बेल (आइकन|आइकॉन)|घंटी/ },
  ],
  stopwords: ["है", "हैं", "था", "थे", "और", "या", "का", "की", "के", "को", "में", "से", "पर", "यह", "वह", "मैं", "हम", "आप", "तो", "भी",
    "नहीं", "एक", "कि", "जो", "ही", "बहुत"],
};
