import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createProject, listFrames } from "../api.js";
import { PACK_LORE, PACK_ORDER, loreFor } from "../packlore.js";
import { PackCard, ORIENTATIONS, OrientationTab, splitByOrientation } from "./Templates.jsx";

// The v2 editor, made real: "Type. Then watch it shoot itself."
// Dark editor card with traffic lights, colored source chips, timeline
// tracks that fill as you type, and a live preview pane.
const TABS = [
  { key: "prompt", label: "PROMPT", c: "#e832a8" },
  { key: "url", label: "URL", c: "#23c8e0" },
  { key: "blog", label: "BLOG", c: "#b9f24a" },
  { key: "video", label: "VIDEO", c: "#ffb03a" },
];

const EXAMPLE_PROMPTS = [
  "Launch a productivity app",
  "Promote a coffee brand",
  "Turn my dog into a movie star",
  "Explain our app in 30 seconds",
];
const SURPRISE_PROMPT =
  "A 30-second cinematic launch film for an AI note-taking app called Lumen — fast kinetic typography, a warm sunrise-to-night palette, three crisp feature beats, and a confident closing call to action.";

const ASPECT = { horizontal: "16:9", vertical: "9:16", square: "1:1" };

// Scope decisions that END the request (server/src/services/prompt_scope.js). The
// other non-supported outcome, NEEDS_CLARIFICATION, is a pause: the same words plus
// one answer can still become a film, so it never locks the prompt.
const REJECTING = new Set(["OUT_OF_SCOPE", "DISALLOWED"]);
// Every decision the panel knows how to render. SUPPORTED is absent on purpose: a
// supported request becomes a job, and a job has nothing to show here.
const DECISIONS = new Set(["NEEDS_CLARIFICATION", ...REJECTING]);
const FALLBACK_QUESTION = "What would you like your video to be about?";
// The http(s) link shape server/src/routes/projects.js validateCreate checks websiteUrl /
// blogUrl against (the server's copy is case-insensitive, so this one is, if anything,
// stricter). One constant, so the Produce gate and the answer gate below can never
// disagree about what counts as a link.
const URL_RE = /^https?:\/\/.+\..+/;
// Why CONTINUE is disabled while a question is open and an answer is typed. The answer
// goes out with the SAME request, so the tab's own source still has to be sendable — a
// link without http(s):// used to go out anyway and come back as a 400, and a disabled
// button with no reason is the dead end this line exists to prevent. The prompt entry
// is for completeness: a question is only ever about a prompt that was long enough to send.
const SOURCE_NEEDED = {
  prompt: "Add a few more words to the prompt above, then continue.",
  url: "Add a website link above that starts with http:// or https://, then continue.",
  blog: "Add a blog post link above that starts with http:// or https://, then continue.",
  video: "Add the reference film above, then continue.",
};

// The caption/on-screen-text languages the backend supports (server/src/services/
// caption_lang.js is the source of truth — keep in step). Hindi, Arabic and
// Japanese need a bundled script font; the rest ride the Latin stack.
// Studio-owned brand presets. The custom wells open on KEYFRAME's own accents,
// never the selected pack's — a pre-filled well is an answer the user can accept
// by not touching it, so it may only hold something honestly attributable to them.
const BRAND_PRESETS = [
  { id: "ocean", label: "Ocean", primary: "#3b82f6", secondary: "#06b6d4" },
  { id: "sunset", label: "Sunset", primary: "#f97316", secondary: "#ef4444" },
  { id: "forest", label: "Forest", primary: "#10b981", secondary: "#22c55e" },
  { id: "royal", label: "Royal", primary: "#6366f1", secondary: "#8b5cf6" },
  { id: "neon", label: "Neon", primary: "#ec4899", secondary: "#a855f7" },
  { id: "gold", label: "Luxury Gold", primary: "#f59e0b", secondary: "#fbbf24" },
];
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

const LANGUAGES = [
  { code: "en", label: "English", native: "English" },
  { code: "hi", label: "Hindi", native: "हिन्दी" },
  { code: "es", label: "Spanish", native: "Español" },
  { code: "fr", label: "French", native: "Français" },
  { code: "de", label: "German", native: "Deutsch" },
  { code: "pt", label: "Portuguese", native: "Português" },
  { code: "ar", label: "Arabic", native: "العربية" },
  { code: "ja", label: "Japanese", native: "日本語" },
];

// Duration now runs to the backend's real 600s ceiling (long-form: up to
// ~10 min, up to ~200 scenes). Quick-pick the common lengths; ≥90s is
// flagged long-form.
const DUR_PRESETS = [15, 30, 60, 90, 120, 180, 300, 480, 600];
const LONGFORM_AT = 90;
const fmtLen = (s) => (s < 60 ? `${s}S` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`);

// VIDEO PACE — how DENSE the film is, not how fast it plays back. The runtime
// the user picked is unchanged; the mode decides how much gets said and how
// often we cut inside it. Keys and order mirror server/src/services/pacing.js
// MODES — the server is the authority on what each one actually does.
const PACES = [
  { key: "relaxed",   label: "RELAXED",   x: "0.8x",  c: "#23c8e0",
    sub: "LONGER HOLDS · FULLER NARRATION · GENTLER MOTION" },
  { key: "normal",    label: "NORMAL",    x: "1x",    c: "rgba(23,19,14,.45)",
    sub: "THE BALANCED DEFAULT" },
  { key: "fast",      label: "FAST",      x: "1.25x", c: "#ffb03a",
    sub: "SHORTER NARRATION · QUICKER CUTS · SHARPER ENTRANCES" },
  { key: "very-fast", label: "VERY FAST", x: "1.5x",  c: "#e832a8",
    sub: "MINIMAL NARRATION · RAPID CUTS · MAXIMUM ENERGY" },
];

// Narration voice — a character/tone hint the brief reads to cast the voice
// (voiceStyle flows into the brief's voice profile). "auto" lets it cast freely.
const VOICES = [
  { key: "auto", label: "AUTO", style: null, c: "rgba(242,237,226,.55)" },
  { key: "warm", label: "WARM", style: "warm, friendly, approachable", c: "#ffb03a" },
  { key: "confident", label: "CONFIDENT", style: "confident, bold, assured", c: "#e832a8" },
  { key: "energetic", label: "ENERGETIC", style: "energetic, upbeat, fast", c: "#b9f24a" },
  { key: "calm", label: "CALM", style: "calm, measured, unhurried", c: "#23c8e0" },
  { key: "cinematic", label: "CINEMATIC", style: "deep, cinematic, dramatic", c: "#8a63ff" },
];

// Export resolution — maps to the backend's config.qualities (short-edge px).
// 1080p is the default premium finish; lower is faster to render / smaller file.
const QUALITIES = [
  { key: "480p", label: "480p", sub: "SD", c: "rgba(23,19,14,.45)" },
  { key: "720p", label: "720p", sub: "HD", c: "#23c8e0" },
  { key: "1080p", label: "1080p", sub: "FULL HD", c: "#e832a8" },
];
// Frame rate — one of the backend's allowedFps. 24 reads cinematic, 30 is the
// default, 60 is glassy-smooth (heavier render, twice the frames).
const FPS_OPTS = [
  { key: 24, label: "24", sub: "CINEMATIC" },
  { key: 30, label: "30", sub: "STANDARD" },
  { key: 60, label: "60", sub: "SMOOTH" },
];

export default function CreateScreen({ onCreated, prefill }) {
  const [tab, setTab] = useState(prefill?.url ? "url" : "prompt");
  const [prompt, setPrompt] = useState(prefill?.prompt || "");
  const [url, setUrl] = useState(prefill?.url || "");
  const [blogUrl, setBlogUrl] = useState(prefill?.blogUrl || "");
  const [file, setFile] = useState(null);
  const [duration, setDuration] = useState(30);
  const [orientation, setOrientation] = useState("horizontal");
  const [quality, setQuality] = useState("1080p"); // export resolution → config.qualities
  const [fps, setFps] = useState(30);               // frame rate → config.allowedFps
  const [pace, setPace] = useState("normal");        // video pace → services/pacing.js
  const [framePack, setFramePack] = useState(prefill?.framePack || "auto");
  const [captions, setCaptions] = useState(false);
  // THREE independent language axes (the server's caption_director treats each
  // as first-class): what is SPOKEN, what is SUBTITLED, what is PRINTED on
  // screen. "auto" on-screen text follows the voiceover so the film reads in
  // one language by default.
  const [voiceLang, setVoiceLang] = useState("en");
  const [captionLang, setCaptionLang] = useState("en");
  const [videoTextLang, setVideoTextLang] = useState("auto");
  const [voiceover, setVoiceover] = useState(true);  // narration on/off — off = music-led cinematic mix
  const [brandChoice, setBrandChoice] = useState("template"); // "template" (pack keeps its accents) · preset id · "custom"
  const [customPrimary, setCustomPrimary] = useState("");
  const [customSecondary, setCustomSecondary] = useState("");
  const [logoFile, setLogoFile] = useState(null);    // the user's own brand mark
  const [assetFiles, setAssetFiles] = useState([]);  // the user's own product images (tier-100, outrank stock)
  const [voice, setVoice] = useState("auto");        // narration character (voiceStyle)
  const [autopilot, setAutopilot] = useState(false); // skip the script-review pause, render straight through
  const [finish, setFinish] = useState("standard"); // standard (default) = scene-kit templates · premium = LLM-composed scenes · cinema = Three.js 3D set
  const [packs, setPacks] = useState(null);
  const [packTab, setPackTab] = useState(null); // null = follow the film's orientation
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(prefill?.error || null);
  // ---- The scope decision: what the server said when this request was SUBMITTED.
  // There is no separate "check my prompt" step any more. Produce sends the request;
  // the server decides whether KEYFRAME can make it BEFORE any job, queue or spend
  // exists, and only a request that is not supported comes back here (HTTP 422) —
  // as one question, as "can't make this, here's what you can", or as a refusal.
  // A supported request never lands in this state: it goes straight to onCreated.
  //
  // Every decision is stored WITH the exact prompt text it judged ({ scope, judgedPrompt })
  // and is only ever shown while that text is still what the field holds. A decision is
  // about words, not about "whatever is on screen now": left unbound, a question about
  // words the person had already replaced by an example chip, SURPRISE ME or retyping kept
  // both CTAs saying "Answer the question ↑" with no way out — and the answer was then
  // appended to the NEW words, spending that request's one question on a subject nobody
  // asked about. Bound, editing the prompt simply makes it a fresh request, and putting the
  // judged words back (RESTORE, or retyping them) brings their decision back with them.
  //
  // Seeded from prefill because the landing page's quick-start submits without ever
  // mounting this screen (App.jsx runGenerate) and hands the decision over — bound to the
  // words it handed over, which are what the field starts with.
  const [decision, setDecision] = useState(
    () => (prefill?.scope ? { scope: prefill.scope, judgedPrompt: (prefill.prompt || "").trim() } : null)
  );
  const [clarifyAnswer, setClarifyAnswer] = useState("");
  const [liveMsg, setLiveMsg] = useState("");
  const [priorPrompt, setPriorPrompt] = useState(null);   // one level of undo
  // The exact text the server turned down. Resubmitting it unchanged would only buy
  // the same answer (and another model call), so both CTAs stay disabled until it is
  // edited. A landing handoff that was turned down arrives already locked.
  const [rejectedPrompt, setRejectedPrompt] = useState(
    () => (REJECTING.has(prefill?.scope?.status) ? ((prefill?.prompt || "").trim() || null) : null)
  );
  // The refusal that goes with that text, kept apart from `decision`. A later request
  // replaces the live decision, but RESTORE can put the refused words back — and a red
  // CUT with both CTAs disabled and no reason anywhere is a dead end.
  const [rejectedScope, setRejectedScope] = useState(
    () => (REJECTING.has(prefill?.scope?.status) ? prefill.scope : null)
  );
  // Bumped each time a decision arrives that still describes the words in the field, so
  // the effect below can move the person to the panel AFTER React has committed it — the
  // heading does not exist until then.
  const [revealTick, setRevealTick] = useState(0);
  const promptRef = useRef(null);
  // What the prompt field holds RIGHT NOW, for code that runs after an await. submit()'s
  // own `prompt` is the value at click time; a decision that arrives seconds later has to
  // compare against what the person has typed SINCE, and only a ref can see that. Written
  // by writePrompt, the one path every change to the field takes.
  const promptNow = useRef(prefill?.prompt || "");
  // Set when the prompt field must take focus but no prompt field is mounted: every tab
  // has one, but a tab switch unmounts the outgoing field before its exit animation ends
  // and mounts the incoming one after, so for ~200 ms there is nothing to focus.
  const focusPromptOnMount = useRef(false);
  const scopePanelRef = useRef(null);
  const scopeHeadingRef = useRef(null);
  // The clarification answer field. A question is answered by typing, so that is where
  // focus lands when one arrives — its aria-label IS the question, so a screen reader
  // hears the question on arrival without a second announcement.
  const answerRef = useRef(null);
  const arrivedWithDecision = useRef(!!prefill?.scope);
  const fileInput = useRef(null);
  const logoInput = useRef(null);
  const assetsInput = useRef(null);
  const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
  const MAX_ASSETS = 12, IMG_MAX_MB = 15;
  const addAssetFiles = (list) => setAssetFiles((prev) => {
    const seen = new Set(prev.map((f) => `${f.name}|${f.size}`));
    const next = [...prev];
    for (const f of Array.from(list || [])) {
      if (!IMAGE_TYPES.includes(f.type) || f.size > IMG_MAX_MB * 1024 * 1024) continue;
      const k = `${f.name}|${f.size}`;
      if (seen.has(k)) continue;
      seen.add(k); next.push(f);
    }
    return next.slice(0, MAX_ASSETS);
  });
  const acceptLogo = (f) => { if (f && [...IMAGE_TYPES, "image/svg+xml"].includes(f.type) && f.size <= IMG_MAX_MB * 1024 * 1024) setLogoFile(f); };
  // The palette that travels with the job. null = "the pack keeps its own
  // accents" — a real answer, treated by the API exactly like absent.
  const brandPreset = BRAND_PRESETS.find((p) => p.id === brandChoice) || null;
  const cp = HEX_RE.test(customPrimary) ? customPrimary.toLowerCase() : null;
  const cs = HEX_RE.test(customSecondary) ? customSecondary.toLowerCase() : null;
  const brandPalette = brandPreset
    ? { primary: brandPreset.primary, secondary: brandPreset.secondary, source: "preset", presetId: brandPreset.id }
    : (brandChoice === "custom" && cp)
      ? { primary: cp, secondary: cs, source: "manual", presetId: null }
      : null;

  const assetThumbs = useMemo(() => assetFiles.map((f) => URL.createObjectURL(f)), [assetFiles]);
  useEffect(() => () => assetThumbs.forEach((u) => URL.revokeObjectURL(u)), [assetThumbs]);

  useEffect(() => {
    listFrames()
      .then((f) => setPacks(orderPacks(f.packs || [])))
      .catch(() => setPacks(orderPacks([])));
  }, []);

  // Land the person ON the decision. The second Produce CTA sits below the whole pack
  // grid, a screen or more away from the editor card, so without this a 422 changes
  // the page somewhere the person is not looking and the button simply re-enables.
  // Focus goes to the panel's heading so keyboard and screen-reader users arrive at
  // the same place the scroll brings everyone else.
  //
  // Only bumped (see submit) when the decision still describes the words in the field.
  // One that arrives after the person has edited them is about text that is no longer
  // there, renders no panel, and is announced instead: yanking the page and the caret
  // away from someone mid-sentence — onto a refusal of words they already changed, or
  // onto some other panel that happens to be up — is worse than no reveal at all.
  useEffect(() => {
    if (!revealTick) return;
    const panel = scopePanelRef.current;
    const heading = scopeHeadingRef.current;
    if (!panel || !heading) return;
    let reduce = false;
    try { reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { /* old browser: animate */ }
    // "center" is the ask, but the out-of-scope panel (what you can make + how) can be
    // taller than a phone viewport, and centring a box taller than the screen pushes
    // its heading off the top. Such a panel aligns to its start instead; the panel's
    // scroll-margin keeps that start clear of the fixed nav.
    const fits = panel.getBoundingClientRect().height <= window.innerHeight - 140;
    panel.scrollIntoView({ block: fits ? "center" : "start", behavior: reduce ? "auto" : "smooth" });
    // preventScroll: a plain focus() jumps instantly and would cancel the smooth scroll.
    // A question lands on its answer field (only mounted while one is open), everything
    // else on the heading.
    (answerRef.current || heading).focus({ preventScroll: true });
  }, [revealTick]);

  // A decision handed over by the landing page is already on screen at mount, so it
  // needs focus but NOT a scroll: App scrolls every new view to the top after this
  // child effect runs, and the editor card — the panel's home — is at the top anyway.
  useEffect(() => {
    if (arrivedWithDecision.current) scopeHeadingRef.current?.focus({ preventScroll: true });
  }, []);

  // Sync when the parent hands in a new prefill (e.g. "use this pack" from the
  // gallery). Adjust-during-render instead of an effect-triggered second pass.
  const [prevPrefill, setPrevPrefill] = useState(prefill);
  if (prevPrefill !== prefill) {
    setPrevPrefill(prefill);
    if (prefill?.framePack) setFramePack(prefill.framePack);
    // Carry orientation from a "use this template" handoff: an explicit prefill
    // orientation wins; otherwise a portrait-native pack defaults to vertical so a
    // 9:16 template doesn't land in a 16:9 frame.
    if (prefill?.orientation) setOrientation(prefill.orientation);
    else if (prefill?.framePack) {
      const pp = (packs || []).find((x) => x.name === prefill.framePack);
      if (pp && pp.portrait) setOrientation("vertical");
    }
  }

  const packList = packs || orderPacks([]);
  const activeLore = framePack !== "auto" ? loreFor(framePack) : null;

  // Frame packs, split by native aspect exactly like the Templates page. Merging
  // them put 9:16 reel packs in the middle of a widescreen brief (and landscape
  // packs in a vertical one), so the grid never matched the film being made.
  const packGroups = splitByOrientation(packList);
  // Which tab is showing: an explicit tab click wins; otherwise follow the pack
  // the user has already picked, then the film's own orientation (square films
  // are widescreen-ish, so they land on Horizontal). Never strand on an empty tab.
  const selectedPack = framePack !== "auto" ? packList.find((p) => p.name === framePack) : null;
  const preferredTab = packTab
    || (selectedPack ? (selectedPack.portrait ? "vertical" : "horizontal") : null)
    || (orientation === "vertical" ? "vertical" : "horizontal");
  const packTabKey = packGroups[preferredTab]?.length ? preferredTab : "horizontal";
  const shownPacks = packGroups[packTabKey] || [];
  const packOrientation = ORIENTATIONS.find((o) => o.key === packTabKey) || ORIENTATIONS[0];

  const promptText = prompt.trim();
  const sourceLen = tab === "prompt" ? promptText.length
    : tab === "url" ? url.trim().length
    : tab === "blog" ? blogUrl.trim().length
    : (file ? 40 : 0);
  // Text the server turned down, still sitting in the field unchanged. Both CTAs read
  // canSubmit, so this one clause covers both — and the server's own gate is what
  // actually enforces it; this only saves the person a pointless round trip.
  const rejected = rejectedPrompt !== null && rejectedPrompt === promptText;
  // What THIS tab needs before a request can go out at all: a request without it comes
  // back from the server's validateCreate as a 400 (no prompt and no source, or a link
  // that isn't http(s)). Kept separate from canSubmit because the answer to a question
  // goes out with the same request and must meet it too: while a question was open,
  // Produce and CONTINUE used to skip it, and a link without http(s):// went out anyway.
  const sourceReady =
    (tab === "prompt" && promptText.length >= 10) ||
    (tab === "url" && URL_RE.test(url.trim())) ||
    (tab === "blog" && URL_RE.test(blogUrl.trim())) ||
    (tab === "video" && !!file);
  const canSubmit = !busy && !rejected && sourceReady;
  // Under the 10-character floor, Produce is simply disabled — and a disabled button
  // says nothing about why. A dim nudge, never red: a short prompt is unfinished, not wrong.
  const promptTooShort = promptText.length > 0 && promptText.length < 10;
  // The live decision, but only while the field still holds the words it judged (see
  // `decision` above). Anything else in the field is a request nobody has judged yet.
  const liveScope = decision && decision.judgedPrompt === promptText && DECISIONS.has(decision.scope?.status)
    ? decision.scope : null;
  // What the panel shows. Refused words back in the field bring their refusal with
  // them (and win over any later decision, which was about different words);
  // otherwise it is the live decision for these words, if there is one.
  const shownScope = rejected && rejectedScope ? rejectedScope : liveScope;
  const showScope = !!shownScope;
  // A question is open only when the panel ON SCREEN is a question. This used to read the
  // live decision directly while the panel preferred the refusal, so RESTORE of refused
  // words during a question showed the refusal with BOTH CTAs enabled as "Answer the
  // question ↑" — a click either focused an answer field that wasn't there or re-sent the
  // locked, refused text. `!rejected` is belt and braces: refused words never ask.
  const asking = !rejected && shownScope?.status === "NEEDS_CLARIFICATION";
  // One real character is an answer. The floor used to be two, so a one-character reply
  // (猫 — Japanese is a shipped language) left CONTINUE disabled with nothing saying why.
  // The server requires exactly this: a non-empty answer after trimming.
  const answerReady = clarifyAnswer.trim().length >= 1;
  // The ONE predicate for sending an answer — CONTINUE, Enter in the answer field and the
  // Produce CTAs all read it, so they cannot disagree about whether an answer can go out.
  const canContinue = asking && canSubmit && answerReady;
  // Said in the panel whenever the tab's source is what is holding the answer back.
  const answerHint = asking && !sourceReady ? SOURCE_NEEDED[tab] : null;

  // Every change to the prompt field goes through here, keystrokes included, so promptNow
  // can never fall behind what the person sees.
  function writePrompt(next) {
    promptNow.current = next;
    setPrompt(next);
  }

  // ONE setter for every programmatic write to the textarea, so a replacement can
  // always be undone. The example chips and SURPRISE ME used to setPrompt() straight
  // onto a CONTROLLED textarea, which makes 300 typed words unrecoverable by Ctrl-Z —
  // and "start a new prompt" below clears the field the same way.
  function replacePrompt(next, { announce } = {}) {
    if (prompt.trim() && prompt !== next) setPriorPrompt(prompt);
    writePrompt(next);
    if (announce) setLiveMsg(announce);
    focusPrompt();
  }

  // The prompt textarea exists on all four tabs (the main field on PROMPT, the optional
  // one on URL, BLOG and VIDEO) and only one is mounted at a time, so all four share this
  // callback ref — which also honours a focus request made while no field was mounted.
  function attachPrompt(el) {
    promptRef.current = el;
    if (el && focusPromptOnMount.current) {
      focusPromptOnMount.current = false;
      el.focus();
    }
  }

  function focusPrompt() {
    if (promptRef.current) promptRef.current.focus();
    else focusPromptOnMount.current = true;
  }

  // After a request comes back WITHOUT revealing a panel, put focus back on the control
  // that submitted — the answer field while a question is open, otherwise the prompt
  // field. Both CTAs (and CONTINUE) are disabled while busy, so a mouse or keyboard
  // submit leaves focus on a disabled button or on <body>, and the next Tab starts from
  // the top of the document. Only in that case, though: if the person has since put focus
  // somewhere themselves (typing in the field while the request was read), it stays.
  function returnFocusIfLost() {
    const active = document.activeElement;
    if (active && active !== document.body && !active.disabled) return;
    if (answerRef.current) answerRef.current.focus();
    else focusPrompt();
  }

  // The out-of-scope panel's one action. It clears rather than rewrites: KEYFRAME does
  // not turn a request it can't make into some other film on the person's behalf.
  // Cleared through replacePrompt so RESTORE brings the words back, and the rejection
  // lock is deliberately kept — restoring the identical text re-locks it.
  //
  // It never switches tabs. It used to jump from VIDEO to PROMPT (VIDEO had no prompt
  // field then), and submit() only attaches the reference film on the VIDEO tab, so the
  // next Produce silently dropped the film the person had attached. Every tab now has a
  // prompt field, so the new prompt is written right where the film still is.
  //
  // The live decision is dropped only if it is about the words being cleared; one about
  // other words stays bound to them, and comes back if they do.
  function startNewPrompt() {
    if (decision && decision.judgedPrompt === promptText) setDecision(null);
    replacePrompt("", { announce: "Prompt cleared — restore is just below the field." });
  }

  function continueWithAnswer() {
    if (!canContinue) return;
    // The question on screen, which is the one about the words in the field — never a
    // decision about some earlier text.
    submit({ clarification: { question: shownScope.clarificationQuestion || FALLBACK_QUESTION, answer: clarifyAnswer.trim() } });
  }

  // BOTH Produce CTAs go through here, never straight to submit().
  //
  // While the one question is open, a bare submit() would clear the question from under
  // the person and re-send the exact request that just prompted it — another model call
  // that can only come back with the same question. So Produce means "continue" when an
  // answer has been typed, and otherwise sends the person to the field that is waiting.
  // `asking` is bound to the words in the field, so once those words are edited this is
  // an ordinary fresh request again.
  function onProduce() {
    if (!canSubmit) return;
    if (asking) {
      if (answerReady) continueWithAnswer();
      else answerRef.current?.focus();
      return;
    }
    submit();
  }

  // Called with NO argument by both Produce CTAs (never passed straight to onClick,
  // which would hand it the click event), and with { clarification } by the answer
  // to the scope gate's one question.
  async function submit({ clarification } = {}) {
    // The exact words this request carries. Whatever decision comes back is bound to them
    // (never to the field as it is when the answer lands), and the prompt field below
    // sends this same value, so what was judged and what was sent cannot drift apart.
    const sentPrompt = prompt.trim();
    setBusy(true);
    setError(null);
    // A fresh submit is a new request, so the last decision no longer describes it.
    // The answer resubmit keeps its panel up: the question the person is answering
    // should not vanish from under them while the server reads the answer.
    if (!clarification) setDecision(null);
    // Honest about the wait: the server now reads the request before it starts
    // anything, which takes a few seconds on every submit.
    setLiveMsg(clarification ? "Reading your answer…" : "Reading your request…");
    // The read is usually a few seconds but is allowed up to ~15. Past six, say so — a
    // silent spinner at ten seconds reads as a hang, and the person should know that
    // nothing has been started or charged while they wait.
    const slowTimer = setTimeout(
      () => setLiveMsg("Still reading — this can take up to 15 seconds. Nothing has started yet."),
      6000
    );
    try {
      const voiceStyle = VOICES.find((v) => v.key === voice)?.style || null;
      const fields = {
        duration, orientation, quality, fps, framePack, autopilot, pace,
        // A non-English film sends the full caption CONFIG object (the backend
        // accepts either that or the legacy boolean). `videoTextLanguage` is what
        // translates the type baked into the frame, not just the subtitle track;
        // the voiceover deliberately stays English — dubbing is a separate,
        // costlier axis we do not turn on implicitly.
        // Captions burn-in and the FILM'S LANGUAGE are INDEPENDENT controls. The
        // config is sent whenever captions are on OR any axis is localized, so a
        // Hindi film with no burned-in subtitles still gets Hindi voice +
        // on-screen text. `enabled` carries ONLY the captions toggle (always
        // explicit — the server defaults a bare object to true).
        captions: (captions || voiceLang !== "en" || captionLang !== "en" || (videoTextLang !== "auto" && videoTextLang !== "en"))
          ? { enabled: captions, language: captionLang, voiceoverLanguage: voiceLang, videoTextLanguage: videoTextLang, exportSRT: true, exportVTT: true }
          : captions,
        // Sent ONLY when disabled — absent means enabled server-side, so every
        // older client keeps working unchanged.
        ...(voiceover ? {} : { voiceover: false }),
        // null = the user kept the pack's accents; the API treats it as absent.
        ...(brandPalette ? { brandPalette } : {}),
        ...(logoFile ? { logo: logoFile } : {}),
        ...(assetFiles.length ? { assets: assetFiles } : {}),
        composeMode: finish === "cinema" ? "standard" : finish,
        ...(finish === "cinema" ? { render3d: true } : {}),
        ...(voiceStyle ? { voiceStyle } : {}),
        ...(sentPrompt.length >= 10 ? { prompt: sentPrompt } : {}),
        // The answer to the one question. The server merges it into the prompt before
        // it decides and before the job stores it, so nothing downstream needs to
        // know a second field exists.
        ...(clarification ? { clarification } : {}),
        ...(tab === "url" && url.trim() ? { websiteUrl: url.trim() } : {}),
        ...(tab === "blog" && blogUrl.trim() ? { blogUrl: blogUrl.trim() } : {}),
        ...(tab === "video" && file ? { referenceVideo: file } : {}),
      };
      const r = await createProject(fields);
      clearTimeout(slowTimer);
      onCreated(r.projectId, { autopilot });
    } catch (e) {
      clearTimeout(slowTimer);
      // Is the person still looking at the words this request sent? The read takes
      // seconds, and people keep typing through it.
      const stillInField = promptNow.current.trim() === sentPrompt;
      // Not supported arrives as a 422 whose body is the scope decision — render it
      // as that decision (a question, what KEYFRAME can make, a refusal), never as the
      // red error line: e.message is the server's plain-text guidance, which would
      // print the whole capability list as one run-on paragraph.
      if (e.status === 422 && DECISIONS.has(e.body?.scope?.status)) {
        const s = e.body.scope;
        setDecision({ scope: s, judgedPrompt: sentPrompt });
        if (REJECTING.has(s.status)) {
          // sentPrompt, not the field: the words the server actually judged, even if the
          // person kept typing while the request was in flight.
          setRejectedPrompt(sentPrompt || null);
          setRejectedScope(s);
        }
        setClarifyAnswer("");
        // The raw status name is our vocabulary, never the person's. A decision about
        // words that have since been edited has no panel to point at (it is bound to the
        // words it judged), so it says what happened and that the new wording is unjudged.
        setLiveMsg(
          s.status === "NEEDS_CLARIFICATION"
            ? (stillInField
              ? `Nothing has started yet. One quick question: ${s.clarificationQuestion || FALLBACK_QUESTION}`
              : "Nothing has started yet. KEYFRAME had a question about the wording you sent, but you've edited it since — your new wording hasn't been checked.")
            : stillInField
              ? (s.status === "OUT_OF_SCOPE"
                ? "Nothing was started. KEYFRAME can't make this one — what it can make, and how, is below."
                : "Nothing was started. KEYFRAME can't make this request.")
              : "Nothing was started. KEYFRAME can't make the wording you sent; you've edited it since, and your new wording hasn't been checked."
        );
        setBusy(false);
        if (stillInField) setRevealTick((n) => n + 1);
        else returnFocusIfLost();
        return;
      }
      // 400 / 429 / a network failure. This used to blank the live region and leave focus
      // on the disabled button (so on <body>): a screen-reader user heard nothing at all,
      // and the red line below the card was only discoverable by sight. The error is said
      // out loud and focus goes back to where the request was made.
      setError(e.message);
      setLiveMsg(`Couldn't start the film: ${e.message}`);
      setBusy(false);
      returnFocusIfLost();
    }
  }

  // READING, not ROLLING, while a create is in flight: nothing rolls until the server
  // has read the request and said yes, and that read is most of the wait.
  //
  // UPLOADING when the request carries files: multer writes them before the server
  // reads a word, and a 200 MB reference film is most of that wait, not the read.
  const uploading = (tab === "video" && !!file) || !!logoFile || assetFiles.length > 0;
  const status = busy ? (uploading ? "● UPLOADING" : "● READING")
    : rejected ? "● CUT"
      : asking ? "● ONE QUESTION"
        : canSubmit ? "● READY" : "● LISTENING";
  // .editor-status hardcodes --color-lm, so the exceptional states override inline.
  // CUT takes the same lightened red as the panel heading: raw REC red is ~3.5:1 on the
  // editor ground, legible as a bar, not as 10px mono type.
  const statusColor = busy ? undefined
    : rejected ? "color-mix(in srgb, var(--color-rec) 60%, var(--color-dark-ink))"
      : asking ? "var(--color-cy)" : undefined;
  // The same gate with or without a question open. It used to be `asking ? !busy :
  // canSubmit`, which switched off BOTH checks the moment a question arrived: the
  // refused-text lock (so RESTORE of refused words during a question re-enabled Produce
  // on them) and the tab's own source checks (so a cleared prompt or a bad link went out).
  // The one question needs neither exemption: `asking` implies the words in the field are
  // the ones that were judged, so they already cleared the length floor, and they are not
  // refused. While a question is open Produce still routes to the answer (see onProduce)
  // and says so on the button.
  const produceEnabled = canSubmit;
  const busyLabel = uploading ? "Uploading…" : "Reading your request…";

  // One level of undo, next in tab order after the field that changed. Rendered under
  // whichever prompt field the current tab shows: "start a new prompt" can clear the
  // prompt from any tab, and an undo that only exists on one of them is not an undo.
  const restoreLink = priorPrompt !== null && priorPrompt !== prompt && (
    <button type="button" className="link-mono on-dark"
      style={{ fontSize: 9, borderBottomWidth: 1, marginTop: 8 }}
      onClick={() => { setPriorPrompt(null); replacePrompt(priorPrompt, { announce: "Your original wording is back." }); }}>
      ↩ RESTORE WHAT I WROTE
    </button>
  );

  // The optional prompt on the three source tabs (URL, BLOG, VIDEO): the same field, the
  // same shared ref and the same restore link on each, so what one tab can do to the prompt
  // — clear it, restore it, take focus after a failed request — every tab can. VIDEO had no
  // field at all, which is what forced "start a new prompt" to leave it (see startNewPrompt).
  const optionalPrompt = (label) => (
    <>
      <textarea
        ref={attachPrompt}
        value={prompt}
        onChange={(e) => writePrompt(e.target.value)}
        aria-label={label}
        placeholder={label}
        className="editor-inset w-full resize-none"
        style={{ marginTop: 10, height: 60, padding: "10px 16px", fontSize: 12 }}
      />
      {restoreLink}
    </>
  );

  return (
    <div className="pb-24">
      {/* ---------- header ---------- */}
      <section style={{ maxWidth: 1120, margin: "0 auto", padding: "clamp(16px,3vw,40px) clamp(16px,4vw,60px) 0" }}>
        <span className="scene-pill" style={{ "--tagc": "#e832a8" }}>SC 01 · THE BRIEF</span>
        <h1 className="headline" style={{ fontSize: "clamp(34px,5.4vw,72px)" }}>
          Type. Then watch it<br /><span style={{ color: "var(--color-cy)" }}>shoot itself.</span>
        </h1>

        {/* ---------- the editor ---------- */}
        <motion.div
          initial={{ opacity: 0, y: 36 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="editor-card"
          style={{ marginTop: 44 }}
        >
          <div className="editor-head">
            <span className="tl-dot" style={{ background: "#ff5f57" }} />
            <span className="tl-dot" style={{ background: "#febc2e" }} />
            <span className="tl-dot" style={{ background: "#28c840" }} />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.2em", color: "#7d766a", marginLeft: 10 }}>KEYFRAME — EDITOR</span>
            <span className="editor-status" style={{ marginLeft: "auto", ...(statusColor ? { color: statusColor } : {}) }}>{status}</span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1.15fr .85fr" }} data-demo-grid="1">
            {/* left — source input + timeline */}
            <div style={{ padding: 24, borderRight: "1px solid rgba(242,237,226,.08)", minWidth: 0 }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
                {TABS.map((t) => (
                  <button key={t.key} role="tab" aria-selected={tab === t.key}
                    onClick={() => setTab(t.key)}
                    className={`chip-c ${tab === t.key ? "is-active" : ""}`}
                    style={{ "--chipc": t.c }}>
                    {t.label}
                  </button>
                ))}
              </div>

              <AnimatePresence mode="wait">
                {tab === "prompt" && (
                  <motion.div key="prompt" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                    <textarea
                      ref={attachPrompt}
                      value={prompt}
                      onChange={(e) => writePrompt(e.target.value)}
                      aria-label="Describe the video you want"
                      aria-describedby={promptTooShort ? "kf-prompt-hint" : undefined}
                      placeholder="A launch film for our sneaker drop — fast cuts, neon energy"
                      className="editor-inset w-full resize-none"
                      style={{ minHeight: 96, padding: "14px 16px" }}
                    />
                    {promptTooShort && (
                      <p id="kf-prompt-hint" style={{ margin: "8px 2px 0", fontSize: 12, lineHeight: 1.5, color: "var(--color-dark-dim)" }}>
                        A few more words — what should the video be about?
                      </p>
                    )}
                    {restoreLink}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12, alignItems: "center" }}>
                      {EXAMPLE_PROMPTS.map((ex) => (
                        <button key={ex} type="button" onClick={() => replacePrompt(ex)} className="chip-c" style={{ "--chipc": "rgba(242,237,226,.6)" }}>{ex}</button>
                      ))}
                      <button type="button" onClick={() => replacePrompt(SURPRISE_PROMPT)} className="chip-c" style={{ "--chipc": "#b9f24a" }}>✦ SURPRISE ME</button>
                    </div>
                  </motion.div>
                )}
                {tab === "url" && (
                  <motion.div key="url" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                    <input
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder="https://your-product.com"
                      className="editor-inset w-full"
                      style={{ padding: "14px 16px" }}
                    />
                    {optionalPrompt("Optional — anything specific the film should say?")}
                  </motion.div>
                )}
                {tab === "blog" && (
                  <motion.div key="blog" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                    <input
                      value={blogUrl}
                      onChange={(e) => setBlogUrl(e.target.value)}
                      placeholder="https://yourblog.com/the-post-to-film"
                      className="editor-inset w-full"
                      style={{ padding: "14px 16px" }}
                    />
                    <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.08em", color: "#9a9284", margin: "8px 2px 0", lineHeight: 1.7 }}>
                      WE READ THE ARTICLE AND FILM ITS STORY — ITS KEY POINTS BECOME SCENES, ITS OWN IMAGES JOIN THE CUT, AND THE FILM ENDS ON “READ THE FULL POST”.
                    </p>
                    {optionalPrompt("Optional — angle or audience for the film?")}
                  </motion.div>
                )}
                {tab === "video" && (
                  <motion.div key="video" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                    {/* The drop zone keeps the click-to-browse handler to itself: on the
                        wrapper it would open the file picker on every click into the
                        prompt field below. */}
                    <div
                      onClick={() => fileInput.current?.click()}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) setFile(f); }}
                      style={{ border: "1px dashed rgba(242,237,226,.3)", background: "var(--color-dark)", borderRadius: 12, padding: "30px 16px", textAlign: "center", cursor: "pointer" }}
                    >
                      <input ref={fileInput} type="file" accept="video/mp4,video/quicktime,video/webm" hidden
                        onChange={(e) => setFile(e.target.files?.[0] || null)} />
                      {file
                        ? <p style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--color-lm)", margin: 0 }}>{file.name} <span style={{ color: "#7d766a" }}>({Math.round(file.size / 1048576)} MB)</span></p>
                        : <p style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.1em", color: "#9a9284", margin: 0, lineHeight: 1.8 }}>DROP A REFERENCE FILM<br /><span style={{ fontSize: 9, color: "#7d766a" }}>MP4 / MOV / WEBM · UP TO 200 MB — WE TRANSCRIBE AND STUDY ITS STYLE</span></p>}
                    </div>
                    {optionalPrompt("Optional — what should the film be about?")}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* The live region lives OUTSIDE the tabs: a region that mounts with its
                  text already in it is not reliably announced, and every tab can now
                  submit and receive a decision. While a decision panel is up the line
                  is visually hidden (still announced) — the panel says the same thing
                  in full directly beneath it, and saying it twice on screen is noise.
                  The same goes for a failed request: its text is the red line under
                  the card, so here it is only spoken. */}
              <p role="status" aria-atomic="true"
                className={showScope || error ? "sr-only" : "label-mono"}
                style={showScope || error ? undefined : { minHeight: 14, marginTop: 10, color: "var(--color-dark-dim)" }}>{liveMsg}</p>

              {/* Below the tab content, so the decision shows on all four tabs. */}
              {showScope && (
                <ScopePanel
                  scope={shownScope}
                  panelRef={scopePanelRef}
                  headingRef={scopeHeadingRef}
                  busy={busy}
                  answer={clarifyAnswer}
                  answerRef={answerRef}
                  canContinue={canContinue}
                  answerHint={answerHint}
                  onAnswer={setClarifyAnswer}
                  onContinue={continueWithAnswer}
                  onStartOver={startNewPrompt}
                />
              )}

              {/* timeline tracks fill as the brief takes shape */}
              <div style={{ marginTop: 18, display: "grid", gap: 8 }}>
                <TimelineRow label="V1">
                  <span className="clip-block" style={{ flex: 1.3, background: "linear-gradient(135deg, var(--color-mag), #8a1d64)", transform: `scaleX(${sourceLen > 6 ? 1 : 0})` }} />
                  <span className="clip-block" style={{ flex: 1, background: "linear-gradient(135deg, var(--color-cy), #127080)", transform: `scaleX(${sourceLen > 18 ? 1 : 0})`, transitionDelay: ".08s" }} />
                  <span className="clip-block" style={{ flex: 1.6, background: "linear-gradient(135deg, var(--color-am), #a56a12)", transform: `scaleX(${sourceLen > 32 ? 1 : 0})`, transitionDelay: ".16s" }} />
                </TimelineRow>
                <TimelineRow label="VO" h={20}>
                  <span className="clip-block" style={{ display: "block", height: "100%", width: "82%", background: "repeating-linear-gradient(90deg, var(--color-lm) 0 2px, rgba(185,242,74,.25) 2px 5px)", transform: `scaleX(${sourceLen > 12 ? 1 : 0})` }} />
                </TimelineRow>
                <TimelineRow label="MUS" h={20}>
                  <span className="clip-block" style={{ display: "block", height: "100%", width: "94%", background: "linear-gradient(90deg, var(--color-cb), rgba(43,91,255,.3))", transform: `scaleX(${sourceLen > 24 ? 1 : 0})` }} />
                </TimelineRow>
              </div>

              {/* meta + produce */}
              <div style={{ marginTop: 18, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div style={{ display: "flex", gap: 14, fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.14em", color: "#9a9284", flexWrap: "wrap" }}>
                  <span>⏱ {fmtLen(duration)}</span>
                  {duration >= LONGFORM_AT && <span style={{ color: "var(--color-cy)" }}>▶ LONG-FORM</span>}
                  <span>▦ {ASPECT[orientation]}</span>
                  <span>◳ {quality.toUpperCase()}{fps !== 30 ? ` · ${fps}FPS` : ""}</span>
                  <span>{captions ? "CC ON" : "♪ SCORED"}</span>
                  {voice !== "auto" && <span style={{ color: "var(--color-vi, #8a63ff)" }}>◗ {voice.toUpperCase()}</span>}
                  <span style={{ color: activeLore ? activeLore.accent : "#9a9284" }}>{activeLore ? activeLore.name.toUpperCase() : "AUTO LOOK"}</span>
                  {finish === "premium" && <span style={{ color: "var(--color-mag)" }}>◆ PREMIUM CUT</span>}
                  {finish === "cinema" && <span style={{ color: "var(--color-cy)" }}>▲ CINEMA 3D</span>}
                  {autopilot && <span style={{ color: "var(--color-lm)" }}>⚡ AUTOPILOT</span>}
                </div>
                <button type="button" onClick={onProduce} disabled={!produceEnabled} aria-busy={busy} className="btn-mag" style={{ padding: "11px 24px", fontSize: 14 }}>
                  {busy ? busyLabel : asking ? "Answer the question ↑" : "Produce →"}
                </button>
              </div>
            </div>

            {/* right — live preview pane */}
            <div style={{ position: "relative", minHeight: 300, background: "var(--color-dark-2)" }}>
              <div className="film-drift" style={{ position: "absolute", inset: 0, background: activeLore ? activeLore.filmGrad : "linear-gradient(135deg, #e832a8, #6b1050 55%, #2a0a20)", opacity: 0.95 }} />
              <div className="film-scan" />
              <div style={{ position: "absolute", top: 12, left: 14, fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.2em", color: "rgba(255,255,255,.85)", display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#ff4d3c", animation: "kf2-blink 1s steps(1) infinite" }} />PREVIEW
              </div>
              <div style={{ position: "absolute", left: 14, right: 14, bottom: 14, textAlign: "center" }}>
                <span style={{ display: "inline-block", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15, color: "#fff", background: "rgba(0,0,0,.55)", padding: "6px 12px", borderRadius: 8, backdropFilter: "blur(4px)" }}>
                  {activeLore ? activeLore.demo : (prompt.trim() ? prompt.trim().slice(0, 42) + (prompt.trim().length > 42 ? "…" : "") : "Your film starts here.")}
                </span>
              </div>
            </div>
          </div>
        </motion.div>

        {error && <p style={{ marginTop: 16, fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--color-rec)" }}>{error}</p>}

        {/* ---------- options: white spine cards ---------- */}
        <div style={{ marginTop: 20, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px,1fr))", gap: 14 }}>
          <div className="card" style={{ padding: "20px 22px 20px 27px" }}>
            <span className="spine" style={{ "--spine": "#e832a8" }} />
            <div className="label-mono" style={{ marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <span>DURATION — {fmtLen(duration)}</span>
              {duration >= LONGFORM_AT && (
                <span style={{ fontSize: 8, letterSpacing: "0.14em", color: "#17130e", background: "var(--color-cy)", padding: "2px 6px", borderRadius: 999 }}>LONG-FORM</span>
              )}
            </div>
            <input type="range" min="10" max="600" step="5" value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="w-full" style={{ accentColor: "var(--color-mag)" }} />
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 12 }}>
              {DUR_PRESETS.map((s) => (
                <button key={s} type="button" onClick={() => setDuration(s)}
                  className={`chip-c on-paper ${duration === s ? "is-active" : ""}`}
                  style={{ "--chipc": s >= LONGFORM_AT ? "#23c8e0" : "rgba(23,19,14,.45)", fontSize: 10, padding: "3px 9px" }}>
                  {fmtLen(s)}
                </button>
              ))}
            </div>
            <div style={{ marginTop: 9, fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em", color: "var(--color-dim)" }}>
              {duration >= LONGFORM_AT ? "LONG-FORM · MORE SCENES · LONGER RENDER" : "SHORT-FORM · TIGHT & PUNCHY"}
            </div>
          </div>
          <div className="card" style={{ padding: "20px 22px 20px 27px" }}>
            <span className="spine" style={{ "--spine": "#23c8e0" }} />
            <div className="label-mono" style={{ marginBottom: 12 }}>ORIENTATION — {ASPECT[orientation]}</div>
            {/* Clearly LABELLED options (icon + name + ratio) so Vertical 9:16 is an
                obvious choice — mirrors the Horizontal/Vertical split on Templates. */}
            <div style={{ display: "flex", gap: 8 }}>
              {[
                { key: "horizontal", label: "Horizontal", ar: "16:9", w: 32, h: 19 },
                { key: "vertical", label: "Vertical", ar: "9:16", w: 17, h: 30 },
                { key: "square", label: "Square", ar: "1:1", w: 24, h: 24 },
              ].map((o) => {
                const on = orientation === o.key;
                return (
                  <button key={o.key} type="button" onClick={() => setOrientation(o.key)}
                    title={`${o.label} ${o.ar}`} aria-label={`${o.label} orientation ${o.ar}`} aria-pressed={on}
                    style={{
                      flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", gap: 6,
                      padding: "12px 4px 9px", minHeight: 74, borderRadius: 8, cursor: "pointer", transition: "all .25s",
                      border: `1.5px solid ${on ? "var(--color-cy)" : "rgba(23,19,14,.22)"}`,
                      background: on ? "rgba(35,200,224,.14)" : "transparent",
                    }}>
                    <span style={{ width: o.w, height: o.h, borderRadius: 3, border: `2px solid ${on ? "var(--color-cy)" : "rgba(23,19,14,.5)"}`, background: on ? "rgba(35,200,224,.18)" : "transparent" }} />
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, letterSpacing: "0.06em", fontWeight: 700, color: on ? "var(--color-cy)" : "#17130e" }}>{o.label}</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 8.5, color: "var(--color-dim)" }}>{o.ar}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* export resolution — config.qualities (was hardcoded to 1080p) */}
          <div className="card" style={{ padding: "20px 22px 20px 27px" }}>
            <span className="spine" style={{ "--spine": "#ff6a3c" }} />
            <div className="label-mono" style={{ marginBottom: 10 }}>RESOLUTION — {quality.toUpperCase()}</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {QUALITIES.map((q) => (
                <button key={q.key} type="button" onClick={() => setQuality(q.key)}
                  className={`chip-c on-paper ${quality === q.key ? "is-active" : ""}`}
                  style={{ "--chipc": q.c, fontSize: 10, padding: "4px 10px" }}
                  title={`${q.label} · ${q.sub}`}>
                  {q.label}
                </button>
              ))}
            </div>
            <div style={{ marginTop: 10, fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em", color: "var(--color-dim)" }}>
              {quality === "1080p" ? "FULL HD · CRISPEST · DEFAULT"
                : quality === "720p" ? "HD · LIGHTER FILE · FASTER RENDER"
                : "SD · SMALLEST · QUICKEST DRAFT"}
            </div>
          </div>

          {/* video pace — services/pacing.js. NOT playback speed: the film is
              still `duration` seconds, the mode changes how much is said and how
              often we cut inside it. */}
          <div className="card" style={{ padding: "20px 22px 20px 27px" }}>
            <span className="spine" style={{ "--spine": PACES.find((p) => p.key === pace)?.c || "#b9f24a" }} />
            <div className="label-mono" style={{ marginBottom: 10 }}>
              VIDEO PACE — {PACES.find((p) => p.key === pace)?.label} {PACES.find((p) => p.key === pace)?.x}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }} role="radiogroup" aria-label="Video pace">
              {PACES.map((p) => (
                <button key={p.key} type="button" onClick={() => setPace(p.key)}
                  role="radio" aria-checked={pace === p.key}
                  className={`chip-c on-paper ${pace === p.key ? "is-active" : ""}`}
                  style={{ "--chipc": p.c, fontSize: 10, padding: "4px 10px" }}
                  title={`${p.label} ${p.x} — ${p.sub.toLowerCase()}`}>
                  {p.label}
                </button>
              ))}
            </div>
            <div style={{ marginTop: 10, fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em", color: "var(--color-dim)" }}>
              {PACES.find((p) => p.key === pace)?.sub}
            </div>
            <div style={{ marginTop: 7, fontSize: 11, lineHeight: 1.45, color: "var(--color-dim)" }}>
              Faster pacing creates shorter narration, quicker scenes and more energetic
              animation — the film stays {fmtLen(duration).toLowerCase()}, it just says less and shows more.
            </div>
          </div>

          {/* frame rate — config.allowedFps (was hardcoded to 30) */}
          <div className="card" style={{ padding: "20px 22px 20px 27px" }}>
            <span className="spine" style={{ "--spine": "#8a63ff" }} />
            <div className="label-mono" style={{ marginBottom: 10 }}>FRAME RATE — {fps} FPS</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {FPS_OPTS.map((f) => (
                <button key={f.key} type="button" onClick={() => setFps(f.key)}
                  className={`chip-c on-paper ${fps === f.key ? "is-active" : ""}`}
                  style={{ "--chipc": f.key === 24 ? "#ffb03a" : f.key === 60 ? "#b9f24a" : "#23c8e0", fontSize: 10, padding: "4px 10px" }}
                  title={`${f.label} fps · ${f.sub}`}>
                  {f.label}
                </button>
              ))}
            </div>
            <div style={{ marginTop: 10, fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em", color: "var(--color-dim)" }}>
              {fps === 24 ? "24 · FILM-LIKE CADENCE"
                : fps === 60 ? "60 · GLASSY-SMOOTH · HEAVIER RENDER"
                : "30 · STANDARD · BALANCED"}
            </div>
          </div>

          {/* LANGUAGE & NARRATION — one card for everything the film SAYS.
              Narration on/off, the three language axes (spoken / subtitled /
              printed), and caption burn-in. Merged from three cards: the old
              standalone CAPTIONS and VOICEOVER cards were a label + one switch
              floating in a tall grid cell — two-thirds dead space. Selects sit
              UNDER their labels at full width so nothing clips at any column
              width. */}
          <div className="card" style={{ padding: "20px 22px 20px 27px" }}>
            <span className="spine" style={{ "--spine": "#8a63ff" }} />
            <div className="label-mono" style={{ marginBottom: 4 }}>LANGUAGE &amp; NARRATION</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em", color: "var(--color-dim)", marginBottom: 12 }}>
              {!voiceover ? "NO NARRATION — MUSIC-LED CINEMATIC MIX"
                : voiceLang === "en" && captionLang === "en" && (videoTextLang === "auto" || videoTextLang === "en")
                  ? "ENGLISH · NO TRANSLATION PASS"
                  : "TRANSLATED · ONE EXTRA MODEL CALL"}
            </div>
            {[["NARRATION", voiceover, () => setVoiceover((v) => !v), voiceover ? "MUSIC DUCKS UNDER THE VOICE" : "OFF — ZERO TTS COST", "#22c55e"]].map(([lbl, on, flip, hint, c]) => (
              <div key={lbl} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, paddingBottom: 12, marginBottom: 12, borderBottom: "1px solid rgba(23,19,14,.08)" }}>
                <div style={{ minWidth: 0 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em", color: "var(--color-ink)" }}>{lbl}</span>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 8.5, letterSpacing: "0.08em", color: "var(--color-dim)", marginTop: 2 }}>{hint}</div>
                </div>
                <button type="button" role="switch" aria-checked={on} aria-label={`Toggle ${lbl.toLowerCase()}`} onClick={flip}
                  style={{ position: "relative", flexShrink: 0, width: 44, height: 24, borderRadius: 999, cursor: "pointer", transition: "background .3s, border-color .3s", background: on ? c : "var(--color-paper-2)", border: `1px solid ${on ? c : "rgba(23,19,14,.25)"}` }}>
                  <span style={{ position: "absolute", top: 2, left: 2, width: 18, height: 18, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(23,19,14,.3)", transition: "transform .3s", transform: on ? "translateX(20px)" : "translateX(0)" }} />
                </button>
              </div>
            ))}
            <div style={{ display: "grid", gap: 10, opacity: 1 }}>
              {[["VOICEOVER LANGUAGE", voiceLang, setVoiceLang, LANGUAGES, !voiceover],
                ["SUBTITLE LANGUAGE", captionLang, setCaptionLang, LANGUAGES, false],
                ["ON-SCREEN TEXT", videoTextLang, setVideoTextLang,
                  [{ code: "auto", label: "Auto — match voiceover" }, ...LANGUAGES], false]
              ].map(([label, val, set, opts, dim]) => (
                <label key={label} style={{ display: "block", opacity: dim ? 0.45 : 1 }}>
                  <span style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em", color: "var(--color-dim)", marginBottom: 4 }}>{label}</span>
                  <select value={val} onChange={(e) => set(e.target.value)} aria-label={label} disabled={dim}
                    style={{ width: "100%", boxSizing: "border-box", padding: "7px 8px", fontFamily: "var(--font-mono)", fontSize: 11, background: "var(--color-paper-2)", border: "1px solid rgba(23,19,14,.25)", borderRadius: 4 }}>
                    {opts.map((o) => <option key={o.code} value={o.code}>{o.native ? `${o.label} · ${o.native}` : o.label}</option>)}
                  </select>
                </label>
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, paddingTop: 12, marginTop: 12, borderTop: "1px solid rgba(23,19,14,.08)" }}>
              <div style={{ minWidth: 0 }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em", color: "var(--color-ink)" }}>BURN-IN SUBTITLES</span>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 8.5, letterSpacing: "0.08em", color: "var(--color-dim)", marginTop: 2 }}>
                  {captions ? "SMALL, BOTTOM OF FRAME" : "OFF — .SRT / .VTT STILL EXPORTED"}
                </div>
              </div>
              <button type="button" role="switch" aria-checked={captions} aria-label="Toggle burned-in captions"
                onClick={() => setCaptions((v) => !v)}
                style={{ position: "relative", flexShrink: 0, width: 44, height: 24, borderRadius: 999, cursor: "pointer", transition: "background .3s, border-color .3s", background: captions ? "var(--color-am)" : "var(--color-paper-2)", border: `1px solid ${captions ? "var(--color-am)" : "rgba(23,19,14,.25)"}` }}>
                <span style={{ position: "absolute", top: 2, left: 2, width: 18, height: 18, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(23,19,14,.3)", transition: "transform .3s", transform: captions ? "translateX(20px)" : "translateX(0)" }} />
              </button>
            </div>
          </div>


          {/* BRAND COLOURS — override the pack's accents with the user's own.
              "Template" = the pack keeps its accents (a real answer, sent as
              nothing). Presets are KEYFRAME's; custom takes typed, validated hex. */}
          <div className="card" style={{ padding: "20px 22px 20px 27px" }}>
            <span className="spine" style={{ "--spine": brandPalette ? brandPalette.primary : "#17130e" }} />
            <div className="label-mono" style={{ marginBottom: 4 }}>
              BRAND COLOURS — {brandPreset ? brandPreset.label.toUpperCase() : brandChoice === "custom" ? "CUSTOM" : "TEMPLATE"}
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em", color: "var(--color-dim)", marginBottom: 10 }}>
              {brandPalette ? "THE FILM'S ACCENTS FOLLOW YOUR PALETTE"
                : brandChoice === "custom" ? "TYPE A PRIMARY HEX BELOW TO APPLY"
                : "THE TEMPLATE KEEPS ITS OWN ACCENTS"}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: brandChoice === "custom" ? 10 : 0 }}>
              <button type="button" onClick={() => setBrandChoice("template")} aria-pressed={brandChoice === "template"}
                style={{ padding: "7px 12px", borderRadius: 999, cursor: "pointer", fontSize: 12.5, fontWeight: brandChoice === "template" ? 700 : 500, border: `1px solid ${brandChoice === "template" ? "var(--color-ink)" : "rgba(23,19,14,.16)"}`, background: brandChoice === "template" ? "var(--color-ink)" : "transparent", color: brandChoice === "template" ? "#fff" : "var(--color-ink)" }}>
                Template
              </button>
              {BRAND_PRESETS.map((p) => {
                const on = brandChoice === p.id;
                return (
                  <button key={p.id} type="button" onClick={() => setBrandChoice(p.id)} aria-pressed={on} title={`${p.primary} · ${p.secondary}`}
                    style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 999, cursor: "pointer", fontSize: 12.5, fontWeight: on ? 700 : 500, border: `1px solid ${on ? p.primary : "rgba(23,19,14,.16)"}`, background: on ? p.primary : "transparent", color: on ? "#fff" : "var(--color-ink)" }}>
                    <span style={{ width: 12, height: 12, borderRadius: "50%", background: `linear-gradient(135deg, ${p.primary} 50%, ${p.secondary} 50%)`, border: "1px solid rgba(255,255,255,.5)" }} />
                    {p.label}
                  </button>
                );
              })}
              <button type="button" onClick={() => setBrandChoice("custom")} aria-pressed={brandChoice === "custom"}
                style={{ padding: "7px 12px", borderRadius: 999, cursor: "pointer", fontSize: 12.5, fontWeight: brandChoice === "custom" ? 700 : 500, border: `1px solid ${brandChoice === "custom" ? "var(--color-am)" : "rgba(23,19,14,.16)"}`, background: brandChoice === "custom" ? "var(--color-am)" : "transparent", color: brandChoice === "custom" ? "#fff" : "var(--color-ink)" }}>
                Custom…
              </button>
            </div>
            {brandChoice === "custom" && (
              <div style={{ display: "grid", gap: 8 }}>
                {/* Stacked rows, label above nothing — swatch + input on one line
                    per colour, contained at any card width. The red state means
                    "you typed something that isn't a hex", never "you haven't
                    typed yet" — an empty well is a neutral prompt, not an error. */}
                {[["PRIMARY", customPrimary, setCustomPrimary], ["SECONDARY — OPTIONAL", customSecondary, setCustomSecondary]].map(([lbl, val, set]) => {
                  const invalid = val !== "" && !HEX_RE.test(val);
                  return (
                    <label key={lbl} style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                      <span style={{ flex: "0 0 40%", fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em", color: "var(--color-dim)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{lbl}</span>
                      <span style={{ flexShrink: 0, width: 22, height: 22, borderRadius: 4, border: "1px solid rgba(23,19,14,.25)", background: HEX_RE.test(val) ? val : "transparent" }} />
                      <input value={val} onChange={(e) => set(e.target.value.trim())} placeholder="#RRGGBB" maxLength={7} spellCheck={false}
                        style={{ flex: "1 1 60px", minWidth: 0, boxSizing: "border-box", padding: "6px 8px", fontFamily: "var(--font-mono)", fontSize: 11, borderRadius: 4, background: "var(--color-paper-2)", border: `1px solid ${invalid ? "#ef4444" : "rgba(23,19,14,.25)"}` }} />
                    </label>
                  );
                })}
                {customPrimary !== "" && !cp && (
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em", color: "#ef4444" }}>PRIMARY MUST BE #RRGGBB</span>
                )}
              </div>
            )}
          </div>


          <div className="card" style={{ padding: "20px 22px 20px 27px" }}>
            <span className="spine" style={{ "--spine": "#b9f24a" }} />
            <div className="label-mono" style={{ marginBottom: 10 }}>FINISH — {finish === "premium" ? "PREMIUM" : finish === "cinema" ? "CINEMA 3D" : "STANDARD"}</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" onClick={() => setFinish("standard")}
                className={`chip-c on-paper ${finish === "standard" ? "is-active" : ""}`}
                style={{ "--chipc": "#b9f24a" }}
                title="Deterministic scene-kit — fast, reliable, ~2 min">
                STANDARD
              </button>
              <button type="button" onClick={() => setFinish("premium")}
                className={`chip-c on-paper ${finish === "premium" ? "is-active" : ""}`}
                style={{ "--chipc": "#e832a8" }}
                title="AI-composed layouts — richer, bespoke, ~10–15 min">
                ◆ PREMIUM
              </button>
              <button type="button" onClick={() => setFinish("cinema")}
                className={`chip-c on-paper ${finish === "cinema" ? "is-active" : ""}`}
                style={{ "--chipc": "#23c8e0" }}
                title="3D film set — your product on a retro CRT screen, WebGL bloom + film grain">
                ▲ CINEMA 3D
              </button>
            </div>
            <div style={{ marginTop: 10, fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em", color: "var(--color-dim)" }}>
              {finish === "premium" ? "AI-COMPOSED SCENES · ~10–15 MIN · RICHER"
                : finish === "cinema" ? "3D SET · CRT SCREEN + FILM GRAIN · ~3–5 MIN"
                : "CODE-BUILT SCENES · ~2 MIN · RELIABLE"}
            </div>
          </div>

          {/* BRAND ASSETS — the user's own logo + up to 12 product images. These become
              tier-100 primary visuals that outrank everything the pipeline fetches. */}
          <div className="card" style={{ padding: "20px 22px 20px 27px" }}>
            <span className="spine" style={{ "--spine": "#e832a8" }} />
            <div className="label-mono" style={{ marginBottom: 10 }}>BRAND ASSETS — YOUR OWN MATERIAL</div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
              <button type="button" onClick={() => logoInput.current?.click()}
                style={{ width: 54, height: 54, borderRadius: 6, border: "1px dashed rgba(23,19,14,.35)", background: "var(--color-paper-2)", cursor: "pointer", display: "grid", placeItems: "center", overflow: "hidden", padding: 0 }}>
                {logoFile ? <img alt="logo" src={URL.createObjectURL(logoFile)} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} /> : <span style={{ fontSize: 18 }}>+</span>}
              </button>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em", color: "var(--color-dim)" }}>
                {logoFile ? `LOGO · ${logoFile.name}` : "LOGO — PNG / JPG / WEBP / SVG · ≤15MB"}
                {logoFile && <button type="button" onClick={() => setLogoFile(null)} style={{ marginLeft: 8, cursor: "pointer" }}>REMOVE</button>}
              </div>
            </div>
            <div onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); addAssetFiles(e.dataTransfer.files); }}
              style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {assetFiles.map((f, i) => (
                <button key={`${f.name}${f.size}`} type="button" title="click to remove"
                  onClick={() => setAssetFiles((p) => p.filter((_, j) => j !== i))}
                  style={{ width: 54, height: 54, padding: 0, borderRadius: 6, border: "1px solid rgba(23,19,14,.2)", overflow: "hidden", cursor: "pointer" }}>
                  <img alt={f.name} src={assetThumbs[i]} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                </button>
              ))}
              {assetFiles.length < MAX_ASSETS && (
                <button type="button" onClick={() => assetsInput.current?.click()}
                  style={{ width: 54, height: 54, borderRadius: 6, border: "1px dashed rgba(23,19,14,.35)", background: "var(--color-paper-2)", cursor: "pointer", fontSize: 18 }}>+</button>
              )}
            </div>
            <div style={{ marginTop: 10, fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em", color: "var(--color-dim)" }}>
              {assetFiles.length ? `${assetFiles.length}/${MAX_ASSETS} IMAGES · YOURS OUTRANK STOCK` : "PRODUCT SCREENSHOTS / PHOTOS — PNG / JPG / WEBP · ≤15MB · MAX 12"}
            </div>
            <input ref={logoInput} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" style={{ display: "none" }}
              onChange={(e) => { acceptLogo(e.target.files?.[0]); e.target.value = ""; }} />
            <input ref={assetsInput} type="file" multiple accept="image/png,image/jpeg,image/webp" style={{ display: "none" }}
              onChange={(e) => { addAssetFiles(e.target.files); e.target.value = ""; }} />
          </div>

          {/* narration voice — voiceStyle hint the brief casts from */}
          <div className="card" style={{ padding: "20px 22px 20px 27px" }}>
            <span className="spine" style={{ "--spine": "#8a63ff" }} />
            <div className="label-mono" style={{ marginBottom: 10 }}>NARRATION VOICE — {VOICES.find((v) => v.key === voice)?.label}</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {VOICES.map((v) => (
                <button key={v.key} type="button" onClick={() => setVoice(v.key)}
                  className={`chip-c on-paper ${voice === v.key ? "is-active" : ""}`}
                  style={{ "--chipc": v.c, fontSize: 10, padding: "4px 10px" }}
                  title={v.style || "let the director cast the voice"}>
                  {v.label}
                </button>
              ))}
            </div>
            <div style={{ marginTop: 10, fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em", color: "var(--color-dim)" }}>
              {voice === "auto" ? "THE DIRECTOR CASTS THE VOICE" : (VOICES.find((v) => v.key === voice)?.style || "").toUpperCase()}
            </div>
          </div>

          {/* autopilot — auto-approve the script and render straight through */}
          <div className="card" style={{ padding: "20px 22px 20px 27px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <span className="spine" style={{ "--spine": "#2b5bff" }} />
            <div>
              <div className="label-mono" style={{ marginBottom: 4 }}>AUTOPILOT</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em", color: "var(--color-dim)", lineHeight: 1.5 }}>
                {autopilot ? "AUTO-APPROVES THE SCRIPT · RENDERS STRAIGHT THROUGH" : "PAUSES SO YOU REVIEW THE SCRIPT FIRST"}
              </div>
            </div>
            <button
              type="button" role="switch" aria-checked={autopilot} aria-label="Toggle autopilot"
              onClick={() => setAutopilot((v) => !v)}
              style={{ position: "relative", flexShrink: 0, width: 44, height: 24, borderRadius: 999, cursor: "pointer", transition: "background .3s, border-color .3s", background: autopilot ? "var(--color-lm)" : "var(--color-paper-2)", border: `1px solid ${autopilot ? "var(--color-lm)" : "rgba(23,19,14,.25)"}` }}
            >
              <span style={{ position: "absolute", top: 2, left: 2, width: 18, height: 18, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(23,19,14,.3)", transition: "transform .3s", transform: autopilot ? "translateX(20px)" : "translateX(0)" }} />
            </button>
          </div>
        </div>
      </section>

      {/* ---------- packs ---------- */}
      <section id="templates" style={{ maxWidth: 1120, margin: "0 auto", padding: "clamp(60px,9vw,110px) clamp(16px,4vw,60px) 0" }}>
        <span className="scene-pill" style={{ "--tagc": "#b9f24a", background: "var(--color-ink)", border: "none" }}>SC 02 · ART DIRECTION</span>
        <h2 className="headline" style={{ fontSize: "clamp(32px,5vw,64px)" }}>
          Pick the look.<br />We <span style={{ color: "var(--color-am)" }}>art-direct</span> the film.
        </h2>
        <p style={{ maxWidth: 560, color: "var(--color-dim)", fontSize: 16, lineHeight: 1.6, margin: "16px 0 0" }}>
          {packList.length} frame packs, each a complete design system — or leave it on auto and
          the pipeline casts the look that fits your brief. Hover a card to watch its motion.
        </p>

        {/* Same Horizontal / Vertical split as the Templates page. */}
        <div role="tablist" aria-label="Frame pack orientation"
          style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginTop: 30 }}>
          {ORIENTATIONS.map((o) => (
            <OrientationTab key={o.key} o={o} count={packGroups[o.key].length}
              selected={o.key === packTabKey} onSelect={() => setPackTab(o.key)} />
          ))}
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: ".14em", color: "var(--color-dim)", textTransform: "uppercase" }}>
            {packOrientation.title}
          </span>
        </div>

        {/* keyed on the tab so switching re-runs the card entrance animation */}
        <motion.div key={packTabKey}
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, ease: "easeOut" }}
          role="tabpanel" aria-label={`${packOrientation.label} frame packs`}
          style={{ marginTop: 22, display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${packTabKey === "vertical" ? 210 : 240}px,1fr))`, gap: 16 }}>
          <SelectablePack active={framePack === "auto"} onSelect={() => setFramePack("auto")}>
            <AutoCard portrait={!!packOrientation.portrait} />
          </SelectablePack>
          {shownPacks.map((p) => (
            <SelectablePack key={p.name} active={framePack === p.name}
              onSelect={() => {
                const next = framePack === p.name ? "auto" : p.name;
                setFramePack(next);
                // A portrait-native template (the Vertical tab) should film
                // vertical by default — otherwise a 9:16 pack renders into a 16:9
                // frame. Only auto-switch ON select, never override a deselect,
                // so the user can still change it after.
                if (next !== "auto" && p.portrait) setOrientation("vertical");
              }}>
              <PackCard compact pack={p} portrait={p.portrait} />
            </SelectablePack>
          ))}
        </motion.div>

        <div style={{ marginTop: 46, textAlign: "center" }}>
          <button type="button" onClick={onProduce} disabled={!produceEnabled} aria-busy={busy} className="btn-mag btn-big">
            {busy ? busyLabel : asking ? "Answer the question ↑" : "Start your film →"}
          </button>
        </div>
      </section>
    </div>
  );
}

function TimelineRow({ label, h = 26, children }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ width: 44, fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", color: "#7d766a" }}>{label}</span>
      <div className="clip-track" style={{ flex: 1, height: h }}>{children}</div>
    </div>
  );
}

function orderPacks(serverPacks) {
  const byName = Object.fromEntries(serverPacks.map((p) => [p.name, p]));
  const known = PACK_ORDER.map((name) => ({ name, ...(byName[name] || {}) }));
  const extras = serverPacks.filter((p) => !PACK_LORE[p.name]);
  return [...known, ...extras];
}

// Selection ring + magenta check over a pack card.
// The card keeps pointer events so its own hover preview (mouse-enter plays the
// pack's motion clip, like the Templates page) still fires; a click anywhere on
// the card bubbles up to onSelect, so the whole tile stays one selection target.
function SelectablePack({ active, onSelect, children }) {
  return (
    <div role="button" aria-pressed={active} tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(); } }}
      style={{ position: "relative", borderRadius: 18, outline: active ? "2px solid var(--color-mag)" : "none", outlineOffset: 3 }}>
      {children}
      {active && (
        <div aria-hidden="true" style={{ position: "absolute", top: 10, right: 10, zIndex: 5, width: 22, height: 22, borderRadius: "50%", display: "grid", placeItems: "center", fontSize: 12, background: "var(--color-mag)", color: "#17130e", boxShadow: "0 4px 14px rgba(232,50,168,.5)" }}>✓</div>
      )}
    </div>
  );
}

// The "auto-direct" card in the same v2 anatomy. Its art box matches the tab's
// aspect (16:9 / 9:16) so it lines up with the pack cards beside it.
function AutoCard({ portrait = false }) {
  return (
    <div className="card card-lift" style={{ overflow: "hidden", cursor: "pointer" }}>
      <span className="spine" style={{ "--spine": "#e832a8", zIndex: 2 }} />
      <div className="film-drift" style={{ aspectRatio: portrait ? "9/16" : "16/9", position: "relative", overflow: "hidden", background: "linear-gradient(135deg, #e832a8, #23c8e0 55%, #17130e)", display: "grid", placeItems: "center" }}>
        <div className="film-scan" />
        <div style={{ position: "relative", zIndex: 2, fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "clamp(17px,2vw,24px)", color: "#fff", letterSpacing: "-.02em", textShadow: "0 4px 20px rgba(0,0,0,.35)" }}>✦ Auto-direct</div>
      </div>
      <div style={{ padding: "16px 16px 18px 21px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <h3 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 16, margin: 0, color: "var(--color-ink)" }}>Auto</h3>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.18em", color: "var(--color-mag)" }}>AI PICKS</span>
        </div>
        <div style={{ marginTop: 10, fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.1em", color: "var(--color-dim)" }}>IT CHOOSES THE LOOK →</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- the scope panel
//
// What the server decided when this request was SUBMITTED, for the three outcomes
// that do not become a job (server/src/services/prompt_scope.js). The status NAME is
// never printed — "OUT_OF_SCOPE" is our vocabulary, not the person's.
//
//   NEEDS_CLARIFICATION  one question, one answer field. The answer goes back with the
//                        same request and the server merges it into the prompt; it will
//                        not ask a second question about the same request.
//   OUT_OF_SCOPE         a plain "can't make this", then what KEYFRAME CAN make and how,
//                        read from the server's live capability catalog (so a new
//                        language or template changes this text with no client edit).
//                        No rewritten prompt and no alternative films: KEYFRAME does not
//                        decide on the person's behalf what they should have asked for.
//   DISALLOWED           the moderation reason, and nothing to act on.
//
// Colour discipline carries over from the editor: magenta is the commit-and-spend
// colour (the Produce CTAs), so the answer button is .btn-ink.on-dark and the one
// out-of-scope action is a plain mono link.
//
// Whether an answer can be SENT is not decided here: `canContinue` and `answerHint` come
// from the screen, which also owns the Produce CTAs and the tab's source fields. A copy of
// the rule inside the panel was how CONTINUE and Produce came to disagree.
function ScopePanel({ scope, panelRef, headingRef, busy, answer, answerRef, canContinue, answerHint, onAnswer, onContinue, onStartOver }) {
  const status = scope?.status;
  const isAsk = status === "NEEDS_CLARIFICATION";
  const isOut = status === "OUT_OF_SCOPE";
  const isBlocked = status === "DISALLOWED";
  if (!isAsk && !isOut && !isBlocked) return null;

  const accent = isBlocked ? "var(--color-rec)" : isOut ? "var(--color-am)" : "var(--color-cy)";
  // REC red sits at about 3.5:1 on the editor ground: enough for the 3px accent bar,
  // too faint for 10px mono type. The heading takes a lighter mix of the same red
  // (about 5.8:1) so the one line that names the refusal is actually legible.
  const headingColor = isBlocked ? "color-mix(in srgb, var(--color-rec) 60%, var(--color-dark-ink))" : accent;
  // The two refusals mean different things and must not read alike: out-of-scope is
  // "this isn't a video KEYFRAME makes" (and comes with what it CAN make); disallowed is
  // a content refusal with nothing to redirect to.
  const heading = isAsk ? "ONE QUICK QUESTION" : isOut ? "KEYFRAME CAN'T MAKE THIS ONE" : "THIS REQUEST ISN'T ALLOWED";
  const question = scope.clarificationQuestion || FALLBACK_QUESTION;
  const g = isOut && scope.guidance ? scope.guidance : null;
  const canCreate = Array.isArray(g?.canCreate) ? g.canCreate : [];
  const steps = Array.isArray(g?.steps) ? g.steps : [];

  // Sentence case for anything the person reads as prose: mono caps for a refusal
  // reads as shouting. Secondary type is --color-dark-dim, never .label-mono's paper
  // --color-dim, which drops under 4:1 on this ground.
  const prose = { margin: 0, fontSize: 14, lineHeight: 1.55, color: "var(--color-dark-ink)" };
  const subhead = { margin: "16px 0 8px", color: "var(--color-dark-dim)" };

  return (
    <section
      ref={panelRef}
      aria-labelledby="kf-scope-h"
      // No role="alert": every decision already moves focus to the panel (the heading,
      // or the answer field), and focus is itself announced. An alert on top of that
      // made a screen reader say the refusal twice.
      style={{
        marginTop: 14, padding: "16px 18px", borderRadius: 14,
        background: "rgba(242,237,226,.04)",
        border: "1px solid rgba(242,237,226,.12)",
        borderLeft: `3px solid ${accent}`,
        // A tall panel is scrolled to its START; this keeps that start clear of the
        // fixed nav bar instead of tucking the heading underneath it.
        scrollMarginTop: 100,
      }}
    >
      <h2 id="kf-scope-h" ref={headingRef} tabIndex={-1} className="label-mono"
        style={{ margin: "0 0 10px", color: headingColor }}>
        {heading}
      </h2>

      {isAsk && (
        <>
          <p style={{ ...prose, marginBottom: 12 }}>{question}</p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <input
              ref={answerRef}
              value={answer}
              onChange={(e) => onAnswer(e.target.value)}
              onKeyDown={(e) => {
                // isComposing: in Japanese (a shipped language) Enter also CONFIRMS an
                // IME candidate, and that keystroke must not send a half-typed answer.
                if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
                e.preventDefault();
                if (canContinue) onContinue();
              }}
              maxLength={1000}
              aria-label={question}
              aria-describedby={answerHint ? "kf-answer-hint" : undefined}
              placeholder="Your answer"
              className="editor-inset"
              // .editor-inset's own border is 10% ink — invisible as the edge of the ONE
              // field the person must find. 40% gives it a boundary on this ground.
              style={{ flex: "1 1 220px", minWidth: 0, padding: "10px 14px", border: "1px solid rgba(242,237,226,.40)" }}
            />
            <button type="button" className="btn-ink on-dark" onClick={onContinue}
              disabled={!canContinue} aria-busy={busy}
              aria-describedby={answerHint ? "kf-answer-hint" : undefined}
              style={{ padding: "9px 18px", fontSize: 13 }}>
              CONTINUE
            </button>
          </div>
          {/* Dim, never red — the same register as the short-prompt nudge: the request
              is unfinished, not wrong. */}
          {answerHint && (
            <p id="kf-answer-hint" style={{ margin: "8px 2px 0", fontSize: 12, lineHeight: 1.5, color: "var(--color-dark-dim)" }}>
              {answerHint}
            </p>
          )}
        </>
      )}

      {isOut && (
        <>
          <p style={prose}>{g ? `${g.reason} ${g.framing}` : (scope.reason || "This request isn't for a video.")}</p>

          {/* Directly under the reason, not after both lists: the lists make this panel
              taller than a phone screen, and the one action should not need a scroll. */}
          <button type="button" className="link-mono on-dark" onClick={onStartOver}
            style={{ fontSize: 10, borderBottomWidth: 1, marginTop: 10 }}>
            ↺ START A NEW PROMPT
          </button>

          {canCreate.length > 0 && (
            <>
              <h3 className="label-mono" style={subhead}>WHAT YOU CAN MAKE WITH KEYFRAME</h3>
              {/* role="list": Safari drops list semantics from a list-style:none list. */}
              <ul role="list" style={{ margin: 0, padding: 0, listStyle: "none" }}>
                {canCreate.map((t) => (
                  <li key={t.label} style={{ display: "flex", gap: 8, margin: "0 0 6px", fontSize: 13, lineHeight: 1.45 }}>
                    <span aria-hidden="true" style={{ color: accent }}>+</span>
                    <span style={{ color: "var(--color-dark-ink)" }}>
                      {t.label}
                      {t.detail ? <span style={{ color: "var(--color-dark-dim)" }}> — {t.detail}</span> : null}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {steps.length > 0 && (
            <>
              <h3 className="label-mono" style={subhead}>HOW TO CREATE A VIDEO</h3>
              {/* Native decimal markers: the order IS the content, and an <ol> says
                  "step 3 of 6" to a screen reader for free. */}
              <ol style={{ margin: 0, padding: "0 0 0 20px", listStyle: "decimal" }}>
                {steps.map((step, i) => (
                  <li key={i} style={{ margin: "0 0 6px", paddingLeft: 2, fontSize: 13, lineHeight: 1.5, color: "var(--color-dark-ink)" }}>
                    {step}
                  </li>
                ))}
              </ol>
            </>
          )}

        </>
      )}

      {isBlocked && (
        <>
          <p style={prose}>{scope.reason || "This request can't be made into a video."}</p>
          {/* Without this the refusal is a dead end: Produce stays locked on the refused
              text and there is nothing on the panel to act on. */}
          <button type="button" className="link-mono on-dark" onClick={onStartOver}
            style={{ fontSize: 10, borderBottomWidth: 1, marginTop: 10 }}>
            ↺ START A NEW PROMPT
          </button>
        </>
      )}
    </section>
  );
}
