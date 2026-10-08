"use client";

import { useTranslations } from "next-intl";

/** Replaces the sections when the tour cannot be built: not cloned (Resync action) or still being indexed. */
export function TourUnavailable({
  reason,
  onResync,
  resyncing = false,
}: {
  reason: "not_cloned" | "not_indexed";
  /** Required for `not_cloned`; the view wires it to the existing resync mutation. */
  onResync?: () => void;
  resyncing?: boolean;
}) {
  const t = useTranslations("onboarding");
  return (
    <div
      role="status"
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 12,
        border: "1px solid var(--border)",
        borderRadius: 8,
        padding: 16,
        background: "var(--bg-surface)",
      }}
    >
      <p style={{ margin: 0, flex: 1, minWidth: 0 }}>
        {reason === "not_cloned" ? t("states.notCloned") : t("states.notIndexed")}
      </p>
      {reason === "not_cloned" && onResync && (
        <button
          type="button"
          onClick={onResync}
          disabled={resyncing}
          style={{ minHeight: 24, minWidth: 24, padding: "0 10px" }}
        >
          {t("states.resync")}
        </button>
      )}
    </div>
  );
}
