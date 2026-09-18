/* PreviewTab — rendered markdown, exactly as the reviewing agent receives it.
   Read-only; editing the body happens in Config. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Markdown } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { s } from "./styles";

export function PreviewTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  return (
    <div style={s.wrap}>
      <p style={s.caption}>{t("previewTab.caption")}</p>
      {skill.source !== "manual" && <p style={s.notice}>{t("previewTab.untrustedNotice")}</p>}
      <div style={s.card}>
        <Markdown>{skill.body}</Markdown>
      </div>
    </div>
  );
}
