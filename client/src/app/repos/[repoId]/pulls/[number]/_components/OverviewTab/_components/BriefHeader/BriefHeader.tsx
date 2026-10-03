/* BriefHeader — the PR Brief card's header: title, Generate / Regenerate,
   provenance (or the model hint before the first brief), the Outdated note and
   inline errors. A failed generate never hides the previous brief (the caller
   keeps rendering it). Status changes are announced via a polite live region. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import type { PrBriefRecord } from "@devdigest/shared";
import type { BriefError } from "@/lib/hooks/brief";
import { formatBriefCost, relativeTime, shortSha } from "../../helpers";
import { s } from "./styles";

function formatAge(t: ReturnType<typeof useTranslations>, iso: string): string {
  const rel = relativeTime(iso);
  return rel.key === "justNow" ? t("card.relativeTime.justNow") : t(`card.relativeTime.${rel.key}`, { count: rel.count });
}

export type BriefStatus = "idle" | "pending" | "success" | "error";

export function BriefHeader({
  brief,
  modelLabel,
  status,
  error,
  onGenerate,
  compact = false,
}: {
  brief: PrBriefRecord | null | undefined;
  modelLabel: string;
  status: BriefStatus;
  error: BriefError | null;
  onGenerate: () => void;
  compact?: boolean;
}) {
  const t = useTranslations("brief");
  const pending = status === "pending";
  const announce =
    status === "pending" ? t("card.status.generating") : status === "success" ? t("card.status.generated") : status === "error" ? t("card.status.failed") : "";

  return (
    <div style={s.wrap}>
      <div style={{ ...s.row, ...(compact ? s.compactRow : {}) }}>
        {!compact && <h3 style={s.title}>{t("card.title")}</h3>}
        <div style={s.actions}>
          {!brief && modelLabel && <span style={s.meta}>{t("card.modelHint", { model: modelLabel })}</span>}
          <Button
            kind={brief ? "secondary" : "primary"}
            size="sm"
            icon={brief ? "RefreshCw" : "Sparkles"}
            disabled={pending}
            onClick={onGenerate}
            style={{ minHeight: 24, minWidth: 24 }}
          >
            {pending ? t("card.generating") : brief ? t("card.regenerate") : t("card.generate")}
          </Button>
        </div>
      </div>

      {!brief && (
        <>
          <p style={{ ...s.body, fontWeight: 600, color: "var(--text-primary)" }}>{t("card.empty.title")}</p>
          <p style={s.body}>{t("card.empty.body")}</p>
        </>
      )}

      {brief && (
        <div style={{ ...s.meta, ...(compact ? s.compactMeta : {}) }}>
          {t("card.provenance", {
            when: formatAge(t, brief.generated_at),
            sha: shortSha(brief.head_sha),
            model: brief.model,
            cost: formatBriefCost(brief.cost_usd, t("card.costNotReported")),
          })}
          {brief.stale && <span style={{ marginLeft: 10, color: "var(--warn)" }}>{t("card.outdated")}</span>}
        </div>
      )}

      {error && !pending && <BriefErrorLine error={error} onRetry={onGenerate} />}

      <span role="status" aria-live="polite" style={s.srOnly}>
        {announce}
      </span>
    </div>
  );
}

function BriefErrorLine({ error, onRetry }: { error: BriefError; onRetry: () => void }) {
  const t = useTranslations("brief");
  if (error.kind === "missing_key") {
    return (
      <div style={s.error}>
        <span>{t("card.error.missingKey", { provider: error.provider ?? "" })}</span>
        <Link href="/settings/api-keys" style={s.link}>
          {t("card.error.apiKeysLink")}
        </Link>
        <Link href="/settings/models" style={s.link}>
          {t("card.error.modelsLink")}
        </Link>
      </div>
    );
  }
  if (error.kind === "rate_limited") {
    return (
      <div style={s.error}>
        <span>{t("card.error.rateLimited")}</span>
      </div>
    );
  }
  const key = error.kind === "other" ? "generic" : error.kind;
  return (
    <div style={s.error}>
      <span>{t(`card.error.${key}`)}</span>
      <Button kind="secondary" size="sm" onClick={onRetry} style={{ minHeight: 24, minWidth: 24 }}>
        {t("card.retry")}
      </Button>
    </div>
  );
}
