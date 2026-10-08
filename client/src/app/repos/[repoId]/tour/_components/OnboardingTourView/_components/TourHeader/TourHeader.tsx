"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import type { OnboardingIndexInfo } from "@/lib/types";
import { s } from "../../styles";

/**
 * Page header: title, short SHA, file counts, index-status chip (text, not colour alone), Copy link and Export.
 * `actions` / `meta` are slots the narrative layer fills (Generate/Regenerate; "Generated…", Outdated, failures).
 */
export function TourHeader({
  repoName,
  sha,
  index,
  onExport,
  actions,
  estimate,
  meta,
}: {
  repoName: string;
  sha: string | null;
  index: OnboardingIndexInfo;
  /** Builds and downloads the Markdown file; omitted while there are no sections to export. */
  onExport?: () => void;
  actions?: ReactNode;
  /** Model + cost estimate, a small muted line under the title row. */
  estimate?: ReactNode;
  meta?: ReactNode;
}) {
  const t = useTranslations("onboarding");
  const [announcement, setAnnouncement] = useState("");

  async function copyLink() {
    try {
      // the view keeps the current section in the hash, so the href already carries it
      await navigator.clipboard.writeText(window.location.href);
      setAnnouncement(t("header.linkCopied"));
    } catch {
      setAnnouncement(t("header.linkCopyFailed"));
    }
  }

  const counts =
    index.files_in_repo != null
      ? t("header.files", { indexed: index.files_indexed, total: index.files_in_repo })
      : t("header.filesUnknownTotal", { indexed: index.files_indexed });

  const shortName = repoName.split("/").pop() ?? repoName;
  const dot = (
    <span aria-hidden="true" style={{ color: "var(--text-muted)" }}>
      ·
    </span>
  );

  return (
    <header style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <h1 style={{ ...s.title, flex: "1 1 240px", minWidth: 0 }}>
          {t("titlePrefix")}
          <span style={{ ...s.mono, color: "var(--accent-text)" }}>{shortName}</span>
        </h1>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
          {actions}
          <Button size="sm" icon="Link" onClick={copyLink}>
            {t("header.copyLink")}
          </Button>
          {onExport && (
            <Button size="sm" icon="FileText" onClick={onExport}>
              {t("header.export")}
            </Button>
          )}
        </div>
      </div>
      <div style={{ ...s.muted, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, fontSize: 13 }}>
        {sha && (
          <>
            <code style={s.mono}>{t("header.sha", { sha: sha.slice(0, 7) })}</code>
            {dot}
          </>
        )}
        <span>{counts}</span>
        <span
          style={{
            border: "1px solid var(--border)",
            borderRadius: 999,
            padding: "1px 10px",
            fontSize: 12,
          }}
        >
          {t(`header.status.${index.status}`)}
        </span>
      </div>
      {estimate}
      {meta}
      <div role="status" aria-live="polite" style={{ fontSize: 12, color: "var(--text-secondary)", minHeight: 0 }}>
        {announcement}
      </div>
    </header>
  );
}
