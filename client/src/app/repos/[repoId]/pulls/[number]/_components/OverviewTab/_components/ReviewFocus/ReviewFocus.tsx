/* ReviewFocus — "read these first": numbered `file:line — reason` entries in
   stored order. Each entry jumps to the Files changed tab. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Card, SectionLabel } from "@devdigest/ui";
import type { ReviewFocusItem } from "@devdigest/shared";
import { middleTruncate } from "../../helpers";
import { s } from "./styles";

export function ReviewFocus({
  items,
  onOpenFile,
}: {
  items: ReviewFocusItem[];
  onOpenFile: (path: string, line: number | null) => void;
}) {
  const t = useTranslations("brief");
  return (
    <section>
      <Card>
        <SectionLabel
          icon="ListChecks"
          right={<Badge color="var(--accent-text)" bg="var(--accent-bg)">{items.length}</Badge>}
        >
          {t("card.reviewFocus.title")}
        </SectionLabel>
        {items.length === 0 ? (
          <p style={s.empty}>{t("card.reviewFocus.empty")}</p>
        ) : (
          <ul style={s.list}>
            {items.map((item, i) => (
              <li key={i} style={s.item}>
                <span aria-hidden="true" style={s.bullet}>▸</span>
                <span>
                  <button
                    type="button"
                    className="mono"
                    style={s.link}
                    title={`${item.file}:${item.line}`}
                    aria-label={`${item.file}:${item.line}`}
                    onClick={() => onOpenFile(item.file, item.line)}
                  >
                    {middleTruncate(item.file)}:{item.line}
                  </button>
                  {" — "}
                  {item.reason}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </section>
  );
}
