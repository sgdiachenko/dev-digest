/* BlastRadiusCard — Overview tab. Shows the PR's blast radius (repo-intel's
   precomputed call graph, pure read): changed symbols, their known callers
   grouped per symbol (BlastSymbolGroup), and the endpoints/crons those
   callers reach. A degraded index shows a badge in place, never an error. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Card, Chip, EmptyState, ErrorState, Icon, SectionLabel, Skeleton } from "@devdigest/ui";
import { useBlastRadius } from "@/lib/hooks/blast";
import { BlastSymbolGroup } from "../BlastSymbolGroup";
import { BlastSymbolGraph } from "../BlastSymbolGraph";
import { PriorPrsSection } from "../PriorPrsSection";
import { computeBlastStats } from "./helpers";
import { s } from "./styles";

type BlastView = "tree" | "graph";

/** Graph-view legend — one swatch per node kind; crons only when at least
    one group actually has an affected cron. */
function GraphLegend({ showCrons }: { showCrons: boolean }) {
  const t = useTranslations("blast");
  return (
    <div style={s.legend}>
      <Badge dot color="var(--accent)" bg="var(--accent-bg)">
        {t("legend.symbol")}
      </Badge>
      <Badge dot color="var(--text-secondary)" bg="var(--bg-elevated)">
        {t("legend.callers")}
      </Badge>
      <Badge dot color="var(--accent)" bg="var(--accent-bg)">
        {t("legend.endpoints")}
      </Badge>
      {showCrons && (
        <Badge dot color="var(--accent)" bg="var(--accent-bg)">
          {t("legend.crons")}
        </Badge>
      )}
    </div>
  );
}

export function BlastRadiusCard({
  prId,
  repoFullName,
  headSha,
}: {
  prId: string | null | undefined;
  repoFullName?: string | null;
  headSha?: string | null;
}) {
  const t = useTranslations("blast");
  const tBrief = useTranslations("brief");
  const { data, isLoading, isError, refetch } = useBlastRadius(prId);
  const [view, setView] = React.useState<BlastView>("tree");

  if (isLoading) {
    return (
      <section>
        <SectionLabel icon="Zap">{tBrief("block.blast")}</SectionLabel>
        <Card>
          <Skeleton height={60} />
        </Card>
      </section>
    );
  }

  if (isError) {
    return (
      <section>
        <SectionLabel icon="Zap">{tBrief("block.blast")}</SectionLabel>
        <Card>
          <ErrorState title={t("error.title")} onRetry={() => refetch()} />
        </Card>
      </section>
    );
  }

  if (!data) return null;

  const stats = computeBlastStats(data);

  return (
    <section>
      <SectionLabel icon="Zap">{tBrief("block.blast")}</SectionLabel>
      <Card style={s.card}>
        <div style={s.header}>
          {data.downstream.length > 0 && (
            <div style={s.statsRow}>
              <span style={s.statItem}>
                <Icon.Code size={13} style={s.statIcon} />
                <span style={s.statCount}>{stats.symbols}</span> {t("stat.symbols")}
              </span>
              <span style={s.statItem}>
                <Icon.CornerDownRight size={13} style={s.statIcon} />
                <span style={s.statCount}>{stats.callers}</span> {t("stat.callers")}
              </span>
              <span style={s.statItem}>
                <Icon.Globe size={13} style={s.statIcon} />
                <span style={s.statCount}>{stats.endpoints}</span> {t("stat.endpoints")}
              </span>
              <span style={s.statItem}>
                <Icon.Clock size={13} style={s.statIcon} />
                <span style={s.statCount}>{stats.crons}</span> {t("stat.crons")}
              </span>
            </div>
          )}

          {data.degraded && (
            <Badge color="var(--warn)" bg="var(--warn-bg)" icon="AlertTriangle">
              {t("degraded")}
            </Badge>
          )}
        </div>

        {data.degraded && data.reason && (
          <div style={s.degradedReason}>{t(`reason.${data.reason}`)}</div>
        )}

        {data.downstream.length > 0 && (
          <div style={s.viewSwitch}>
            <Chip active={view === "tree"} onClick={() => setView("tree")}>
              {t("view.tree")}
            </Chip>
            <Chip active={view === "graph"} onClick={() => setView("graph")}>
              {t("view.graph")}
            </Chip>
          </div>
        )}

        {data.downstream.length === 0 ? (
          <EmptyState
            icon="Zap"
            title={t(view === "graph" ? "graph.empty" : "noDownstream", { count: stats.symbols })}
          />
        ) : view === "tree" ? (
          <div style={s.groups}>
            {data.downstream.map((group) => (
              <BlastSymbolGroup
                key={group.symbol}
                group={group}
                repoFullName={repoFullName}
                headSha={headSha}
              />
            ))}
          </div>
        ) : (
          <div style={s.groups}>
            <GraphLegend showCrons={stats.crons > 0} />
            {data.downstream.map((group) => (
              <BlastSymbolGraph key={group.symbol} group={group} />
            ))}
          </div>
        )}

        <PriorPrsSection prId={prId} repoFullName={repoFullName} />
      </Card>
    </section>
  );
}
