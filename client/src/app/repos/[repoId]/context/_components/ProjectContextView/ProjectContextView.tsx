"use client";

import React from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { ApiError } from "@/lib/api";
import { useContextCatalog, useContextDoc, useRescanContext } from "@/lib/hooks/context";
import { useRefreshRepo } from "@/lib/hooks";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import type { ContextCategory } from "@/lib/types";
import { SKELETON_ROWS } from "./constants";
import { filterDocs, isNoMatch, parseViewState, toSearch, type ViewState } from "./helpers";
import { s } from "./styles";
import { CatalogFilters } from "./_components/CatalogFilters";
import { CatalogFooter } from "./_components/CatalogFooter";
import { DocPreview } from "./_components/DocPreview";
import { DocRow } from "./_components/DocRow";

/** Read-only Project Context page: catalog list + preview. Filters and the selected doc live in the URL. */
export function ProjectContextView() {
  const t = useTranslations("context");
  const { repoId } = useParams<{ repoId: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);
  const refresh = useRefreshRepo();
  const rescan = useRescanContext(repoId);
  const catalog = useContextCatalog(repoId, { pollNotCloned: refresh.isSuccess });
  const data = catalog.data;
  const view = parseViewState(search);
  const docQuery = useContextDoc(repoId, view.doc, data?.scanned_sha);

  const navigate = (next: ViewState) => {
    const qs = toSearch(next);
    router.replace(`/repos/${repoId}/context${qs ? `?${qs}` : ""}`);
  };
  const toggleCategory = (cat: ContextCategory) =>
    navigate({
      ...view,
      cats: view.cats.includes(cat) ? view.cats.filter((c) => c !== cat) : [...view.cats, cat],
    });
  const doRescan = () => rescan.mutate();

  const crumb = [{ label: activeRepo?.full_name ?? repoId, mono: true }, { label: t("title") }];
  if (repoNotFound) {
    return (
      <AppShell crumb={crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  const files = data?.files ?? [];
  const filtered = filterDocs(files, view.q, view.cats);
  const scanning = data?.status === "scanning" || rescan.isPending;
  const failure = data?.status === "error" ? data.error : null;
  const rescanFailure = rescan.isError
    ? rescan.error instanceof ApiError
      ? rescan.error.message
      : String(rescan.error)
    : null;

  let list: React.ReactNode;
  if (catalog.isPending) {
    list = (
      <div style={s.loadingStack}>
        {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
          <Skeleton key={i} height={28} />
        ))}
      </div>
    );
  } else if (!data) {
    list = <ErrorState title={t("loadError")} onRetry={() => catalog.refetch()} />;
  } else if (data.status === "not_cloned") {
    list = (
      <EmptyState
        icon="GitBranch"
        title={t("notCloned.title")}
        body={t("notCloned.body")}
        cta={refresh.isPending ? t("notCloned.resyncing") : t("notCloned.resync")}
        ctaLoading={refresh.isPending}
        onCta={() => refresh.mutate(repoId)}
      />
    );
  } else if (files.length === 0 && data.status === "scanning") {
    list = <EmptyState icon="RefreshCw" title={t("scanning.title")} body={t("scanning.body")} />;
  } else if (files.length === 0) {
    list = failure ? null : (
      <EmptyState
        icon="FileText"
        title={t("empty.title")}
        body={t("empty.body")}
        cta={scanning ? t("rescanning") : t("rescan")}
        ctaLoading={scanning}
        onCta={doRescan}
      />
    );
  } else {
    list = (
      <>
        <CatalogFilters
          q={view.q}
          cats={view.cats}
          onQuery={(q) => navigate({ ...view, q })}
          onToggleCategory={toggleCategory}
        />
        {isNoMatch(files, filtered) ? (
          <EmptyState
            title={t("noMatch.title")}
            cta={t("noMatch.clear")}
            onCta={() => navigate({ q: "", cats: [], doc: view.doc })}
          />
        ) : (
          <ul aria-label={t("listLabel")} style={s.list}>
            {filtered.map((doc) => (
              <DocRow
                key={doc.path}
                doc={doc}
                selected={doc.path === view.doc}
                onSelect={(path) => navigate({ ...view, doc: path })}
              />
            ))}
          </ul>
        )}
        {data.truncated && <div style={s.note}>{t("truncated", { total: data.total_files })}</div>}
      </>
    );
  }

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        <div style={s.pageHeader}>
          <h1 style={s.pageTitle}>{t("title")}</h1>
          <p style={s.pageSubtitle}>{t("subtitle")}</p>
        </div>
        <div style={s.layout}>
          <div style={s.card}>
            {catalog.isError && data && (
              <div role="alert" style={s.banner("error")}>
                <span>{t("loadError")}</span>
                <button type="button" onClick={() => catalog.refetch()}>
                  {t("retry")}
                </button>
              </div>
            )}
            {failure && (
              <div role="alert" style={s.banner("error")}>
                <span>{t("scanError", { reason: failure })}</span>
                <button type="button" onClick={doRescan}>
                  {t("retry")}
                </button>
              </div>
            )}
            {rescanFailure && (
              <div role="alert" style={s.banner("error")}>
                <span>{t("rescanError", { reason: rescanFailure })}</span>
              </div>
            )}
            {list}
            {data && data.status !== "not_cloned" && (
              <CatalogFooter
                totalFiles={data.total_files}
                scannedAt={data.scanned_at}
                branch={data.branch}
                sha={data.scanned_sha}
                scanning={scanning}
                onRescan={doRescan}
              />
            )}
          </div>
          <div style={s.previewCard}>
            {view.doc ? (
              <DocPreview
                query={docQuery}
                scanRef={{ branch: data?.branch ?? null, sha: data?.scanned_sha ?? null }}
                rescanning={scanning}
                onRescan={doRescan}
                onBack={() => navigate({ ...view, doc: null })}
              />
            ) : (
              <p style={s.pageSubtitle}>{t("preview.selectPrompt")}</p>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
