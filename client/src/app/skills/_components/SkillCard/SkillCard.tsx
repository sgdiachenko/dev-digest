/* SkillCard — one row of the /skills rail. AgentCard is the template; the
   stats footer ("3 agents · 71% pull · 74% accept") is fed by the LIST
   endpoint's batched stats — never a request per card. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon, Toggle } from "@devdigest/ui";
import type { SkillWithStats } from "@devdigest/shared";
import { useDeleteSkill } from "../../../../lib/hooks/skills";
import { TYPE_COLOR } from "./constants";
import { footerSegments } from "./helpers";
import { s } from "./styles";

export function SkillCard({
  skill,
  active,
  onClick,
  onToggle,
}: {
  skill: SkillWithStats;
  active?: boolean;
  onClick?: () => void;
  onToggle?: (enabled: boolean) => void;
}) {
  const t = useTranslations("skills");
  const del = useDeleteSkill();
  const segments = footerSegments(skill.stats);
  // Imported skills stay flagged until someone reads the body and re-enables it.
  const needsVetting = skill.source !== "manual" && !skill.enabled;

  return (
    <div onClick={onClick} style={s.card(!!active, skill.enabled)}>
      <div style={s.headerRow}>
        <div style={s.iconBox}>
          <Icon.Sparkles size={15} />
        </div>
        <span className="mono" style={s.name}>
          {skill.name}
        </span>
        {onToggle && (
          <div onClick={(e) => e.stopPropagation()}>
            <Toggle on={skill.enabled} onChange={onToggle} size={14} />
          </div>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (window.confirm(`Delete skill "${skill.name}"? This cannot be undone.`)) del.mutate(skill.id);
          }}
          disabled={del.isPending}
          title="Delete skill"
          aria-label="Delete skill"
          style={{
            background: "none",
            border: "none",
            cursor: del.isPending ? "not-allowed" : "pointer",
            color: "var(--text-muted)",
            display: "inline-flex",
            padding: 4,
          }}
        >
          <Icon.Trash size={14} style={del.isPending ? { animation: "ddspin 1s linear infinite" } : undefined} />
        </button>
      </div>

      <div style={s.description}>{skill.description || t("listItem.noDescription")}</div>

      <div style={s.badgeRow}>
        <Badge color={TYPE_COLOR[skill.type]}>{t(`listItem.type.${skill.type}`)}</Badge>
        <Badge color="var(--text-muted)">{t(`listItem.source.${skill.source}`)}</Badge>
        {needsVetting && (
          <span title={t("listItem.vettingTitle")}>
            <Badge color="var(--warn)" icon="AlertTriangle" style={{ cursor: "help" }}>
              {t("listItem.needsVetting")}
            </Badge>
          </span>
        )}
      </div>

      <div style={s.footer}>
        {segments.map((seg, i) => (
          <React.Fragment key={seg.key}>
            {i > 0 && <span style={s.sep}>·</span>}
            <span className="tnum">{seg.label}</span>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
