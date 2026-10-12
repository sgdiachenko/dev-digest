/* UpdateResults — per-repository outcome of "Update CI config"; successful updates stay listed next to the
   failures (AC-78, AC-134). Announced politely (C10). */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import { needsSettings } from "../../helpers";
import type { UpdateResult } from "../../useUpdateCiConfig";
import { s } from "./styles";

export function UpdateResults({ results }: { results: UpdateResult[] | null }) {
  const t = useTranslations("ci");
  return (
    <div aria-live="polite" role="status">
      {results && (
        <ul style={s.list} aria-label={t("ciTab.update.heading")}>
          {results.map((r) => (
            <li key={r.repo} style={s.item}>
              {r.ok ? <Icon.CheckCircle size={14} style={{ color: "var(--ok)" }} /> : <Icon.XCircle size={14} style={{ color: "var(--crit)" }} />}
              <span className="mono" style={s.repo}>
                {r.repo}
              </span>
              {r.ok ? (
                <span>
                  {t("ciTab.update.success")}
                  {r.prUrl && (
                    <>
                      {" "}
                      <a href={r.prUrl} target="_blank" rel="noopener noreferrer" style={s.link}>
                        {t("ciTab.prLink")}
                      </a>
                    </>
                  )}
                </span>
              ) : (
                <span style={s.fail}>
                  {t("ciTab.update.failure", { message: r.message ?? "" })}
                  {needsSettings(r.code) && (
                    <>
                      {" "}
                      <Link href="/settings/api-keys" style={s.link}>
                        {t("settingsLink")}
                      </Link>
                    </>
                  )}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
