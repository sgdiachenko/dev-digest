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
import { COLLAPSED_BY_DEFAULT } from "./constants";
import { diffTotals, findingsForSmartDiff, orderFilesByRole, type DiffOrder } from "./helpers";
import { DiffOrderToggle } from "./_components/DiffOrderToggle";
import { RoleGroup } from "./_components/RoleGroup";

interface DiffTabProps {
  prId: string | null;
  filesCount: number;
  files: PrFile[];
  /** Inline commenting is offered only on open PRs (GitHub rejects otherwise). */
  canComment?: boolean;
  repoFullName?: string | null;
  headSha?: string | null;
  /** PrDetailHeader's measured sticky height — see page.tsx. */
  headerHeight?: number;
}

export function DiffTab({
  prId,
  files,
  canComment,
  repoFullName,
  headSha,
  headerHeight = 0,
}: DiffTabProps) {
  const t = useTranslations("prReview");
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
            defaultCollapsed={!!COLLAPSED_BY_DEFAULT[g.role]}
            commenting={commenting}
            findings={findingApi}
            stickyTop={headerHeight}
          />
        ))
      ) : (
        <DiffViewer files={files} commenting={commenting} findings={findingApi} />
      )}
    </section>
  );
}
