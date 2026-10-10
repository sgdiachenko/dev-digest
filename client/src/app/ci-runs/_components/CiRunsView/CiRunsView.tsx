/* CiRunsView — /ci-runs: stored CI runs, newest first, refreshed from GitHub only on demand (AC-79–AC-83, AC-97, AC-102).
   No auto-refresh and no filters. Rows stay visible while a Refresh is in flight. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { CI_LIMITS } from "@devdigest/shared";
import { AppShell } from "@/components/app-shell";
import { useCiRuns, useRefreshCiRuns } from "@/lib/hooks/ci";
import { CiRunRow } from "../CiRunRow";
import { RefreshResults } from "../RefreshResults";
import { COLUMNS } from "./constants";
import { s } from "./styles";

export function CiRunsView() {
  const t = useTranslations("ci");
  const router = useRouter();
  const runs = useCiRuns(CI_LIMITS.RUNS_PAGE_MAX);
  const refresh = useRefreshCiRuns();
  const crumb = [{ label: t("page.crumbLab") }, { label: t("page.crumb") }];
  const rows = runs.data ?? [];

  let body: React.ReactNode;
  if (runs.isLoading) {
    body = (
      <div style={s.skeletons} aria-busy="true" aria-label={t("runs.loading")}>
        <Skeleton height={40} />
        <Skeleton height={56} />
        <Skeleton height={56} />
      </div>
    );
  } else if (runs.isError && !runs.data) {
    body = <ErrorState title={t("runs.loadFailed")} body={t("runs.loadFailedBody")} onRetry={() => void runs.refetch()} />;
  } else if (rows.length === 0) {
    body = (
      <EmptyState
        icon="Workflow"
        title={t("runs.emptyTitle")}
        body={t("runs.emptyBody")}
        cta={t("runs.emptyCta")}
        onCta={() => router.push("/agents")}
      />
    );
  } else {
    body = (
      <div style={s.scroller}>
        <table style={s.table} aria-label={t("runs.title")}>
          <colgroup>
            {COLUMNS.map((c) => (
              <col key={c.key} style={{ width: c.width }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {COLUMNS.map((c) => (
                <th key={c.key} scope="col" style={s.th}>
                  {t(c.labelKey)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((run) => (
              <CiRunRow key={run.id} run={run} />
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        <div style={s.header}>
          <div>
            <h1 style={s.title}>{t("runs.title")}</h1>
            <p style={s.subtitle}>{t("runs.subtitle")}</p>
          </div>
          <div style={s.actions}>
            <Button
              kind="secondary"
              size="sm"
              icon="RefreshCw"
              loading={refresh.isPending}
              onClick={() => refresh.mutate()}
            >
              {refresh.isPending ? t("runs.refreshing") : t("runs.refresh")}
            </Button>
          </div>
        </div>
        <RefreshResults results={refresh.data?.results ?? null} error={refresh.error} />
        {body}
      </div>
    </AppShell>
  );
}
