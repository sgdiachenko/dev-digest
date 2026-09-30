/* ContextTab — attach Project Context documents to an agent (order = budget priority).
   Every write PUTs the FULL ordered list across all repos (`mergeForPut`); the selected repo
   only decides which slice the list edits and which repo the budget is computed for. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { useAgentContext, useContextCatalog, useSetAgentContext } from "@/lib/hooks/context";
import { useActiveRepo } from "@/lib/repo-context";
import type { ContextAttachmentRef } from "@/lib/types";
import { AttachList, BudgetMeter, mergeForPut, rowsFor } from "@/components/context-attachments";
import { InheritedSection } from "./_components/InheritedSection";
import { s } from "./styles";

/** Per-repo body, keyed by repo in the parent so the save state never leaks between repos. */
function RepoContext({ agentId, repoId }: { agentId: string; repoId: string }) {
  const t = useTranslations("context");
  const catalog = useContextCatalog(repoId);
  const view = useAgentContext(agentId, repoId);
  const save = useSetAgentContext(agentId, repoId);
  const [failedBody, setFailedBody] = React.useState<ContextAttachmentRef[] | null>(null);

  const contextHref = `/repos/${repoId}/context`;
  const contextLink = (
    <Link href={contextHref} style={s.link}>
      {t("title")}
    </Link>
  );

  if (catalog.isError || view.isError) {
    return (
      <ErrorState
        title={t("attachments.loadError")}
        onRetry={() => {
          if (catalog.isError) catalog.refetch();
          if (view.isError) view.refetch();
        }}
      />
    );
  }
  if (catalog.isLoading || view.isLoading || !catalog.data || !view.data) return <Skeleton height={180} />;

  const { data: cat } = catalog;
  const { data: ctx } = view;
  if (cat.status === "not_cloned") {
    return (
      <>
        <EmptyState title={t("attachments.noClone.title")} body={t("attachments.noClone.body")} />
        {contextLink}
      </>
    );
  }

  const rows = rowsFor(cat.files, ctx.own, repoId);
  if (rows.length === 0) {
    return (
      <>
        <EmptyState
          title={cat.status === "scanning" ? t("scanning.title") : t("attachments.noCatalog.title")}
          body={cat.status === "scanning" ? t("scanning.body") : t("attachments.noCatalog.body")}
        />
        {contextLink}
      </>
    );
  }

  const ownRefs = ctx.own.map((d) => ({ repo_id: d.repo_id, path: d.path }));
  const commit = (body: ContextAttachmentRef[]) => {
    setFailedBody(body);
    save.mutate(body);
  };
  const skippedPaths = rows.filter((r) => r.would_skip).map((r) => r.path);

  return (
    <>
      <AttachList
        rows={rows}
        pending={save.isPending}
        status={save.isSuccess ? "saved" : "idle"}
        error={save.isError}
        catalogRef={{ branch: cat.branch, sha: cat.scanned_sha }}
        onCommit={(ordered) => commit(mergeForPut(ownRefs, repoId, ordered))}
        onRetry={() => failedBody && commit(failedBody)}
        previewHref={(path) => `${contextHref}?doc=${encodeURIComponent(path)}`}
      />
      <BudgetMeter
        total={ctx.total_est_tokens}
        budget={ctx.budget_tokens}
        overBudget={ctx.over_budget}
        skippedPaths={skippedPaths}
      />
      {ownRefs.length >= 20 && <div style={s.muted}>{t("attachments.maxDocs", { max: 20 })}</div>}
      <InheritedSection docs={ctx.inherited} />
      <div style={s.footer}>{t("attachments.footer")}</div>
    </>
  );
}

export function ContextTab({ agentId }: { agentId: string }) {
  const t = useTranslations("context");
  const { repoId: activeId, repos } = useActiveRepo();
  const [picked, setPicked] = React.useState<string | null>(null);
  const repoId = picked ?? activeId;

  return (
    <div style={s.wrap}>
      <h2 style={s.h2}>{t("attachments.title")}</h2>
      <p style={s.hint}>{t("attachments.agentHint")}</p>
      {repos.length > 0 && (
        <label style={s.repoRow}>
          {t("attachments.repoLabel")}
          <select value={repoId ?? ""} onChange={(e) => setPicked(e.target.value)} style={s.select}>
            {repos.map((r) => (
              <option key={r.id} value={r.id}>
                {r.full_name}
              </option>
            ))}
          </select>
        </label>
      )}
      {repoId ? (
        <RepoContext key={repoId} agentId={agentId} repoId={repoId} />
      ) : (
        <EmptyState title={t("attachments.noRepo.title")} body={t("attachments.noRepo.body")} />
      )}
    </div>
  );
}
