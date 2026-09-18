// EDITOR KEYBOARD SHORTCUTS (UX.md §4.9).
//
// One declarative KEYMAP drives three things: matching a KeyboardEvent to an action, the
// shortcuts dialog, and `aria-keyshortcuts` on the controls that own an action. Matching is pure
// (it takes the event and a context object) so it is unit-tested without a DOM, and it refuses
// to fire while the person is typing — a caption edit that eats "K" or Backspace as playback or
// delete would destroy work. Esc is the one key that still works inside an open dialog.
//
// Zones: an element (or an ancestor) may carry data-kf-zone="player" | "timeline" | "slider" |
// "transcript". Space plays only from body/player/timeline focus; arrows are left to the
// timeline's roving focus and to sliders, which own them there.

export const KEYMAP = Object.freeze([
  { id: "togglePlay", keys: ["K"], label: "Play / pause", group: "Playback" },
  { id: "togglePlaySpace", action: "togglePlay", keys: ["Space"], label: "Play / pause (player or timeline focused)", group: "Playback" },
  { id: "jumpBack", keys: ["J"], label: "Back 5 seconds", group: "Playback", amount: -5 },
  { id: "jumpForward", keys: ["L"], label: "Forward 5 seconds", group: "Playback", amount: 5 },
  { id: "nudgeBack", keys: ["ArrowLeft"], label: "Back 1 second (Shift: 5)", group: "Playback", amount: -1 },
  { id: "nudgeForward", keys: ["ArrowRight"], label: "Forward 1 second (Shift: 5)", group: "Playback", amount: 1 },
  { id: "frameBack", keys: [","], label: "Previous frame (paused)", group: "Playback", amount: -1 },
  { id: "frameForward", keys: ["."], label: "Next frame (paused)", group: "Playback", amount: 1 },
  { id: "prevItem", keys: ["["], label: "Previous item", group: "Selection" },
  { id: "nextItem", keys: ["]"], label: "Next item", group: "Selection" },
  { id: "itemActions", keys: ["Enter"], label: "Open item actions", group: "Selection" },
  { id: "removeSelected", keys: ["Delete", "Backspace"], label: "Remove or turn off the selected item", group: "Selection" },
  { id: "undo", keys: ["Mod+Z"], label: "Undo", group: "History" },
  { id: "redo", keys: ["Mod+Shift+Z", "Ctrl+Y"], label: "Redo", group: "History" },
  { id: "escape", keys: ["Escape"], label: "Close dialog, then clear selection", group: "General" },
  { id: "showShortcuts", keys: ["?"], label: "Show shortcuts", group: "General" },
].map((e) => Object.freeze(e)));

const TYPING_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);
// Inputs that do not take text: a checkbox or button-like input may still let shortcuts through.
const NON_TEXT_INPUTS = new Set(["checkbox", "radio", "button", "submit", "reset", "color", "file", "image"]);

function closest(el, selector) {
  try { return el && typeof el.closest === "function" ? el.closest(selector) : null; } catch { return null; }
}

// True when keystrokes on `el` belong to the element: text fields, selects, range sliders
// (arrows adjust the value), contenteditable regions. Works on real elements and plain objects
// with {tagName, type, isContentEditable, closest}.
export function isTypingTarget(el) {
  if (!el || typeof el !== "object") return false;
  const tag = String(el.tagName || "").toUpperCase();
  if (TYPING_TAGS.has(tag)) {
    if (tag === "INPUT") {
      const type = String(el.type || (typeof el.getAttribute === "function" ? el.getAttribute("type") : "") || "text").toLowerCase();
      return !NON_TEXT_INPUTS.has(type);
    }
    return true;
  }
  if (el.isContentEditable === true) return true;
  const ce = typeof el.getAttribute === "function" ? el.getAttribute("contenteditable") : null;
  if (ce !== null && ce !== undefined && ce !== "false") return true;
  return !!closest(el, "[contenteditable]:not([contenteditable='false'])");
}

// Buttons, links and form controls handle Enter/Space themselves.
export function isInteractiveTarget(el) {
  if (!el || typeof el !== "object") return false;
  const tag = String(el.tagName || "").toUpperCase();
  if (tag === "BUTTON" || tag === "A" || tag === "SUMMARY" || TYPING_TAGS.has(tag)) return true;
  const role = typeof el.getAttribute === "function" ? el.getAttribute("role") : null;
  return ["button", "link", "switch", "checkbox", "radio", "tab", "menuitem", "option", "slider"].includes(role);
}

export function zoneOf(el) {
  const z = closest(el, "[data-kf-zone]");
  if (!z) return null;
  return (z.dataset && z.dataset.kfZone) || (typeof z.getAttribute === "function" ? z.getAttribute("data-kf-zone") : null);
}

const isMacPlatform = () => {
  try {
    const p = (typeof navigator !== "undefined" && (navigator.userAgentData?.platform || navigator.platform)) || "";
    return /mac|iphone|ipad|ipod/i.test(p);
  } catch { return false; }
};

function normalizeKey(e) {
  const k = e.key;
  if (k === " " || k === "Spacebar") return "Space";
  if (typeof k === "string" && k.length === 1) return k.toUpperCase();
  return k;
}

function comboMatches(combo, e, mac) {
  const parts = combo.split("+");
  const key = parts.pop();
  const want = { mod: parts.includes("Mod"), ctrl: parts.includes("Ctrl"), shift: parts.includes("Shift"), alt: parts.includes("Alt") };
  const k = normalizeKey(e);
  if (key === "?") return e.key === "?" && !e.ctrlKey && !e.metaKey && !e.altKey;
  if (k !== key) return false;
  const modPressed = mac ? !!e.metaKey : !!e.ctrlKey;
  if (want.mod && !modPressed) return false;
  if (want.ctrl && !e.ctrlKey) return false;
  if (!want.mod && !want.ctrl && (e.ctrlKey || e.metaKey)) return false;
  if (want.alt !== !!e.altKey) return false;
  // Arrow keys accept Shift (it scales the amount); other plain keys must not carry Shift.
  if (key === "ArrowLeft" || key === "ArrowRight") return true;
  if (want.shift !== !!e.shiftKey) return false;
  return true;
}

// Match a keyboard event to { id, action, amount } or null.
// ctx: { target?, dialogOpen?, paused?, zone?, mac? } — target defaults to e.target.
export function matchShortcut(e, ctx = {}) {
  if (!e || e.defaultPrevented || e.isComposing) return null;
  const target = ctx.target ?? e.target;
  const mac = ctx.mac ?? isMacPlatform();
  const zone = ctx.zone !== undefined ? ctx.zone : zoneOf(target);
  const isEsc = e.key === "Escape" || e.key === "Esc";
  if (ctx.dialogOpen) return isEsc ? { id: "escape", action: "escape", amount: 0 } : null;
  if (isEsc) return { id: "escape", action: "escape", amount: 0 };
  if (isTypingTarget(target)) return null;

  for (const entry of KEYMAP) {
    if (entry.id === "escape") continue;
    if (!entry.keys.some((combo) => comboMatches(combo, e, mac))) continue;
    const action = entry.action || entry.id;
    switch (entry.id) {
      case "togglePlaySpace":
        if (!(zone === "player" || zone === "timeline" || isBodyLike(target))) return null;
        if (zone !== "player" && zone !== "timeline" && isInteractiveTarget(target)) return null;
        break;
      case "nudgeBack":
      case "nudgeForward":
        if (zone === "timeline" || zone === "slider") return null;
        return { id: entry.id, action, amount: entry.amount * (e.shiftKey ? 5 : 1) };
      case "frameBack":
      case "frameForward":
        if (ctx.paused === false) return null;
        break;
      case "itemActions":
        if (isInteractiveTarget(target)) return null;
        break;
      case "removeSelected":
        if (zone === "slider") return null;
        break;
      default:
        break;
    }
    return { id: entry.id, action, amount: entry.amount ?? 0 };
  }
  return null;
}

function isBodyLike(el) {
  if (!el) return true;
  const tag = String(el.tagName || "").toUpperCase();
  return tag === "BODY" || tag === "HTML" || tag === "MAIN" || tag === "SECTION" || tag === "DIV" && !isInteractiveTarget(el);
}

const GLYPHS_MAC = { Mod: "⌘", Shift: "⇧", Alt: "⌥", Ctrl: "⌃" };
const KEY_NAMES = { ArrowLeft: "←", ArrowRight: "→", Escape: "Esc", Delete: "Del", Backspace: "⌫", Space: "Space", Enter: "Enter" };

// "Mod+Shift+Z" → "⌘⇧Z" on Apple platforms, "Ctrl+Shift+Z" elsewhere.
export function formatShortcut(combo, { mac = isMacPlatform() } = {}) {
  const parts = String(combo).split("+");
  const key = parts.pop();
  const keyName = KEY_NAMES[key] || key;
  if (mac) return parts.map((p) => GLYPHS_MAC[p] || p).join("") + keyName;
  return [...parts.map((p) => (p === "Mod" ? "Ctrl" : p)), keyName].join("+");
}

// Value for aria-keyshortcuts ("Control+Z Meta+Z" style per ARIA).
export function ariaKeyshortcuts(id, { mac = isMacPlatform() } = {}) {
  const ids = KEYMAP.filter((e) => e.id === id || e.action === id);
  const combos = ids.flatMap((e) => e.keys);
  return combos.map((c) => c.split("+").map((p) => (p === "Mod" ? (mac ? "Meta" : "Control") : p === "Ctrl" ? "Control" : p)).join("+")).join(" ");
}

export function shortcutGroups() {
  const groups = new Map();
  for (const e of KEYMAP) {
    if (!groups.has(e.group)) groups.set(e.group, []);
    groups.get(e.group).push(e);
  }
  return [...groups.entries()].map(([group, entries]) => ({ group, entries }));
}
