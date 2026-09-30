/* ContextTab — attach Project Context documents to a skill (every agent using it inherits them).
   Repo is chosen locally (defaults to the active repo); the PUT carries the full list, so other
   repos' attachments are preserved via mergeForPut. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Skeleton } from "@devdigest/ui";
import { AttachList, BudgetMeter, mergeForPut, ownForRepo, rowsFor } from "@/components/context-attachments";
import { useContextCatalog, useSetSkillContext, useSkillContext } from "@/lib/hooks/context";
import { useRepos } from "@/lib/hooks/core";
import { useActiveRepo } from "@/lib/repo-context";
import type { ContextAttachmentRef } from "@/lib/types";
import { s } from "./styles";

export function ContextTab({ skillId }: { skillId: string }) {
  const t = useTranslations("context");
  const { repoId: activeRepoId } = useActiveRepo();
  const { data: repos = [], isLoading: reposLoading } = useRepos();
  const [picked, setPicked] = React.useState<string | null>(null);
  const repoId = picked ?? activeRepoId ?? repos[0]?.id ?? null;

  const catalog = useContextCatalog(repoId);
  const view = useSkillContext(skillId, repoId);
  const mutation = useSetSkillContext(skillId, repoId);
  const [saved, setSaved] = React.useState(false);
  const failedBody = React.useRef<ContextAttachmentRef[] | null>(null);

  const save = (body: ContextAttachmentRef[]) => {
    setSaved(false);
    failedBody.current = body;
    mutation.mutate(body, {
      onSuccess: () => {
        failedBody.current = null;
        setSaved(true);
      },
    });
  };

  if (reposLoading) return <Skeleton height={120} />;
  if (!repoId) {
    return (
      <div style={s.state}>
        <span style={s.stateTitle}>{t("attachments.noRepo.title")}</span>
        <span style={s.stateBody}>{t("attachments.noRepo.body")}</span>
      </div>
    );
  }

  const cat = catalog.data;
  const own = view.data?.own ?? [];
  const rows = rowsFor(cat?.files ?? [], own, repoId);
  const skipped = ownForRepo(own, repoId)
    .filter((d) => d.would_skip)
    .map((d) => d.path);

  let body: React.ReactNode;
  if (catalog.isError || view.isError) {
    body = (
      <div role="alert" style={s.state}>
        <span style={s.stateTitle}>{t(view.isError ? "attachments.loadError" : "loadError")}</span>
        <button
          type="button"
          style={s.link}
          onClick={() => {
            if (catalog.isError) void catalog.refetch();
            if (view.isError) void view.refetch();
          }}
        >
          {t("retry")}
        </button>
      </div>
    );
  } else if (cat?.status === "not_cloned" && rows.length === 0) {
    body = (
      <div style={s.state}>
        <span style={s.stateTitle}>{t("attachments.noClone.title")}</span>
        <span style={s.stateBody}>{t("attachments.noClone.body")}</span>
      </div>
    );
  } else if (cat?.status === "scanning" && rows.length === 0) {
    body = (
      <div style={s.state}>
        <span style={s.stateTitle}>{t("scanning.title")}</span>
        <span style={s.stateBody}>{t("scanning.body")}</span>
      </div>
    );
  } else {
    body = (
      <>
        <AttachList
          rows={rows}
          loading={catalog.isLoading || view.isLoading}
          pending={mutation.isPending}
          status={saved && !mutation.isError ? "saved" : "idle"}
          error={mutation.isError}
          catalogRef={{ branch: cat?.branch ?? null, sha: cat?.scanned_sha ?? null }}
          onCommit={(ordered) => save(mergeForPut(own, repoId, ordered))}
          onRetry={() => failedBody.current && save(failedBody.current)}
          previewHref={(path) => `/repos/${repoId}/context?doc=${encodeURIComponent(path)}`}
        />
        {view.data && (
          <>
            <BudgetMeter
              total={view.data.total_est_tokens}
              budget={view.data.budget_tokens}
              overBudget={view.data.over_budget}
              skippedPaths={skipped}
            />
            <section style={s.serialized} aria-label={t("attachments.skill.serializedTitle")}>
              <div style={s.serializedHead}>
                <span>{t("attachments.skill.serializedTitle")}</span>
                {view.data.serialized !== "" && (
                  <span className="tnum">{t("attachments.skill.serializedTokens", { count: view.data.serialized_est_tokens })}</span>
                )}
              </div>
              {view.data.serialized === "" ? (
                <div style={s.empty}>{t("attachments.skill.serializedEmpty")}</div>
              ) : (
                <pre style={s.pre}>{view.data.serialized}</pre>
              )}
            </section>
          </>
        )}
      </>
    );
  }

  return (
    <div style={s.wrap}>
      <h3 style={s.title}>{t("attachments.title")}</h3>
      <p style={s.hint}>{t("attachments.skillHint")}</p>
      <p style={s.hint}>{t("attachments.skill.agentsNote")}</p>
      <label style={s.repoRow}>
        <span>{t("attachments.repoLabel")}</span>
        <select
          value={repoId}
          onChange={(e) => {
            setPicked(e.target.value);
            setSaved(false);
            failedBody.current = null;
            mutation.reset();
          }}
          style={s.select}
        >
          {repos.map((r) => (
            <option key={r.id} value={r.id}>
              {r.full_name}
            </option>
          ))}
        </select>
      </label>
      {body}
    </div>
  );
}
