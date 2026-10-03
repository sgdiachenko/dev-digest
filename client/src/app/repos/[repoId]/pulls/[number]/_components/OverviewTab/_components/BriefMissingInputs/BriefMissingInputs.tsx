/* BriefMissingInputs — "Generated without:" the inputs the brief could not use,
   each with its reason in words and, where the studio has one, a link to fix it. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { BriefMissingInput } from "@devdigest/shared";
import { missingFixHref } from "../../helpers";

const linkStyle: React.CSSProperties = {
  color: "var(--accent-text)",
  textDecoration: "underline",
  textUnderlineOffset: 2,
  display: "inline-flex",
  alignItems: "center",
  minHeight: 24,
};

export function BriefMissingInputs({ missing, repoId }: { missing: BriefMissingInput[]; repoId: string }) {
  const t = useTranslations("brief");
  if (missing.length === 0) return null;
  return (
    <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>
      <span style={{ fontWeight: 600 }}>{t("card.missing.title")}</span>
      <ul style={{ listStyle: "none", margin: "4px 0 0", padding: 0, display: "flex", flexWrap: "wrap", columnGap: 16 }}>
        {missing.map((m) => {
          const href = missingFixHref(m.input, repoId);
          const fixKey = m.input === "intent" ? "intent" : m.input === "specs" ? "specs" : null;
          return (
            <li key={`${m.input}:${m.reason}`} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span>
                {t(`card.missing.input.${m.input}`)} — {t(`card.missing.reason.${m.reason}`)}
              </span>
              {href && fixKey &&
                (href.startsWith("#") ? (
                  <a href={href} style={linkStyle}>
                    {t(`card.missing.fix.${fixKey}`)}
                  </a>
                ) : (
                  <Link href={href} style={linkStyle}>
                    {t(`card.missing.fix.${fixKey}`)}
                  </Link>
                ))}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
