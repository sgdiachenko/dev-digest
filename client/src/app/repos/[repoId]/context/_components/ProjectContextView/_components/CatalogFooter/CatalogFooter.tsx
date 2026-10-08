"use client";

import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import { s } from "../../styles";
import { relativeTime, shortSha } from "../../helpers";

/** "N files · scanned X ago", branch@sha and Rescan. The sr-only live region announces scan start/finish. */
export function CatalogFooter({
  totalFiles,
  scannedAt,
  branch,
  sha,
  scanning,
  onRescan,
}: {
  totalFiles: number;
  scannedAt: string | null;
  branch: string | null;
  sha: string | null;
  scanning: boolean;
  onRescan: () => void;
}) {
  const t = useTranslations("context");
  return (
    <div style={s.footer}>
      <span role="status" aria-live="polite" style={s.srOnly}>
        {scanning ? t("status.started") : t("status.finished")}
      </span>
      <span>
        {t("footer.summary", { count: totalFiles, time: relativeTime(scannedAt) })}
        {branch && sha && (
          <>
            {" · "}
            <span className="mono">{t("footer.ref", { branch, sha: shortSha(sha) })}</span>
          </>
        )}
      </span>
      <Button kind="ghost" size="sm" icon="RefreshCw" disabled={scanning} onClick={onRescan}>
        {scanning ? t("rescanning") : t("rescan")}
      </Button>
    </div>
  );
}
