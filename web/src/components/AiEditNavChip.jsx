import { useUpload } from "../uploadStore.js";

// Nav chip for AI Edit. While an upload is in flight anywhere in the app it reads
// "AI EDIT · 42%" (the upload store outlives screens). The wrapper span carries the responsive
// visibility because the unlayered .btn-chip{display:inline-flex} would beat Tailwind's `hidden`.
export default function AiEditNavChip({ active = false, onClick }) {
  const upload = useUpload();
  const uploading = upload.phase === "uploading";
  const verifying = upload.phase === "verifying";
  const pct = Math.floor(upload.progress?.pct ?? 0);
  const text = uploading ? `AI EDIT · ${pct}%` : verifying ? "AI EDIT · CHECKING" : "AI EDIT";
  const spoken = uploading ? `AI Edit, uploading ${pct} percent` : verifying ? "AI Edit, checking the footage" : undefined;

  return (
    <span className="hidden sm:inline-flex">
      <button
        type="button"
        className={`btn-chip ${active ? "is-active" : ""}`}
        aria-current={active ? "page" : undefined}
        aria-label={spoken}
        onClick={onClick}
        style={{ minHeight: 40, fontVariantNumeric: "tabular-nums" }}
      >
        {(uploading || verifying) && (
          <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--color-rec)", animation: "kf2-blink 1.1s steps(1) infinite", flexShrink: 0 }} />
        )}
        {text}
      </button>
    </span>
  );
}
