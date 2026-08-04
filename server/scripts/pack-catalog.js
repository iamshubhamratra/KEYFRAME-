// PACK CATALOG — concrete variants for new-pack.js. Each entry is a family + a
// palette + fonts + subject; new-pack.js crosses it with the family DNA to emit a
// complete pack.json + FRAME.md.
//
// The Phase-5 gap-category packs (terminal-green/amber, signal-mono, flux-analytics,
// vault-gold, ledger-noir, care-mint, care-lavender, nimbus-saas, mint-launch) were
// removed from the project, so the catalog is intentionally empty. Add new entries
// here (see git history for the removed shape) so new-pack.js can generate them.
//
// Palette rule: `ground` is the base, `ink` the high-contrast text, `accents`
// = [primary device, secondary]. `display` MUST be a bundled webfont
// (server/src/fonts/pack_fonts.js) or a safe family, else it won't render.

module.exports = [];
