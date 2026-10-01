"use client";

import { useTranslations } from "next-intl";
import type { OnboardingIndexInfo } from "@/lib/types";

/** Banner for a partial / degraded / failed index: status, reason, counts and a Resync action. Nothing for `full`. */
export function StatusBanner({
  index,
  onResync,
  resyncing = false,
}: {
  index: OnboardingIndexInfo;
  onResync: () => void;
  resyncing?: boolean;
}) {
  const t = useTranslations("onboarding");
  if (index.status === "full") return null;

  const status = t(`states.statusWord.${index.status}`);
  const message =
    index.files_in_repo == null
      ? t("states.bannerUnknownTotal", { status, indexed: index.files_indexed })
      : index.reason
        ? t("states.banner", { status, reason: index.reason, indexed: index.files_indexed, total: index.files_in_repo })
        : t("states.bannerNoReason", { status, indexed: index.files_indexed, total: index.files_in_repo });

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
        padding: "8px 12px",
        background: "var(--bg-surface)",
      }}
    >
      <span style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>{message}</span>
      <button
        type="button"
        onClick={onResync}
        disabled={resyncing}
        style={{ minHeight: 24, minWidth: 24, padding: "0 10px" }}
      >
        {t("states.resync")}
      </button>
    </div>
  );
}
