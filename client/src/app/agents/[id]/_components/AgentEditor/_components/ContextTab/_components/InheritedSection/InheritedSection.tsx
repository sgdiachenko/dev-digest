/* InheritedSection — read-only list of documents the agent gets through its linked skills,
   one row per document in skill order; inactive skills and duplicates say why nothing is injected. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { InheritedDoc } from "@/lib/types";

const s = {
  title: { fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", color: "var(--text-muted)", textTransform: "uppercase" },
  row: { display: "flex", flexDirection: "column", gap: 2, padding: "8px 10px", borderRadius: 7, border: "1px solid var(--border)", marginBottom: 6 },
  path: { fontSize: 13, fontFamily: "var(--font-mono)" },
  meta: { fontSize: 12, color: "var(--text-muted)" },
  link: { color: "var(--accent)" },
} as const satisfies Record<string, React.CSSProperties>;

export function InheritedSection({ docs }: { docs: InheritedDoc[] }) {
  const t = useTranslations("context");
  return (
    <section aria-label={t("attachments.inherited.title")}>
      <div style={s.title}>{t("attachments.inherited.title")}</div>
      {docs.length === 0 && <div style={s.meta}>{t("attachments.inherited.empty")}</div>}
      {docs.map((d) => (
        <div key={`${d.skill_id}:${d.repo_id}:${d.path}`} role="listitem" style={{ ...s.row, opacity: d.skill_active ? 1 : 0.6 }}>
          <span style={s.path}>{d.path}</span>
          <Link href={`/skills/${d.skill_id}?tab=context`} style={s.link}>
            {t("attachments.inherited.from", { skill: d.skill_name })}
          </Link>
          {d.skill_inactive_reason && (
            <span style={s.meta}>{t(`attachments.inherited.inactive.${d.skill_inactive_reason}`)}</span>
          )}
          {d.duplicate && <span style={s.meta}>{t("attachments.inherited.duplicate")}</span>}
        </div>
      ))}
    </section>
  );
}
