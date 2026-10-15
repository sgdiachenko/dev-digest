/* AgentEditor — agent config editor (model + system prompt) + the Skills, Context, Evals, Stats and CI tabs.
   Tab state lives in ?tab=. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Tabs } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import type { PeriodUrlState } from "../../../../../lib/agent-stats/usePeriodUrl";
import { CiTab } from "./_components/CiTab";
import { ConfigTab } from "./_components/ConfigTab";
import { ContextTab } from "./_components/ContextTab";
import { EvalsTab } from "./_components/EvalsTab";
import { SkillsTab } from "./_components/SkillsTab";
import { StatsTab } from "./_components/StatsTab";
import { TABS } from "./constants";
import { s } from "./styles";

const noop = () => {};

export function AgentEditor({
  agent,
  tab,
  onTab,
  statsPeriod,
  onAgentNotFound = noop,
}: {
  agent: Agent;
  tab: string;
  onTab: (t: string) => void;
  /** The Stats tab's URL-backed period; the Stats tab renders only when given. */
  statsPeriod?: PeriodUrlState;
  onAgentNotFound?: () => void;
}) {
  const t = useTranslations("agents");
  const tabs = TABS.map((tb) => ({ key: tb.key, label: t(tb.labelKey), icon: tb.icon }));
  return (
    <div style={s.wrap}>
      <div style={s.tabsBar}>
        <Tabs tabs={tabs} value={tab} onChange={onTab} pad="0 24px" />
      </div>
      <div style={s.body}>
        {tab === "skills" ? (
          <SkillsTab agentId={agent.id} />
        ) : tab === "context" ? (
          <ContextTab agentId={agent.id} />
        ) : tab === "evals" ? (
          <EvalsTab agentId={agent.id} agentName={agent.name} />
        ) : tab === "stats" && statsPeriod ? (
          <StatsTab agentId={agent.id} periodState={statsPeriod} onAgentNotFound={onAgentNotFound} />
        ) : tab === "ci" ? (
          <CiTab agent={agent} />
        ) : (
          <ConfigTab agent={agent} />
        )}
      </div>
    </div>
  );
}
