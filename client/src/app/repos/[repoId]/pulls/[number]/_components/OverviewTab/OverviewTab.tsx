"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Card, SectionLabel } from "@devdigest/ui";
import type { ReviewRecord, Verdict } from "@devdigest/shared";
import { usePrBrief, useGenerateBrief, briefErrorOf } from "@/lib/hooks/brief";
import { useSettings } from "@/lib/hooks/core";
import { IntentCard } from "../IntentCard";
import { BlastRadiusCard } from "../BlastRadiusCard";
import { VerdictBanner } from "../VerdictBanner";
import { BriefHeader, type BriefStatus } from "./_components/BriefHeader";
import { BriefSummary } from "./_components/BriefSummary";
import { BriefMissingInputs } from "./_components/BriefMissingInputs";
import { BriefSkeleton } from "./_components/BriefSkeleton";
import { RiskAreas } from "./_components/RiskAreas";
import { ReviewFocus } from "./_components/ReviewFocus";
import { riskModelLabel } from "./helpers";
import { s } from "./styles";
import styles from "./OverviewTab.module.css";

interface OverviewTabProps {
  prId: string | null | undefined;
  repoId: string;
  prBody: string | null | undefined;
  /** Repo/commit coordinates used to link blast-radius files to GitHub. */
  repo?: { fullName?: string | null; headSha?: string | null };
  /** Paths of the PR's changed files — decides which refs are navigable. */
  changedFiles: string[];
  /** Newest review of the PR (drives the verdict banner), or null. */
  latestReview: ReviewRecord | null;
  /** Jump to the Files changed tab at a file (and line, when known). */
  onOpenFile: (path: string, line: number | null) => void;
}

export function OverviewTab({
  prId,
  repoId,
  prBody,
  repo,
  changedFiles,
  latestReview,
  onOpenFile,
}: OverviewTabProps) {
  const t = useTranslations("brief");
  const { data: brief, isLoading, isError, refetch } = usePrBrief(prId);
  const generate = useGenerateBrief(prId);
  const { data: settings } = useSettings();

  const pending = generate.isPending;
  const status: BriefStatus = pending ? "pending" : generate.isError ? "error" : generate.isSuccess ? "success" : "idle";
  const error = generate.isError ? briefErrorOf(generate.error) : null;
  const busy = isLoading || pending; // skeleton in place of Risk areas / Review focus
  const showBanner = latestReview?.verdict != null;

  return (
    <div className={styles.root}>
      <section aria-label={t("card.title")}>
        <SectionLabel icon="FileText">{t("card.title")}</SectionLabel>
        <Card style={s.briefCard}>
          {showBanner && latestReview && (
            <VerdictBanner
              embedded
              verdict={latestReview.verdict as Verdict}
              summary={latestReview.summary}
              score={latestReview.score}
              findingsCount={latestReview.findings.length}
              blockers={latestReview.findings.filter((f) => f.severity === "CRITICAL" && !f.dismissed_at).length}
              agentName={latestReview.agent_name}
            />
          )}
          {isError ? (
            <div style={s.loadFailed}>
              <span>{t("card.error.loadFailed")}</span>
              <Button kind="secondary" size="sm" onClick={() => refetch()}>
                {t("card.retry")}
              </Button>
            </div>
          ) : isLoading ? (
            <BriefSkeleton />
          ) : (
            <>
              <BriefHeader
                compact
                brief={brief}
                modelLabel={riskModelLabel(settings)}
                status={status}
                error={error}
                onGenerate={() => generate.mutate()}
              />
              {brief && <BriefSummary summary={brief.summary} />}
              {brief && <BriefMissingInputs missing={brief.missing_inputs} repoId={repoId} />}
            </>
          )}
        </Card>
      </section>

      <div style={s.columns}>
        <IntentCard prId={prId}>
          {busy ? (
            <BriefSkeleton />
          ) : brief ? (
            <RiskAreas risks={brief.risks.risks} changedFiles={changedFiles} onOpenFile={onOpenFile} />
          ) : null}
        </IntentCard>
        <BlastRadiusCard prId={prId} repoId={repoId} repoFullName={repo?.fullName} headSha={repo?.headSha} />
      </div>

      {busy ? (
        <section>
          <SectionLabel icon="Target">{t("card.reviewFocus.title")}</SectionLabel>
          <Card>
            <BriefSkeleton />
          </Card>
        </section>
      ) : brief ? (
        <ReviewFocus items={brief.review_focus} onOpenFile={onOpenFile} />
      ) : null}

      {prBody && (
        <section>
          <SectionLabel icon="MessageSquare">Description</SectionLabel>
          <div style={s.descriptionBox}>{prBody}</div>
        </section>
      )}
    </div>
  );
}
