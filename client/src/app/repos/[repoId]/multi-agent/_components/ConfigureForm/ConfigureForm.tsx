/* ConfigureForm — /repos/:repoId/multi-agent. Pick a PR and 2+ agents, see the
   parallel-run estimate, start the group, then land on the results page. The
   PR can be preselected through `?pr=<number>`. */
"use client";

import React from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { useAgents } from "@/lib/hooks/agents";
import { usePulls } from "@/lib/hooks/core";
import { useAgentRunEstimates, useStartGroup } from "@/lib/hooks/multi-agent";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { estimateTotals, preselectPr } from "../../helpers";
import { AgentChecklist } from "../AgentChecklist";
import { EstimateSummary } from "../EstimateSummary";
import { s } from "./styles";

export function ConfigureForm() {
  const t = useTranslations("multiAgent");
  const { repoId } = useParams<{ repoId: string }>();
  const search = useSearchParams();
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);

  const pulls = usePulls(repoId);
  const agents = useAgents();
  const estimates = useAgentRunEstimates();

  // Selection is derived: an explicit pick wins, else the `?pr=` preselection.
  const [pickedPrId, setPickedPrId] = React.useState<string | null>(null);
  const [checkedIds, setCheckedIds] = React.useState<string[]>([]);
  const prId = pickedPrId ?? preselectPr(search.get("pr"), pulls.data)?.id ?? null;
  const pr = pulls.data?.find((p) => p.id === prId) ?? null;

  const enabled = (agents.data ?? []).filter((a) => a.enabled);
  const checked = checkedIds.filter((id) => enabled.some((a) => a.id === id));
  const { reason, blocked, resultsHref, isPending, error, conflict, start } = useStartGroup({
    repoId,
    prId: pr?.id ?? null,
    prNumber: pr?.number ?? null,
    checked,
    loading: agents.isPending || pulls.isPending,
  });
  const totals = estimateTotals(estimates.data, checked);

  const toggle = (agentId: string, value: boolean) =>
    setCheckedIds((prev) => (value ? [...prev.filter((id) => id !== agentId), agentId] : prev.filter((id) => id !== agentId)));

  const allSelected = enabled.length > 0 && checked.length === enabled.length;
  const toggleAll = () => setCheckedIds(allSelected ? [] : enabled.map((a) => a.id));

  const crumb = [{ label: activeRepo?.full_name ?? repoId, mono: true }, { label: t("configure.title") }];
  if (repoNotFound) {
    return (
      <AppShell crumb={crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  return (
    <AppShell crumb={crumb}>
      <div style={s.root}>
        <div>
          <h1 style={s.h1}>{t("configure.title")}</h1>
          <p style={s.subtitle}>{t("configure.subtitle")}</p>
        </div>

        <section style={s.step}>
          <h2 style={s.stepHeading}>
            <span style={s.badge}>1</span>
            {t("configure.prLabel")}
          </h2>
          <select
            aria-label={t("configure.prLabel")}
            style={s.select}
            value={prId ?? ""}
            onChange={(e) => setPickedPrId(e.target.value || null)}
          >
            <option value="">{t("configure.prPlaceholder")}</option>
            {(pulls.data ?? []).map((p) => (
              <option key={p.id ?? p.number} value={p.id ?? ""}>
                {t("configure.prOption", { number: p.number, title: p.title })}
              </option>
            ))}
          </select>
        </section>

        <section style={s.step}>
          <div style={s.stepHeader}>
            <h2 style={s.stepHeading}>
              <span style={s.badge}>2</span>
              {t("configure.agentsHeading")}
            </h2>
            <button type="button" style={s.selectAll} onClick={toggleAll} disabled={enabled.length === 0}>
              {t("configure.selectAll")}
            </button>
          </div>
          {agents.isError && <p style={s.error}>{t("configure.agentsLoadError")}</p>}
          <AgentChecklist
            agents={agents.data}
            estimates={estimates.data}
            checked={checked}
            loading={agents.isPending}
            onToggle={toggle}
          />
          {!agents.isPending && enabled.length < 2 && <p style={s.note}>{t("configure.needTwoEnabled")}</p>}
        </section>

        <div style={s.footer}>
          <Button
            kind="primary"
            icon="Users"
            disabled={blocked}
            loading={isPending}
            aria-describedby="multi-agent-block-reason"
            onClick={start}
          >
            {isPending ? t("configure.starting") : t("configure.start", { count: checked.length })}
          </Button>
          <EstimateSummary totals={totals} />
          <span id="multi-agent-block-reason" style={s.reason}>
            {reason ? t(`configure.block.${reason}`) : null}
          </span>
          {reason === "running" && resultsHref && (
            <Link href={resultsHref} style={s.link}>
              {t("configure.viewResults")}
            </Link>
          )}
        </div>

        {error && (
          <p role="alert" style={s.error}>
            {error.message}
          </p>
        )}
        {conflict && resultsHref && (
          <Link href={resultsHref} style={s.link}>
            {t("configure.activeRun")}
          </Link>
        )}
      </div>
    </AppShell>
  );
}
