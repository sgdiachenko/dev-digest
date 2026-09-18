/* SkillsTab — link/unlink + reorder an agent's skills. Every write posts the
   FULL ordered set (`POST /agents/:id/skills { skill_ids }`) — there is no
   per-link enable, "enable/disable for this agent" IS link/unlink. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Checkbox, ErrorState, IconBtn, Skeleton } from "@devdigest/ui";
import { useAgentSkills, useSetAgentSkills } from "../../../../../../../lib/hooks/agents";
import { useSkills } from "../../../../../../../lib/hooks/skills";
import { moveId, orderedIdsFrom, toggleId } from "./helpers";
import { s } from "./styles";

export function SkillsTab({ agentId }: { agentId: string }) {
  const t = useTranslations("agents");
  const { data: links, isLoading: linksLoading, isError: linksError, refetch: refetchLinks } = useAgentSkills(agentId);
  const { data: skills, isLoading: skillsLoading, isError: skillsError, refetch: refetchSkills } = useSkills();
  const setSkills = useSetAgentSkills();
  const [filter, setFilter] = React.useState("");

  if (linksLoading || skillsLoading) return <Skeleton height={220} />;
  if (linksError || skillsError || !links || !skills) {
    return <ErrorState onRetry={() => (linksError ? refetchLinks() : refetchSkills())} />;
  }

  const orderedIds = orderedIdsFrom(links);
  const linkedSet = new Set(orderedIds);
  const skillById = new Map(skills.map((sk) => [sk.id, sk]));
  const needle = filter.trim().toLowerCase();
  const unlinked = skills
    .filter((sk) => !linkedSet.has(sk.id))
    .filter((sk) => !needle || sk.name.toLowerCase().includes(needle));

  const commit = (ids: string[]) => setSkills.mutate({ agentId, skillIds: ids });

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("skills.title")}</h2>
        <span style={s.count}>{t("skills.enabledCount", { linked: orderedIds.length, total: skills.length })}</span>
      </div>
      <p style={s.hint}>{t("skills.orderHint")}</p>

      <input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder={t("skills.filterPlaceholder")}
        style={s.filterInput}
      />

      {orderedIds.length > 0 && (
        <>
          {orderedIds.map((id, i) => {
            const sk = skillById.get(id);
            if (!sk) return null;
            return (
              <div key={id} style={s.row}>
                <Checkbox
                  checked
                  onChange={() => commit(toggleId(orderedIds, id, false))}
                  label={<span className="mono">{sk.name}</span>}
                />
                <div style={s.rowMain}>
                  <span style={s.desc}>{sk.description}</span>
                  <div style={s.reorder}>
                    <IconBtn
                      icon="ArrowUp"
                      label="Move up"
                      size={26}
                      onClick={() => commit(moveId(orderedIds, i, -1))}
                    />
                    <IconBtn
                      icon="ArrowDown"
                      label="Move down"
                      size={26}
                      onClick={() => commit(moveId(orderedIds, i, 1))}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </>
      )}

      {unlinked.length > 0 && (
        <>
          {orderedIds.length > 0 && <div style={s.sectionLabel}>{t("skills.unlinkedSectionLabel")}</div>}
          {unlinked.map((sk) => (
            <div key={sk.id} style={s.row}>
              <Checkbox
                checked={false}
                onChange={() => commit(toggleId(orderedIds, sk.id, true))}
                label={<span className="mono">{sk.name}</span>}
              />
              <div style={s.rowMain}>
                <span style={s.desc}>{sk.description}</span>
              </div>
            </div>
          ))}
        </>
      )}

      {orderedIds.length === 0 && unlinked.length === 0 && <div style={s.empty}>{t("skills.empty")}</div>}
    </div>
  );
}
