/* TargetStep — GitHub Actions (the only target, preselected) and the target repository from the workspace's
   imported repos (AC-3–AC-6). The wizard keeps Continue disabled while no repo or a non-OpenRouter agent blocks it. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { Provider, Repo } from "@devdigest/shared";
import { step } from "../stepStyles";

export function TargetStep({
  repos,
  repo,
  onRepo,
  provider,
}: {
  repos: Repo[];
  repo: string;
  onRepo: (fullName: string) => void;
  provider: Provider;
}) {
  const t = useTranslations("ci");
  return (
    <div style={step.body}>
      <div role="radiogroup" aria-label={t("exportWizard.targetLabel")}>
        <div role="radio" aria-checked="true" style={{ ...step.card, ...step.cardOn }}>
          <Icon.Workflow size={16} />
          <div>
            <div style={{ fontWeight: 600 }}>{t("exportWizard.targets.gha")}</div>
            <div style={step.hint}>{t("exportWizard.targets.ghaDesc")}</div>
          </div>
        </div>
      </div>

      {provider !== "openrouter" && <div role="alert" style={step.notice}>{t("exportWizard.providerNotice")}</div>}

      {repos.length === 0 ? (
        <div role="alert" style={step.notice}>
          {t("exportWizard.noRepos")}{" "}
          <Link href="/onboarding" style={step.link}>
            {t("exportWizard.noReposLink")}
          </Link>
        </div>
      ) : (
        <div>
          <label htmlFor="ci-target-repo" style={step.label}>
            {t("exportWizard.repoLabel")}
          </label>
          <select id="ci-target-repo" style={step.select} value={repo} onChange={(e) => onRepo(e.target.value)}>
            {repos.map((r) => (
              <option key={r.id} value={r.full_name} title={r.full_name}>
                {r.full_name}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
