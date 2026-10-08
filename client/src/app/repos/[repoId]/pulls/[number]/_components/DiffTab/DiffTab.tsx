"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel, Button } from "@devdigest/ui";
import { DiffViewer, type DiffCommentApi, type DiffFindingApi } from "@/components/diff-viewer";
import {
  usePrComments,
  useCreatePrComment,
  usePrReviews,
  useFindingAction,
} from "@/lib/hooks/reviews";
import { usePrSmartDiff } from "@/lib/hooks/smart-diff";
import { notify } from "@/lib/toast";
import type { PrFile } from "@devdigest/shared";
import { diffTotals, findingsForSmartDiff, orderFilesByRole, type DiffOrder } from "./helpers";
import { DiffOrderToggle } from "./_components/DiffOrderToggle";
import { RoleGroup } from "./_components/RoleGroup";
import { useDiffTarget, type DiffTargetInput } from "./useDiffTarget";

interface DiffTabProps {
  prId: string | null;
  files: PrFile[];
  /** Inline commenting is offered only on open PRs (GitHub rejects otherwise). */
  canComment?: boolean;
  repoFullName?: string | null;
  headSha?: string | null;
  /** PrDetailHeader's measured sticky height — see page.tsx. */
  headerHeight?: number;
  /** Validated file (and line) to reveal — from the PR Brief or a shared URL. */
  target?: DiffTargetInput | null;
}

export function DiffTab({
  prId,
  files,
  canComment,
  repoFullName,
  headSha,
  headerHeight = 0,
  target: targetInput = null,
}: DiffTabProps) {
  const t = useTranslations("prReview");
  const tBrief = useTranslations("brief");
  const { data: comments } = usePrComments(prId);
  const create = useCreatePrComment(prId);
  const { data: reviews } = usePrReviews(prId);
  const { data: smartDiff, isLoading: smartDiffLoading, isError: smartDiffError } = usePrSmartDiff(prId);
  const action = useFindingAction();

  const allFindings = React.useMemo(() => (reviews ?? []).flatMap((r) => r.findings), [reviews]);
  const hasFindings = allFindings.length > 0;
  const noReviewYet = !!reviews && reviews.length === 0;

  // D10: while loading/on error, Smart order is unavailable — fall back to
  // Original order and disable the switch.
  const smartAvailable = !!smartDiff && !smartDiffLoading && !smartDiffError;
  const [order, setOrder] = React.useState<DiffOrder>("smart");
  const effectiveOrder: DiffOrder = smartAvailable ? order : "original";

  // D8: one switch for both GitHub comments and finding cards — defaults ON
  // once findings exist, off otherwise (a clean diff by default).
  const [showAnnotations, setShowAnnotations] = React.useState(false);
  React.useEffect(() => {
    if (hasFindings) setShowAnnotations(true);
  }, [hasFindings]);

  const commentCount = comments?.length ?? 0;
  const smartDiffFindings = smartDiff ? findingsForSmartDiff(smartDiff, allFindings) : [];
  const totals = diffTotals(files);
  const resolvedGroups = smartDiff ? orderFilesByRole(smartDiff.groups, files) : [];
  const smartFilesByRole = new Map((smartDiff?.groups ?? []).map((g) => [g.role, g.files]));

  // Held back while Smart Diff loads: its arrival swaps Original for Smart
  // order and would remount the cards the target just expanded.
  const target = useDiffTarget(
    targetInput,
    !smartDiffLoading,
    headerHeight,
    tBrief("card.lineNotInDiff", { line: targetInput?.line ?? 0 }),
  );

  const commenting: DiffCommentApi = {
    comments: comments ?? [],
    canComment: !!canComment && !!prId,
    showComments: showAnnotations,
    posting: create.isPending,
    onSubmit: async (input) => {
      try {
        return await create.mutateAsync(input);
      } catch (err) {
        notify.error(err instanceof Error ? err.message : t("smartDiff.commentPostError"));
        throw err;
      }
    },
  };

  const findingApi: DiffFindingApi = {
    findings: smartDiffFindings,
    showFindings: showAnnotations,
    pending: action.isPending,
    onAction: (findingId, act, reply) => {
      if (prId) action.mutate({ findingId, action: act, reply, prId });
    },
    repoFullName,
    headSha,
  };

  return (
    <section>
      <SectionLabel
        icon="Code"
        right={
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {commentCount + smartDiffFindings.length > 0 && (
              <Button
                kind="ghost"
                size="sm"
                icon={showAnnotations ? "EyeOff" : "Eye"}
                onClick={() => setShowAnnotations((v) => !v)}
              >
                {showAnnotations ? t("smartDiff.hideAnnotations") : t("smartDiff.showAnnotations")}
              </Button>
            )}
            <DiffOrderToggle order={effectiveOrder} onChange={setOrder} disabled={!smartAvailable} />
          </div>
        }
      >
        {t("smartDiff.totals", { files: totals.files, additions: totals.additions, deletions: totals.deletions })}
      </SectionLabel>

      {noReviewYet && <div style={{ marginBottom: 12, fontSize: 13, color: "var(--text-muted)" }}>{t("smartDiff.noReviewYet")}</div>}

      {effectiveOrder === "smart" && resolvedGroups.length > 0 ? (
        resolvedGroups.map((g) => (
          <RoleGroup
            key={g.role}
            role={g.role}
            smartFiles={smartFilesByRole.get(g.role) ?? []}
            files={g.files}
            commenting={commenting}
            findings={findingApi}
            stickyTop={headerHeight}
            target={target && g.files.some((f) => f.path === target.path) ? target : undefined}
          />
        ))
      ) : (
        <DiffViewer files={files} commenting={commenting} findings={findingApi} target={target ?? undefined} />
      )}
    </section>
  );
}
