/* AttachList — attach/detach + reorder a repo's Project Context documents for an agent or skill.
   Controlled by `rows` (the last server-confirmed state); the optimistic draft lives here only
   until the save settles — on error it is dropped (rollback) and Retry re-sends the failed list. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Skeleton } from "@devdigest/ui";
import { applyDraft, docKey, moveId, moveIdTo, refsOf, toggleId, type AttachRowData } from "../helpers";
import type { ContextAttachmentRef } from "@/lib/types";
import { AttachRow } from "../AttachRow/AttachRow";
import { s } from "../styles";

export interface AttachListProps {
  rows: AttachRowData[];
  loading?: boolean;
  pending: boolean;
  status: "idle" | "saved";
  error: boolean;
  catalogRef: { branch: string | null; sha: string | null };
  onCommit: (orderedRefs: ContextAttachmentRef[]) => void;
  onRetry: () => void;
  previewHref: (path: string) => string;
}

export function AttachList({
  rows,
  loading = false,
  pending,
  status,
  error,
  catalogRef,
  onCommit,
  onRetry,
  previewHref,
}: AttachListProps) {
  const t = useTranslations("context");
  const [filter, setFilter] = React.useState("");
  const [draft, setDraft] = React.useState<string[] | null>(null);
  const [wasPending, setWasPending] = React.useState(false);
  const [draggedKey, setDraggedKey] = React.useState<string | null>(null);
  const [overKey, setOverKey] = React.useState<string | null>(null);

  // The save settled (ok → server rows are the truth; error → rollback): drop the draft.
  if (wasPending !== pending) {
    setWasPending(pending);
    if (wasPending && !pending) setDraft(null);
  }

  const shown = draft ? applyDraft(rows, draft) : rows;
  const attachedKeys = shown.filter((r) => r.attached).map(docKey);
  const needle = filter.trim().toLowerCase();
  const visible = shown.filter((r) => needle === "" || r.path.toLowerCase().includes(needle));
  const locked = loading || pending;

  const commit = (keys: string[]) => {
    const next = applyDraft(shown, keys);
    setDraft(keys);
    onCommit(refsOf(next));
  };

  return (
    <div style={s.wrap}>
      <input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder={t("attachments.filterPlaceholder")}
        aria-label={t("attachments.filterLabel")}
        style={s.filterInput}
      />
      <div role="status" style={s.statusLine}>
        {pending ? t("attachments.pending") : status === "saved" ? t("attachments.saved") : ""}
      </div>
      {error && !pending && (
        <div role="alert" style={s.error}>
          <span>{t("attachments.saveError")}</span>
          <button type="button" onClick={onRetry} style={s.link}>
            {t("attachments.retry")}
          </button>
        </div>
      )}
      {loading && shown.length === 0 && <Skeleton height={120} />}
      {!loading && shown.length === 0 && <div style={s.empty}>{t("attachments.noCatalog.title")}</div>}
      {shown.length > 0 && visible.length === 0 && (
        <div style={s.empty}>{t("attachments.noMatch", { q: filter.trim() })}</div>
      )}
      <div role="list" aria-label={t("attachments.listLabel")} aria-busy={locked} style={s.wrap}>
        {visible.map((row) => {
          const key = docKey(row);
          const index = attachedKeys.indexOf(key);
          return (
            <div
              key={key}
              role="listitem"
              draggable={row.attached && !locked}
              onDragStart={(e) => {
                setDraggedKey(key);
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", key);
              }}
              onDragOver={(e) => {
                if (!row.attached || !draggedKey || draggedKey === key) return;
                e.preventDefault();
                setOverKey(key);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (row.attached && draggedKey && draggedKey !== key) commit(moveIdTo(attachedKeys, draggedKey, key));
                setDraggedKey(null);
                setOverKey(null);
              }}
              onDragEnd={() => {
                setDraggedKey(null);
                setOverKey(null);
              }}
              style={overKey === key ? { outline: "1px solid var(--accent)", borderRadius: 7 } : undefined}
            >
              <AttachRow
                row={row}
                canMoveUp={index > 0}
                canMoveDown={index >= 0 && index < attachedKeys.length - 1}
                disabled={locked}
                catalogRef={catalogRef}
                previewHref={previewHref}
                onToggle={(checked) => commit(toggleId(attachedKeys, key, checked))}
                onMove={(dir) => commit(moveId(attachedKeys, index, dir))}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
