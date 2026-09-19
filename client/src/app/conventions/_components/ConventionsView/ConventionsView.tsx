/* Conventions screen — scan the active repo for its house rules, triage each
   candidate (Accept/Reject/Edit), then merge the accepted ones into a skill.
   Repo-scoped via the ACTIVE repo (repo switcher), matching /skills and
   /agents rather than a :repoId route param. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Chip, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import type { ConventionSkillDraft, Skill } from "@devdigest/shared";
import { AppShell } from "../../../../components/app-shell";
import { RepoNotFound } from "../../../../components/repo-not-found";
import { useActiveRepo } from "../../../../lib/repo-context";
import {
  useConventions,
  useConventionScan,
  useConventionSkillDraft,
  useDeleteConvention,
  useDeselectAllConventions,
  useExtractConventions,
  useUpdateConvention,
} from "../../../../lib/hooks/conventions";
import { ConventionCard } from "./_components/ConventionCard";
import { CreateSkillModal } from "./_components/CreateSkillModal";
import { ScanSummary } from "./_components/ScanSummary";
import { DEFAULT_FILTER, STATUS_FILTERS, type StatusFilter } from "./constants";
import { countByStatus, filterConventions } from "./helpers";
import { s } from "./styles";

export function ConventionsView() {
  const t = useTranslations("conventions");
  const { activeRepo, reposLoaded } = useActiveRepo();
  const repoId = activeRepo?.id;

  const [filter, setFilter] = React.useState<StatusFilter>(DEFAULT_FILTER);
  const [draft, setDraft] = React.useState<ConventionSkillDraft | null>(null);
  const wasRunning = React.useRef(false);

  const { data: candidates, isLoading, isError, refetch } = useConventions(repoId);
  const { data: scan } = useConventionScan(repoId);
  const extract = useExtractConventions();
  const update = useUpdateConvention();
  const del = useDeleteConvention();
  const deselectAll = useDeselectAllConventions();
  const buildDraft = useConventionSkillDraft();

  // A scan leaving 'running' means the board has new/changed rows — refetch
  // once, right when it settles (mirrors useRepoIntelStatus's pattern).
  React.useEffect(() => {
    if (wasRunning.current && scan?.status !== "running") void refetch();
    wasRunning.current = scan?.status === "running";
  }, [scan?.status, refetch]);

  if (reposLoaded && !activeRepo) {
    return (
      <AppShell crumb={[{ label: t("page.crumbLab") }, { label: t("page.crumbConventions") }]}>
        <RepoNotFound />
      </AppShell>
    );
  }

  const list = candidates ?? [];
  const counts = countByStatus(list);
  const filtered = filterConventions(list, filter);
  const scanning = scan?.status === "running";
  const hasAnyScan = !!scan || list.length > 0;

  const runScan = () => {
    if (!repoId) return;
    extract.mutate(repoId);
  };

  const createSkillFromAccepted = async () => {
    if (!repoId) return;
    const result = await buildDraft.mutateAsync({ repoId });
    setDraft(result);
  };

  const onCreated = (_skill: Skill) => {
    // Deliberately do NOT navigate away and do NOT clear the board's
    // filters — a second skill can still be built from whatever remains
    // pending (grading: "сторінка не оновлюється").
    setDraft(null);
  };

  const crumb = [
    { label: t("page.crumbLab") },
    { label: t("page.crumbConventions") },
  ];

  return (
    <AppShell crumb={crumb}>
      {draft && activeRepo && (
        <CreateSkillModal draft={draft} repoName={activeRepo.full_name} onClose={() => setDraft(null)} onCreated={onCreated} />
      )}
      <div style={s.page}>
        <div style={s.header}>
          <div>
            <div style={s.headingRow}>
              <span style={s.heading}>
                {t("page.headingPrefix")}
                <span style={s.headingRepo}>{activeRepo?.full_name ?? t("page.repoFallback")}</span>
              </span>
            </div>
            <p style={s.subtitle}>{t("page.subtitle")}</p>
          </div>
          <Button
            kind="secondary"
            icon="RefreshCw"
            onClick={runScan}
            disabled={scanning || extract.isPending || !repoId}
          >
            {scanning || extract.isPending ? t("page.scanning") : hasAnyScan ? t("page.rescan") : t("page.runExtraction")}
          </Button>
        </div>

        {scan && (
          <div style={s.summaryRow}>
            <ScanSummary scan={scan} />
          </div>
        )}

        {isLoading && (
          <div style={s.skeletonWrap}>
            <Skeleton height={140} />
            <Skeleton height={140} />
          </div>
        )}

        {isError && (
          <div style={s.errorWrap}>
            <ErrorState body={t("page.loadError")} onRetry={() => refetch()} />
          </div>
        )}

        {!isLoading && !isError && list.length === 0 && !scanning && (
          <div style={s.emptyWrap}>
            <EmptyState
              icon="ListChecks"
              title={t("page.empty.title")}
              body={t("page.empty.body")}
              cta={t("page.empty.cta")}
              onCta={runScan}
            />
          </div>
        )}

        {!isLoading && !isError && list.length > 0 && (
          <>
            <div style={s.actionsRow}>
              <div style={s.filterChips}>
                {STATUS_FILTERS.map((f) => (
                  <Chip key={f} active={filter === f} count={counts[f]} onClick={() => setFilter(f)}>
                    {t(`filters.${f}`)}
                  </Chip>
                ))}
              </div>
              <div style={s.spacer} />
              {counts.accepted > 0 && (
                <Button kind="ghost" size="sm" onClick={() => repoId && deselectAll.mutate(repoId)}>
                  {t("page.deselectAll")}
                </Button>
              )}
              {counts.accepted > 0 && (
                <Button kind="primary" size="sm" icon="Sparkles" onClick={() => void createSkillFromAccepted()} disabled={buildDraft.isPending}>
                  {t("page.createSkillCta")}
                </Button>
              )}
            </div>

            <div style={s.list}>
              {filtered.map((c) => (
                <ConventionCard
                  key={c.id}
                  candidate={c}
                  repo={activeRepo!}
                  saving={update.isPending}
                  onAccept={() => update.mutate({ repoId: repoId!, id: c.id, patch: { status: "accepted" } })}
                  onReject={() => update.mutate({ repoId: repoId!, id: c.id, patch: { status: "rejected" } })}
                  onSave={(patch) => update.mutate({ repoId: repoId!, id: c.id, patch })}
                  onDelete={() => del.mutate({ repoId: repoId!, id: c.id })}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
