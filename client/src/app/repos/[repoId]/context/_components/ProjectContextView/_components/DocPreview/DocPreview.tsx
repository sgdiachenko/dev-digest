"use client";

import { useTranslations } from "next-intl";
import { Badge, Button, Markdown, Skeleton } from "@devdigest/ui";
import { ApiError } from "@/lib/api";
import type { ContextDocContent } from "@/lib/types";
import { s } from "../../styles";
import { formatSize } from "../../helpers";
import { TokenEstimate } from "../TokenEstimate";

export interface DocPreviewQuery {
  data?: ContextDocContent;
  isLoading: boolean;
  error: unknown;
}

/** Preview pane for the selected document. Content renders only through the vendored `Markdown` (no raw HTML). */
export function DocPreview({
  query,
  scanRef,
  rescanning,
  onRescan,
  onBack,
}: {
  query: DocPreviewQuery;
  /** The catalog's scanned ref, named in the "not found" message. */
  scanRef: { branch: string | null; sha: string | null };
  rescanning: boolean;
  onRescan: () => void;
  onBack: () => void;
}) {
  const t = useTranslations("context");
  const { data, isLoading, error } = query;

  if (error instanceof ApiError && error.status === 404) {
    return (
      <div role="alert">
        <p style={s.previewMuted}>
          {t("preview.notFound", { branch: scanRef.branch ?? "?", sha: (scanRef.sha ?? "?").slice(0, 7) })}
        </p>
        <div style={s.previewActions}>
          <Button kind="secondary" size="sm" icon="RefreshCw" disabled={rescanning} onClick={onRescan}>
            {rescanning ? t("rescanning") : t("rescan")}
          </Button>
          <Button kind="ghost" size="sm" onClick={onBack}>
            {t("preview.backToList")}
          </Button>
        </div>
      </div>
    );
  }
  if (error) return <p role="alert" style={s.previewMuted}>{t("preview.loadError")}</p>;
  if (isLoading || !data) {
    return (
      <div role="status" aria-busy="true" aria-label={t("preview.loading")}>
        <Skeleton height={18} width="60%" />
        <Skeleton height={14} style={{ marginTop: 12 }} />
        <Skeleton height={14} style={{ marginTop: 8 }} />
      </div>
    );
  }

  return (
    <article>
      <header style={s.previewHeader}>
        <span className="mono" style={s.previewPath}>
          {data.path}
        </span>
        <Badge>{t(`categories.${data.category}`)}</Badge>
        <TokenEstimate tokens={data.est_tokens} />
        {data.secret_warning && <Badge icon="AlertTriangle">{t("secretWarning")}</Badge>}
      </header>
      <div style={s.previewBody}>
        {data.status === "empty" ? (
          <p style={s.previewMuted}>{t("preview.empty")}</p>
        ) : data.status === "too_large" ? (
          <p style={s.previewMuted}>{t("preview.tooLarge", { size: formatSize(data.size) })}</p>
        ) : data.status === "unreadable" ? (
          <p style={s.previewMuted}>{t("preview.unreadable", { size: formatSize(data.size) })}</p>
        ) : (
          <Markdown>{data.content}</Markdown>
        )}
      </div>
    </article>
  );
}
