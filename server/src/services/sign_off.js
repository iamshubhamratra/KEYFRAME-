// DOES THIS FILM HAVE A DESTINATION TO SEND THE VIEWER TO?
//
// Every template closes on a sign-off card: a logo lockup, the brand's name, a
// "GET <BRAND>" button and the URL. That card is a sign-off for a PRODUCT, and
// it is correct when the user handed us a website or a blog post — the film is
// an ad for a thing that exists and the last frame is where to go find it.
//
// A film built from a bare PROMPT has no product, no logo and no domain, and the
// closer asserted all three anyway. Measured on a prompt-only 30s film titled
// "How compound interest quietly builds wealth" (scripts run 2026-09-08):
//
//   omelette (197 packs)        last beat cast as the CTA/Join shape:
//                               cta "GET COMPOUND", a GENERATED MONOGRAM standing
//                               in for a logo, url blanked to " "
//   template_engine (49 packs)  endcard printed "how.com" — the brand fell back to
//                               the title's FIRST WORD and the url to `${brand}.com`
//   momentum                    "howcompoundinter.app"
//   showcase                    "howcompoundinter.com"
//
// A fabricated domain is not a guess, it is an assertion — printed on the last
// frame — about an address we do not own and have never checked. "how.com",
// "from.com" and "turn.com" all resolve to real businesses. omelette_adapter
// already refused to invent one (see its NEVER INVENT A DOMAIN note); this module
// is that rule made shared, plus the second half of it: with no domain there is
// nothing to sign off TO, so the film simply does not draw the card.
//
// The beat is NOT dropped — dropping it would leave its narration playing over
// someone else's frame. The closing beat keeps its copy and its airtime and is
// cast as an ordinary content shape, so the film ends on what it was saying.

// OWNER SOURCES ONLY. `topic-screenshot` and `related-website` are captures of
// OTHER products' reference sites, so deriving the film's own URL from one
// printed a COMPETITOR'S domain on the CTA — a real Lumen film closed on
// "reflect.app" because its topic shots were of reflect/notion/mem.
const OWNER_SOURCE = /^(website|website-image|blog)$/;

/** The hostname of the site this film is ABOUT, or "" when it is about no site. */
function ownHost(assets) {
  return (Array.isArray(assets) ? assets : [])
    .filter((a) => a && a.sourceUrl && OWNER_SOURCE.test(String(a.source)))
    .map((a) => { try { return new URL(a.sourceUrl).hostname.replace(/^www\./, ""); } catch { return null; } })
    .find(Boolean) || "";
}

/**
 * The URL the film may print. "" when the film has none.
 *
 * NEVER falls back to `${brand}.com` — that fallback is what put "how.com" on
 * the closing frame of every family film built from a prompt.
 */
function filmUrl(sb, assets) {
  const authored = String((sb && sb.url) || "").trim();
  return (authored || ownHost(assets)).slice(0, 40);
}

/**
 * The user's OWN mark, uploaded with the brief (user_assets pins it to the last
 * scene as role:"logo"). Someone who uploads their logo has a brand even when
 * they gave us no URL, so their film still earns its sign-off.
 */
function hasOwnLogo(assets) {
  return (Array.isArray(assets) ? assets : [])
    .some((a) => a && String(a.role || "").toLowerCase() === "logo");
}

/**
 * May this film close on the brand card?
 *
 * Pass the url you already derived (or let it derive one). True only when the
 * film has a real destination of its own, or the user gave us their own mark.
 */
function signsOff({ url, storyboard = null, assets = null } = {}) {
  // An explicit opt-in wins. The pack PREVIEWS need it: a preview exists to show
  // what a template can do, closer included, and it is composed from a canned
  // storyboard with no site — so without this every gallery clip would quietly
  // lose its sign-off shape. Saying so on the storyboard is honest in a way that
  // handing the previews a made-up domain would not be.
  if (storyboard && typeof storyboard.signOff === "boolean") return storyboard.signOff;
  const u = url != null ? String(url).trim() : filmUrl(storyboard, assets);
  return !!u || hasOwnLogo(assets);
}

module.exports = { OWNER_SOURCE, ownHost, filmUrl, hasOwnLogo, signsOff };
