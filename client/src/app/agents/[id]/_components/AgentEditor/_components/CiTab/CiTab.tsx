/* CiTab — Agents › CI: where the agent is installed, "Fail CI on", Update CI config and the
   Export to CI wizard (AC-1, AC-68–AC-78, AC-134). Owns the installations query; rows and the
   gate control are presentational. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, EmptyState, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { useCiInstallations } from "@/lib/hooks/ci";
import { CiInstallationRow } from "./_components/CiInstallationRow";
import { ExportCiWizard } from "./_components/ExportCiWizard";
import { FailCiOn } from "./_components/FailCiOn";
import { UpdateResults } from "./_components/UpdateResults";
import { useUpdateCiConfig } from "./useUpdateCiConfig";
import { s } from "./styles";

export function CiTab({ agent }: { agent: Agent }) {
  const t = useTranslations("ci");
  const installs = useCiInstallations(agent.id);
  const [wizardOpen, setWizardOpen] = React.useState(false);
  const update = useUpdateCiConfig(agent.id);

  if (installs.isLoading) {
    return (
      <div style={s.skeletons} aria-busy="true" aria-label={t("ciTab.loading")}>
        <Skeleton height={28} width={260} />
        <Skeleton height={64} />
        <Skeleton height={48} />
        <Skeleton height={48} />
      </div>
    );
  }
  if (installs.isError && !installs.data) {
    return (
      <ErrorState title={t("ciTab.loadFailed")} body={t("ciTab.loadFailedBody")} onRetry={() => void installs.refetch()} />
    );
  }

  const rows = installs.data ?? [];
  const wizard = wizardOpen ? <ExportCiWizard agent={agent} onClose={() => setWizardOpen(false)} /> : null;

  if (rows.length === 0) {
    return (
      <div style={s.wrap}>
        {wizard}
        <EmptyState
          icon="Workflow"
          title={t("ciTab.emptyTitle")}
          body={t("ciTab.emptyBody")}
          cta={t("ciTab.addToCi")}
          onCta={() => setWizardOpen(true)}
        />
      </div>
    );
  }

  return (
    <div style={s.wrap}>
      {wizard}
      <div style={s.header}>
        <h2 style={s.title}>{t("ciTab.deployment")}</h2>
        <Badge color="var(--ok)" bg="var(--ok-bg)" dot>
          {t("ciTab.installedIn", { count: rows.length })}
        </Badge>
        <div style={s.actions}>
          <Button kind="secondary" size="sm" icon="RefreshCw" loading={update.running} onClick={() => void update.run(rows)}>
            {update.running ? t("ciTab.updating") : t("ciTab.updateConfig")}
          </Button>
          <Button kind="primary" size="sm" icon="Plus" onClick={() => setWizardOpen(true)}>
            {t("ciTab.addToCi")}
          </Button>
        </div>
      </div>

      <FailCiOn agent={agent} />
      <UpdateResults results={update.results} />

      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {rows.map((inst) => (
          <CiInstallationRow key={inst.id} installation={inst} agent={agent} />
        ))}
      </ul>

      <button type="button" style={s.addRow} onClick={() => setWizardOpen(true)}>
        <Icon.Plus size={15} />
        {t("ciTab.addRepository")}
      </button>
    </div>
  );
}
