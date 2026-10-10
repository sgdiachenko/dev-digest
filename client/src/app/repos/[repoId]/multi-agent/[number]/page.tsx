/* Route: /repos/:repoId/multi-agent/:number — results of the PR's latest
   multi-agent run. Thin: resolves the PR number to its id, wraps the container
   in the app shell. */
"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { usePulls } from "@/lib/hooks/core";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { MultiAgentResults } from "./_components/MultiAgentResults";

export default function MultiAgentResultsPage() {
  const t = useTranslations("multiAgentResults");
  const { repoId, number } = useParams<{ repoId: string; number: string }>();
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);
  const pulls = usePulls(repoId);
  const prId = pulls.data?.find((p) => p.number === Number(number))?.id ?? null;

  const crumb = [
    { label: activeRepo?.full_name ?? repoId, mono: true, href: `/repos/${repoId}/pulls` },
    { label: t("crumb"), href: `/repos/${repoId}/multi-agent` },
    { label: `#${number}`, mono: true },
  ];

  return (
    <AppShell crumb={crumb}>
      {repoNotFound ? (
        <RepoNotFound />
      ) : (
        <Suspense fallback={null}>
          <MultiAgentResults repoId={repoId} number={number} prId={prId} pullsLoading={pulls.isPending} />
        </Suspense>
      )}
    </AppShell>
  );
}
