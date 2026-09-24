/* OutsideDiffFindings — footer list for findings whose start_line isn't in
   the currently rendered patch (an older round, or a re-diffed file).
   Modeled on OutdatedComments. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { FindingActionKind, FindingRecord } from "@devdigest/shared";
import { FindingCard } from "@/components/finding-card/FindingCard";
import { cs } from "../comments";

export function OutsideDiffFindings({
  findings,
  pending,
  onAction,
  repoFullName,
  headSha,
}: {
  findings: FindingRecord[];
  pending?: boolean;
  onAction?: (findingId: string, action: FindingActionKind, reply?: string) => void;
  repoFullName?: string | null;
  headSha?: string | null;
}) {
  const t = useTranslations("prReview");
  if (findings.length === 0) return null;
  return (
    <div style={cs.outdatedWrap}>
      <span style={cs.outdatedTitle}>{t("smartDiff.outsideDiffTitle", { count: findings.length })}</span>
      {findings.map((f) => (
        <FindingCard
          key={f.id}
          f={f}
          pending={pending}
          repoFullName={repoFullName}
          headSha={headSha}
          onAction={(action, reply) => onAction?.(f.id, action, reply)}
        />
      ))}
    </div>
  );
}
