/* RefreshResults — outcome of the last Refresh: per-repository errors with their reason (AC-97), the
   token-missing message with a Settings link (AC-102). Announced politely (C10). */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { CiRefreshResult } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import { SYNC_ERROR_KEYS } from "./constants";
import { s } from "./styles";

export function RefreshResults({ results, error }: { results: CiRefreshResult[] | null; error: Error | null }) {
  const t = useTranslations("ci");
  const failed = (results ?? []).filter((r) => r.error_code !== null);
  const stored = (results ?? []).reduce((n, r) => n + r.stored, 0);
  const tokenMissing = error instanceof ApiError && error.code === "github_token_missing";

  return (
    <div aria-live="polite" role="status">
      {tokenMissing && (
        <div style={s.notice}>
          {t("runs.errorCodes.github_token_missing")}{" "}
          <Link href="/settings/api-keys" style={s.link}>
            {t("settingsLink")}
          </Link>
        </div>
      )}
      {error && !tokenMissing && <div style={s.notice}>{t("runs.refreshFailed", { message: error.message })}</div>}
      {results && failed.length === 0 && <div style={s.ok}>{t("runs.refreshed", { count: stored })}</div>}
      {failed.length > 0 && (
        <ul style={s.list} aria-label={t("runs.refreshErrorsTitle")}>
          {failed.map((r) => {
            const code = r.error_code!;
            const key = SYNC_ERROR_KEYS[code];
            return (
              <li key={r.installation_id} style={s.notice}>
                <strong>{r.repo}</strong> {key ? t(key) : t("runs.errorCodes.unknown", { code })}
                {(code === "github_token_missing" || code === "github_scope_missing") && (
                  <>
                    {" "}
                    <Link href="/settings/api-keys" style={s.link}>
                      {t("settingsLink")}
                    </Link>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
