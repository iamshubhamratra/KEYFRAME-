import Dialog from "../../components/Dialog.jsx";
import { shortcutGroups, formatShortcut } from "../../shortcuts.js";

// SHORTCUTS (UX.md §4.9) — the keymap from shortcuts.js, grouped, with platform-correct key names.
const kbd = {
  display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 26, height: 26, padding: "0 7px",
  borderRadius: 6, border: "1px solid rgba(242,237,226,.22)", borderBottomWidth: 2, background: "rgba(242,237,226,.05)",
  fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--color-dark-ink)", whiteSpace: "nowrap",
};

export default function ShortcutsDialog({ onClose }) {
  const groups = shortcutGroups();
  return (
    <Dialog open onClose={onClose} title="Keyboard shortcuts" scene="EDIT BAY · KEYS" width={680} description="They pause while you type in a field. Esc always closes a dialog.">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "18px 28px" }}>
        {groups.map((g) => (
          <section key={g.group} aria-label={g.group}>
            <h3 className="label-mono" style={{ margin: "0 0 8px", color: "var(--color-dark-dim)", fontWeight: 500 }}>{g.group}</h3>
            <dl style={{ margin: 0, display: "grid", gap: 6 }}>
              {g.entries.map((e) => (
                <div key={e.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "4px 0", borderBottom: "1px solid var(--color-dark-line)" }}>
                  <dt style={{ fontSize: 13, lineHeight: 1.4, color: "var(--color-dark-ink)" }}>{e.label}</dt>
                  <dd style={{ margin: 0, display: "inline-flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
                    {e.keys.map((k, i) => (
                      <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                        {i > 0 && <span style={{ fontSize: 11, color: "var(--color-dark-dim)" }}>or</span>}
                        <kbd style={kbd}>{formatShortcut(k)}</kbd>
                      </span>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Dialog>
  );
}
