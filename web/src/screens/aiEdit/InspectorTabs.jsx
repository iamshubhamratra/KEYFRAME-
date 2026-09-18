import { useEffect, useRef } from "react";
import { useEditor, PANEL_LABELS } from "../../editState.js";
import { kindOfId } from "../../editModel.js";
import TranscriptPanel from "./panels/TranscriptPanel.jsx";
import CaptionsPanel from "./panels/CaptionsPanel.jsx";
import BrollPanel from "./panels/BrollPanel.jsx";
import EffectsPanel from "./panels/EffectsPanel.jsx";
import AudioPanel from "./panels/AudioPanel.jsx";
import BrandingPanel from "./panels/BrandingPanel.jsx";
import FormatPanel from "./panels/FormatPanel.jsx";

// INSPECTOR TABS (UX.md §1d, §4.8) — the full ARIA tablist pattern over the editor's panels:
// role=tablist/tab/tabpanel, one Tab stop, ←/→ and Home/End move and activate, every tabpanel exists
// (so summary chips can point aria-controls at it) but only the active one renders. A magenta dot on
// a tab means something in that panel isn't in the preview yet.

const SHORT = { transcript: "Transcript", captions: "Captions", broll: "B-roll", effects: "Effects", audio: "Audio", branding: "Branding", format: "Format" };
const PANEL_OF_KIND = { caption: "captions", broll: "broll", effect: "effects", graphic: "effects", transition: "effects", cut: "transcript", segment: "format", sfx: "audio" };
const PANEL_OF_SETTING = { removeSilence: "transcript", silencePace: "transcript", removeFillers: "transcript", brollIntensity: "broll", effects: "effects", effectsEnabled: "effects", autoJumpCuts: "effects", punchInOnJumpCuts: "effects" };

function panelsWithPending(ids, plan) {
  const out = new Set();
  for (const id of ids || []) {
    if (id === "music" || id === "sfx") out.add("audio");
    else if (id === "logo") out.add("branding");
    else if (id === "captions") out.add("captions");
    else if (id === "cuts") out.add("transcript");
    else if (id === "output") out.add("format");
    else if (String(id).startsWith("settings.")) { const p = PANEL_OF_SETTING[String(id).slice(9)]; if (p) out.add(p); }
    else { const p = PANEL_OF_KIND[kindOfId(plan, id)]; if (p) out.add(p); }
  }
  return out;
}

function renderPanel(key, props) {
  switch (key) {
    case "transcript": return <TranscriptPanel {...props} filter={props.transcriptFilter} onFilter={props.onTranscriptFilter} />;
    case "captions": return <CaptionsPanel layout={props.layout} />;
    case "broll": return <BrollPanel layout={props.layout} />;
    case "effects": return <EffectsPanel layout={props.layout} />;
    case "audio": return <AudioPanel layout={props.layout} />;
    case "branding": return <BrandingPanel layout={props.layout} />;
    case "format": return <FormatPanel layout={props.layout} />;
    default: return null;
  }
}

export default function InspectorTabs({ layout, tabs, active, onPanel, transcriptFilter, onTranscriptFilter }) {
  const pending = useEditor((s) => s.pendingItemIds);
  const plan = useEditor((s) => s.plan);
  const listRef = useRef(null);
  const tabRefs = useRef({});
  const dirty = panelsWithPending(pending, plan);
  const current = tabs.includes(active) ? active : tabs[0];

  // Keep the active tab visible inside the (horizontally scrolling) tablist without moving the page.
  useEffect(() => {
    const list = listRef.current;
    const tab = tabRefs.current[current];
    if (!list || !tab) return;
    const left = tab.offsetLeft;
    const right = left + tab.offsetWidth;
    if (left < list.scrollLeft) list.scrollLeft = Math.max(0, left - 12);
    else if (right > list.scrollLeft + list.clientWidth) list.scrollLeft = right - list.clientWidth + 12;
  }, [current]);

  const onKey = (e, i) => {
    let next;
    switch (e.key) {
      case "ArrowRight": next = tabs[(i + 1) % tabs.length]; break;
      case "ArrowLeft": next = tabs[(i - 1 + tabs.length) % tabs.length]; break;
      case "Home": next = tabs[0]; break;
      case "End": next = tabs[tabs.length - 1]; break;
      default: return;
    }
    e.preventDefault();
    onPanel(next);
    tabRefs.current[next]?.focus();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: 0, flex: 1 }}>
      <div
        ref={listRef}
        role="tablist"
        aria-label="Inspector"
        style={{ display: "flex", gap: 2, overflowX: "auto", scrollbarWidth: "none", padding: "6px 10px 0", borderBottom: "1px solid var(--color-dark-line)", flexShrink: 0 }}
      >
        {tabs.map((key, i) => {
          const selected = key === current;
          return (
            <button
              key={key}
              ref={(el) => { tabRefs.current[key] = el; }}
              type="button"
              role="tab"
              id={`kf-tab-${key}`}
              aria-selected={selected}
              aria-controls={`kf-panel-${key}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onPanel(key)}
              onKeyDown={(e) => onKey(e, i)}
              title={PANEL_LABELS[key]}
              style={{
                position: "relative", flexShrink: 0, minHeight: 44, padding: "0 12px", border: 0, cursor: "pointer",
                background: "transparent", borderBottom: `2px solid ${selected ? "var(--color-mag)" : "transparent"}`,
                color: selected ? "var(--color-dark-ink)" : "var(--color-dark-dim)",
                fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: "0.14em", textTransform: "uppercase", whiteSpace: "nowrap",
              }}
            >
              {SHORT[key]}
              {dirty.has(key) && (
                <>
                  <span aria-hidden="true" style={{ position: "absolute", top: 10, right: 3, width: 6, height: 6, borderRadius: "50%", background: "var(--color-mag)" }} />
                  <span className="sr-only"> — changes not in preview yet</span>
                </>
              )}
            </button>
          );
        })}
      </div>
      <div className="kf-ed-scroll">
        {tabs.map((key) => (
          <div key={key} role="tabpanel" id={`kf-panel-${key}`} aria-labelledby={`kf-tab-${key}`} hidden={key !== current} tabIndex={0} style={{ outlineOffset: -2 }}>
            {key === current && renderPanel(key, { layout, transcriptFilter, onTranscriptFilter })}
          </div>
        ))}
      </div>
    </div>
  );
}
