"use client";

import { useTranslations } from "next-intl";
import { fileUrl } from "../../helpers";

/** Opens a repo path on GitHub pinned to `sha` (facts SHA, or the narrative's SHA when it is outdated). */
export function OpenOnGitHub({
  repoFullName,
  sha,
  path,
  kind = "file",
}: {
  repoFullName: string;
  sha: string;
  path: string;
  kind?: "file" | "directory";
}) {
  const t = useTranslations("onboarding");
  return (
    <a
      href={fileUrl(repoFullName, sha, path, kind)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={t("openOnGitHubFor", { path })}
      style={{
        display: "inline-flex",
        alignItems: "center",
        minHeight: 24,
        minWidth: 24,
        padding: "3px 10px",
        fontSize: 12,
        fontWeight: 500,
        color: "var(--text-primary)",
        border: "1px solid var(--border-strong)",
        borderRadius: 6,
        textDecoration: "none",
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}
    >
      {t("open")}
    </a>
  );
}
