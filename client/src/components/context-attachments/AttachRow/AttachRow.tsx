"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Checkbox, Icon } from "@devdigest/ui";
import { truncateMiddle, type AttachRowData } from "../helpers";
import { TokenEstimate } from "../TokenEstimate/TokenEstimate";
import { s } from "../styles";

/** Documents the catalog could not read as text can't be newly attached (AC-16). */
function blockedReason(row: AttachRowData): "too_large" | "unreadable" | null {
  if (row.attached) return null;
  return row.status === "too_large" || row.status === "unreadable" ? row.status : null;
}

export function AttachRow({
  row,
  canMoveUp,
  canMoveDown,
  disabled,
  catalogRef,
  previewHref,
  onToggle,
  onMove,
}: {
  row: AttachRowData;
  canMoveUp: boolean;
  canMoveDown: boolean;
  disabled: boolean;
  catalogRef: { branch: string | null; sha: string | null };
  previewHref: (path: string) => string;
  onToggle: (checked: boolean) => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const t = useTranslations("context");
  const blocked = blockedReason(row);
  const missing = row.status === "missing";
  return (
    <div style={s.row}>
      {row.attached && (
        <span aria-hidden="true" style={{ ...s.handle, cursor: disabled ? "default" : "grab" }} title={t("attachments.dragHandle", { path: row.path })}>
          <Icon.Menu size={15} />
        </span>
      )}
      <Checkbox
        checked={row.attached}
        disabled={disabled || blocked !== null}
        onChange={onToggle}
        label={
          <>
            <span style={s.srOnly}>{row.path}</span>
            <span aria-hidden="true" className="mono" style={s.path} title={row.path}>
              {truncateMiddle(row.path)}
            </span>
          </>
        }
      />
      <div style={s.rowMain}>
        <div style={s.meta}>
          {row.category && <Badge>{t(`categories.${row.category}`)}</Badge>}
          {!missing && <TokenEstimate tokens={row.est_tokens} />}
          {!missing && (
            <a href={previewHref(row.path)} style={s.link} aria-label={t("attachments.previewLabel", { path: row.path })}>
              {t("attachments.preview")}
            </a>
          )}
        </div>
        {blocked && <span style={s.reason}>{t(`attachments.blocked.${blocked}`)}</span>}
        {row.would_skip && <span style={s.warn}>{t("attachments.budget.wouldSkip")}</span>}
        {missing && (
          <span style={s.warn}>
            {t("attachments.notFound", { branch: catalogRef.branch ?? "—", sha: (catalogRef.sha ?? "").slice(0, 7) })}
          </span>
        )}
      </div>
      {missing && (
        <button type="button" disabled={disabled} onClick={() => onToggle(false)} style={s.link} aria-label={t("attachments.detach", { path: row.path })}>
          {t("attachments.detachLabel")}
        </button>
      )}
      {row.attached && (
        <>
          <button
            type="button"
            style={s.iconBtn}
            disabled={disabled || !canMoveUp}
            aria-label={t("attachments.moveUp", { path: row.path })}
            onClick={() => onMove(-1)}
          >
            <Icon.ArrowUp size={14} />
          </button>
          <button
            type="button"
            style={s.iconBtn}
            disabled={disabled || !canMoveDown}
            aria-label={t("attachments.moveDown", { path: row.path })}
            onClick={() => onMove(1)}
          >
            <Icon.ArrowDown size={14} />
          </button>
        </>
      )}
    </div>
  );
}
