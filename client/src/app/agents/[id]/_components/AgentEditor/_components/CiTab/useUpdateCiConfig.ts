/* useUpdateCiConfig — "Update CI config": runs the PR install for every installation of the agent with
   that installation's stored triggers and post mode, and keeps one result per repository (AC-77, AC-78, AC-134). */
"use client";

import React from "react";
import type { CiInstallation } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import { useExportCi } from "@/lib/hooks/ci";

export interface UpdateResult {
  repo: string;
  ok: boolean;
  prUrl: string | null;
  message: string | null;
  code: string | undefined;
}

export function useUpdateCiConfig(agentId: string) {
  const exportCi = useExportCi(agentId);
  const [results, setResults] = React.useState<UpdateResult[] | null>(null);
  const [running, setRunning] = React.useState(false);

  const run = async (installations: CiInstallation[]) => {
    setRunning(true);
    setResults(null);
    const out = await Promise.all(
      installations.map(async (inst): Promise<UpdateResult> => {
        try {
          const res = await exportCi.mutateAsync({
            repo: inst.repo,
            target: "gha",
            action: "open_pr",
            post_as: inst.post_as,
            triggers: inst.triggers,
          });
          return { repo: inst.repo, ok: true, prUrl: res.pr_url, message: null, code: undefined };
        } catch (e) {
          const err = e instanceof ApiError ? e : null;
          return {
            repo: inst.repo,
            ok: false,
            prUrl: null,
            message: err?.message ?? (e instanceof Error ? e.message : String(e)),
            code: err?.code,
          };
        }
      }),
    );
    setResults(out);
    setRunning(false);
  };

  return { run, running, results };
}
