import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { useEditor, useEditorActions } from "../../../editState.js";
import { fmtBytes, errorCopy } from "../../../editFormat.js";
import { BRAND_PRESETS, KEYFRAME_PALETTE, LOGO_CORNERS, LOGO_LIMITS } from "../../../brand.js";
import BrandPalettePicker from "../../../components/BrandPalettePicker.jsx";
import RadioChips from "../../../components/RadioChips.jsx";
import ItemCard, { ActionButton, PanelSection, RangeField, CostHint } from "../ItemCard.jsx";

// BRANDING (UX.md §1d panel 6) — the logo (upload / replace / remove, corner, size 8–20 %, opacity
// 60–100 %) and the brand palette cards and captions use. A logo upload is its own request
// (POST /:id/logo, re-encoded server-side); the revision it creates is folded back into the editor.

function paletteValue(p) {
  if (!p) return null;
  const primary = String(p.primary || "").toLowerCase();
  const accent = String(p.accent || "").toLowerCase();
  if (p.source === "default" || (primary === KEYFRAME_PALETTE.primary && accent === KEYFRAME_PALETTE.secondary)) return null;
  const preset = BRAND_PRESETS.find((x) => x.primary === primary && x.secondary === accent);
  if (preset) return { primary, secondary: accent, source: "preset", presetId: preset.id };
  return { primary, ...(accent ? { secondary: accent } : {}), source: "manual" };
}

// The brand palette as an edit op (shared with the Captions panel).
export function PaletteField({ label = "Brand colours" }) {
  const f = useEditorActions();
  const palette = useEditor((s) => s.plan?.branding?.palette);
  const onChange = (v) => {
    const op = v
      ? { type: "branding.setPalette", primary: v.primary, ...(v.secondary ? { accent: v.secondary } : {}), ...(v.presetId ? { presetId: v.presetId } : {}) }
      : { type: "branding.setPalette", primary: KEYFRAME_PALETTE.primary, accent: KEYFRAME_PALETTE.secondary };
    const r = f.apply(op);
    if (!r.ok) f.toast({ tone: "error", message: r.reason });
  };
  return (
    <div style={{ display: "grid", gap: 6, minWidth: 0 }}>
      <BrandPalettePicker value={paletteValue(palette)} onChange={onChange} label={label} />
      <CostHint op={{ type: "branding.setPalette" }} />
    </div>
  );
}

function LogoUpload({ hasLogo, children }) {
  const f = useEditorActions();
  const inputRef = useRef(null);
  const hintId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!LOGO_LIMITS.types.includes(file.type)) { setError("Logos must be PNG, JPG or WEBP."); return; }
    if (file.size > LOGO_LIMITS.maxBytes) { setError(`This logo is ${fmtBytes(file.size)}. The limit is 5 MB.`); return; }
    setError(null);
    setBusy(true);
    try {
      const res = await f.api.uploadLogo(f.editId, file);
      f.externalRevision({ revision: res?.revision, label: hasLogo ? "Replace logo" : "Set logo" });
      f.toast({ tone: "success", message: hasLogo ? "Logo replaced" : "Logo added · rendering the whole video" });
    } catch (err) {
      if (err?.status === 401) f.needAuth(() => inputRef.current?.click());
      setError(errorCopy(err).body);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <input ref={inputRef} type="file" accept={LOGO_LIMITS.types.join(",")} tabIndex={-1} aria-hidden="true" onChange={onFile} style={{ display: "none" }} />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <button type="button" className="btn-ink on-dark" onClick={() => inputRef.current?.click()} disabled={busy} aria-describedby={hintId} aria-busy={busy || undefined} style={{ minHeight: 44 }}>
          {busy ? "Uploading…" : hasLogo ? "Replace logo" : "Upload logo"}
        </button>
        {children}
      </div>
      <span id={hintId} className="label-mono" style={{ color: "var(--color-dark-dim)" }}>PNG, JPG OR WEBP · UP TO 5 MB</span>
      {error && <p role="alert" style={{ margin: 0, fontSize: 13, color: "#ff6a3c" }}>{error}</p>}
    </div>
  );
}

export function LogoCard({ layout }) {
  const f = useEditorActions();
  const logo = useEditor((s) => s.plan?.branding?.logo);
  const src = useSyncExternalStore(f.media.subscribe, () => (logo ? f.media.get("logo") : null));
  useEffect(() => { if (logo) f.media.request("logo"); }, [f, logo]);

  if (!logo) {
    return (
      <div style={{ padding: 16, borderRadius: 14, border: "1px dashed rgba(242,237,226,.25)", display: "grid", gap: 10 }}>
        <p style={{ margin: 0, fontSize: 14, color: "var(--color-dark-ink)" }}>No logo on this edit.</p>
        <LogoUpload hasLogo={false} />
      </div>
    );
  }
  const place = (patch) => {
    const r = f.apply({ type: "branding.setLogoPlacement", placement: logo.placement, scale: logo.scale, opacity: logo.opacity, ...patch });
    if (!r.ok) f.toast({ tone: "error", message: r.reason });
  };
  return (
    <ItemCard kind="logo" id="logo" layout={layout}>
      <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
        <div aria-hidden="true" style={{ width: 88, height: 88, borderRadius: 12, flexShrink: 0, display: "grid", placeItems: "center", background: "repeating-conic-gradient(rgba(242,237,226,.08) 0 25%, transparent 0 50%) 50% / 16px 16px", border: "1px solid var(--color-dark-line)" }}>
          {src ? <img src={src} alt="" style={{ maxWidth: "80%", maxHeight: "80%", objectFit: "contain", opacity: logo.opacity }} /> : <span className="label-mono">LOGO</span>}
        </div>
        <LogoUpload hasLogo>
          <ActionButton tone="danger" onClick={() => f.removeItem("logo", "logo")} cost={{ type: "branding.removeLogo" }}>Remove</ActionButton>
        </LogoUpload>
      </div>
      <RadioChips label="Corner" value={logo.placement} options={LOGO_CORNERS} onChange={(v) => place({ placement: v })} />
      <RangeField label="Size" min={8} max={20} step={1} value={Math.round((Number(logo.scale) || 0.12) * 100)} format={(v) => `${Math.round(v)}% width`} onChange={(v) => place({ scale: v / 100 })} />
      <RangeField label="Opacity" min={60} max={100} step={1} value={Math.round((Number(logo.opacity) || 0.85) * 100)} format={(v) => `${Math.round(v)}%`} onChange={(v) => place({ opacity: v / 100 })} />
      <CostHint op={{ type: "branding.setLogoPlacement" }} />
    </ItemCard>
  );
}

export default function BrandingPanel({ layout }) {
  return (
    <div>
      <PanelSection first title="LOGO">
        <LogoCard layout={layout} />
      </PanelSection>
      <PanelSection title="PALETTE">
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: "var(--color-dark-dim)" }}>Titles, cards and highlighted caption words use these colours. Your footage is never recoloured.</p>
        <PaletteField />
      </PanelSection>
    </div>
  );
}
