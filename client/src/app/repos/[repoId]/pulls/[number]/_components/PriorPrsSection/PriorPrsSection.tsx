/* PriorPrsSection — "Prior PRs touching these files" (P3/E5). Collapsible,
   defaults CLOSED (1:1 pattern with IntentCard's sourcesOpen/BlastSymbolGroup's
   toggle) — `usePrHistory` only fires once expanded, so opening the PR page
   never pays for the GitHub reads behind `GET /pulls/:id/history`. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { EmptyState, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import { usePrHistory } from "@/lib/hooks/pr-history";
import { githubPrUrl } from "@/lib/github-urls";
import { s } from "./styles";

export function PriorPrsSection({
  prId,
  repoFullName,
}: {
  prId: string | null | undefined;
  repoFullName?: string | null;
}) {
  const t = useTranslations("pr-history");
  const [open, setOpen] = React.useState(false);
  const bodyId = React.useId();
  const { data, isLoading, isError, refetch } = usePrHistory(prId, { enabled: open });

  return (
    <div style={s.section}>
      <button
        type="button"
        style={s.toggleRow}
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon.ChevronDown
          size={14}
          style={{
            ...s.chevron,
            transform: open ? "rotate(0deg)" : "rotate(-90deg)",
            transition: "transform .12s",
          }}
        />
        <span style={s.title}>{t("title")}</span>
        {data && <span style={s.count}>{t("toggle", { count: data.history.length })}</span>}
      </button>

      {open && (
        <div id={bodyId} style={s.body}>
          {isLoading && <Skeleton height={40} />}
          {isError && <ErrorState title={t("error.title")} onRetry={() => refetch()} />}
          {data && data.history.length === 0 && <EmptyState icon="History" title={t("empty")} />}
          {data && data.history.length > 0 && (
            <div style={s.list}>
              {data.history.map((item) => (
                <div key={item.pr_number} style={s.row}>
                  {repoFullName ? (
                    <a
                      className="mono"
                      href={githubPrUrl(repoFullName, item.pr_number)}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={s.link}
                    >
                      #{item.pr_number}
                    </a>
                  ) : (
                    <span className="mono" style={s.link}>
                      #{item.pr_number}
                    </span>
                  )}
                  <span style={s.rowTitle}>{item.title}</span>
                  <span style={s.rowMeta}>{t("mergedBy", { author: item.author })}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
