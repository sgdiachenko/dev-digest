/* useBundlePreview — fetches the bundle for the Preview step (`action: "files"`: no GitHub call, nothing stored, AC-37).
   Keeps the last bundle with the config key it was generated for, so going Back and forward reuses it (AC-14). */
"use client";

import React from "react";
import type { CiFile } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import { useExportCi } from "@/lib/hooks/ci";
import { configKey, type WizardConfig } from "./helpers";

export interface BundleError {
  message: string;
  code: string | undefined;
}

export function useBundlePreview(agentId: string) {
  const exportCi = useExportCi(agentId);
  const [bundle, setBundle] = React.useState<{ key: string; files: CiFile[] } | null>(null);

  const load = (cfg: WizardConfig) => {
    const key = configKey(cfg);
    setBundle(null);
    exportCi.mutate(
      { repo: cfg.repo, target: "gha", action: "files", post_as: cfg.postAs, triggers: cfg.triggers },
      { onSuccess: (res) => setBundle({ key, files: res.files }) },
    );
  };

  const err = exportCi.error;
  const error: BundleError | null = exportCi.isError
    ? { message: err instanceof Error ? err.message : String(err), code: err instanceof ApiError ? err.code : undefined }
    : null;

  return { bundle, loading: exportCi.isPending, error, load };
}
