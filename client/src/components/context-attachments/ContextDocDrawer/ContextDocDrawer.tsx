/* ContextDocDrawer — read-only preview of one Project Context document, opened from an attach list
   without leaving the agent/skill editor. Content renders only through the vendored `Markdown`. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Drawer, Markdown, Skeleton } from "@devdigest/ui";
import { ApiError } from "@/lib/api";
import { useContextDoc } from "@/lib/hooks/context";
import { TokenEstimate } from "../TokenEstimate/TokenEstimate";

const DRAWER_WIDTH = 560;

function formatSize(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}

export function ContextDocDrawer({
  repoId,
  path,
  sha,
  branch,
  onClose,
}: {
  repoId: string;
  path: string;
  sha: string | null;
  branch: string | null;
  onClose: () => void;
}) {
  const t = useTranslations("context");
  const { data, isLoading, error } = useContextDoc(repoId, path, sha);

  let body: React.ReactNode;
  if (error instanceof ApiError && error.status === 404) {
    body = <p role="alert">{t("preview.notFound", { branch: branch ?? "?", sha: (sha ?? "?").slice(0, 7) })}</p>;
  } else if (error) {
    body = <p role="alert">{t("preview.loadError")}</p>;
  } else if (isLoading || !data) {
    body = (
      <div role="status" aria-busy="true" aria-label={t("preview.loading")}>
        <Skeleton height={18} width="60%" />
        <Skeleton height={14} style={{ marginTop: 12 }} />
        <Skeleton height={14} style={{ marginTop: 8 }} />
      </div>
    );
  } else if (data.status === "empty") {
    body = <p>{t("preview.empty")}</p>;
  } else if (data.status === "too_large") {
    body = <p>{t("preview.tooLarge", { size: formatSize(data.size) })}</p>;
  } else if (data.status === "unreadable") {
    body = <p>{t("preview.unreadable", { size: formatSize(data.size) })}</p>;
  } else {
    body = <Markdown>{data.content}</Markdown>;
  }

  return (
    <Drawer
      width={DRAWER_WIDTH}
      onClose={onClose}
      title={<span className="mono">{path}</span>}
      subtitle={
        data && (
          <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
            <Badge>{t(`categories.${data.category}`)}</Badge>
            <TokenEstimate tokens={data.est_tokens} />
            {data.secret_warning && <Badge icon="AlertTriangle">{t("secretWarning")}</Badge>}
          </span>
        )
      }
    >
      {body}
    </Drawer>
  );
}
